'use strict';
const router = require('express').Router();
const { query, HttpError } = require('../db');
const { requirePerm } = require('../middleware/auth');
const v = require('../lib/validate');

async function post(type, req, res) {
  const accountId = v.id(req.body.account_id, 'Account');
  const amt = v.amount(req.body.amount);
  const description = v.text(req.body.description, 'Description', { max: 150, required: false })
    || (type === 'DEPOSIT' ? 'Cash deposit' : 'Cash withdrawal');
  // A plain INSERT: trg_txn_before_insert validates amount / status / balance and trg_txn_after_insert updates the balance.
  const r = await query(
    "INSERT INTO `transaction` (account_id, transaction_type, amount, description) VALUES (?, ?, ?, ?)",
    [accountId, type, amt, description]);
  const [txn] = await query(
    `SELECT t.transaction_id, t.transaction_date, t.transaction_type, t.amount, t.description, t.balance_after, a.account_number
       FROM \`transaction\` t JOIN account a ON a.account_id = t.account_id WHERE t.transaction_id = ?`, [r.insertId]);
  res.status(201).json(txn);
}

router.post('/deposit', requirePerm('transactions:post'), (req, res) => post('DEPOSIT', req, res));
router.post('/withdraw', requirePerm('transactions:post'), (req, res) => post('WITHDRAWAL', req, res));

router.get('/recent', requirePerm('transactions:recent'), async (_req, res) => {
  res.json(await query(
    `SELECT transaction_id, transaction_date, transaction_type, amount, account_number, branch_name, holders, balance_after
       FROM v_transaction_audit ORDER BY transaction_id DESC LIMIT 12`));
});

router.get('/:id', requirePerm('transactions:recent'), async (req, res) => {
  const [row] = await query('SELECT * FROM v_transaction_audit WHERE transaction_id = ?', [v.id(req.params.id, 'Transaction')]);
  if (!row) throw new HttpError(404, 'Transaction not found');
  res.json(row);
});

module.exports = router;
