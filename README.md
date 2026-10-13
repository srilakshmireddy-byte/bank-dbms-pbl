# Bank Account and Transaction Management System

DBMS Project-Based Learning · Project 55 · **M. Srilakshmi Reddy** · AI-ML · Woxsen University · 2026

Design and implementation of a DBMS for bank accounts and transactions: normalized MySQL schema (3NF) with constraints, triggers and stored procedures that enforce the banking rules, plus a web application (Node.js + Express + MySQL) with a private-banking interface.

| Review | Folder | Contents |
|---|---|---|
| Review 1 | [`review-1/`](review-1) | Problem statement, scope, users and requirements, ER diagram, initial schema: deck (HTML + PDF) and report (.docx) |
| Review 2 | [`review-2/`](review-2) | 3NF design and data dictionary, DDL / triggers / sample data / views / queries (`sql/`), validation tests, deck (HTML + PDF) |
| Review 3 | [`review-3/`](review-3) | Working web application, tests, setup instructions |

**Live demo (runs in the browser, sample data):** https://srilakshmireddy-byte.github.io/bank-dbms-pbl/

## Quick start

```bash
cd review-3
mysql -u root -p < bank_review2.sql
npm install
cp .env.example .env        # then edit .env yourself: DB_PASSWORD, JWT_SECRET
npm start
```

Details, demo staff logins and the Codespaces option are in [`review-3/README.md`](review-3/README.md).
