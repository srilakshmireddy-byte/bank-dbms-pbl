'use strict';
// End-to-end API tests against the REAL MySQL database configured in .env (bank_db loaded from bank_review2.sql).
// They add rows (new customer, account, loan, postings) - re-run `mysql -u root -p < db/bank_review2.sql` for a clean slate.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');
const { pool, query } = require('../db');
const { ensureStaffTable } = require('../lib/staff');

let server, base;
const jars = {};
const num = (x) => Number(x);
const near = (a, b, msg) => assert.ok(Math.abs(num(a) - num(b)) < 0.005, `${msg || ''} expected ${b}, got ${a}`);

async function call(who, method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(jars[who] ? { Cookie: jars[who] } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie && method === 'POST' && url === '/api/auth/login') jars[who] = setCookie.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch (_) { /* no body */ }
  return { status: res.status, data };
}
const login = async (who, username, password) => {
  const r = await call(who, 'POST', '/api/auth/login', { username, password });
  assert.equal(r.status, 200, `login ${username}`);
  return r.data;
};
const balanceOf = async (id) => num((await query('SELECT balance FROM account WHERE account_id = ?', [id]))[0].balance);

before(async () => {
  await ensureStaffTable();
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  await login('teller', 'teller', 'Teller@123');
  await login('loans', 'loans', 'Loans@123');
  await login('manager', 'manager', 'Manager@123');
});
after(async () => { server.close(); await pool.end(); });

test('auth: bad password, no session, role permissions', async () => {
  assert.equal((await call('x', 'POST', '/api/auth/login', { username: 'teller', password: 'nope' })).status, 401);
  assert.equal((await call('anon', 'GET', '/api/customers')).status, 401);
  const me = await call('teller', 'GET', '/api/auth/me');
  assert.equal(me.data.user.role, 'TELLER');
  assert.ok(me.data.user.permissions.includes('transactions:post'));
  assert.ok(!me.data.user.permissions.includes('audit:view'));
  // password hashes are never exposed
  assert.equal(JSON.stringify(me.data).includes('hash'), false);
  const hash = (await query("SELECT password_hash FROM staff_user WHERE username='teller'"))[0].password_hash;
  assert.match(hash, /^\$2[aby]\$/);
});

test('role-based access is enforced by the API', async () => {
  assert.equal((await call('teller', 'GET', '/api/audit')).status, 403);
  assert.equal((await call('loans', 'POST', '/api/transactions/deposit', { account_id: 1, amount: '10' })).status, 403);
  assert.equal((await call('teller', 'POST', '/api/loans', {})).status, 403);
  assert.equal((await call('teller', 'PATCH', '/api/accounts/1/status', { status: 'FROZEN' })).status, 403);
  assert.equal((await call('manager', 'GET', '/api/audit')).status, 200);
});

test('dashboard, branches, lookups', async () => {
  const d = await call('teller', 'GET', '/api/dashboard');
  assert.equal(d.status, 200);
  assert.equal(d.data.monthly.length, 6);
  assert.equal(d.data.branches.length, 4);
  const sum = num((await query('SELECT SUM(balance) s FROM account'))[0].s);
  near(d.data.totals.total_deposits, sum, 'total deposits');
  assert.equal((await call('teller', 'GET', '/api/branches')).data.length, 4);
  assert.equal((await call('teller', 'GET', '/api/account-types')).data.length, 4);
});

test('customers: search, create, validate, duplicate, update', async () => {
  const s = await call('teller', 'GET', '/api/customers?q=ananya');
  assert.equal(s.data.rows.length, 1);
  const stamp = Date.now();
  const c = await call('teller', 'POST', '/api/customers', {
    full_name: 'Test Customer', date_of_birth: '1990-05-05', email: `t${stamp}@example.com`, phone: '9000000000',
    address: 'Somewhere', id_proof: `TST${stamp}`.slice(0, 30),
  });
  assert.equal(c.status, 201);
  const id = c.data.customer_id;
  const dup = await call('teller', 'POST', '/api/customers', { ...c.data, id_proof: 'XYZ' });
  assert.equal(dup.status, 409);
  assert.match(dup.data.error, /Duplicate/i);
  const bad = await call('teller', 'POST', '/api/customers', {
    full_name: 'Bad Email', date_of_birth: '1990-05-05', email: 'not-an-email', phone: '1', address: 'a', id_proof: `BAD${stamp}`.slice(0, 30) });
  assert.equal(bad.status, 422);
  assert.match(bad.data.error, /ck_customer_email/);
  assert.equal((await call('teller', 'POST', '/api/customers', { full_name: 'x' })).status, 400);
  const u = await call('teller', 'PUT', `/api/customers/${id}`, { ...c.data, date_of_birth: '1990-05-05', phone: '9111111111' });
  assert.equal(u.data.phone, '9111111111');
  const detail = await call('teller', 'GET', `/api/customers/${id}`);
  assert.equal(detail.data.accountList.length, 0);
  globalThis.__cust = id;
});

