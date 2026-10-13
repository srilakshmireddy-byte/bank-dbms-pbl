-- Sample data (posted through the triggers). Run after 02_triggers.sql.
USE bank_db;

-- =====================================================================
-- PART 3 : SAMPLE DATA
-- (all money movements go through the triggers, so balances stay consistent)
-- =====================================================================

INSERT INTO branch (branch_name, address, city, phone, branch_manager) VALUES
 ('Hanamkonda Main',  'Nakkalagutta Road',      'Hanamkonda', '0870-2501122', 'K. Ramesh Babu'),
 ('Warangal Fort',    'Fort Road, Mattewada',   'Warangal',   '0870-2445566', 'S. Padmavathi'),
 ('Hyderabad Banjara','Road No. 12, Banjara Hills','Hyderabad','040-23551234', 'M. Anil Kumar'),
 ('Karimnagar Town',  'Mankammathota',          'Karimnagar', '0878-2233445', 'P. Vijaya Lakshmi');

INSERT INTO account_type (type_name, description, min_balance, is_interest_bearing) VALUES
 ('Savings',       'Regular savings account',            1000.00, TRUE),
 ('Current',       'Business current account',           5000.00, FALSE),
 ('Salary',        'Zero balance salary account',           0.00, TRUE),
 ('Fixed Deposit', 'Term deposit account',              10000.00, TRUE);

INSERT INTO customer (full_name, date_of_birth, email, phone, address, id_proof) VALUES
 ('Ananya Reddy',       '1998-04-12', 'ananya.reddy@example.com',   '9848011001', 'Kazipet, Hanamkonda',       'ABCPR1234A'),
 ('Rahul Verma',        '1995-09-30', 'rahul.verma@example.com',    '9848011002', 'Subedari, Hanamkonda',      'BCDPV2345B'),
 ('Sneha Kapoor',       '1990-01-22', 'sneha.kapoor@example.com',   '9848011003', 'Hunter Road, Warangal',     'CDEPK3456C'),
 ('Arjun Naidu',        '1987-07-05', 'arjun.naidu@example.com',    '9848011004', 'Jubilee Hills, Hyderabad',  'DEFPN4567D'),
 ('Priya Sharma',       '2000-11-18', 'priya.sharma@example.com',   '9848011005', 'Karimnagar',                'EFGPS5678E'),
 ('Mohammed Imran',     '1992-03-09', 'imran.mohammed@example.com', '9848011006', 'Mattewada, Warangal',       'FGHPM6789F'),
 ('Lakshmi Devi',       '1975-12-25', 'lakshmi.devi@example.com',   '9848011007', 'Hanamkonda',                'GHIPD7890G'),
 ('Vikram Singh',       '1983-06-14', 'vikram.singh@example.com',   '9848011008', 'Banjara Hills, Hyderabad',  'HIJPS8901H'),
 ('Divya Menon',        '1999-08-02', 'divya.menon@example.com',    '9848011009', 'Warangal',                  'IJKPM9012I'),
 ('Karthik Goud',       '1993-02-27', 'karthik.goud@example.com',   '9848011010', 'Karimnagar',                'JKLPG0123J');

INSERT INTO account (account_number, type_id, branch_id, status, open_date) VALUES
 ('50010000001001', 1, 1, 'ACTIVE',  '2024-01-15'),   -- 1  Ananya
 ('50010000001002', 1, 1, 'ACTIVE',  '2024-02-10'),   -- 2  Rahul
 ('50010000002001', 1, 2, 'ACTIVE',  '2023-11-05'),   -- 3  Sneha
 ('50010000003001', 2, 3, 'ACTIVE',  '2022-06-20'),   -- 4  Arjun (current)
 ('50010000004001', 3, 4, 'ACTIVE',  '2025-03-01'),   -- 5  Priya (salary)
 ('50010000002002', 1, 2, 'ACTIVE',  '2024-07-18'),   -- 6  Imran
 ('50010000001003', 4, 1, 'ACTIVE',  '2023-09-12'),   -- 7  Lakshmi (FD)
 ('50010000003002', 1, 3, 'ACTIVE',  '2024-04-02'),   -- 8  Vikram + Divya (joint)
 ('50010000002003', 3, 2, 'ACTIVE',  '2024-10-09'),   -- 9  Divya (frozen)
 ('50010000004002', 1, 4, 'ACTIVE',  '2025-01-20'),   -- 10 Karthik
 ('50010000001004', 1, 1, 'CLOSED',  '2021-05-30');   -- 11 Lakshmi (closed)

