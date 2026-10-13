'use strict';
const router = require('express').Router();
const { pool, HttpError } = require('../db');
const { requirePerm } = require('../middleware/auth');
const v = require('../lib/validate');

const INSERT = "INSERT INTO `transaction` (account_id, transaction_type, amount, description) VALUES (?, ?, ?, 'Rule tester probe')";

// Every scenario is attempted inside a transaction that is ALWAYS rolled back, so nothing it does can persist.
// The point is to show the database's own verdict; no rule is re-implemented here.
const SCENARIOS = {
  overdraw: {
    title: 'Overdraw an account',
    rule: 'Withdrawals may not take the balance below the account type\'s minimum balance.',
    needs: ['account_id', 'amount'],
    sql: (p) => `INSERT INTO \`transaction\` (account_id, transaction_type, amount) VALUES (${p.account_id}, 'WITHDRAWAL', ${p.amount});`,
    run: async (c, p) => { await c.execute(INSERT, [p.account_id, 'WITHDRAWAL', p.amount]); },
  },
  frozen: {
    title: 'Post to a frozen account',
    rule: 'Only ACTIVE accounts accept postings.',
    needs: ['account_id', 'amount'],
    sql: (p) => `INSERT INTO \`transaction\` (account_id, transaction_type, amount) VALUES (${p.account_id}, 'DEPOSIT', ${p.amount});`,
    run: async (c, p) => { await c.execute(INSERT, [p.account_id, 'DEPOSIT', p.amount]); },
  },
  negative: {
    title: 'Post a negative amount',
    rule: 'Every transaction amount must be positive.',
    needs: ['account_id', 'amount'],
    sql: (p) => `INSERT INTO \`transaction\` (account_id, transaction_type, amount) VALUES (${p.account_id}, 'DEPOSIT', ${p.amount});`,
    run: async (c, p) => { await c.execute(INSERT, [p.account_id, 'DEPOSIT', p.amount]); },
  },
  zero: {
    title: 'Post a zero amount',
    rule: 'Zero is not a positive amount.',
    needs: ['account_id'],
    sql: (p) => `INSERT INTO \`transaction\` (account_id, transaction_type, amount) VALUES (${p.account_id}, 'DEPOSIT', 0);`,
    run: async (c, p) => { await c.execute(INSERT, [p.account_id, 'DEPOSIT', '0']); },
  },
  closed: {
    title: 'Post to a closed account',
    rule: 'Closed accounts are not ACTIVE, so postings are refused.',
    needs: ['account_id', 'amount'],
    sql: (p) => `INSERT INTO \`transaction\` (account_id, transaction_type, amount) VALUES (${p.account_id}, 'DEPOSIT', ${p.amount});`,
    run: async (c, p) => { await c.execute(INSERT, [p.account_id, 'DEPOSIT', p.amount]); },
  },
  same_account: {
    title: 'Transfer to the same account',
    rule: 'A transfer needs two different accounts.',
    needs: ['account_id', 'amount'],
    sql: (p) => `CALL sp_transfer(${p.account_id}, ${p.account_id}, ${p.amount}, 'probe', NULL);`,
    // sp_transfer refuses before it opens its own transaction, so it cannot commit anything here.
    run: async (c, p) => { await c.execute('CALL sp_transfer(?, ?, ?, ?, NULL)', [p.account_id, p.account_id, p.amount, 'Rule tester probe']); },
  },
  unbalanced: {
    title: 'Unbalanced transfer legs',
    rule: 'The debit leg and the credit leg of a transfer must be equal.',
    needs: ['account_id', 'to_account_id', 'amount'],
    sql: (p) => `INSERT INTO \`transaction\` ... TRANSFER_DEBIT ${p.amount} from #${p.account_id};\n` +
                `INSERT INTO \`transaction\` ... TRANSFER_CREDIT ${p.amount} + 1.00 to #${p.to_account_id};\n` +
                'INSERT INTO transfer (debit_transaction_id, credit_transaction_id) VALUES (<debit>, <credit>);',
    run: async (c, p) => {
      const [d] = await c.execute(INSERT, [p.account_id, 'TRANSFER_DEBIT', p.amount]);
      const [k] = await c.execute(INSERT, [p.to_account_id, 'TRANSFER_CREDIT', (Number(p.amount) + 1).toFixed(2)]);
      await c.execute('INSERT INTO transfer (debit_transaction_id, credit_transaction_id, remarks) VALUES (?, ?, ?)', [d.insertId, k.insertId, 'probe']);
    },
  },
};

router.get('/scenarios', requirePerm('ruletester:run'), (_req, res) => {
  res.json(Object.entries(SCENARIOS).map(([key, s]) => ({ key, title: s.title, rule: s.rule, needs: s.needs })));
});

router.post('/:scenario', requirePerm('ruletester:run'), async (req, res) => {
  const sc = SCENARIOS[req.params.scenario];
  if (!sc) throw new HttpError(404, 'Unknown scenario');
  const p = {
    account_id: v.id(req.body.account_id, 'Account'),
    to_account_id: sc.needs.includes('to_account_id') ? v.id(req.body.to_account_id, 'Second account') : null,
    amount: sc.needs.includes('amount') ? v.amount(req.body.amount) : '0',
  };
  const conn = await pool.getConnection();
  let outcome;
  try {
    await conn.beginTransaction();
    try {
      await sc.run(conn, p);
      outcome = { rejected: false };
    } catch (err) {
      if (!err.sqlState) throw err;
      outcome = { rejected: true, sqlState: err.sqlState, errno: err.errno, message: err.sqlMessage };
    }
  } finally {
    try { await conn.rollback(); } catch (_) { /* nothing to roll back */ }
    conn.release();
  }
  res.json({ scenario: req.params.scenario, title: sc.title, rule: sc.rule, sql: sc.sql(p), rolledBack: true, ...outcome });
});

module.exports = router;
