-- =====================================================================
--  PROJECT 55 : BANK ACCOUNT AND TRANSACTION MANAGEMENT SYSTEM
--  REVIEW 2  : Normalized schema (3NF), DDL with constraints,
--              sample data, queries, views, prototype demo
--  Database  : MySQL 8.x  (also runs on MariaDB 10.5+)
--  Run       : mysql -u root -p < bank_review2.sql
-- =====================================================================

DROP DATABASE IF EXISTS bank_db;
CREATE DATABASE bank_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bank_db;

-- =====================================================================
-- PART 1 : DDL  (tables, keys and integrity constraints)
-- =====================================================================

CREATE TABLE branch (
    branch_id       INT AUTO_INCREMENT PRIMARY KEY,
    branch_name     VARCHAR(80)  NOT NULL UNIQUE,
    address         VARCHAR(150) NOT NULL,
    city            VARCHAR(50)  NOT NULL,
    phone           VARCHAR(15)  NOT NULL,
    branch_manager  VARCHAR(80)  NOT NULL
) ENGINE=InnoDB;

CREATE TABLE account_type (
    type_id              INT AUTO_INCREMENT PRIMARY KEY,
    type_name            VARCHAR(40)  NOT NULL UNIQUE,
    description          VARCHAR(150),
    min_balance          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    is_interest_bearing  BOOLEAN       NOT NULL DEFAULT TRUE,
    CONSTRAINT ck_type_min_balance CHECK (min_balance >= 0)
) ENGINE=InnoDB;

CREATE TABLE customer (
    customer_id    INT AUTO_INCREMENT PRIMARY KEY,
    full_name      VARCHAR(100) NOT NULL,
    date_of_birth  DATE         NOT NULL,
    email          VARCHAR(120) NOT NULL UNIQUE,
    phone          VARCHAR(15)  NOT NULL,
    address        VARCHAR(150) NOT NULL,
    id_proof       VARCHAR(30)  NOT NULL UNIQUE,
    CONSTRAINT ck_customer_email CHECK (email LIKE '%_@_%._%')
) ENGINE=InnoDB;

CREATE TABLE account (
    account_id      INT AUTO_INCREMENT PRIMARY KEY,
    account_number  VARCHAR(16)  NOT NULL UNIQUE,
    type_id         INT          NOT NULL,
    branch_id       INT          NOT NULL,
    status          ENUM('ACTIVE','DORMANT','FROZEN','CLOSED') NOT NULL DEFAULT 'ACTIVE',
    open_date       DATE         NOT NULL,
    balance         DECIMAL(15,2) NOT NULL DEFAULT 0.00,   -- maintained ONLY by trigger
    CONSTRAINT ck_account_balance CHECK (balance >= 0),
    CONSTRAINT fk_account_type   FOREIGN KEY (type_id)   REFERENCES account_type(type_id),
    CONSTRAINT fk_account_branch FOREIGN KEY (branch_id) REFERENCES branch(branch_id)
) ENGINE=InnoDB;

CREATE TABLE account_holder (
    account_id   INT NOT NULL,
    customer_id  INT NOT NULL,
    holder_type  ENUM('PRIMARY','JOINT') NOT NULL DEFAULT 'PRIMARY',
    since_date   DATE NOT NULL,
    PRIMARY KEY (account_id, customer_id),
    CONSTRAINT fk_holder_account  FOREIGN KEY (account_id)  REFERENCES account(account_id),
    CONSTRAINT fk_holder_customer FOREIGN KEY (customer_id) REFERENCES customer(customer_id)
) ENGINE=InnoDB;

-- Supertype of every money movement (deposit, withdrawal, transfer legs, charges, loan items)
CREATE TABLE `transaction` (
    transaction_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    account_id        INT NOT NULL,
    transaction_type  ENUM('DEPOSIT','WITHDRAWAL','TRANSFER_DEBIT','TRANSFER_CREDIT',
                           'SERVICE_CHARGE','LOAN_DISBURSEMENT','LOAN_REPAYMENT') NOT NULL,
    amount            DECIMAL(15,2) NOT NULL,
    transaction_date  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    description       VARCHAR(150),
    balance_after     DECIMAL(15,2) NULL,                  -- audit snapshot, set by trigger
    CONSTRAINT ck_txn_amount_positive CHECK (amount > 0),
    CONSTRAINT fk_txn_account FOREIGN KEY (account_id) REFERENCES account(account_id)
) ENGINE=InnoDB;