test('accounts: list/search, create with joint holder + opening deposit, status change', async () => {
  const list = await call('teller', 'GET', '/api/accounts');
  assert.equal(list.data.total, 11 + (await query("SELECT COUNT(*) n FROM account WHERE account_id > 11"))[0].n);
  assert.equal((await call('teller', 'GET', '/api/accounts?q=Divya')).data.rows.length, 2);
  assert.equal((await call('teller', 'GET', '/api/accounts?status=FROZEN')).data.rows.length >= 1, true);
  const created = await call('teller', 'POST', '/api/accounts', {
    type_id: 1, branch_id: 1, primary_customer_id: globalThis.__cust, joint_customer_ids: [1], opening_deposit: '5000.00' });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.match(created.data.account_number, /^5001000000\d{4}$/);
  near(created.data.balance, 5000);
  assert.match(created.data.holders, /Test Customer/);
  assert.match(created.data.holders, /Ananya/);
  globalThis.__acct = created.data.account_id;
  // opening deposit rejected by the trigger rolls the whole account back
  const before = num((await query('SELECT COUNT(*) n FROM account'))[0].n);
  const rej = await call('teller', 'POST', '/api/accounts', { type_id: 1, branch_id: 1, primary_customer_id: globalThis.__cust, opening_deposit: '-5' });
  assert.equal(rej.status, 422);
  assert.equal(rej.data.error, 'Transaction amount must be positive');
  assert.equal(num((await query('SELECT COUNT(*) n FROM account'))[0].n), before, 'account insert rolled back');
  // status change: manager only
  const st = await call('manager', 'PATCH', `/api/accounts/${globalThis.__acct}/status`, { status: 'DORMANT' });
  assert.equal(st.data.status, 'DORMANT');
  assert.equal((await call('manager', 'PATCH', `/api/accounts/${globalThis.__acct}/status`, { status: 'BOGUS' })).status, 400);
  await call('manager', 'PATCH', `/api/accounts/${globalThis.__acct}/status`, { status: 'ACTIVE' });
});

test('deposit / withdraw: balances move, DB rules surface verbatim', async () => {
  const id = globalThis.__acct;
  const b0 = await balanceOf(id);
  const d = await call('teller', 'POST', '/api/transactions/deposit', { account_id: id, amount: '1234.56', description: 'e2e deposit' });
  assert.equal(d.status, 201);
  near(d.data.balance_after, b0 + 1234.56);
  near(await balanceOf(id), b0 + 1234.56);
  const w = await call('teller', 'POST', '/api/transactions/withdraw', { account_id: id, amount: '234.56' });
  assert.equal(w.status, 201);
  near(await balanceOf(id), b0 + 1000);

  const over = await call('teller', 'POST', '/api/transactions/withdraw', { account_id: id, amount: '999999' });
  assert.equal(over.status, 422);
  assert.equal(over.data.error, 'Insufficient balance (minimum balance rule)');
  assert.equal(over.data.sqlState, '45000');
  const neg = await call('teller', 'POST', '/api/transactions/deposit', { account_id: id, amount: '-10' });
  assert.equal(neg.data.error, 'Transaction amount must be positive');
  const zero = await call('teller', 'POST', '/api/transactions/deposit', { account_id: id, amount: '0' });
  assert.equal(zero.data.error, 'Transaction amount must be positive');
  const frozen = await call('teller', 'POST', '/api/transactions/deposit', { account_id: 9, amount: '100' });
  assert.equal(frozen.data.error, 'Account is not ACTIVE - transaction rejected');
  const closed = await call('teller', 'POST', '/api/transactions/deposit', { account_id: 11, amount: '100' });
  assert.equal(closed.data.error, 'Account is not ACTIVE - transaction rejected');
  const nope = await call('teller', 'POST', '/api/transactions/deposit', { account_id: 99999, amount: '100' });
  assert.equal(nope.data.error, 'Account does not exist');
  assert.equal((await call('teller', 'POST', '/api/transactions/deposit', { account_id: id, amount: 'abc' })).status, 400);
  assert.equal((await call('teller', 'POST', '/api/transactions/deposit', { account_id: id, amount: "1; DROP TABLE account" })).status, 400);
  near(await balanceOf(id), b0 + 1000, 'rejected postings changed nothing');
  assert.ok((await call('teller', 'GET', '/api/transactions/recent')).data.length > 0);
});

