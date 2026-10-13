'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { HttpError } = require('../db');
const { can } = require('../lib/permissions');

const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET is not set in .env - using a random secret; sessions will reset on every restart.');
}
const COOKIE = 'wcb_session';
const MAX_AGE_MS = 8 * 60 * 60 * 1000; // one working day

function issueSession(res, user) {
  const token = jwt.sign({ sub: user.staff_id, username: user.username, name: user.full_name, role: user.role }, SECRET, { expiresIn: '8h' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', maxAge: MAX_AGE_MS, path: '/' });
}
const clearSession = (res) => res.clearCookie(COOKIE, { path: '/' });

function authenticate(req, _res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) throw new HttpError(401, 'Please sign in');
  try {
    const p = jwt.verify(token, SECRET);
    req.user = { id: p.sub, username: p.username, name: p.name, role: p.role };
  } catch (_) {
    throw new HttpError(401, 'Your session has expired - please sign in again');
  }
  next();
}

const requirePerm = (perm) => (req, _res, next) => {
  if (!can(req.user.role, perm)) {
    throw new HttpError(403, `Your role (${req.user.role.replace('_', ' ').toLowerCase()}) is not allowed to do this`);
  }
  next();
};

module.exports = { issueSession, clearSession, authenticate, requirePerm };
