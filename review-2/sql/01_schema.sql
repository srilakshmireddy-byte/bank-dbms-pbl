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

