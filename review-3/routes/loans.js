'use strict';
const router = require('express').Router();
const { pool, query, withTransaction, HttpError } = require('../db');
const { requirePerm } = require('../middleware/auth');
const v = require('../lib/validate');

const LOAN_TYPES = ['PERSONAL', 'VEHICLE', 'EDUCATION', 'HOME'];

const LOAN_SELECT = `
  SELECT o.loan_id, o.full_name, l.customer_id, l.account_id, a.account_number, o.loan_type, o.principal, o.interest_rate,
         o.total_payable, o.total_repaid, o.outstanding, o.status, l.start_date, l.end_date,
         (SELECT COUNT(*) FROM loan_schedule s WHERE s.loan_id = o.loan_id) AS instalments,
         (SELECT COUNT(*) FROM loan_schedule s WHERE s.loan_id = o.loan_id AND s.status = 'PAID') AS paid_instalments,
         (SELECT COUNT(*) FROM loan_schedule s WHERE s.loan_id = o.loan_id AND s.status = 'OVERDUE') AS overdue_instalments,
         (SELECT MIN(s.due_date) FROM loan_schedule s WHERE s.loan_id = o.loan_id AND s.status <> 'PAID') AS next_due
    FROM v_loan_outstanding o
    JOIN loan l ON l.loan_id = o.loan_id
    JOIN account a ON a.account_id = l.account_id`;

router.get('/', requirePerm('loans:view'), async (req, res) => {
  const where = [], params = [];
  if (req.query.status) { where.push('o.status = ?'); params.push(v.oneOf(req.query.status, ['ACTIVE', 'CLOSED', 'DEFAULTED'], 'Status')); }
  if (req.query.customer_id) { where.push('l.customer_id = ?'); params.push(v.id(req.query.customer_id, 'Customer')); }
  if (req.query.q) {
    where.push('(o.full_name LIKE ? OR o.loan_type LIKE ? OR CAST(o.loan_id AS CHAR) = ?)');
    params.push(v.like(req.query.q), v.like(req.query.q), String(req.query.q).trim());
  }
  if (req.query.overdue === '1') where.push("EXISTS (SELECT 1 FROM loan_schedule s WHERE s.loan_id = o.loan_id AND s.status = 'OVERDUE')");
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query(`${LOAN_SELECT} ${w} ORDER BY o.loan_id DESC`, params);
  const [sum] = await query(
    `SELECT COUNT(*) AS loans, COALESCE(SUM(CASE WHEN o.status = 'ACTIVE' THEN o.outstanding END), 0) AS outstanding,
            COALESCE(SUM(CASE WHEN o.status = 'ACTIVE' THEN o.principal END), 0) AS principal
       FROM v_loan_outstanding o`);
  const [od] = await query(
    `SELECT COUNT(*) AS instalments, COUNT(DISTINCT s.loan_id) AS loans,
            COALESCE(SUM(s.due_amount - COALESCE(p.paid, 0)), 0) AS amount
       FROM loan_schedule s
       LEFT JOIN (SELECT schedule_id, SUM(amount) AS paid FROM repayment WHERE status = 'APPLIED' GROUP BY schedule_id) p
         ON p.schedule_id = s.schedule_id
      WHERE s.status = 'OVERDUE'`);
  res.json({ rows, summary: { ...sum, overdue: od } });
});

router.get('/:id', requirePerm('loans:view'), async (req, res) => {
  const id = v.id(req.params.id, 'Loan');
  const [loan] = await query(`${LOAN_SELECT} WHERE o.loan_id = ?`, [id]);
  if (!loan) throw new HttpError(404, 'Loan not found');
  const schedule = await query(
    `SELECT s.schedule_id, s.due_date, s.due_amount, s.status, COALESCE(p.paid, 0) AS paid_amount
       FROM loan_schedule s
       LEFT JOIN (SELECT schedule_id, SUM(amount) AS paid FROM repayment WHERE status = 'APPLIED' GROUP BY schedule_id) p
         ON p.schedule_id = s.schedule_id
      WHERE s.loan_id = ? ORDER BY s.due_date`, [id]);
  const repayments = await query(
    'SELECT due_date, due_amount, paid_on, paid_amount, instalment_status FROM v_repayment_history WHERE loan_id = ? ORDER BY paid_on DESC', [id]);
  res.json({ ...loan, schedule, repayments });
});

