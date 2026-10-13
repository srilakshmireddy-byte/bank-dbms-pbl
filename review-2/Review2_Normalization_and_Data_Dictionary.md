# Review 2 — Normalization and Data Dictionary

Project 55: Bank Account and Transaction Management System · M. Srilakshmi Reddy · AI-ML · 2026

## 1. Normalization (UNF to 3NF)

| Stage | What was done |
|---|---|
| **UNF** | One bank sheet repeats customer, branch, account, joint holders, many transactions and loan instalments in a single record. |
| **1NF** | Atomic values only. Repeating groups (holders, transactions, instalments) moved into their own rows; a primary key added to every table. |
| **2NF** | Partial dependencies removed. Branch and account-type data split out of ACCOUNT; ACCOUNT_HOLDER resolves the many-to-many between customers and joint accounts. |
| **3NF** | Transitive dependencies removed. TRANSFER, SERVICE_CHARGE and LOAN_REPAYMENT are subtypes of TRANSACTION; REPAYMENT allocates a payment to a LOAN_SCHEDULE instalment. |

**Removed anomaly (example).** Before: each account row stored branch name, city and manager, so changing a manager meant editing every account. After: ACCOUNT stores only `branch_id` and BRANCH holds the details once.

**Controlled redundancy.** `account.balance` and `transaction.balance_after` are derived values maintained by the BEFORE/AFTER INSERT triggers on `transaction`, never typed by users. An audit query confirms there are no mismatches between the stored balance and the last ledger entry.

## 2. Functional dependencies

| Relation | Functional dependencies |
|---|---|
| BRANCH | branch_id → branch_name, address, city, phone, branch_manager |
| ACCOUNT_TYPE | type_id → type_name, description, min_balance, is_interest_bearing |
| CUSTOMER | customer_id → full_name, date_of_birth, email, phone, address, id_proof |
| ACCOUNT | account_id → account_number, type_id, branch_id, status, open_date, balance; account_number → account_id |
| ACCOUNT_HOLDER | (account_id, customer_id) → holder_type, since_date |
| TRANSACTION | transaction_id → account_id, transaction_type, amount, transaction_date, description, balance_after |
| TRANSFER | transfer_id → debit_transaction_id, credit_transaction_id, remarks |
| SERVICE_CHARGE | charge_id → transaction_id, charge_type |
| BENEFICIARY | beneficiary_id → customer_id, beneficiary_name, account_number, bank_name, ifsc_code, type, created_at |
| STATEMENT | statement_id → account_id, from_date, to_date, generated_date |
| LOAN | loan_id → customer_id, account_id, loan_type, amount, interest_rate, start_date, end_date, status |
| LOAN_SCHEDULE | schedule_id → loan_id, due_date, due_amount, status; (loan_id, due_date) → schedule_id |
| LOAN_REPAYMENT | repayment_id → transaction_id, loan_id |
| REPAYMENT | repayment_id → schedule_id, transaction_id, amount, status |

Every determinant is a candidate key (or superkey) of its relation, so each table satisfies BCNF as well as 3NF.

## 3. Data dictionary

Generated from the live `bank_db` schema (MySQL/MariaDB).

### account
_Bank account (balance is trigger-maintained)_

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| account_id | int(11) | NO | PRI | - | auto_increment |
| account_number | varchar(16) | NO | UNI | - | - |
| type_id | int(11) | NO | MUL | - | - |
| branch_id | int(11) | NO | MUL | - | - |
| status | enum('ACTIVE','DORMANT','FROZEN','CLOSED') | NO | - | 'ACTIVE' | - |
| open_date | date | NO | - | - | - |
| balance | decimal(15,2) | NO | - | 0.00 | - |

### account_holder
_Links customers to accounts (joint holders)_

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| account_id | int(11) | NO | PRI | - | - |
| customer_id | int(11) | NO | PRI | - | - |
| holder_type | enum('PRIMARY','JOINT') | NO | - | 'PRIMARY' | - |
| since_date | date | NO | - | - | - |

### account_type
_Savings, Current, Salary and Fixed Deposit rules_

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| type_id | int(11) | NO | PRI | - | auto_increment |
| type_name | varchar(40) | NO | UNI | - | - |
| description | varchar(150) | YES | - | NULL | - |
| min_balance | decimal(12,2) | NO | - | 0.00 | - |
| is_interest_bearing | tinyint(1) | NO | - | 1 | - |

### beneficiary
_Saved payees_

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| beneficiary_id | int(11) | NO | PRI | - | auto_increment |
| customer_id | int(11) | NO | MUL | - | - |
| beneficiary_name | varchar(100) | NO | - | - | - |
| account_number | varchar(20) | NO | - | - | - |
| bank_name | varchar(80) | NO | - | - | - |
| ifsc_code | varchar(11) | NO | - | - | - |
| type | enum('INTERNAL','EXTERNAL') | NO | - | 'INTERNAL' | - |
| created_at | datetime | NO | - | current_timestamp() | - |

