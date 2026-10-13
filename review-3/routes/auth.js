'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query, HttpError } = require('../db');
const { issueSession, clearSession, authenticate } = require('../middleware/auth');
const { permissionsFor } = require('../lib/permissions');
const { DEMO_STAFF } = require('../lib/staff');

// Tiny in-memory throttle: 8 failed attempts per username+IP per 10 minutes.
const fails = new Map();
const WINDOW = 10 * 60 * 1000, MAX_FAILS = 8;
function throttled(key) {
  const rec = fails.get(key);
  if (!rec || Date.now() - rec.first > WINDOW) { fails.delete(key); return false; }
  return rec.n >= MAX_FAILS;
}
function noteFail(key) {
  const rec = fails.get(key);
  if (!rec || Date.now() - rec.first > WINDOW) fails.set(key, { n: 1, first: Date.now() });
  else rec.n += 1;
}

const publicUser = (u) => ({ id: u.staff_id ?? u.id, username: u.username, name: u.full_name ?? u.name, role: u.role, permissions: permissionsFor(u.role) });

router.post('/login', async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!username || !password) throw new HttpError(400, 'Enter your username and password');
  const key = `${username}|${req.ip}`;
  if (throttled(key)) throw new HttpError(429, 'Too many failed attempts - try again in a few minutes');

  const [user] = await query('SELECT * FROM staff_user WHERE username = ? AND is_active = TRUE', [username]);
  // Compare against a dummy hash when the user is unknown so timing does not reveal valid usernames.
  const ok = await bcrypt.compare(password, user ? user.password_hash : '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
  if (!user || !ok) { noteFail(key); throw new HttpError(401, 'Incorrect username or password'); }

  fails.delete(key);
  await query('UPDATE staff_user SET last_login = NOW() WHERE staff_id = ?', [user.staff_id]);
  issueSession(res, user);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });

router.get('/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

// Optional one-click demo logins for a classroom install (DEMO_LOGINS=false hides them).
router.get('/demo', (_req, res) => {
  if (String(process.env.DEMO_LOGINS).toLowerCase() === 'false') return res.json({ accounts: [] });
  res.json({ accounts: DEMO_STAFF.map(({ username, role, password, full_name }) => ({ username, role, password, name: full_name })) });
});

module.exports = router;