test('transfers: beneficiary + direct, debit = credit, atomic failure, history', async () => {
  const a1 = await balanceOf(1), a2 = await balanceOf(2);
  // beneficiary 1 = Ananya -> Rahul (account 2)
  const t = await call('teller', 'POST', '/api/transfers', { from_account_id: 1, beneficiary_id: 1, amount: '250.00', remarks: 'e2e' });
  assert.equal(t.status, 201, JSON.stringify(t.data));
  assert.equal(t.data.balanced, true);
  near(t.data.debited, 250); near(t.data.credited, 250);
  near(await balanceOf(1), a1 - 250); near(await balanceOf(2), a2 + 250);
  const direct = await call('teller', 'POST', '/api/transfers', { from_account_id: 2, to_account_id: 1, amount: '250' });
  assert.equal(direct.status, 201);
  near(await balanceOf(1), a1); near(await balanceOf(2), a2);

  const same = await call('teller', 'POST', '/api/transfers', { from_account_id: 1, to_account_id: 1, amount: '5' });
  assert.equal(same.data.error, 'Cannot transfer to the same account');
  const txnBefore = num((await query('SELECT COUNT(*) n FROM `transaction`'))[0].n);
  const over = await call('teller', 'POST', '/api/transfers', { from_account_id: 1, to_account_id: 2, amount: '99999999' });
  assert.equal(over.data.error, 'Insufficient balance (minimum balance rule)');
  const toFrozen = await call('teller', 'POST', '/api/transfers', { from_account_id: 1, to_account_id: 9, amount: '10' });
  assert.equal(toFrozen.data.error, 'Account is not ACTIVE - transaction rejected');
  assert.equal(num((await query('SELECT COUNT(*) n FROM `transaction`'))[0].n), txnBefore, 'failed transfers left no orphan leg');
  near(await balanceOf(1), a1, 'sender untouched after failed credit leg');
  // external beneficiary (id 2 = Suresh at SBI) cannot be settled
  assert.equal((await call('teller', 'POST', '/api/transfers', { from_account_id: 1, beneficiary_id: 2, amount: '10' })).status, 422);

  const hist = await call('teller', 'GET', '/api/transfers?limit=100');
  assert.ok(hist.data.rows.length >= 10);
  assert.ok(hist.data.rows.every((r) => r.balanced === true && num(r.debited) === num(r.credited)));
  assert.ok(hist.data.rows[0].from_holders);
  const bens = await call('teller', 'GET', '/api/beneficiaries?account_id=1');
  assert.equal(bens.data.length, 2);
  assert.equal(bens.data.find((b) => b.type === 'INTERNAL').account_id, 2);
  const nb = await call('teller', 'POST', '/api/beneficiaries', { customer_id: 1, beneficiary_name: 'Sneha', account_number: '50010000002001', bank_name: 'Woxsen Co-operative Bank', ifsc_code: 'woxs0000002', type: 'INTERNAL' });
  assert.equal(nb.status, 201);
  assert.equal(nb.data.ifsc_code, 'WOXS0000002');
  await call('teller', 'DELETE', `/api/beneficiaries/${nb.data.beneficiary_id}`);
});