router.post('/', requirePerm('loans:create'), async (req, res) => {
  const b = req.body;
  const customerId = v.id(b.customer_id, 'Customer');
  const accountId = v.id(b.account_id, 'Disbursement account');
  const type = v.oneOf(b.loan_type, LOAN_TYPES, 'Loan type');
  const amt = v.amount(b.amount, 'Loan amount');
  const rate = String(b.interest_rate ?? '').trim();
  if (!/^-?\d{1,3}(\.\d{1,2})?$/.test(rate)) throw new HttpError(400, 'Interest rate must be a number with at most 2 decimals');
  const start = v.date(b.start_date, 'Start date');
  const months = Number(b.tenure_months);
  if (!Number.isInteger(months) || months < 1 || months > 360) throw new HttpError(400, 'Tenure must be a whole number of months between 1 and 360');

  const [held] = await query('SELECT 1 AS ok FROM account_holder WHERE account_id = ? AND customer_id = ?', [accountId, customerId]);
  if (!held) throw new HttpError(400, 'The disbursement account must be held by the borrower');

  const loanId = await withTransaction(async (conn) => {
    const [r] = await conn.execute(
      `INSERT INTO loan (customer_id, account_id, loan_type, amount, interest_rate, start_date, end_date, status)
       VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(?, INTERVAL ? MONTH), 'ACTIVE')`,
      [customerId, accountId, type, amt, rate, start, start, String(months)]);
    const id = r.insertId;
    // Disburse into the account - the trigger rejects a non-ACTIVE account and rolls the whole loan back.
    await conn.execute(
      "INSERT INTO `transaction` (account_id, transaction_type, amount, description) VALUES (?, 'LOAN_DISBURSEMENT', ?, ?)",
      [accountId, amt, `${type.charAt(0)}${type.slice(1).toLowerCase()} loan #${id} disbursement`]);
    // Reducing-balance EMI schedule, same formula as the sample data: P*r*(1+r)^n / ((1+r)^n - 1), r = rate/1200.
    await conn.execute(
      `INSERT INTO loan_schedule (loan_id, due_date, due_amount, status)
       WITH RECURSIVE k (n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM k WHERE n < ?)
       SELECT l.loan_id, DATE_ADD(l.start_date, INTERVAL k.n MONTH),
              ROUND(l.amount * (l.interest_rate / 1200) * POW(1 + l.interest_rate / 1200, ?)
                    / (POW(1 + l.interest_rate / 1200, ?) - 1), 2),
              IF(DATE_ADD(l.start_date, INTERVAL k.n MONTH) < CURDATE(), 'OVERDUE', 'PENDING')
         FROM loan l JOIN k WHERE l.loan_id = ?`,
      [months, months, months, id]);
    return id;
  });
  const [loan] = await query(`${LOAN_SELECT} WHERE o.loan_id = ?`, [loanId]);
  res.status(201).json(loan);
});

router.post('/:id/repay', requirePerm('loans:repay'), async (req, res) => {
  const loanId = v.id(req.params.id, 'Loan');
  const scheduleId = v.id(req.body.schedule_id, 'Instalment');
  const amt = v.amount(req.body.amount, 'Repayment amount');

  // The procedure does not stop a second payment on an instalment that is already PAID, so refuse that here.
  const [item] = await query('SELECT status FROM loan_schedule WHERE schedule_id = ? AND loan_id = ?', [scheduleId, loanId]);
  if (item && item.status === 'PAID') throw new HttpError(409, 'This instalment is already fully paid');

  const conn = await pool.getConnection();
  try {
    await conn.execute('CALL sp_loan_repayment(?, ?, ?, NULL)', [loanId, scheduleId, amt]);
  } finally {
    conn.release();
  }
  const [loan] = await query(`${LOAN_SELECT} WHERE o.loan_id = ?`, [loanId]);
  const [inst] = await query('SELECT schedule_id, due_date, due_amount, status FROM loan_schedule WHERE schedule_id = ?', [scheduleId]);
  res.json({ loan, instalment: inst });
});

module.exports = router;
