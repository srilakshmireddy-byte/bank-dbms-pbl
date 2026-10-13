'use strict';
const { HttpError } = require('../db');

// Only *shape* checks live here (is it a number? a date? an id?). Business rules - positive amounts,
// sufficient balance, ACTIVE accounts, balanced transfers - are left to the database on purpose.
const AMOUNT_RE = /^-?\d{1,13}(\.\d{1,2})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function id(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${label} is required`);
  return n;
}
function optId(value, label) {
  return value === undefined || value === null || value === '' ? null : id(value, label);
}
function amount(value, label = 'Amount') {
  const s = String(value ?? '').trim();
  if (!AMOUNT_RE.test(s)) throw new HttpError(400, `${label} must be a number with at most 2 decimals`);
  return s;
}
function text(value, label, { max = 150, required = true } = {}) {
  const s = value === undefined || value === null ? '' : String(value).trim();
  if (!s) {
    if (required) throw new HttpError(400, `${label} is required`);
    return null;
  }
  if (s.length > max) throw new HttpError(400, `${label} must be at most ${max} characters`);
  return s;
}
function date(value, label, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, `${label} is required`);
    return null;
  }
  const s = String(value);
  if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) throw new HttpError(400, `${label} must be a valid date (YYYY-MM-DD)`);
  return s;
}
function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw new HttpError(400, `${label} must be one of: ${allowed.join(', ')}`);
  return value;
}
/** Paging with hard caps. Returns integers that are bound as parameters like everything else. */
function paging(q, { defLimit = 25, maxLimit = 200 } = {}) {
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || defLimit, 1), maxLimit);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  return { limit, offset: (page - 1) * limit, page };
}
const like = (s) => `%${String(s).replace(/[\\%_]/g, (c) => '\\' + c)}%`;

module.exports = { id, optId, amount, text, date, oneOf, paging, like };