test('statements: running balance, opening/closing, history, bad range', async () => {
  const s = await call('teller', 'GET', '/api/statements?account_id=1&from=2026-01-01&to=2026-12-31');
  assert.equal(s.status, 200);
  near(s.data.opening_balance, 0);
  near(s.data.closing_balance, await balanceOf(1), 'closing equals live balance');
  let run = 0;
  for (const l of s.data.lines) { run += num(l.credit) - num(l.debit); near(l.balance, run, 'running'); }
  // split ranges: July opening + movement = August opening
  const jul = await call('teller', 'GET', '/api/statements?account_id=1&from=2026-07-01&to=2026-07-31');
  const aug = await call('teller', 'GET', '/api/statements?account_id=1&from=2026-08-01&to=2026-08-31');
  near(aug.data.opening_balance, jul.data.closing_balance, 'range continuity');
  assert.ok(s.data.lines.every((l) => num(l.balance) >= 0), 'never negative');
  const logged = await call('teller', 'POST', '/api/statements', { account_id: 1, from: '2026-07-01', to: '2026-07-31' });
  assert.equal(logged.status, 201);
  const hist = await call('teller', 'GET', '/api/statements/history?account_id=1');
  assert.ok(hist.data.length >= 3);
  const bad = await call('teller', 'POST', '/api/statements', { account_id: 1, from: '2026-08-01', to: '2026-07-01' });
  assert.equal(bad.status, 422);
  assert.match(bad.data.error, /ck_statement_period/);
  assert.equal((await call('teller', 'GET', '/api/statements?account_id=1&from=garbage&to=2026-01-01')).status, 400);
});

test('loans: create (disbursement + schedule), repay, overdue guard, view totals', async () => {
  const list = await call('loans', 'GET', '/api/loans');
  assert.ok(list.data.rows.length >= 3);
  const seed1 = (await call('loans', 'GET', '/api/loans/1')).data;
  near(seed1.outstanding, 37087.17);
  assert.equal(seed1.overdue_instalments, 1);

  // Same terms as seed loan #2 but for the test account -> EMI must equal the sample-data formula.
  const acct = globalThis.__acct, cust = globalThis.__cust;
  const b0 = await balanceOf(acct);
  const created = await call('loans', 'POST', '/api/loans', {
    customer_id: cust, account_id: acct, loan_type: 'VEHICLE', amount: '300000', interest_rate: '9', start_date: '2026-10-09', tenure_months: 12 });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const loan = (await call('loans', 'GET', `/api/loans/${created.data.loan_id}`)).data;
  assert.equal(loan.schedule.length, 12);
  assert.ok(loan.schedule.every((s) => s.status === 'PENDING'));
  const r = 0.09 / 12, f = Math.pow(1 + r, 12);
  near(loan.schedule[0].due_amount, 300000 * r * f / (f - 1), 'EMI (300000 @ 9% x 12)');
  near(await balanceOf(acct), b0 + 300000, 'disbursed');
  near(loan.total_payable, loan.schedule.reduce((a, s) => a + num(s.due_amount), 0));

  const rep = await call('loans', 'POST', `/api/loans/${loan.loan_id}/repay`, { schedule_id: loan.schedule[0].schedule_id, amount: loan.schedule[0].due_amount });
  assert.equal(rep.status, 200, JSON.stringify(rep.data));
  assert.equal(rep.data.instalment.status, 'PAID');
  near(rep.data.loan.total_repaid, loan.schedule[0].due_amount);
  near(rep.data.loan.outstanding, num(loan.total_payable) - num(loan.schedule[0].due_amount));
  near(await balanceOf(acct), b0 + 300000 - num(loan.schedule[0].due_amount));
  const again = await call('loans', 'POST', `/api/loans/${loan.loan_id}/repay`, { schedule_id: loan.schedule[0].schedule_id, amount: '10' });
  assert.equal(again.status, 409);
  const neg = await call('loans', 'POST', `/api/loans/${loan.loan_id}/repay`, { schedule_id: loan.schedule[1].schedule_id, amount: '-5' });
  assert.equal(neg.data.error, 'Transaction amount must be positive');
  const wrong = await call('loans', 'POST', `/api/loans/${loan.loan_id}/repay`, { schedule_id: 1, amount: '5' });
  assert.equal(wrong.data.error, 'Schedule item does not belong to this loan');
  // partial payment leaves the instalment unpaid
  const part = await call('teller', 'POST', `/api/loans/${loan.loan_id}/repay`, { schedule_id: loan.schedule[1].schedule_id, amount: '100' });
  assert.equal(part.data.instalment.status, 'PENDING');
  const det = (await call('loans', 'GET', `/api/loans/${loan.loan_id}`)).data;
  near(det.schedule[1].paid_amount, 100);
  assert.equal(det.repayments.length, 2);

  // frozen account: disbursement rejected, nothing persists
  const nLoans = num((await query('SELECT COUNT(*) n FROM loan'))[0].n);
  const frozen = await call('loans', 'POST', '/api/loans', { customer_id: 9, account_id: 9, loan_type: 'PERSONAL', amount: '1000', interest_rate: '10', start_date: '2026-10-09', tenure_months: 6 });
  assert.equal(frozen.data.error, 'Account is not ACTIVE - transaction rejected');
  assert.equal(num((await query('SELECT COUNT(*) n FROM loan'))[0].n), nLoans, 'loan rolled back');
  assert.equal(num((await query('SELECT COUNT(*) n FROM loan_schedule WHERE loan_id NOT IN (SELECT loan_id FROM loan)'))[0].n), 0);
  // DB checks via the API: zero interest, bad holder, bad tenure
  const zeroRate = await call('loans', 'POST', '/api/loans', { customer_id: cust, account_id: acct, loan_type: 'PERSONAL', amount: '1000', interest_rate: '0', start_date: '2026-10-09', tenure_months: 6 });
  assert.equal(zeroRate.status, 422); assert.match(zeroRate.data.error, /ck_loan_rate/);
  assert.equal((await call('loans', 'POST', '/api/loans', { customer_id: 2, account_id: acct, loan_type: 'PERSONAL', amount: '1000', interest_rate: '10', start_date: '2026-10-09', tenure_months: 6 })).status, 400);
  assert.equal((await call('loans', 'POST', '/api/loans', { customer_id: cust, account_id: acct, loan_type: 'PERSONAL', amount: '1000', interest_rate: '10', start_date: '2026-10-09', tenure_months: 0 })).status, 400);
  // overdue filter
  const od = await call('loans', 'GET', '/api/loans?overdue=1');
  assert.ok(od.data.rows.every((l) => num(l.overdue_instalments) > 0));
  assert.ok(num(od.data.summary.overdue.instalments) >= 2);
});