INSERT INTO account_holder (account_id, customer_id, holder_type, since_date) VALUES
 (1, 1, 'PRIMARY', '2024-01-15'),
 (2, 2, 'PRIMARY', '2024-02-10'),
 (3, 3, 'PRIMARY', '2023-11-05'),
 (4, 4, 'PRIMARY', '2022-06-20'),
 (5, 5, 'PRIMARY', '2025-03-01'),
 (6, 6, 'PRIMARY', '2024-07-18'),
 (7, 7, 'PRIMARY', '2023-09-12'),
 (8, 8, 'PRIMARY', '2024-04-02'),
 (8, 9, 'JOINT',   '2024-04-02'),
 (9, 9, 'PRIMARY', '2024-10-09'),
 (10,10,'PRIMARY', '2025-01-20'),
 (11, 7,'PRIMARY', '2021-05-30');

-- Opening deposits and everyday activity (posted through the trigger)
INSERT INTO `transaction` (account_id, transaction_type, amount, transaction_date, description) VALUES
 (1, 'DEPOSIT',    50000.00, '2026-07-01 10:15:00', 'Opening cash deposit'),
 (2, 'DEPOSIT',    75000.00, '2026-07-01 11:00:00', 'Cheque deposit'),
 (3, 'DEPOSIT',    42000.00, '2026-07-02 09:45:00', 'Cash deposit'),
 (4, 'DEPOSIT',   250000.00, '2026-07-02 12:30:00', 'Business receipts'),
 (5, 'DEPOSIT',    38000.00, '2026-07-03 10:00:00', 'Salary credit - July'),
 (6, 'DEPOSIT',    20000.00, '2026-07-03 14:20:00', 'Cash deposit'),
 (7, 'DEPOSIT',   500000.00, '2026-07-04 10:30:00', 'Fixed deposit principal'),
 (8, 'DEPOSIT',   120000.00, '2026-07-04 15:10:00', 'Joint account funding'),
 (10,'DEPOSIT',    30000.00, '2026-07-05 11:40:00', 'Cash deposit'),
 (9, 'DEPOSIT',    15000.00, '2026-07-05 16:00:00', 'Initial deposit'),
 (1, 'WITHDRAWAL',  8000.00, '2026-07-10 17:05:00', 'ATM withdrawal'),
 (2, 'WITHDRAWAL', 12000.00, '2026-07-12 10:25:00', 'Cash withdrawal'),
 (3, 'WITHDRAWAL',  5000.00, '2026-07-14 13:00:00', 'ATM withdrawal'),
 (4, 'WITHDRAWAL', 60000.00, '2026-07-15 12:00:00', 'Supplier payment'),
 (5, 'DEPOSIT',    38000.00, '2026-08-03 10:00:00', 'Salary credit - August'),
 (5, 'WITHDRAWAL', 15000.00, '2026-08-05 18:30:00', 'Rent payment withdrawal'),
 (8, 'WITHDRAWAL', 25000.00, '2026-08-08 11:15:00', 'Household expenses'),
 (10,'WITHDRAWAL',  4000.00, '2026-08-09 09:50:00', 'ATM withdrawal'),
 (6, 'DEPOSIT',    15000.00, '2026-08-12 15:35:00', 'Cash deposit'),
 (1, 'DEPOSIT',    22000.00, '2026-08-18 10:10:00', 'Freelance payment received'),
 (5, 'DEPOSIT',    38000.00, '2026-09-03 10:00:00', 'Salary credit - September'),
 (2, 'DEPOSIT',    18000.00, '2026-09-06 11:45:00', 'Cheque deposit'),
 (4, 'DEPOSIT',    90000.00, '2026-09-10 12:20:00', 'Business receipts');

