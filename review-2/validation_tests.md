# Review 2 — Validation Tests

Each statement below was run against `bank_db`. Every one must be rejected by the database, and balances stay unchanged.

| # | Test | Statement | Result (actual MySQL error) |
|---|---|---|---|
| 1 | Negative amount deposit | ``INSERT INTO `transaction`(account_id,transaction_type,amount) VALUES (1,'DEPOSIT',-500)`` | Transaction amount must be positive |
| 2 | Withdrawal larger than balance | `INSERT ... (5,'WITHDRAWAL',9999999)` | Insufficient balance (minimum balance rule) |
| 3 | Deposit to FROZEN account | `INSERT ... (9,'DEPOSIT',1000)` | Account is not ACTIVE - transaction rejected |
| 4 | Deposit to CLOSED account | `INSERT ... (11,'DEPOSIT',1000)` | Account is not ACTIVE - transaction rejected |
| 5 | Transfer to the same account | `CALL sp_transfer(1,1,100,...)` | Cannot transfer to the same account |
| 6 | Transfer larger than balance (rolled back) | `CALL sp_transfer(5,2,99999999,...)` | Insufficient balance (minimum balance rule) |
| 7 | Duplicate account number | `INSERT INTO account (account_number, ...) VALUES ('50010000001001', ...)` | Duplicate entry '50010000001001' for key 'account_number' |

## Consistency checks

| Check | Result |
|---|---|
| Accounts whose stored balance differs from the last ledger balance | 0 |
| Transfers where debited amount differs from credited amount | 0 |
| Ledger transactions loaded | 54 |

Run order: `sql/01_schema.sql`, `02_triggers.sql`, `03_sample_data.sql`, `04_views_reports.sql`, then `05_queries.sql`.