test('loan closes when the last instalment is paid', async () => {
  const acct = globalThis.__acct, cust = globalThis.__cust;
  const c = await call('loans', 'POST', '/api/loans', { customer_id: cust, account_id: acct, loan_type: 'PERSONAL', amount: '1200', interest_rate: '12', start_date: '2026-10-09', tenure_months: 2 });
  const loan = (await call('loans', 'GET', `/api/loans/${c.data.loan_id}`)).data;
  for (const s of loan.schedule) {
    const r = await call('loans', 'POST', `/api/loans/${loan.loan_id}/repay`, { schedule_id: s.schedule_id, amount: s.due_amount });
    assert.equal(r.status, 200);
  }
  const fin = (await call('loans', 'GET', `/api/loans/${loan.loan_id}`)).data;
  assert.equal(fin.status, 'CLOSED');
  near(fin.outstanding, 0);
  const closed = await call('loans', 'POST', `/api/loans/${loan.loan_id}/repay`, { schedule_id: loan.schedule[0].schedule_id, amount: '1' });
  assert.equal(closed.status, 409); // already paid guard comes first
});

test('audit: filters + paging (manager)', async () => {
  const all = await call('manager', 'GET', '/api/audit?limit=5');
  assert.equal(all.data.rows.length, 5);
  assert.ok(all.data.total > 50);
  const w = await call('manager', 'GET', '/api/audit?type=WITHDRAWAL&limit=200');
  assert.ok(w.data.rows.every((r) => r.transaction_type === 'WITHDRAWAL'));
  const f = await call('manager', 'GET', '/api/audit?from=2026-07-01&to=2026-07-05&limit=200');
  assert.ok(f.data.rows.every((r) => r.transaction_date >= '2026-07-01' && r.transaction_date < '2026-07-06'));
  const acc = await call('manager', 'GET', '/api/audit?account=50010000001001&status=ACTIVE&min_amount=1000&limit=200');
  assert.ok(acc.data.rows.length > 0 && acc.data.rows.every((r) => r.account_number === '50010000001001' && num(r.amount) >= 1000));
  assert.equal((await call('manager', 'GET', '/api/audit?type=HACK')).status, 400);
  const inj = await call('manager', 'GET', "/api/audit?account=' OR 1=1 --");
  assert.equal(inj.data.rows.length, 0);
  const p2 = await call('manager', 'GET', '/api/audit?limit=5&page=2');
  assert.notEqual(p2.data.rows[0].transaction_id, all.data.rows[0].transaction_id);
});