-- Account 9 is frozen only after its opening deposit has been posted
UPDATE account SET status = 'FROZEN' WHERE account_id = 9;

-- Transfers (each creates a debit leg and a credit leg atomically)
CALL sp_transfer(1, 2,  5000.00, 'Rent share',            '2026-07-20 10:00:00');
CALL sp_transfer(2, 3,  7500.00, 'Gift to sister',        '2026-07-25 14:30:00');
CALL sp_transfer(4, 6, 20000.00, 'Vendor settlement',     '2026-08-02 11:00:00');
CALL sp_transfer(8, 1,  6000.00, 'Tuition support',       '2026-08-14 16:10:00');
CALL sp_transfer(3, 10, 3000.00, 'Friend repayment',      '2026-08-22 12:45:00');
CALL sp_transfer(6, 2,  4500.00, 'Shared purchase',       '2026-09-01 18:00:00');
CALL sp_transfer(5, 1, 10000.00, 'Savings top-up',        '2026-09-05 09:30:00');
CALL sp_transfer(2, 8,  9000.00, 'Joint account top-up',  '2026-09-12 13:05:00');

-- Service charges (debit transaction + charge details)
INSERT INTO `transaction` (account_id, transaction_type, amount, transaction_date, description) VALUES
 (1, 'SERVICE_CHARGE', 118.00, '2026-07-31 23:00:00', 'SMS alert charges - Q2'),
 (2, 'SERVICE_CHARGE', 236.00, '2026-08-01 23:00:00', 'Debit card annual fee'),
 (4, 'SERVICE_CHARGE', 500.00, '2026-08-31 23:00:00', 'Current account maintenance'),
 (3, 'SERVICE_CHARGE',  59.00, '2026-09-01 23:00:00', 'SMS alert charges');
INSERT INTO service_charge (transaction_id, charge_type)
SELECT transaction_id,
       CASE WHEN description LIKE 'SMS%' THEN 'SMS_ALERT'
            WHEN description LIKE 'Debit card%' THEN 'ATM_FEE'
            ELSE 'ANNUAL_MAINTENANCE' END
  FROM `transaction` WHERE transaction_type = 'SERVICE_CHARGE';

INSERT INTO beneficiary (customer_id, beneficiary_name, account_number, bank_name, ifsc_code, type, created_at) VALUES
 (1, 'Rahul Verma',      '50010000001002', 'Woxsen Co-operative Bank', 'WOXS0000001', 'INTERNAL', '2026-07-18 10:00:00'),
 (1, 'Suresh Reddy',     '31204455678',    'State Bank of India',      'SBIN0000925', 'EXTERNAL', '2026-07-19 09:30:00'),
 (2, 'Sneha Kapoor',     '50010000002001', 'Woxsen Co-operative Bank', 'WOXS0000002', 'INTERNAL', '2026-07-22 12:15:00'),
 (3, 'Karthik Goud',     '50010000004002', 'Woxsen Co-operative Bank', 'WOXS0000004', 'INTERNAL', '2026-08-20 15:00:00'),
 (4, 'Imran Mohammed',   '50010000002002', 'Woxsen Co-operative Bank', 'WOXS0000002', 'INTERNAL', '2026-07-30 10:45:00'),
 (8, 'Ananya Reddy',     '50010000001001', 'Woxsen Co-operative Bank', 'WOXS0000001', 'INTERNAL', '2026-08-12 11:30:00'),
 (5, 'Anil Kumar',       '60234455123',    'HDFC Bank',                'HDFC0001234', 'EXTERNAL', '2026-09-02 17:20:00');

-- Loans: disbursed into the customer's account through the trigger
INSERT INTO loan (customer_id, account_id, loan_type, amount, interest_rate, start_date, end_date, status) VALUES
 (1, 1,  'PERSONAL',  60000.00, 12.00, '2026-07-01', '2026-12-01', 'ACTIVE'),
 (4, 4,  'VEHICLE',  300000.00,  9.00, '2026-06-01', '2027-05-01', 'ACTIVE'),
 (10,10, 'EDUCATION',150000.00,  8.00, '2026-07-05', '2027-06-05', 'ACTIVE');

