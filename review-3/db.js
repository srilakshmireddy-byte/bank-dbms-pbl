'use strict';
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bank_db',
  waitForConnections: true,
  connectionLimit: 10,
  // DATE / DATETIME come back as plain strings (no timezone shifting); DECIMAL stays a string (no float error).
  dateStrings: true,
  charset: 'utf8mb4',
});

/** Prepared-statement query; always parameterised. Returns the rows (or the result header for writes). */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Run fn(conn) inside one transaction on one connection; commits on success, rolls back on any error. */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* connection may already be gone */ }
    throw err;
  } finally {
    conn.release();
  }
}

/** HTTP error that carries a user-facing message. */
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

// MySQL errors the user caused by sending data the database refuses (constraints, keys, enums ...).
const CLIENT_ERRNOS = new Set([
  1048, // column cannot be null
  1062, // duplicate entry
  1264, // out of range
  1265, // data truncated
  1292, // incorrect date value
  1366, // incorrect value
  1406, // data too long
  1451, 1452, // foreign key
  3819, // CHECK constraint violated
]);

/** Translate a thrown error into { status, body } for the JSON API. */
function describeError(err) {
  if (err instanceof HttpError) {
    return { status: err.status, body: { error: err.message, ...(err.extra || {}) } };
  }
  if (err && err.sqlState === '45000') {
    // Business rule raised by a trigger / stored procedure: surface the exact database message.
    return { status: 422, body: { error: err.sqlMessage, source: 'database', sqlState: err.sqlState, errno: err.errno } };
  }
  if (err && CLIENT_ERRNOS.has(err.errno)) {
    return { status: err.errno === 1062 ? 409 : 422, body: { error: err.sqlMessage, source: 'database', sqlState: err.sqlState, errno: err.errno } };
  }
  if (err && err.type === 'entity.parse.failed') return { status: 400, body: { error: 'Malformed JSON body' } };
  return { status: 500, body: { error: 'Internal server error' } };
}

module.exports = { pool, query, withTransaction, HttpError, describeError };