-- Subtype: one transfer = one debit leg + one credit leg
CREATE TABLE transfer (
    transfer_id            INT AUTO_INCREMENT PRIMARY KEY,
    debit_transaction_id   BIGINT NOT NULL UNIQUE,
    credit_transaction_id  BIGINT NOT NULL UNIQUE,
    remarks                VARCHAR(150),
    CONSTRAINT ck_transfer_legs CHECK (debit_transaction_id <> credit_transaction_id),
    CONSTRAINT fk_transfer_debit  FOREIGN KEY (debit_transaction_id)  REFERENCES `transaction`(transaction_id),
    CONSTRAINT fk_transfer_credit FOREIGN KEY (credit_transaction_id) REFERENCES `transaction`(transaction_id)
) ENGINE=InnoDB;

-- Subtype: service charge
CREATE TABLE service_charge (
    charge_id       INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id  BIGINT NOT NULL UNIQUE,
    charge_type     ENUM('SMS_ALERT','ATM_FEE','MIN_BALANCE_PENALTY','CHEQUE_BOOK','ANNUAL_MAINTENANCE') NOT NULL,
    CONSTRAINT fk_charge_txn FOREIGN KEY (transaction_id) REFERENCES `transaction`(transaction_id)
) ENGINE=InnoDB;

CREATE TABLE beneficiary (
    beneficiary_id    INT AUTO_INCREMENT PRIMARY KEY,
    customer_id       INT NOT NULL,
    beneficiary_name  VARCHAR(100) NOT NULL,
    account_number    VARCHAR(20)  NOT NULL,
    bank_name         VARCHAR(80)  NOT NULL,
    ifsc_code         VARCHAR(11)  NOT NULL,
    type              ENUM('INTERNAL','EXTERNAL') NOT NULL DEFAULT 'INTERNAL',
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_beneficiary UNIQUE (customer_id, account_number, ifsc_code),
    CONSTRAINT fk_beneficiary_customer FOREIGN KEY (customer_id) REFERENCES customer(customer_id)
) ENGINE=InnoDB;

CREATE TABLE statement (
    statement_id    INT AUTO_INCREMENT PRIMARY KEY,
    account_id      INT NOT NULL,
    from_date       DATE NOT NULL,
    to_date         DATE NOT NULL,
    generated_date  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_statement_period CHECK (to_date >= from_date),
    CONSTRAINT fk_statement_account FOREIGN KEY (account_id) REFERENCES account(account_id)
) ENGINE=InnoDB;

CREATE TABLE loan (
    loan_id        INT AUTO_INCREMENT PRIMARY KEY,
    customer_id    INT NOT NULL,
    account_id     INT NOT NULL,                           -- disbursement / repayment account
    loan_type      ENUM('PERSONAL','VEHICLE','EDUCATION','HOME') NOT NULL,
    amount         DECIMAL(15,2) NOT NULL,
    interest_rate  DECIMAL(5,2)  NOT NULL,
    start_date     DATE NOT NULL,
    end_date       DATE NOT NULL,
    status         ENUM('ACTIVE','CLOSED','DEFAULTED') NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT ck_loan_amount   CHECK (amount > 0),
    CONSTRAINT ck_loan_rate     CHECK (interest_rate > 0),
    CONSTRAINT ck_loan_dates    CHECK (end_date > start_date),
    CONSTRAINT fk_loan_customer FOREIGN KEY (customer_id) REFERENCES customer(customer_id),
    CONSTRAINT fk_loan_account  FOREIGN KEY (account_id)  REFERENCES account(account_id)
) ENGINE=InnoDB;

CREATE TABLE loan_schedule (
    schedule_id  INT AUTO_INCREMENT PRIMARY KEY,
    loan_id      INT NOT NULL,
    due_date     DATE NOT NULL,
    due_amount   DECIMAL(15,2) NOT NULL,
    status       ENUM('PENDING','PAID','OVERDUE') NOT NULL DEFAULT 'PENDING',
    CONSTRAINT uq_schedule_due UNIQUE (loan_id, due_date),
    CONSTRAINT ck_schedule_amount CHECK (due_amount > 0),
    CONSTRAINT fk_schedule_loan FOREIGN KEY (loan_id) REFERENCES loan(loan_id)
) ENGINE=InnoDB;