INSERT INTO `transaction` (account_id, transaction_type, amount, transaction_date, description) VALUES
 (4,  'LOAN_DISBURSEMENT', 300000.00, '2026-06-01 10:00:00', 'Vehicle loan disbursement'),
 (1,  'LOAN_DISBURSEMENT',  60000.00, '2026-07-01 10:30:00', 'Personal loan disbursement'),
 (10, 'LOAN_DISBURSEMENT', 150000.00, '2026-07-05 12:00:00', 'Education loan disbursement');

-- Repayment schedules: EMI = P*r*(1+r)^n / ((1+r)^n - 1), one row per month
INSERT INTO loan_schedule (loan_id, due_date, due_amount)
SELECT l.loan_id,
       DATE_ADD(l.start_date, INTERVAL n.k MONTH),
       ROUND(l.amount * (l.interest_rate/1200) * POW(1 + l.interest_rate/1200, m.months)
             / (POW(1 + l.interest_rate/1200, m.months) - 1), 2)
  FROM loan l
  JOIN (SELECT loan_id, TIMESTAMPDIFF(MONTH, start_date, end_date) AS months FROM loan) m
    ON m.loan_id = l.loan_id
  JOIN (SELECT 1 AS k UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
        UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12) n
    ON n.k <= m.months;

-- Repayments received so far (EMI amounts read back from the schedule)
SELECT schedule_id, due_amount INTO @sid, @amt FROM loan_schedule WHERE loan_id = 2 AND due_date = '2026-07-01';
CALL sp_loan_repayment(2, @sid, @amt, '2026-07-01 09:00:00');
SELECT schedule_id, due_amount INTO @sid, @amt FROM loan_schedule WHERE loan_id = 2 AND due_date = '2026-08-01';
CALL sp_loan_repayment(2, @sid, @amt, '2026-08-01 09:00:00');
SELECT schedule_id, due_amount INTO @sid, @amt FROM loan_schedule WHERE loan_id = 2 AND due_date = '2026-09-01';
CALL sp_loan_repayment(2, @sid, @amt, '2026-09-01 09:00:00');
SELECT schedule_id, due_amount INTO @sid, @amt FROM loan_schedule WHERE loan_id = 2 AND due_date = '2026-10-01';
CALL sp_loan_repayment(2, @sid, @amt, '2026-10-01 09:00:00');
SELECT schedule_id, due_amount INTO @sid, @amt FROM loan_schedule WHERE loan_id = 1 AND due_date = '2026-08-01';
CALL sp_loan_repayment(1, @sid, @amt, '2026-08-01 10:00:00');
SELECT schedule_id, due_amount INTO @sid, @amt FROM loan_schedule WHERE loan_id = 1 AND due_date = '2026-09-01';
CALL sp_loan_repayment(1, @sid, @amt, '2026-09-01 10:00:00');
SELECT schedule_id, due_amount INTO @sid, @amt FROM loan_schedule WHERE loan_id = 3 AND due_date = '2026-08-05';
CALL sp_loan_repayment(3, @sid, @amt, '2026-08-05 10:00:00');
SELECT schedule_id, due_amount INTO @sid, @amt FROM loan_schedule WHERE loan_id = 3 AND due_date = '2026-09-05';
CALL sp_loan_repayment(3, @sid, @amt, '2026-09-05 10:00:00');

-- Past-due instalments that are still unpaid
UPDATE loan_schedule SET status = 'OVERDUE' WHERE status = 'PENDING' AND due_date < '2026-10-09';

-- Statements already generated
INSERT INTO statement (account_id, from_date, to_date, generated_date) VALUES
 (1, '2026-07-01', '2026-07-31', '2026-08-01 06:00:00'),
 (1, '2026-08-01', '2026-08-31', '2026-09-01 06:00:00'),
 (2, '2026-07-01', '2026-09-30', '2026-10-01 06:00:00'),
 (4, '2026-07-01', '2026-09-30', '2026-10-01 06:05:00'),
 (5, '2026-08-01', '2026-09-30', '2026-10-01 06:10:00'),
 (8, '2026-07-01', '2026-09-30', '2026-10-01 06:15:00');

