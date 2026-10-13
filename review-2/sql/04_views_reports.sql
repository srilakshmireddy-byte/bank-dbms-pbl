-- Reporting views. Run after 03_sample_data.sql.
USE bank_db;

-- =====================================================================
-- PART 4 : VIEWS  (reusable reports)
-- =====================================================================

-- Balances: who holds what, where
CREATE VIEW v_account_balances AS
SELECT a.account_id, a.account_number, at.type_name, b.branch_name, a.status,
       GROUP_CONCAT(c.full_name ORDER BY h.holder_type SEPARATOR ', ') AS holders,
       a.balance
  FROM account a
  JOIN account_type at   ON at.type_id = a.type_id
  JOIN branch b          ON b.branch_id = a.branch_id
  JOIN account_holder h  ON h.account_id = a.account_id
  JOIN customer c        ON c.customer_id = h.customer_id
 GROUP BY a.account_id, a.account_number, at.type_name, b.branch_name, a.status, a.balance;

-- Account statement: every posting with direction and running balance
CREATE VIEW v_account_statement AS
SELECT t.account_id, a.account_number, t.transaction_id, t.transaction_date,
       t.transaction_type, t.description,
       CASE WHEN t.transaction_type IN ('DEPOSIT','TRANSFER_CREDIT','LOAN_DISBURSEMENT')
            THEN t.amount ELSE 0 END AS credit,
       CASE WHEN t.transaction_type IN ('DEPOSIT','TRANSFER_CREDIT','LOAN_DISBURSEMENT')
            THEN 0 ELSE t.amount END AS debit,
       t.balance_after
  FROM `transaction` t JOIN account a ON a.account_id = t.account_id;

-- Transaction audit: posting with account, branch and holder
CREATE VIEW v_transaction_audit AS
SELECT t.transaction_id, t.transaction_date, t.transaction_type, t.amount,
       a.account_number, b.branch_name, a.status AS account_status,
       (SELECT GROUP_CONCAT(c.full_name SEPARATOR ', ')
          FROM account_holder h JOIN customer c ON c.customer_id = h.customer_id
         WHERE h.account_id = a.account_id) AS holders,
       t.balance_after
  FROM `transaction` t
  JOIN account a ON a.account_id = t.account_id
  JOIN branch b  ON b.branch_id = a.branch_id;

-- Transfers: sender, receiver and the proof that debit = credit
CREATE VIEW v_transfers AS
SELECT tf.transfer_id, td.transaction_date,
       ad.account_number AS from_account, ac.account_number AS to_account,
       td.amount AS debited, tc.amount AS credited,
       (td.amount = tc.amount) AS balanced, tf.remarks
  FROM transfer tf
  JOIN `transaction` td ON td.transaction_id = tf.debit_transaction_id
  JOIN `transaction` tc ON tc.transaction_id = tf.credit_transaction_id
  JOIN account ad ON ad.account_id = td.account_id
  JOIN account ac ON ac.account_id = tc.account_id;

-- Loan outstanding = total scheduled - total repaid
CREATE VIEW v_loan_outstanding AS
SELECT l.loan_id, c.full_name, l.loan_type, l.amount AS principal, l.interest_rate,
       s.total_payable,
       COALESCE(r.total_repaid, 0) AS total_repaid,
       s.total_payable - COALESCE(r.total_repaid, 0) AS outstanding,
       l.status
  FROM loan l
  JOIN customer c ON c.customer_id = l.customer_id
  JOIN (SELECT loan_id, SUM(due_amount) AS total_payable FROM loan_schedule GROUP BY loan_id) s
    ON s.loan_id = l.loan_id
  LEFT JOIN (SELECT ls.loan_id, SUM(rp.amount) AS total_repaid
               FROM repayment rp JOIN loan_schedule ls ON ls.schedule_id = rp.schedule_id
              WHERE rp.status = 'APPLIED' GROUP BY ls.loan_id) r
    ON r.loan_id = l.loan_id;

-- Repayments: which instalment each payment settled
CREATE VIEW v_repayment_history AS
SELECT l.loan_id, c.full_name, ls.due_date, ls.due_amount,
       t.transaction_date AS paid_on, rp.amount AS paid_amount, ls.status AS instalment_status
  FROM repayment rp
  JOIN loan_schedule ls ON ls.schedule_id = rp.schedule_id
  JOIN loan l           ON l.loan_id = ls.loan_id
  JOIN customer c       ON c.customer_id = l.customer_id
  JOIN `transaction` t  ON t.transaction_id = rp.transaction_id;

-- Branch summary
CREATE VIEW v_branch_summary AS
SELECT b.branch_id, b.branch_name, b.city,
       COUNT(DISTINCT a.account_id)                         AS accounts,
       COALESCE(SUM(a.balance), 0)                          AS total_deposits,
       ROUND(COALESCE(AVG(a.balance), 0), 2)                AS avg_balance,
       COUNT(DISTINCT CASE WHEN a.status <> 'ACTIVE' THEN a.account_id END) AS inactive_accounts
  FROM branch b LEFT JOIN account a ON a.branch_id = b.branch_id
 GROUP BY b.branch_id, b.branch_name, b.city;
