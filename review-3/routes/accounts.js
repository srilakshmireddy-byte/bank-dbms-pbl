'use strict';
const router = require('express').Router();
const { query, withTransaction, HttpError } = require('../db');
const { requirePerm } = require('../middleware/auth');
const v = require('../lib/validate');

const STATUSES = ['ACTIVE', 'DORMANT', 'FROZEN', 'CLOSED'];

const SELECT = `
  SELECT vb.account_id, vb.account_number, vb.type_name, vb.branch_name, vb.status, vb.holders, vb.balance,
         a.open_date, a.type_id, a.branch_id, t.min_balance
    FROM v_account_balances vb
    JOIN account a ON a.account_id = vb.account_id
    JOIN account_type t ON t.type_id = a.type_id`;

router.get('/', requirePerm('accounts:view'), async (req, res) => {
  const { limit, offset, page } = v.paging(req.query, { defLimit: 60, maxLimit: 500 });
  const where = [], params = [];
  if (req.query.q) {
    const q = v.like(req.query.q);
    where.push('(vb.account_number LIKE ? OR vb.holders LIKE ?)');
    params.push(q, q);
  }
  if (req.query.status) { where.push('vb.status = ?'); params.push(v.oneOf(req.query.status, STATUSES, 'Status')); }
  if (req.query.branch_id) { where.push('a.branch_id = ?'); params.push(v.id(req.query.branch_id, 'Branch')); }
  if (req.query.type_id) { where.push('a.type_id = ?'); params.push(v.id(req.query.type_id, 'Account type')); }
  if (req.query.customer_id) {
    where.push('EXISTS (SELECT 1 FROM account_holder h WHERE h.account_id = a.account_id AND h.customer_id = ?)');
    params.push(v.id(req.query.customer_id, 'Customer'));
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query(`${SELECT} ${w} ORDER BY vb.account_id LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM v_account_balances vb JOIN account a ON a.account_id = vb.account_id ${w}`, params);
  res.json({ rows, total: Number(total), page, limit });
});

router.get('/:id', requirePerm('accounts:view'), async (req, res) => {
  const id = v.id(req.params.id, 'Account');
  const [account] = await query(`${SELECT} WHERE vb.account_id = ?`, [id]);
  if (!account) throw new HttpError(404, 'Account not found');
  account.holderList = await query(
    `SELECT c.customer_id, c.full_name, h.holder_type, h.since_date
       FROM account_holder h JOIN customer c ON c.customer_id = h.customer_id
      WHERE h.account_id = ? ORDER BY h.holder_type, c.full_name`, [id]);
  account.recent = await query(
    `SELECT transaction_id, transaction_date, transaction_type, description, credit, debit, balance_after
       FROM v_account_statement WHERE account_id = ? ORDER BY transaction_id DESC LIMIT 8`, [id]);
  res.json(account);
});

/** Next account number in the seed's pattern: 5001000000 + (branch*1000 + running serial). */
async function nextAccountNumber(conn, branchId) {
  const [[row]] = await conn.execute(
    `SELECT MAX(CAST(account_number AS UNSIGNED)) AS m FROM account
      WHERE branch_id = ? AND account_number REGEXP '^5001000000[0-9]{4}$'`, [branchId]);
  const next = row.m ? BigInt(row.m) + 1n : BigInt(5001000000) * 10000n + BigInt(branchId) * 1000n + 1n;
  return String(next).padStart(14, '0');
}

router.post('/', requirePerm('accounts:create'), async (req, res) => {
  const b = req.body;
  const typeId = v.id(b.type_id, 'Account type');
  const branchId = v.id(b.branch_id, 'Branch');
  const primary = v.id(b.primary_customer_id, 'Primary holder');
  const joint = (Array.isArray(b.joint_customer_ids) ? b.joint_customer_ids : [])
    .map((x) => v.id(x, 'Joint holder')).filter((x) => x !== primary);
  const holders = [...new Set(joint)];
  const opening = b.opening_deposit === undefined || b.opening_deposit === '' || b.opening_deposit === null
    ? null : v.amount(b.opening_deposit, 'Opening deposit');

  const created = await withTransaction(async (conn) => {
    const number = await nextAccountNumber(conn, branchId);
    const [r] = await conn.execute(
      'INSERT INTO account (account_number, type_id, branch_id, status, open_date) VALUES (?, ?, ?, ?, CURDATE())',
      [number, typeId, branchId, 'ACTIVE']);
    const accountId = r.insertId;
    await conn.execute(
      "INSERT INTO account_holder (account_id, customer_id, holder_type, since_date) VALUES (?, ?, 'PRIMARY', CURDATE())",
      [accountId, primary]);
    for (const cid of holders) {
      await conn.execute(
        "INSERT INTO account_holder (account_id, customer_id, holder_type, since_date) VALUES (?, ?, 'JOINT', CURDATE())",
        [accountId, cid]);
    }
    if (opening !== null) {
      // The trigger decides whether the amount is acceptable; a rejection rolls the whole account back.
      await conn.execute(
        "INSERT INTO `transaction` (account_id, transaction_type, amount, description) VALUES (?, 'DEPOSIT', ?, 'Opening deposit')",
        [accountId, opening]);
    }
    return accountId;
  });
  const [row] = await query(`${SELECT} WHERE vb.account_id = ?`, [created]);
  res.status(201).json(row);
});

router.patch('/:id/status', requirePerm('accounts:status'), async (req, res) => {
  const id = v.id(req.params.id, 'Account');
  const status = v.oneOf(req.body.status, STATUSES, 'Status');
  const r = await query('UPDATE account SET status = ? WHERE account_id = ?', [status, id]);
  if (r.affectedRows === 0) throw new HttpError(404, 'Account not found');
  const [row] = await query(`${SELECT} WHERE vb.account_id = ?`, [id]);
  res.json(row);
});

module.exports = router;