test('rule tester: every probe is rejected by the DB and rolled back', async () => {
  const snap = async () => JSON.stringify([
    await query('SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM `transaction`'),
    await query('SELECT SUM(balance) s FROM account'),
    await query('SELECT COUNT(*) n FROM transfer')]);
  const before = await snap();
  const run = (k, b) => call('teller', 'POST', `/api/rule-tests/${k}`, b);
  const o = (await run('overdraw', { account_id: 3, amount: '9999999' })).data;
  assert.equal(o.rejected, true); assert.equal(o.message, 'Insufficient balance (minimum balance rule)'); assert.equal(o.sqlState, '45000');
  assert.equal((await run('frozen', { account_id: 9, amount: '100' })).data.message, 'Account is not ACTIVE - transaction rejected');
  assert.equal((await run('negative', { account_id: 1, amount: '-500' })).data.message, 'Transaction amount must be positive');
  assert.equal((await run('zero', { account_id: 1 })).data.message, 'Transaction amount must be positive');
  assert.equal((await run('closed', { account_id: 11, amount: '5' })).data.message, 'Account is not ACTIVE - transaction rejected');
  assert.equal((await run('same_account', { account_id: 1, amount: '5' })).data.message, 'Cannot transfer to the same account');
  const ub = (await run('unbalanced', { account_id: 1, to_account_id: 2, amount: '100' })).data;
  assert.equal(ub.message, 'Unbalanced transfer: debit must equal credit');
  assert.equal(ub.rolledBack, true);
  // control: a probe the DB accepts is reported as NOT rejected - and still leaves no trace
  const ok = (await run('overdraw', { account_id: 4, amount: '1' })).data;
  assert.equal(ok.rejected, false);
  assert.equal(await snap(), before, 'nothing persisted by any probe');
  assert.equal((await run('nonsense', {})).status, 404);
});

test('concurrency: parallel withdrawals never overdraw (row locking in the trigger)', async () => {
  const id = globalThis.__acct;
  await call('teller', 'POST', '/api/transactions/deposit', { account_id: id, amount: '10000' });
  const bal = await balanceOf(id);                    // min balance 1000 for Savings
  const each = Math.floor((bal - 1000) / 3) + 1;       // three of these cannot all succeed
  const rs = await Promise.all([1, 2, 3].map(() => call('teller', 'POST', '/api/transactions/withdraw', { account_id: id, amount: String(each) })));
  const ok = rs.filter((r) => r.status === 201).length;
  assert.equal(ok, 2, JSON.stringify(rs.map((r) => r.status)));
  assert.ok((await balanceOf(id)) >= 1000);
});

test('ledger invariant: every balance equals the sum of its postings', async () => {
  const bad = await query(
    `SELECT a.account_id FROM account a
      WHERE a.balance <> COALESCE((SELECT SUM(CASE WHEN transaction_type IN ('DEPOSIT','TRANSFER_CREDIT','LOAN_DISBURSEMENT') THEN amount ELSE -amount END)
                                     FROM \`transaction\` t WHERE t.account_id = a.account_id), 0)`);
  assert.deepEqual(bad, []);
});

test('static front end is served and unknown API routes are JSON 404', async () => {
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /Woxsen/);
  const font = await fetch(base + '/fonts/inter-latin-wght-normal.woff2');
  assert.equal(font.status, 200);
  const r = await call('teller', 'GET', '/api/nothing-here');
  assert.equal(r.status, 404);
  const malformed = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(malformed.status, 400);
});