-- Subtype: the cash payment made against a loan (one bank transaction)
CREATE TABLE loan_repayment (
    repayment_id    INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id  BIGINT NOT NULL UNIQUE,
    loan_id         INT NOT NULL,
    CONSTRAINT fk_lrepay_txn  FOREIGN KEY (transaction_id) REFERENCES `transaction`(transaction_id),
    CONSTRAINT fk_lrepay_loan FOREIGN KEY (loan_id)        REFERENCES loan(loan_id)
) ENGINE=InnoDB;

-- Allocation of a payment to a schedule instalment (a payment may cover several)
CREATE TABLE repayment (
    repayment_id    INT AUTO_INCREMENT PRIMARY KEY,
    schedule_id     INT NOT NULL,
    transaction_id  BIGINT NOT NULL,
    amount          DECIMAL(15,2) NOT NULL,
    status          ENUM('APPLIED','REVERSED') NOT NULL DEFAULT 'APPLIED',
    CONSTRAINT ck_repayment_amount CHECK (amount > 0),
    CONSTRAINT fk_repay_schedule FOREIGN KEY (schedule_id)    REFERENCES loan_schedule(schedule_id),
    CONSTRAINT fk_repay_txn      FOREIGN KEY (transaction_id) REFERENCES `transaction`(transaction_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Indexes on frequently searched attributes
-- (PK / UNIQUE / FK columns are already indexed by InnoDB)
-- ---------------------------------------------------------------------
CREATE INDEX idx_txn_account_date ON `transaction` (account_id, transaction_date);
CREATE INDEX idx_txn_type         ON `transaction` (transaction_type);
CREATE INDEX idx_account_branch   ON account (branch_id, status);
CREATE INDEX idx_customer_name    ON customer (full_name);
CREATE INDEX idx_schedule_status  ON loan_schedule (status, due_date);

-- =====================================================================
-- PART 2 : TRIGGERS AND PROCEDURES  (business rules)
-- =====================================================================
DELIMITER $$

-- Rules enforced on every posting: positive amount, ACTIVE account,
-- sufficient balance (respecting the account type's minimum balance),
-- and the audit snapshot balance_after.
CREATE TRIGGER trg_txn_before_insert
BEFORE INSERT ON `transaction`
FOR EACH ROW
BEGIN
    DECLARE v_status VARCHAR(10);
    DECLARE v_bal    DECIMAL(15,2);
    DECLARE v_min    DECIMAL(12,2);
    DECLARE v_new    DECIMAL(15,2);

    IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Transaction amount must be positive';
    END IF;

    SELECT a.status, a.balance, t.min_balance
      INTO v_status, v_bal, v_min
      FROM account a JOIN account_type t ON t.type_id = a.type_id
     WHERE a.account_id = NEW.account_id
       FOR UPDATE;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account does not exist';
    END IF;
    IF v_status <> 'ACTIVE' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account is not ACTIVE - transaction rejected';
    END IF;

    IF NEW.transaction_type IN ('DEPOSIT','TRANSFER_CREDIT','LOAN_DISBURSEMENT') THEN
        SET v_new = v_bal + NEW.amount;
    ELSE
        SET v_new = v_bal - NEW.amount;
        IF v_new < v_min THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient balance (minimum balance rule)';
        END IF;
    END IF;

    SET NEW.balance_after = v_new;
END$$

CREATE TRIGGER trg_txn_after_insert
AFTER INSERT ON `transaction`
FOR EACH ROW
BEGIN
    UPDATE account SET balance = NEW.balance_after WHERE account_id = NEW.account_id;
END$$

-- Balanced debit/credit: the two legs of a transfer must match exactly
CREATE TRIGGER trg_transfer_before_insert
BEFORE INSERT ON transfer
FOR EACH ROW
BEGIN
    DECLARE d_amt DECIMAL(15,2); DECLARE c_amt DECIMAL(15,2);
    DECLARE d_type VARCHAR(20);  DECLARE c_type VARCHAR(20);
    DECLARE d_acc INT;           DECLARE c_acc INT;

    SELECT amount, transaction_type, account_id INTO d_amt, d_type, d_acc
      FROM `transaction` WHERE transaction_id = NEW.debit_transaction_id;
    SELECT amount, transaction_type, account_id INTO c_amt, c_type, c_acc
      FROM `transaction` WHERE transaction_id = NEW.credit_transaction_id;

    IF d_type <> 'TRANSFER_DEBIT' OR c_type <> 'TRANSFER_CREDIT' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Transfer legs must be a TRANSFER_DEBIT and a TRANSFER_CREDIT';
    END IF;
    IF d_amt <> c_amt THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unbalanced transfer: debit must equal credit';
    END IF;
    IF d_acc = c_acc THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot transfer to the same account';
    END IF;
END$$

-- Atomic transfer: both legs + transfer record commit together or not at all
CREATE PROCEDURE sp_transfer(IN p_from INT, IN p_to INT, IN p_amount DECIMAL(15,2),
                             IN p_remarks VARCHAR(150), IN p_when DATETIME)
BEGIN
    DECLARE v_debit BIGINT; DECLARE v_credit BIGINT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN ROLLBACK; RESIGNAL; END;

    IF p_from = p_to THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot transfer to the same account';
    END IF;
    START TRANSACTION;
        INSERT INTO `transaction`(account_id, transaction_type, amount, transaction_date, description)
        VALUES (p_from, 'TRANSFER_DEBIT', p_amount, COALESCE(p_when, NOW()), CONCAT('Transfer to A/C #', p_to));
        SET v_debit = LAST_INSERT_ID();
        INSERT INTO `transaction`(account_id, transaction_type, amount, transaction_date, description)
        VALUES (p_to, 'TRANSFER_CREDIT', p_amount, COALESCE(p_when, NOW()), CONCAT('Transfer from A/C #', p_from));
        SET v_credit = LAST_INSERT_ID();
        INSERT INTO transfer(debit_transaction_id, credit_transaction_id, remarks)
        VALUES (v_debit, v_credit, p_remarks);
    COMMIT;
END$$

-- Loan repayment: debits the loan account, records the payment and allocates it
CREATE PROCEDURE sp_loan_repayment(IN p_loan INT, IN p_schedule INT,
                                   IN p_amount DECIMAL(15,2), IN p_when DATETIME)
BEGIN
    DECLARE v_acc INT; DECLARE v_status VARCHAR(10); DECLARE v_txn BIGINT;
    DECLARE v_due DECIMAL(15,2); DECLARE v_paid DECIMAL(15,2); DECLARE v_open INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN ROLLBACK; RESIGNAL; END;

    SELECT account_id, status INTO v_acc, v_status FROM loan WHERE loan_id = p_loan;
    IF v_status IS NULL OR v_status <> 'ACTIVE' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Loan not found or not ACTIVE';
    END IF;
    SELECT due_amount INTO v_due FROM loan_schedule
     WHERE schedule_id = p_schedule AND loan_id = p_loan;
    IF v_due IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Schedule item does not belong to this loan';
    END IF;

    START TRANSACTION;
        INSERT INTO `transaction`(account_id, transaction_type, amount, transaction_date, description)
        VALUES (v_acc, 'LOAN_REPAYMENT', p_amount, COALESCE(p_when, NOW()), CONCAT('EMI for loan #', p_loan));
        SET v_txn = LAST_INSERT_ID();
        INSERT INTO loan_repayment(transaction_id, loan_id) VALUES (v_txn, p_loan);
        INSERT INTO repayment(schedule_id, transaction_id, amount) VALUES (p_schedule, v_txn, p_amount);

        SELECT COALESCE(SUM(amount),0) INTO v_paid FROM repayment
         WHERE schedule_id = p_schedule AND status = 'APPLIED';
        IF v_paid >= v_due THEN
            UPDATE loan_schedule SET status = 'PAID' WHERE schedule_id = p_schedule;
        END IF;
        SELECT COUNT(*) INTO v_open FROM loan_schedule WHERE loan_id = p_loan AND status <> 'PAID';
        IF v_open = 0 THEN
            UPDATE loan SET status = 'CLOSED' WHERE loan_id = p_loan;
        END IF;
    COMMIT;
END$$

DELIMITER ;

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
