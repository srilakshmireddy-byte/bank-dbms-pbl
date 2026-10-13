# Bank Account and Transaction Management System

**Project 55 · DBMS Project-Based Learning (PBL)** M. Srilakshmi Reddy · AI-ML · Woxsen University · 2026

A relational database system in MySQL 8, normalized to 3NF, for managing bank customers, accounts, transactions, transfers and loans. Business rules are enforced inside the database (3 triggers, 11 CHECK constraints, 2 stored procedures), and a web application sits on top of it.

> ### ▶ [Try it now: live demo (no install)](https://srilakshmireddy-byte.github.io/bank-dbms-pbl/)
> Opens in any browser and runs on built-in sample data, so no database is needed. Pick a demo login on the sign-in page (Teller, Loan Officer or Manager); everything resets when you reload. The full MySQL-backed version is under [Run the prototype](#run-the-prototype) below.

![Woxsen Co-operative Bank dashboard](review-3/screenshots/02_dashboard.png)

| | |
|---|---|
| ![Sign in](review-3/screenshots/01_login.png) | ![Accounts](review-3/screenshots/03_accounts.png) |
| ![Transfers](review-3/screenshots/04_transfers.png) | ![Loans](review-3/screenshots/05_loans.png) |
| ![Statements](review-3/screenshots/06_statements.png) | ![Rule tester](review-3/screenshots/07_rule_tester.png) |

## What it does

- Manages **customers, accounts (including joint holders), deposits, withdrawals, transfers, service charges, beneficiaries, statements and loans**, with an EMI schedule and repayments for each loan.
- Enforces the banking rules **inside the database**, not in the application: positive amounts, sufficient balance (account-type minimum), ACTIVE accounts only, and balanced debit and credit on every transfer.
- Posts a transfer as **one atomic unit** through `sp_transfer`: both legs commit together or not at all. Loan repayments go through `sp_loan_repayment`.
- Keeps `account.balance` and `transaction.balance_after` up to date with triggers, so statements show a running balance.
- Provides **7 reporting views** for balances, account statements, transaction audit, transfers, loan outstanding, repayment history and branch summary.
- Includes a **Rule Tester** page that tries illegal operations against the database (overdraw, frozen account, negative amount, zero amount, closed account, same-account transfer, unbalanced transfer legs) and shows each refusal.
- Uses parameterized SQL only, and role-based access (Teller, Loan Officer, Manager) enforced on the API.

## Database at a glance

| Item | Count |
|---|---|
| Tables (3NF) | 14 |
| Foreign keys / UNIQUE constraints | 17 / 11 |
| CHECK constraints | 11 |
| Triggers | 3 |
| Stored procedures | 2 |
| Views | 7 |
| Indexes on frequent search columns | 5 |
| Sample data | 4 branches, 10 customers, 11 accounts, 54 ledger transactions, 8 transfers, 3 loans |

## Repository structure

```
review-1/   Problem statement, scope, users and requirements, ER diagram, initial schema
            deck (HTML + PDF) and report (.docx)
review-2/   Normalization and data dictionary, validation tests, deck (HTML + PDF)
  sql/      01_schema.sql, 02_triggers.sql, 03_sample_data.sql,
            04_views_reports.sql, 05_queries.sql, queries_output.txt
review-3/   Final prototype: Node.js + Express + MySQL back end, plain HTML/CSS/JS front end,
            end-to-end tests, screenshots, README
.github/    GitHub Pages workflow that publishes the live demo
.devcontainer/  GitHub Codespaces setup (app + MySQL)
```

| Review | What is there |
|---|---|
| [Review 1](review-1) | Problem statement, scope and objectives, users and functional requirements, ER diagram, initial relational schema |
| [Review 2](review-2) | [3NF design, functional dependencies and data dictionary](review-2/Review2_Normalization_and_Data_Dictionary.md), [validation tests](review-2/validation_tests.md), [SQL scripts](review-2/sql), deck |
| [Review 3](review-3) | Working web application with login, dashboard, customers, accounts, transactions, transfers, statements, loans and the Rule Tester |

## Run the prototype

**Requirements:** MySQL 8 and Node.js 18 or newer.

```bash
cd review-3

# 1. Create the database (drops and recreates bank_db with the sample data)
mysql -u root -p < bank_review2.sql

# 2. Install dependencies
npm install

# 3. Configure: copy the template, then open .env in an editor and fill in your own values
cp .env.example .env

# 4. Start
npm start
```

Then open <http://localhost:3000>. Edit `.env` yourself (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT`, `JWT_SECRET`) and never commit it.

**Demo staff logins:** Teller `teller`, Loan Officer `loans`, Manager `manager`. Passwords are listed in [`review-3/README.md`](review-3/README.md). Run the tests with `npm test`.

**No installs?** Open the repository in GitHub Codespaces (Code, Codespaces, Create codespace on main). The first start builds MySQL, loads the schema and starts the app.

## Run the SQL on its own

Run the scripts in order, then the queries:

```bash
cd review-2/sql
for f in 01_schema 02_triggers 03_sample_data 04_views_reports; do mysql -u root -p < $f.sql; done
mysql -u root -p -t < 05_queries.sql
```

## Tech stack

MySQL 8 · Node.js · Express · mysql2 · plain HTML, CSS and JavaScript (no build step, fonts bundled locally) · GitHub Pages and GitHub Codespaces
