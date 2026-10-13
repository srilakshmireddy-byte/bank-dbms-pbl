'use strict';
const router = require('express').Router();
const { query } = require('../db');
const { requirePerm } = require('../middleware/auth');

router.get('/', requirePerm('dashboard:view'), async (_req, res) => {
  const [totals] = await query(
    `SELECT (SELECT COUNT(*) FROM customer) AS customers,
            (SELECT COUNT(*) FROM account) AS accounts,
            (SELECT COUNT(*) FROM account WHERE status = 'ACTIVE') AS active_accounts,
            (SELECT COUNT(*) FROM account WHERE status IN ('FROZEN','DORMANT')) AS restricted_accounts,
            (SELECT COALESCE(SUM(balance), 0) FROM account) AS total_deposits,
            (SELECT COUNT(*) FROM \`transaction\` WHERE DATE(transaction_date) = CURDATE()) AS txns_today,
            (SELECT COUNT(*) FROM \`transaction\` WHERE transaction_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS txns_month,
            (SELECT COUNT(*) FROM loan WHERE status = 'ACTIVE') AS active_loans,
            (SELECT COALESCE(SUM(outstanding), 0) FROM v_loan_outstanding WHERE status = 'ACTIVE') AS loan_outstanding,
            (SELECT COUNT(*) FROM loan_schedule WHERE status = 'OVERDUE') AS overdue_instalments`);
  // Last 6 calendar months, zero-filled, deposits vs withdrawals (DEPOSIT / WITHDRAWAL postings only).
  const monthly = await query(
    `WITH RECURSIVE m (d, n) AS (
        SELECT CAST(DATE_FORMAT(CURDATE(), '%Y-%m-01') AS DATE), 0
        UNION ALL SELECT DATE_SUB(d, INTERVAL 1 MONTH), n + 1 FROM m WHERE n < 5)
     SELECT DATE_FORMAT(m.d, '%Y-%m') AS month, DATE_FORMAT(m.d, '%b') AS label,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'DEPOSIT' THEN t.amount END), 0) AS deposits,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'WITHDRAWAL' THEN t.amount END), 0) AS withdrawals
       FROM m LEFT JOIN \`transaction\` t
         ON t.transaction_date >= m.d AND t.transaction_date < DATE_ADD(m.d, INTERVAL 1 MONTH)
      GROUP BY m.d ORDER BY m.d`);
  const branches = await query(
    `SELECT s.branch_id, s.branch_name, s.city, s.accounts, s.total_deposits, s.avg_balance, s.inactive_accounts, b.branch_manager
       FROM v_branch_summary s JOIN branch b ON b.branch_id = s.branch_id ORDER BY s.branch_id`);
  const recent = await query(
    `SELECT transaction_id, transaction_date, transaction_type, amount, account_number, holders
       FROM v_transaction_audit ORDER BY transaction_id DESC LIMIT 6`);
  res.json({ totals, monthly, branches, recent });
});

module.exports = router;
