'use strict';
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { pool, query, describeError } = require('./db');
const { authenticate } = require('./middleware/auth');
const { ensureStaffTable } = require('./lib/staff');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', false);

app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    // Everything is served from this origin (fonts, scripts, styles are bundled); no CDNs.
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
  });
  next();
});
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// ---- API ----------------------------------------------------------------
const api = express.Router();
api.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
api.use('/auth', require('./routes/auth'));            // login / logout / me
api.use(authenticate);                                  // everything below needs a signed-in staff member
api.use('/dashboard', require('./routes/dashboard'));
api.use('/customers', require('./routes/customers'));
api.use('/accounts', require('./routes/accounts'));
api.use('/transactions', require('./routes/transactions'));
api.use('/transfers', require('./routes/transfers'));
api.use('/beneficiaries', require('./routes/beneficiaries'));
api.use('/statements', require('./routes/statements'));
api.use('/loans', require('./routes/loans'));
api.use('/audit', require('./routes/audit'));
api.use('/rule-tests', require('./routes/ruleTester'));
api.use('/', require('./routes/lookups'));              // /branches, /account-types
api.use((_req, res) => res.status(404).json({ error: 'No such API endpoint' }));
app.use('/api', api);

// ---- Front end (plain static files) -------------------------------------
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: 0, etag: true }));

// ---- Errors -> JSON -------------------------------------------------------
app.use((err, req, res, _next) => {
  const { status, body } = describeError(err);
  if (status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(status).json(body);
});

/** Instalments whose due date has passed and are still PENDING become OVERDUE (the same rule the sample data applies). */
async function markOverdue() {
  const r = await query("UPDATE loan_schedule SET status = 'OVERDUE' WHERE status = 'PENDING' AND due_date < CURDATE()");
  if (r.affectedRows) console.log(`[loans] ${r.affectedRows} instalment(s) marked OVERDUE`);
}

async function start() {
  const port = Number(process.env.PORT) || 3000;
  try {
    await query('SELECT 1 FROM v_branch_summary LIMIT 1');
  } catch (e) {
    console.error(`\nCannot use the database "${process.env.DB_NAME || 'bank_db'}": ${e.message}`);
    console.error('Check DB_* values in .env and that you ran:  mysql -u root -p < bank_review2.sql\n');
    process.exit(1);
  }
  await ensureStaffTable();
  await markOverdue();
  setInterval(() => markOverdue().catch((e) => console.error('[loans]', e.message)), 60 * 60 * 1000).unref();

  const server = app.listen(port, () => console.log(`Woxsen Co-operative Bank is running at http://localhost:${port}`));
  const stop = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (require.main === module) start();
module.exports = app;
