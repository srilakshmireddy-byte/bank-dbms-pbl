'use strict';
const router = require('express').Router();
const { query } = require('../db');
const { requirePerm } = require('../middleware/auth');
const v = require('../lib/validate');

const TYPES = ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER_DEBIT', 'TRANSFER_CREDIT', 'SERVICE_CHARGE', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT'];

router.get('/', requirePerm('audit:view'), async (req, res) => {
  const { limit, offset, page } = v.paging(req.query, { defLimit: 25 });
  const q = req.query, where = [], params = [];
  if (q.type) { where.push('transaction_type = ?'); params.push(v.oneOf(q.type, TYPES, 'Type')); }
  if (q.account) { where.push('account_number LIKE ?'); params.push(v.like(q.account)); }
  if (q.branch) { where.push('branch_name = ?'); params.push(v.text(q.branch, 'Branch', { max: 80 })); }
  if (q.status) { where.push('account_status = ?'); params.push(v.oneOf(q.status, ['ACTIVE', 'DORMANT', 'FROZEN', 'CLOSED'], 'Status')); }
  if (q.holder) { where.push('holders LIKE ?'); params.push(v.like(q.holder)); }
  if (q.from) { where.push('transaction_date >= ?'); params.push(v.date(q.from, 'From date')); }
  if (q.to) { where.push('transaction_date < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(v.date(q.to, 'To date')); }
  if (q.min_amount) { where.push('amount >= ?'); params.push(v.amount(q.min_amount, 'Minimum amount')); }
  if (q.max_amount) { where.push('amount <= ?'); params.push(v.amount(q.max_amount, 'Maximum amount')); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await query(
    `SELECT * FROM v_transaction_audit ${w} ORDER BY transaction_date DESC, transaction_id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]);
  const [totals] = await query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0) AS total_amount FROM v_transaction_audit ${w}`, params);
  res.json({ rows, total: Number(totals.total), total_amount: totals.total_amount, page, limit });
});

module.exports = router;
