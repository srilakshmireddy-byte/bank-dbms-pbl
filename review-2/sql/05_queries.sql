USE bank_db;
-- Q1 JOIN: account statement for account 1 (running balance in posting order)
SELECT t.transaction_id, t.transaction_date, t.transaction_type, t.amount, t.balance_after
FROM `transaction` t JOIN account a ON a.account_id=t.account_id
WHERE a.account_number='50010000001001' ORDER BY t.transaction_id;  -- posting order = running-balance order
-- Q2 JOIN (4 tables): customers with accounts, type and branch
SELECT c.full_name, a.account_number, at.type_name, b.branch_name, a.balance
FROM customer c JOIN account_holder h ON h.customer_id=c.customer_id
JOIN account a ON a.account_id=h.account_id JOIN account_type at ON at.type_id=a.type_id
JOIN branch b ON b.branch_id=a.branch_id ORDER BY a.balance DESC LIMIT 6;
-- Q3 SUBQUERY: accounts holding more than the average balance
SELECT account_number, balance FROM account
WHERE balance > (SELECT AVG(balance) FROM account WHERE status='ACTIVE') ORDER BY balance DESC;
-- Q4 SUBQUERY (correlated): customers with no loan
SELECT full_name FROM customer c WHERE NOT EXISTS (SELECT 1 FROM loan l WHERE l.customer_id=c.customer_id);
-- Q5 AGGREGATION: monthly deposits vs withdrawals
SELECT DATE_FORMAT(transaction_date,'%Y-%m') AS month,
 SUM(CASE WHEN transaction_type='DEPOSIT' THEN amount END) AS deposits,
 SUM(CASE WHEN transaction_type='WITHDRAWAL' THEN amount END) AS withdrawals,
 COUNT(*) AS txns
FROM `transaction` GROUP BY month ORDER BY month;
-- Q6 AGGREGATION + HAVING: accounts with more than 6 transactions
SELECT account_id, COUNT(*) AS txn_count, SUM(amount) AS total_amount
FROM `transaction` GROUP BY account_id HAVING COUNT(*)>6 ORDER BY txn_count DESC;
-- Q7 VIEW: transfers
SELECT * FROM v_transfers;
-- Q8 VIEW: loan outstanding
SELECT * FROM v_loan_outstanding;
-- Q9 VIEW: repayment history
SELECT * FROM v_repayment_history ORDER BY 1 LIMIT 5;
-- Q10 VIEW: branch summary
SELECT * FROM v_branch_summary;
-- Q11 AUDIT: balance in account table = last ledger balance (0 rows = consistent)
SELECT a.account_id, a.balance, l.balance_after FROM account a
JOIN `transaction` l ON l.transaction_id=(SELECT MAX(transaction_id) FROM `transaction` WHERE account_id=a.account_id)
WHERE a.balance<>l.balance_after;
-- Q12 Overdue instalments
SELECT s.schedule_id, s.loan_id, s.due_date, s.due_amount, s.status FROM loan_schedule s WHERE s.status='OVERDUE';