### branch
_Bank branches_

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| branch_id | int(11) | NO | PRI | - | auto_increment |
| branch_name | varchar(80) | NO | UNI | - | - |
| address | varchar(150) | NO | - | - | - |
| city | varchar(50) | NO | - | - | - |
| phone | varchar(15) | NO | - | - | - |
| branch_manager | varchar(80) | NO | - | - | - |

### customer
_Customer profile_

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| customer_id | int(11) | NO | PRI | - | auto_increment |
| full_name | varchar(100) | NO | MUL | - | - |
| date_of_birth | date | NO | - | - | - |
| email | varchar(120) | NO | UNI | - | - |
| phone | varchar(15) | NO | - | - | - |
| address | varchar(150) | NO | - | - | - |
| id_proof | varchar(30) | NO | UNI | - | - |

### loan
_Loan master_

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| loan_id | int(11) | NO | PRI | - | auto_increment |
| customer_id | int(11) | NO | MUL | - | - |
| account_id | int(11) | NO | MUL | - | - |
| loan_type | enum('PERSONAL','VEHICLE','EDUCATION','HOME') | NO | - | - | - |
| amount | decimal(15,2) | NO | - | - | - |
| interest_rate | decimal(5,2) | NO | - | - | - |
| start_date | date | NO | - | - | - |
| end_date | date | NO | - | - | - |
| status | enum('ACTIVE','CLOSED','DEFAULTED') | NO | - | 'ACTIVE' | - |

### loan_repayment
_Repayment transaction subtype_

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| repayment_id | int(11) | NO | PRI | - | auto_increment |
| transaction_id | bigint(20) | NO | UNI | - | - |
| loan_id | int(11) | NO | MUL | - | - |

### loan_schedule
_EMI schedule, one row per instalment_

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| schedule_id | int(11) | NO | PRI | - | auto_increment |
| loan_id | int(11) | NO | MUL | - | - |
| due_date | date | NO | - | - | - |
| due_amount | decimal(15,2) | NO | - | - | - |
| status | enum('PENDING','PAID','OVERDUE') | NO | MUL | 'PENDING' | - |

### repayment
_Allocates a payment to a schedule instalment_

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| repayment_id | int(11) | NO | PRI | - | auto_increment |
| schedule_id | int(11) | NO | MUL | - | - |
| transaction_id | bigint(20) | NO | MUL | - | - |
| amount | decimal(15,2) | NO | - | - | - |
| status | enum('APPLIED','REVERSED') | NO | - | 'APPLIED' | - |

### service_charge
_Fee details for a service-charge transaction_

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| charge_id | int(11) | NO | PRI | - | auto_increment |
| transaction_id | bigint(20) | NO | UNI | - | - |
| charge_type | enum('SMS_ALERT','ATM_FEE','MIN_BALANCE_PENALTY','CHEQUE_BOOK','ANNUAL_MAINTENANCE') | NO | - | - | - |

### statement
_Statement generation log_

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| statement_id | int(11) | NO | PRI | - | auto_increment |
| account_id | int(11) | NO | MUL | - | - |
| from_date | date | NO | - | - | - |
| to_date | date | NO | - | - | - |
| generated_date | datetime | NO | - | current_timestamp() | - |

### transaction
_Single ledger of all money movement_

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| transaction_id | bigint(20) | NO | PRI | - | auto_increment |
| account_id | int(11) | NO | MUL | - | - |
| transaction_type | enum('DEPOSIT','WITHDRAWAL','TRANSFER_DEBIT','TRANSFER_CREDIT','SERVICE_CHARGE','LOAN_DISBURSEMENT','LOAN_REPAYMENT') | NO | MUL | - | - |
| amount | decimal(15,2) | NO | - | - | - |
| transaction_date | datetime | NO | - | current_timestamp() | - |
| description | varchar(150) | YES | - | NULL | - |
| balance_after | decimal(15,2) | YES | - | NULL | - |

### transfer
_Links the debit and credit legs of one transfer_

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| transfer_id | int(11) | NO | PRI | - | auto_increment |
| debit_transaction_id | bigint(20) | NO | UNI | - | - |
| credit_transaction_id | bigint(20) | NO | UNI | - | - |
| remarks | varchar(150) | YES | - | NULL | - |

## 4. Business rules and where they are enforced

| Rule | Mechanism |
|---|---|
| Unique account and transaction IDs | PRIMARY KEY AUTO_INCREMENT on every ID; UNIQUE on account_number, email, id_proof |
| Sufficient balance | `trg_txn_before_insert` rejects a debit that would take the balance below the account type's minimum |
| Balanced debit / credit | `sp_transfer` posts both legs in one transaction; `trg_transfer_before_insert` checks both legs are equal |
| Active-account requirement | Trigger rejects any posting to DORMANT, FROZEN or CLOSED accounts |
| Positive amounts | CHECK (amount > 0) plus a trigger message |
| Atomic operations | `sp_transfer` and `sp_loan_repayment` use START TRANSACTION with an EXIT HANDLER that rolls back |
