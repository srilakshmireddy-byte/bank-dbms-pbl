# Woxsen Co-operative Bank — Bank Account and Transaction Management System

**Live demo:** <https://srilakshmireddy-byte.github.io/bank-dbms-pbl/> (runs entirely in your browser with the sample data; changes are not saved and reset when you reload). For the real Node + MySQL version, see the run steps below.

DBMS course project: a Node.js + Express + MySQL 8 back end and a plain HTML/CSS/JS front end (no build step, no CDN).
`db/bank_review2.sql` is used **unchanged** as the schema. Every business rule (positive amounts, sufficient balance,
ACTIVE accounts only, balanced transfers) lives in the database triggers/procedures; the app only shows the
database's own error message.

## Run it

Requirements: Node.js 18+ and MySQL 8.

```bash
# 1. Create the database (drops and recreates bank_db with the sample data)
mysql -u root -p < db/bank_review2.sql

# 2. Install dependencies
npm install

# 3. Configure: copy the template, then open .env in your editor and fill in YOUR values
cp .env.example .env

# 4. Start
npm start
```

Open the live demo: <https://srilakshmireddy-byte.github.io/bank-dbms-pbl/>

**Edit `.env` yourself** (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT`, `JWT_SECRET`). Never paste passwords into chat or commit `.env`.

## Demo staff logins

The SQL file has no login table, so the app creates a `staff_user` table in `bank_db` on first start
(bcrypt-hashed passwords; the SQL file itself is not modified).

| Role | Username | Password | Can do |
|---|---|---|---|
| Teller | `teller` | `Teller@123` | customers, accounts, deposits/withdrawals, transfers, statements, loan repayments |
| Loan Officer | `loans` | `Loans@123` | view everything, create loans, take repayments, statements |
| Manager | `manager` | `Manager@123` | everything, plus transaction audit and account status changes |

Change these for anything beyond a classroom install: edit `DEMO_STAFF` in `lib/staff.js` and run `npm run seed:staff`,
and set `DEMO_LOGINS=false` in `.env` to hide the one-click chips on the login page.
Roles are enforced on the API (`lib/permissions.js`), not just by hiding menu items.

## Pages

A private-banking look (ivory, black and brass) with a light/dark theme toggle in the top bar, remembered in the browser.

Login · Dashboard (totals, deposits-vs-withdrawals SVG chart, branch cards) · Customers · Accounts (card view, joint holders,
status change) · Transactions (deposit/withdraw + filtered audit) · Transfers (beneficiary picker, history showing debit = credit) ·
Statements (date range, running balance, Print / Save as PDF) · Loans (create + EMI schedule, repay, outstanding/overdue) ·
**Rule Tester** (overdraw, frozen account, negative amount, plus zero, closed account, same-account transfer, unbalanced
transfer — each attempted against MySQL inside a transaction that is always rolled back).

## Project layout

```
server.js            Express app, static files, error → JSON
db.js                mysql2 pool, transaction helper, MySQL error → HTTP mapping
routes/              auth, dashboard, customers, accounts, transactions, transfers,
                     statements, loans, audit, beneficiaries, ruleTester, lookups
middleware/auth.js   JWT in an httpOnly SameSite=Strict cookie, role checks
lib/                 permissions, validation (shape only), staff table + seeding
public/              index.html, css/, js/ (ES modules), fonts/ (Bodoni Moda + Jost, bundled), img/
test/e2e.test.js     end-to-end API tests against the real database
.env.example
```

## API summary (all under `/api`, JSON, parameterised queries only)

`POST /auth/login|logout`, `GET /auth/me` · `GET /dashboard` · `GET|POST /customers`, `GET|PUT /customers/:id` ·
`GET|POST /accounts`, `GET /accounts/:id`, `PATCH /accounts/:id/status` · `POST /transactions/deposit|withdraw`, `GET /transactions/recent` ·
`GET|POST /transfers` (calls `sp_transfer`) · `GET|POST /statements`, `GET /statements/history` ·
`GET|POST /loans`, `GET /loans/:id`, `POST /loans/:id/repay` (calls `sp_loan_repayment`) · `GET /audit` ·
`GET|POST /beneficiaries`, `DELETE /beneficiaries/:id` · `GET /branches`, `/account-types` · `POST /rule-tests/:scenario`.

Rejections from triggers/procedures (SQLSTATE `45000`) come back as HTTP 422 with `{ "error": "<exact MySQL message>", "source": "database", "sqlState": "45000" }`.
CHECK/UNIQUE/foreign-key violations are also passed through with MySQL's message.

## Tests

```bash
npm test
```

Runs 15 end-to-end tests against the real database in `.env` (auth, roles, every route, rule rejections, atomic rollback,
parallel withdrawals, ledger invariant). The tests add rows; re-run `mysql -u root -p < db/bank_review2.sql` to restore the sample data.

## Design notes and known behaviours

* **Statements** rebuild the running balance in date order (opening balance + credits − debits). The sample data posts some
  transactions with back-dated timestamps, so the stored `balance_after` snapshot (posting order) can differ from a
  date-ordered view; the Audit page shows that snapshot as-is.
* **Repaying an already PAID instalment** is refused by the app (HTTP 409); `sp_loan_repayment` itself does not check this.
  Everything else (positive amount, sufficient funds, ACTIVE account, ACTIVE loan) is left to the database.
* **Loan creation** runs in one transaction: loan row → `LOAN_DISBURSEMENT` posting (the trigger can reject it, e.g. frozen
  account, which rolls the whole loan back) → EMI schedule using the same formula as the sample data.
  The app also checks that the disbursement account belongs to the borrower.
* Pending instalments past their due date are marked OVERDUE at start-up and hourly (same rule the sample data applies).
* External beneficiaries can be saved but cannot be settled, since `sp_transfer` only moves money between accounts in this bank.
* Account numbers for new accounts follow the sample pattern (`5001000000` + branch/serial).
