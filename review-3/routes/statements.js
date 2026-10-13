'use strict';
const router = require('express').Router();
const { query, HttpError } = require('../db');
const { requirePerm } = require('../middleware/auth');
const v = require('../lib/validate');

/**
 * Statement from v_account_statement. The running balance is rebuilt in date order
 * (opening balance + credits - debits) so it always reads correctly top to bottom, even for
 * postings that were back-dated when the sample data was loaded.
 */
async function buildStatement(accountId, from, to) {
  const [acc] = await query(
    `SELECT vb.account_id, vb.account_number, vb.type_name, vb.branch_name, vb.status, vb.holders, vb.balance, a.open_date
       FROM v_account_balances vb JOIN account a ON a.account_id = vb.account_id WHERE vb.account_id = ?`, [accountId]);
  if (!acc) throw new HttpError(404, 'Account not found');

  const [{ opening }] = await query(
    'SELECT COALESCE(SUM(credit - debit), 0) AS opening FROM v_account_statement WHERE account_id = ? AND transaction_date < ?',
    [accountId, from]);
  const rows = await query(
    `SELECT transaction_id, transaction_date, transaction_type, description, credit, debit
       FROM v_account_statement
      WHERE account_id = ? AND transaction_date >= ? AND transaction_date < DATE_ADD(?, INTERVAL 1 DAY)
      ORDER BY transaction_date, transaction_id`, [accountId, from, to]);

  // Money in integer paise to avoid floating-point drift.
  const paise = (s) => Math.round(Number(s) * 100);
  const fmt = (p) => (p / 100).toFixed(2);
  let running = paise(opening), credits = 0, debits = 0;
  const lines = rows.map((r) => {
    const c = paise(r.credit), d = paise(r.debit);
    credits += c; debits += d; running += c - d;
    return { ...r, balance: fmt(running) };
  });
  return {
    account: acc, from, to, opening_balance: opening, closing_balance: fmt(running),
    total_credits: fmt(credits), total_debits: fmt(debits), count: lines.length, lines,
  };
}

function range(src) {
  const from = v.date(src.from, 'From date'), to = v.date(src.to, 'To date');
  return { from, to };
}

router.get('/history', requirePerm('statements:view'), async (req, res) => {
  const params = [];
  let w = '';
  if (req.query.account_id) { w = 'WHERE s.account_id = ?'; params.push(v.id(req.query.account_id, 'Account')); }
  res.json(await query(
    `SELECT s.statement_id, s.account_id, a.account_number, s.from_date, s.to_date, s.generated_date
       FROM statement s JOIN account a ON a.account_id = s.account_id ${w}
      ORDER BY s.generated_date DESC, s.statement_id DESC LIMIT 20`, params));
});

// Preview without logging
router.get('/', requirePerm('statements:view'), async (req, res) => {
  const { from, to } = range(req.query);
  res.json(await buildStatement(v.id(req.query.account_id, 'Account'), from, to));
});

// Generate = log the request in the `statement` table (its CHECK validates the period) and return the statement.
router.post('/', requirePerm('statements:view'), async (req, res) => {
  const accountId = v.id(req.body.account_id, 'Account');
  const { from, to } = range(req.body);
  await query('INSERT INTO statement (account_id, from_date, to_date) VALUES (?, ?, ?)', [accountId, from, to]);
  res.status(201).json(await buildStatement(accountId, from, to));
});

module.exports = router;
