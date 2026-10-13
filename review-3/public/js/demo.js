// demo.js: the whole Woxsen Co-operative Bank back end, running inside the page (GitHub Pages demo only).
//
// It is loaded ONLY when window.__DEMO__ is set (the Pages build injects that flag); the normal
// Node + MySQL server never loads this file. It mirrors the SQL in bank_review2.sql: the same tables,
// the same sample data, the same triggers (positive amount, ACTIVE account, minimum balance, balanced
// transfer legs), the same procedures (sp_transfer, sp_loan_repayment) and the same error messages.
// Nothing is stored anywhere: reloading the page restores the sample data.
import { ApiError } from './api.js';

// ---------------------------------------------------------------- tiny helpers
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoDateTime = (d) => `${isoDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const nowStr = () => isoDateTime(new Date());
const todayStr = () => isoDate(new Date());
const parseD = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const addDaysStr = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return isoDate(d); };
/** MySQL DATE_ADD(date, INTERVAL n MONTH): the day is clamped to the end of a shorter month. */
function addMonthsStr(s, n) {
  const d = parseD(s);
  const day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(day, last));
  return isoDate(t);
}
const monthsBetween = (a, b) => {
  const x = parseD(a), y = parseD(b);
  let m = (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth());
  if (y.getDate() < x.getDate()) m -= 1;
  return m;
};
// money is kept in integer paise and shown as the 2-decimal strings MySQL returns for DECIMAL columns
const paise = (s) => Math.round(Number(s) * 100);
const fmt = (p) => (p / 100).toFixed(2);
const clone = (o) => JSON.parse(JSON.stringify(o));
const likeOk = (hay, needle) => String(hay ?? '').toLowerCase().includes(String(needle).toLowerCase());

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra || {}; }
}
/** An error the database itself would raise (trigger SIGNAL, CHECK, UNIQUE, FK). */
class DbError extends Error {
  constructor(errno, message, sqlState = '23000') { super(message); this.errno = errno; this.sqlState = sqlState; this.sqlMessage = message; }
}
const signal = (message) => new DbError(1644, message, '45000');

// ---------------------------------------------------------------- validation (lib/validate.js)
const AMOUNT_RE = /^-?\d{1,13}(\.\d{1,2})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const v = {
  id(value, label) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${label} is required`);
    return n;
  },
  optId(value, label) { return value === undefined || value === null || value === '' ? null : v.id(value, label); },
  amount(value, label = 'Amount') {
    const s = String(value ?? '').trim();
    if (!AMOUNT_RE.test(s)) throw new HttpError(400, `${label} must be a number with at most 2 decimals`);
    return s;
  },
  text(value, label, { max = 150, required = true } = {}) {
    const s = value === undefined || value === null ? '' : String(value).trim();
    if (!s) { if (required) throw new HttpError(400, `${label} is required`); return null; }
    if (s.length > max) throw new HttpError(400, `${label} must be at most ${max} characters`);
    return s;
  },
  date(value, label, { required = true } = {}) {
    if (value === undefined || value === null || value === '') {
      if (required) throw new HttpError(400, `${label} is required`);
      return null;
    }
    const s = String(value);
    if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) throw new HttpError(400, `${label} must be a valid date (YYYY-MM-DD)`);
    return s;
  },
  oneOf(value, allowed, label) {
    if (!allowed.includes(value)) throw new HttpError(400, `${label} must be one of: ${allowed.join(', ')}`);
    return value;
  },
  paging(q, { defLimit = 25, maxLimit = 200 } = {}) {
    const limit = Math.min(Math.max(parseInt(q.limit, 10) || defLimit, 1), maxLimit);
    const page = Math.max(parseInt(q.page, 10) || 1, 1);
    return { limit, offset: (page - 1) * limit, page };
  },
};

// ---------------------------------------------------------------- roles (lib/permissions.js)
const T = 'TELLER', L = 'LOAN_OFFICER', M = 'MANAGER';
const PERMISSIONS = {
  'dashboard:view': [T, L, M], 'customers:view': [T, L, M], 'customers:write': [T, M],
  'accounts:view': [T, L, M], 'accounts:create': [T, M], 'accounts:status': [M],
  'transactions:post': [T, M], 'transactions:recent': [T, L, M], 'audit:view': [M],
  'transfers:view': [T, L, M], 'transfers:create': [T, M], 'beneficiaries:write': [T, M],
  'statements:view': [T, L, M], 'loans:view': [T, L, M], 'loans:create': [L, M], 'loans:repay': [T, L, M],
  'branches:view': [T, L, M], 'ruletester:run': [T, L, M],
};
const can = (role, perm) => (PERMISSIONS[perm] || []).includes(role);
const permissionsFor = (role) => Object.keys(PERMISSIONS).filter((p) => can(role, p));
const STAFF = [
  { staff_id: 1, username: 'teller', full_name: 'M. Srilakshmi Reddy', role: T, password: 'Teller@123' },
  { staff_id: 2, username: 'loans', full_name: 'Deekshan Raj', role: L, password: 'Loans@123' },
  { staff_id: 3, username: 'manager', full_name: 'Sri Lakshmi', role: M, password: 'Manager@123' },
];
const publicUser = (u) => ({ id: u.staff_id ?? u.id, username: u.username, name: u.full_name ?? u.name, role: u.role, permissions: permissionsFor(u.role) });

// ---------------------------------------------------------------- the database
let db;

/** Run fn as one transaction: any thrown error puts every table back exactly as it was. */
function tx(fn) {
  const before = clone(db);
  try { return fn(); } catch (e) { db = before; throw e; }
}
const nextId = (key) => (db.seq[key] += 1);

const CREDIT_TYPES = ['DEPOSIT', 'TRANSFER_CREDIT', 'LOAN_DISBURSEMENT'];
const accountOf = (id) => db.account.find((a) => a.account_id === id);
const typeOf = (id) => db.account_type.find((t) => t.type_id === id);
const branchOf = (id) => db.branch.find((b) => b.branch_id === id);
const customerOf = (id) => db.customer.find((c) => c.customer_id === id);
const loanOf = (id) => db.loan.find((l) => l.loan_id === id);

/** trg_txn_before_insert + the insert + trg_txn_after_insert. Returns the new row. */
function insertTxn(account_id, type, amountStr, description, when) {
  const amount = amountStr === null || amountStr === undefined ? null : paise(amountStr);
  if (amount === null || amount <= 0) throw signal('Transaction amount must be positive');
  const acc = accountOf(account_id);
  if (!acc) throw signal('Account does not exist');
  if (acc.status !== 'ACTIVE') throw signal('Account is not ACTIVE - transaction rejected');
  const min = paise(typeOf(acc.type_id).min_balance);
  let after;
  if (CREDIT_TYPES.includes(type)) after = acc.balance + amount;
  else {
    after = acc.balance - amount;
    if (after < min) throw signal('Insufficient balance (minimum balance rule)');
  }
  if (after < 0) throw new DbError(3819, "Check constraint 'ck_account_balance' is violated.");
  const row = {
    transaction_id: nextId('transaction'), account_id, transaction_type: type, amount,
    transaction_date: when || nowStr(), description: description ?? null, balance_after: after,
  };
  db.transaction.push(row);
  acc.balance = after;
  return row;
}

/** trg_transfer_before_insert + the insert. */
function insertTransferRow(debit_id, credit_id, remarks) {
  const d = db.transaction.find((t) => t.transaction_id === debit_id);
  const c = db.transaction.find((t) => t.transaction_id === credit_id);
  if (d.transaction_type !== 'TRANSFER_DEBIT' || c.transaction_type !== 'TRANSFER_CREDIT') {
    throw signal('Transfer legs must be a TRANSFER_DEBIT and a TRANSFER_CREDIT');
  }
  if (d.amount !== c.amount) throw signal('Unbalanced transfer: debit must equal credit');
  if (d.account_id === c.account_id) throw signal('Cannot transfer to the same account');
  const row = { transfer_id: nextId('transfer'), debit_transaction_id: debit_id, credit_transaction_id: credit_id, remarks: remarks ?? null };
  db.transfer.push(row);
  return row;
}

/** CALL sp_transfer(from, to, amount, remarks, when). */
function spTransfer(from, to, amountStr, remarks, when) {
  if (from === to) throw signal('Cannot transfer to the same account');
  return tx(() => {
    const d = insertTxn(from, 'TRANSFER_DEBIT', amountStr, `Transfer to A/C #${to}`, when);
    const c = insertTxn(to, 'TRANSFER_CREDIT', amountStr, `Transfer from A/C #${from}`, when);
    return insertTransferRow(d.transaction_id, c.transaction_id, remarks);
  });
}

/** CALL sp_loan_repayment(loan, schedule, amount, when). */
function spLoanRepayment(loan_id, schedule_id, amountStr, when) {
  const loan = loanOf(loan_id);
  if (!loan || loan.status !== 'ACTIVE') throw signal('Loan not found or not ACTIVE');
  const item = db.loan_schedule.find((s) => s.schedule_id === schedule_id && s.loan_id === loan_id);
  if (!item) throw signal('Schedule item does not belong to this loan');
  tx(() => {
    const t = insertTxn(loan.account_id, 'LOAN_REPAYMENT', amountStr, `EMI for loan #${loan_id}`, when);
    db.loan_repayment.push({ repayment_id: nextId('loan_repayment'), transaction_id: t.transaction_id, loan_id });
    db.repayment.push({ repayment_id: nextId('repayment'), schedule_id, transaction_id: t.transaction_id, amount: paise(amountStr), status: 'APPLIED' });
    const paid = db.repayment.filter((r) => r.schedule_id === schedule_id && r.status === 'APPLIED').reduce((s, r) => s + r.amount, 0);
    if (paid >= item.due_amount) item.status = 'PAID';
    if (db.loan_schedule.filter((s) => s.loan_id === loan_id && s.status !== 'PAID').length === 0) loan.status = 'CLOSED';
  });
}

function emi(principalStr, rateStr, months) {
  // MySQL divides DECIMAL(5,2) by 1200 at a scale of 6 digits (8.00 / 1200 = 0.006667), so match that
  const P = Number(principalStr), r = Number((Number(rateStr) / 1200).toFixed(6));
  const pow = Math.pow(1 + r, months);
  return Math.round(P * r * pow / (pow - 1) * 100); // paise
}
function buildSchedule(loan_id, start, months, today) {
  const a = emi(loanOf(loan_id).amount / 100, loanOf(loan_id).interest_rate, months);
  for (let k = 1; k <= months; k += 1) {
    const due = addMonthsStr(start, k);
    db.loan_schedule.push({ schedule_id: nextId('loan_schedule'), loan_id, due_date: due, due_amount: a, status: due < today ? 'OVERDUE' : 'PENDING' });
  }
}

/** The sample data of bank_review2.sql, loaded through the same triggers in the same order. */
function seed() {
  db = {
    seq: { branch: 0, account_type: 0, customer: 0, account: 0, transaction: 0, transfer: 0, beneficiary: 0, statement: 0, loan: 0, loan_schedule: 0, loan_repayment: 0, repayment: 0 },
    branch: [], account_type: [], customer: [], account: [], account_holder: [], transaction: [], transfer: [],
    beneficiary: [], statement: [], loan: [], loan_schedule: [], loan_repayment: [], repayment: [],
  };
  [
    ['Hanamkonda Main', 'Nakkalagutta Road', 'Hanamkonda', '0870-2501122', 'K. Ramesh Babu'],
    ['Warangal Fort', 'Fort Road, Mattewada', 'Warangal', '0870-2445566', 'S. Padmavathi'],
    ['Hyderabad Banjara', 'Road No. 12, Banjara Hills', 'Hyderabad', '040-23551234', 'M. Anil Kumar'],
    ['Karimnagar Town', 'Mankammathota', 'Karimnagar', '0878-2233445', 'P. Vijaya Lakshmi'],
  ].forEach(([branch_name, address, city, phone, branch_manager]) =>
    db.branch.push({ branch_id: nextId('branch'), branch_name, address, city, phone, branch_manager }));
  [
    ['Savings', 'Regular savings account', '1000.00', 1],
    ['Current', 'Business current account', '5000.00', 0],
    ['Salary', 'Zero balance salary account', '0.00', 1],
    ['Fixed Deposit', 'Term deposit account', '10000.00', 1],
  ].forEach(([type_name, description, min_balance, ib]) =>
    db.account_type.push({ type_id: nextId('account_type'), type_name, description, min_balance, is_interest_bearing: ib }));
  [
    ['Ananya Reddy', '1998-04-12', 'ananya.reddy@example.com', '9848011001', 'Kazipet, Hanamkonda', 'ABCPR1234A'],
    ['Rahul Verma', '1995-09-30', 'rahul.verma@example.com', '9848011002', 'Subedari, Hanamkonda', 'BCDPV2345B'],
    ['Sneha Kapoor', '1990-01-22', 'sneha.kapoor@example.com', '9848011003', 'Hunter Road, Warangal', 'CDEPK3456C'],
    ['Arjun Naidu', '1987-07-05', 'arjun.naidu@example.com', '9848011004', 'Jubilee Hills, Hyderabad', 'DEFPN4567D'],
    ['Priya Sharma', '2000-11-18', 'priya.sharma@example.com', '9848011005', 'Karimnagar', 'EFGPS5678E'],
    ['Mohammed Imran', '1992-03-09', 'imran.mohammed@example.com', '9848011006', 'Mattewada, Warangal', 'FGHPM6789F'],
    ['Lakshmi Devi', '1975-12-25', 'lakshmi.devi@example.com', '9848011007', 'Hanamkonda', 'GHIPD7890G'],
    ['Vikram Singh', '1983-06-14', 'vikram.singh@example.com', '9848011008', 'Banjara Hills, Hyderabad', 'HIJPS8901H'],
    ['Divya Menon', '1999-08-02', 'divya.menon@example.com', '9848011009', 'Warangal', 'IJKPM9012I'],
    ['Karthik Goud', '1993-02-27', 'karthik.goud@example.com', '9848011010', 'Karimnagar', 'JKLPG0123J'],
  ].forEach(([full_name, date_of_birth, email, phone, address, id_proof]) =>
    db.customer.push({ customer_id: nextId('customer'), full_name, date_of_birth, email, phone, address, id_proof }));
  [
    ['50010000001001', 1, 1, 'ACTIVE', '2024-01-15'], ['50010000001002', 1, 1, 'ACTIVE', '2024-02-10'],
    ['50010000002001', 1, 2, 'ACTIVE', '2023-11-05'], ['50010000003001', 2, 3, 'ACTIVE', '2022-06-20'],
    ['50010000004001', 3, 4, 'ACTIVE', '2025-03-01'], ['50010000002002', 1, 2, 'ACTIVE', '2024-07-18'],
    ['50010000001003', 4, 1, 'ACTIVE', '2023-09-12'], ['50010000003002', 1, 3, 'ACTIVE', '2024-04-02'],
    ['50010000002003', 3, 2, 'ACTIVE', '2024-10-09'], ['50010000004002', 1, 4, 'ACTIVE', '2025-01-20'],
    ['50010000001004', 1, 1, 'CLOSED', '2021-05-30'],
  ].forEach(([account_number, type_id, branch_id, status, open_date]) =>
    db.account.push({ account_id: nextId('account'), account_number, type_id, branch_id, status, open_date, balance: 0 }));
  [
    [1, 1, 'PRIMARY', '2024-01-15'], [2, 2, 'PRIMARY', '2024-02-10'], [3, 3, 'PRIMARY', '2023-11-05'],
    [4, 4, 'PRIMARY', '2022-06-20'], [5, 5, 'PRIMARY', '2025-03-01'], [6, 6, 'PRIMARY', '2024-07-18'],
    [7, 7, 'PRIMARY', '2023-09-12'], [8, 8, 'PRIMARY', '2024-04-02'], [8, 9, 'JOINT', '2024-04-02'],
    [9, 9, 'PRIMARY', '2024-10-09'], [10, 10, 'PRIMARY', '2025-01-20'], [11, 7, 'PRIMARY', '2021-05-30'],
  ].forEach(([account_id, customer_id, holder_type, since_date]) => db.account_holder.push({ account_id, customer_id, holder_type, since_date }));

  [
    [1, 'DEPOSIT', '50000.00', '2026-07-01 10:15:00', 'Opening cash deposit'], [2, 'DEPOSIT', '75000.00', '2026-07-01 11:00:00', 'Cheque deposit'],
    [3, 'DEPOSIT', '42000.00', '2026-07-02 09:45:00', 'Cash deposit'], [4, 'DEPOSIT', '250000.00', '2026-07-02 12:30:00', 'Business receipts'],
    [5, 'DEPOSIT', '38000.00', '2026-07-03 10:00:00', 'Salary credit - July'], [6, 'DEPOSIT', '20000.00', '2026-07-03 14:20:00', 'Cash deposit'],
    [7, 'DEPOSIT', '500000.00', '2026-07-04 10:30:00', 'Fixed deposit principal'], [8, 'DEPOSIT', '120000.00', '2026-07-04 15:10:00', 'Joint account funding'],
    [10, 'DEPOSIT', '30000.00', '2026-07-05 11:40:00', 'Cash deposit'], [9, 'DEPOSIT', '15000.00', '2026-07-05 16:00:00', 'Initial deposit'],
    [1, 'WITHDRAWAL', '8000.00', '2026-07-10 17:05:00', 'ATM withdrawal'], [2, 'WITHDRAWAL', '12000.00', '2026-07-12 10:25:00', 'Cash withdrawal'],
    [3, 'WITHDRAWAL', '5000.00', '2026-07-14 13:00:00', 'ATM withdrawal'], [4, 'WITHDRAWAL', '60000.00', '2026-07-15 12:00:00', 'Supplier payment'],
    [5, 'DEPOSIT', '38000.00', '2026-08-03 10:00:00', 'Salary credit - August'], [5, 'WITHDRAWAL', '15000.00', '2026-08-05 18:30:00', 'Rent payment withdrawal'],
    [8, 'WITHDRAWAL', '25000.00', '2026-08-08 11:15:00', 'Household expenses'], [10, 'WITHDRAWAL', '4000.00', '2026-08-09 09:50:00', 'ATM withdrawal'],
    [6, 'DEPOSIT', '15000.00', '2026-08-12 15:35:00', 'Cash deposit'], [1, 'DEPOSIT', '22000.00', '2026-08-18 10:10:00', 'Freelance payment received'],
    [5, 'DEPOSIT', '38000.00', '2026-09-03 10:00:00', 'Salary credit - September'], [2, 'DEPOSIT', '18000.00', '2026-09-06 11:45:00', 'Cheque deposit'],
    [4, 'DEPOSIT', '90000.00', '2026-09-10 12:20:00', 'Business receipts'],
  ].forEach(([a, t, amt, d, desc]) => insertTxn(a, t, amt, desc, d));
  accountOf(9).status = 'FROZEN';

  [
    [1, 2, '5000.00', 'Rent share', '2026-07-20 10:00:00'], [2, 3, '7500.00', 'Gift to sister', '2026-07-25 14:30:00'],
    [4, 6, '20000.00', 'Vendor settlement', '2026-08-02 11:00:00'], [8, 1, '6000.00', 'Tuition support', '2026-08-14 16:10:00'],
    [3, 10, '3000.00', 'Friend repayment', '2026-08-22 12:45:00'], [6, 2, '4500.00', 'Shared purchase', '2026-09-01 18:00:00'],
    [5, 1, '10000.00', 'Savings top-up', '2026-09-05 09:30:00'], [2, 8, '9000.00', 'Joint account top-up', '2026-09-12 13:05:00'],
  ].forEach(([f, t, amt, rem, d]) => spTransfer(f, t, amt, rem, d));

  [
    [1, '118.00', '2026-07-31 23:00:00', 'SMS alert charges - Q2'], [2, '236.00', '2026-08-01 23:00:00', 'Debit card annual fee'],
    [4, '500.00', '2026-08-31 23:00:00', 'Current account maintenance'], [3, '59.00', '2026-09-01 23:00:00', 'SMS alert charges'],
  ].forEach(([a, amt, d, desc]) => insertTxn(a, 'SERVICE_CHARGE', amt, desc, d));

  [
    [1, 'Rahul Verma', '50010000001002', 'Woxsen Co-operative Bank', 'WOXS0000001', 'INTERNAL', '2026-07-18 10:00:00'],
    [1, 'Suresh Reddy', '31204455678', 'State Bank of India', 'SBIN0000925', 'EXTERNAL', '2026-07-19 09:30:00'],
    [2, 'Sneha Kapoor', '50010000002001', 'Woxsen Co-operative Bank', 'WOXS0000002', 'INTERNAL', '2026-07-22 12:15:00'],
    [3, 'Karthik Goud', '50010000004002', 'Woxsen Co-operative Bank', 'WOXS0000004', 'INTERNAL', '2026-08-20 15:00:00'],
    [4, 'Imran Mohammed', '50010000002002', 'Woxsen Co-operative Bank', 'WOXS0000002', 'INTERNAL', '2026-07-30 10:45:00'],
    [8, 'Ananya Reddy', '50010000001001', 'Woxsen Co-operative Bank', 'WOXS0000001', 'INTERNAL', '2026-08-12 11:30:00'],
    [5, 'Anil Kumar', '60234455123', 'HDFC Bank', 'HDFC0001234', 'EXTERNAL', '2026-09-02 17:20:00'],
  ].forEach(([customer_id, beneficiary_name, account_number, bank_name, ifsc_code, type, created_at]) =>
    db.beneficiary.push({ beneficiary_id: nextId('beneficiary'), customer_id, beneficiary_name, account_number, bank_name, ifsc_code, type, created_at }));

  [
    [1, 1, 'PERSONAL', '60000.00', '12.00', '2026-07-01', '2026-12-01'],
    [4, 4, 'VEHICLE', '300000.00', '9.00', '2026-06-01', '2027-05-01'],
    [10, 10, 'EDUCATION', '150000.00', '8.00', '2026-07-05', '2027-06-05'],
  ].forEach(([customer_id, account_id, loan_type, amount, interest_rate, start_date, end_date]) =>
    db.loan.push({ loan_id: nextId('loan'), customer_id, account_id, loan_type, amount: paise(amount), interest_rate, start_date, end_date, status: 'ACTIVE' }));
  insertTxn(4, 'LOAN_DISBURSEMENT', '300000.00', 'Vehicle loan disbursement', '2026-06-01 10:00:00');
  insertTxn(1, 'LOAN_DISBURSEMENT', '60000.00', 'Personal loan disbursement', '2026-07-01 10:30:00');
  insertTxn(10, 'LOAN_DISBURSEMENT', '150000.00', 'Education loan disbursement', '2026-07-05 12:00:00');
  db.loan.forEach((l) => buildSchedule(l.loan_id, l.start_date, monthsBetween(l.start_date, l.end_date), '0000-01-01'));

  const pay = (loan, due, when) => {
    const s = db.loan_schedule.find((x) => x.loan_id === loan && x.due_date === due);
    spLoanRepayment(loan, s.schedule_id, fmt(s.due_amount), when);
  };
  pay(2, '2026-07-01', '2026-07-01 09:00:00'); pay(2, '2026-08-01', '2026-08-01 09:00:00');
  pay(2, '2026-09-01', '2026-09-01 09:00:00'); pay(2, '2026-10-01', '2026-10-01 09:00:00');
  pay(1, '2026-08-01', '2026-08-01 10:00:00'); pay(1, '2026-09-01', '2026-09-01 10:00:00');
  pay(3, '2026-08-05', '2026-08-05 10:00:00'); pay(3, '2026-09-05', '2026-09-05 10:00:00');
  markOverdue();

  [
    [1, '2026-07-01', '2026-07-31', '2026-08-01 06:00:00'], [1, '2026-08-01', '2026-08-31', '2026-09-01 06:00:00'],
    [2, '2026-07-01', '2026-09-30', '2026-10-01 06:00:00'], [4, '2026-07-01', '2026-09-30', '2026-10-01 06:05:00'],
    [5, '2026-08-01', '2026-09-30', '2026-10-01 06:10:00'], [8, '2026-07-01', '2026-09-30', '2026-10-01 06:15:00'],
  ].forEach(([account_id, from_date, to_date, generated_date]) =>
    db.statement.push({ statement_id: nextId('statement'), account_id, from_date, to_date, generated_date }));
}

/** Pending instalments whose date has passed become OVERDUE (the server does this at start-up and hourly). */
function markOverdue() {
  const t = todayStr();
  db.loan_schedule.forEach((s) => { if (s.status === 'PENDING' && s.due_date < t) s.status = 'OVERDUE'; });
}

// ---------------------------------------------------------------- views
const holdersOf = (account_id) => db.account_holder
  .filter((h) => h.account_id === account_id)
  .sort((a, b) => (a.holder_type === b.holder_type ? 0 : a.holder_type === 'PRIMARY' ? -1 : 1))
  .map((h) => customerOf(h.customer_id).full_name).join(', ');

function accountBalanceRow(a) {
  return { account_id: a.account_id, account_number: a.account_number, type_name: typeOf(a.type_id).type_name, branch_name: branchOf(a.branch_id).branch_name, status: a.status, holders: holdersOf(a.account_id), balance: fmt(a.balance) };
}
const accountRow = (a) => ({ ...accountBalanceRow(a), open_date: a.open_date, type_id: a.type_id, branch_id: a.branch_id, min_balance: typeOf(a.type_id).min_balance });
function auditRow(t) {
  const a = accountOf(t.account_id);
  return {
    transaction_id: t.transaction_id, transaction_date: t.transaction_date, transaction_type: t.transaction_type, amount: fmt(t.amount),
    account_number: a.account_number, branch_name: branchOf(a.branch_id).branch_name, account_status: a.status,
    holders: holdersOf(a.account_id), balance_after: fmt(t.balance_after),
  };
}
function statementLine(t) {
  const isCredit = CREDIT_TYPES.includes(t.transaction_type);
  return { transaction_id: t.transaction_id, transaction_date: t.transaction_date, transaction_type: t.transaction_type, description: t.description, credit: fmt(isCredit ? t.amount : 0), debit: fmt(isCredit ? 0 : t.amount), balance_after: fmt(t.balance_after), _c: isCredit ? t.amount : 0, _d: isCredit ? 0 : t.amount };
}
function transferRow(tf) {
  const td = db.transaction.find((t) => t.transaction_id === tf.debit_transaction_id);
  const tc = db.transaction.find((t) => t.transaction_id === tf.credit_transaction_id);
  return {
    transfer_id: tf.transfer_id, transaction_date: td.transaction_date, from_account: accountOf(td.account_id).account_number,
    to_account: accountOf(tc.account_id).account_number, debited: fmt(td.amount), credited: fmt(tc.amount),
    balanced: td.amount === tc.amount, remarks: tf.remarks,
  };
}
function loanView(l) {
  const sched = db.loan_schedule.filter((s) => s.loan_id === l.loan_id);
  if (!sched.length) return null;
  const payable = sched.reduce((s, x) => s + x.due_amount, 0);
  const ids = new Set(sched.map((s) => s.schedule_id));
  const repaid = db.repayment.filter((r) => r.status === 'APPLIED' && ids.has(r.schedule_id)).reduce((s, r) => s + r.amount, 0);
  const open = sched.filter((s) => s.status !== 'PAID').map((s) => s.due_date).sort();
  return {
    loan_id: l.loan_id, full_name: customerOf(l.customer_id).full_name, customer_id: l.customer_id, account_id: l.account_id,
    account_number: accountOf(l.account_id).account_number, loan_type: l.loan_type, principal: fmt(l.amount), interest_rate: l.interest_rate,
    total_payable: fmt(payable), total_repaid: fmt(repaid), outstanding: fmt(payable - repaid), status: l.status, start_date: l.start_date, end_date: l.end_date,
    instalments: sched.length, paid_instalments: sched.filter((s) => s.status === 'PAID').length,
    overdue_instalments: sched.filter((s) => s.status === 'OVERDUE').length, next_due: open[0] || null,
    _principal: l.amount, _outstanding: payable - repaid,
  };
}
const strip = (o) => { const r = { ...o }; Object.keys(r).filter((k) => k.startsWith('_')).forEach((k) => delete r[k]); return r; };
const applied = (schedule_id) => db.repayment.filter((r) => r.schedule_id === schedule_id && r.status === 'APPLIED').reduce((s, r) => s + r.amount, 0);

// ---------------------------------------------------------------- routes
const session = { user: null };
try { const u = sessionStorage.getItem('demo_user'); if (u) session.user = JSON.parse(u); } catch (_) { /* no storage */ }

function need(perm) {
  if (!session.user) throw new HttpError(401, 'Please sign in');
  if (!can(session.user.role, perm)) {
    throw new HttpError(403, `Your role (${session.user.role.replace('_', ' ').toLowerCase()}) is not allowed to do this`);
  }
}

function checkCustomerRules(c, exceptId) {
  if (!/^.+@.+\..+$/.test(c.email) || c.email.length < 5) throw new DbError(3819, "Check constraint 'ck_customer_email' is violated.");
  if (db.customer.some((x) => x.customer_id !== exceptId && x.email.toLowerCase() === c.email.toLowerCase())) {
    throw new DbError(1062, `Duplicate entry '${c.email}' for key 'customer.email'`);
  }
  if (db.customer.some((x) => x.customer_id !== exceptId && x.id_proof.toLowerCase() === c.id_proof.toLowerCase())) {
    throw new DbError(1062, `Duplicate entry '${c.id_proof}' for key 'customer.id_proof'`);
  }
}
const fkFail = () => new DbError(1452, 'Cannot add or update a child row: a foreign key constraint fails');
const customerListRow = (c) => {
  const hs = db.account_holder.filter((h) => h.customer_id === c.customer_id);
  return { ...c, accounts: hs.length, total_balance: fmt(hs.reduce((s, h) => s + accountOf(h.account_id).balance, 0)) };
};
const nextAccountNumber = (branchId) => {
  const nums = db.account.filter((a) => a.branch_id === branchId && /^5001000000[0-9]{4}$/.test(a.account_number)).map((a) => BigInt(a.account_number));
  const next = nums.length ? nums.reduce((m, x) => (x > m ? x : m)) + 1n : 5001000000n * 10000n + BigInt(branchId) * 1000n + 1n;
  return String(next).padStart(14, '0');
};
const statusFilter = (rows, s) => (s ? rows.filter((r) => r.status === s) : rows);

function buildStatement(accountId, from, to) {
  const acc = accountOf(accountId);
  if (!acc) throw new HttpError(404, 'Account not found');
  const lines = db.transaction.filter((t) => t.account_id === accountId).map(statementLine);
  const opening = lines.filter((l) => l.transaction_date < from).reduce((s, l) => s + l._c - l._d, 0);
  const end = addDaysStr(to, 1);
  const inRange = lines.filter((l) => l.transaction_date >= from && l.transaction_date < end)
    .sort((a, b) => (a.transaction_date === b.transaction_date ? a.transaction_id - b.transaction_id : a.transaction_date < b.transaction_date ? -1 : 1));
  let running = opening, credits = 0, debits = 0;
  const out = inRange.map((l) => {
    credits += l._c; debits += l._d; running += l._c - l._d;
    const { _c, _d, balance_after, ...rest } = l;
    return { ...rest, balance: fmt(running) };
  });
  return {
    account: { ...accountBalanceRow(acc), open_date: acc.open_date }, from, to, opening_balance: fmt(opening), closing_balance: fmt(running),
    total_credits: fmt(credits), total_debits: fmt(debits), count: out.length, lines: out,
  };
}

const SCENARIOS = {
  overdraw: { title: 'Overdraw an account', rule: "Withdrawals may not take the balance below the account type's minimum balance.", needs: ['account_id', 'amount'],
    sql: (p) => `INSERT INTO \`transaction\` (account_id, transaction_type, amount) VALUES (${p.account_id}, 'WITHDRAWAL', ${p.amount});`,
    run: (p) => insertTxn(p.account_id, 'WITHDRAWAL', p.amount, 'Rule tester probe') },
  frozen: { title: 'Post to a frozen account', rule: 'Only ACTIVE accounts accept postings.', needs: ['account_id', 'amount'],
    sql: (p) => `INSERT INTO \`transaction\` (account_id, transaction_type, amount) VALUES (${p.account_id}, 'DEPOSIT', ${p.amount});`,
    run: (p) => insertTxn(p.account_id, 'DEPOSIT', p.amount, 'Rule tester probe') },
  negative: { title: 'Post a negative amount', rule: 'Every transaction amount must be positive.', needs: ['account_id', 'amount'],
    sql: (p) => `INSERT INTO \`transaction\` (account_id, transaction_type, amount) VALUES (${p.account_id}, 'DEPOSIT', ${p.amount});`,
    run: (p) => insertTxn(p.account_id, 'DEPOSIT', p.amount, 'Rule tester probe') },
  zero: { title: 'Post a zero amount', rule: 'Zero is not a positive amount.', needs: ['account_id'],
    sql: (p) => `INSERT INTO \`transaction\` (account_id, transaction_type, amount) VALUES (${p.account_id}, 'DEPOSIT', 0);`,
    run: (p) => insertTxn(p.account_id, 'DEPOSIT', '0', 'Rule tester probe') },
  closed: { title: 'Post to a closed account', rule: 'Closed accounts are not ACTIVE, so postings are refused.', needs: ['account_id', 'amount'],
    sql: (p) => `INSERT INTO \`transaction\` (account_id, transaction_type, amount) VALUES (${p.account_id}, 'DEPOSIT', ${p.amount});`,
    run: (p) => insertTxn(p.account_id, 'DEPOSIT', p.amount, 'Rule tester probe') },
  same_account: { title: 'Transfer to the same account', rule: 'A transfer needs two different accounts.', needs: ['account_id', 'amount'],
    sql: (p) => `CALL sp_transfer(${p.account_id}, ${p.account_id}, ${p.amount}, 'probe', NULL);`,
    run: (p) => spTransfer(p.account_id, p.account_id, p.amount, 'Rule tester probe') },
  unbalanced: { title: 'Unbalanced transfer legs', rule: 'The debit leg and the credit leg of a transfer must be equal.', needs: ['account_id', 'to_account_id', 'amount'],
    sql: (p) => `INSERT INTO \`transaction\` ... TRANSFER_DEBIT ${p.amount} from #${p.account_id};\n` +
      `INSERT INTO \`transaction\` ... TRANSFER_CREDIT ${p.amount} + 1.00 to #${p.to_account_id};\n` +
      'INSERT INTO transfer (debit_transaction_id, credit_transaction_id) VALUES (<debit>, <credit>);',
    run: (p) => {
      const d = insertTxn(p.account_id, 'TRANSFER_DEBIT', p.amount, 'Rule tester probe');
      const k = insertTxn(p.to_account_id, 'TRANSFER_CREDIT', (Number(p.amount) + 1).toFixed(2), 'Rule tester probe');
      insertTransferRow(d.transaction_id, k.transaction_id, 'probe');
    } },
};

function route(method, url, query, body) {
  const parts = url.split('/').filter(Boolean);
  const [a, b, c] = parts;
  const is = (m, ...segs) => method === m && segs.length === parts.length && segs.every((s, i) => s === '*' || s === parts[i]);
  const num = (x) => Number(x);

  // ----- auth
  if (is('POST', 'auth', 'login')) {
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!username || !password) throw new HttpError(400, 'Enter your username and password');
    const u = STAFF.find((s) => s.username === username);
    if (!u || u.password !== password) throw new HttpError(401, 'Incorrect username or password');
    session.user = publicUser(u);
    try { sessionStorage.setItem('demo_user', JSON.stringify(session.user)); } catch (_) { /* no storage */ }
    return { user: session.user };
  }
  if (is('POST', 'auth', 'logout')) {
    session.user = null;
    try { sessionStorage.removeItem('demo_user'); } catch (_) { /* no storage */ }
    return { ok: true };
  }
  if (is('GET', 'auth', 'me')) {
    if (!session.user) throw new HttpError(401, 'Please sign in');
    return { user: session.user };
  }
  if (is('GET', 'auth', 'demo')) return { accounts: STAFF.map((s) => ({ username: s.username, role: s.role, password: s.password, name: s.full_name })) };
  if (!session.user) throw new HttpError(401, 'Please sign in');

  // ----- dashboard
  if (is('GET', 'dashboard')) {
    need('dashboard:view');
    const t = todayStr();
    const monthStart = `${t.slice(0, 7)}-01`;
    const loans = db.loan.map(loanView).filter(Boolean);
    const sumDep = db.account.reduce((s, x) => s + x.balance, 0);
    const totals = {
      customers: db.customer.length, accounts: db.account.length, active_accounts: db.account.filter((x) => x.status === 'ACTIVE').length,
      restricted_accounts: db.account.filter((x) => x.status === 'FROZEN' || x.status === 'DORMANT').length, total_deposits: fmt(sumDep),
      txns_today: db.transaction.filter((x) => x.transaction_date.slice(0, 10) === t).length,
      txns_month: db.transaction.filter((x) => x.transaction_date >= monthStart).length,
      active_loans: db.loan.filter((l) => l.status === 'ACTIVE').length,
      loan_outstanding: fmt(loans.filter((l) => l.status === 'ACTIVE').reduce((s, l) => s + l._outstanding, 0)),
      overdue_instalments: db.loan_schedule.filter((s) => s.status === 'OVERDUE').length,
    };
    const monthly = [];
    const now = new Date();
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      const rows = db.transaction.filter((x) => x.transaction_date.slice(0, 7) === key);
      monthly.push({
        month: key, label: d.toLocaleString('en-US', { month: 'short' }),
        deposits: fmt(rows.filter((x) => x.transaction_type === 'DEPOSIT').reduce((s, x) => s + x.amount, 0)),
        withdrawals: fmt(rows.filter((x) => x.transaction_type === 'WITHDRAWAL').reduce((s, x) => s + x.amount, 0)),
      });
    }
    const branches = db.branch.map((br) => {
      const accs = db.account.filter((x) => x.branch_id === br.branch_id);
      const total = accs.reduce((s, x) => s + x.balance, 0);
      return { branch_id: br.branch_id, branch_name: br.branch_name, city: br.city, accounts: accs.length, total_deposits: fmt(total),
        avg_balance: fmt(accs.length ? Math.round(total / accs.length) : 0), inactive_accounts: accs.filter((x) => x.status !== 'ACTIVE').length, branch_manager: br.branch_manager };
    });
    const recent = [...db.transaction].sort((x, y) => y.transaction_id - x.transaction_id).slice(0, 6).map((x) => {
      const r = auditRow(x);
      return { transaction_id: r.transaction_id, transaction_date: r.transaction_date, transaction_type: r.transaction_type, amount: r.amount, account_number: r.account_number, holders: r.holders };
    });
    return { totals, monthly, branches, recent };
  }

  // ----- customers
  if (is('GET', 'customers')) {
    need('customers:view');
    const { limit, offset, page } = v.paging(query, { defLimit: 50 });
    let rows = db.customer;
    if (query.q) rows = rows.filter((x) => [x.full_name, x.email, x.phone, x.id_proof].some((f) => likeOk(f, query.q)));
    rows = [...rows].sort((x, y) => x.full_name.localeCompare(y.full_name));
    return { rows: rows.slice(offset, offset + limit).map(customerListRow), total: rows.length, page, limit };
  }
  if (is('GET', 'customers', '*')) {
    need('customers:view');
    const id = v.id(b, 'Customer');
    const cu = customerOf(id);
    if (!cu) throw new HttpError(404, 'Customer not found');
    const accountList = db.account_holder.filter((h) => h.customer_id === id).map((h) => {
      const x = accountOf(h.account_id);
      return { account_id: x.account_id, account_number: x.account_number, type_name: typeOf(x.type_id).type_name, branch_name: branchOf(x.branch_id).branch_name, status: x.status, balance: fmt(x.balance), holder_type: h.holder_type };
    }).sort((p, q) => p.account_id - q.account_id);
    const loans = db.loan.filter((l) => l.customer_id === id).map(loanView).filter(Boolean)
      .map((l) => ({ loan_id: l.loan_id, loan_type: l.loan_type, principal: l.principal, outstanding: l.outstanding, status: l.status })).sort((p, q) => p.loan_id - q.loan_id);
    const beneficiaries = db.beneficiary.filter((x) => x.customer_id === id)
      .map(({ beneficiary_id, beneficiary_name, account_number, bank_name, ifsc_code, type }) => ({ beneficiary_id, beneficiary_name, account_number, bank_name, ifsc_code, type }));
    return { ...customerListRow(cu), accountList, loans, beneficiaries };
  }
  const customerBody = () => ({
    full_name: v.text(body.full_name, 'Full name', { max: 100 }), date_of_birth: v.date(body.date_of_birth, 'Date of birth'),
    email: v.text(body.email, 'Email', { max: 120 }), phone: v.text(body.phone, 'Phone', { max: 15 }),
    address: v.text(body.address, 'Address', { max: 150 }), id_proof: v.text(body.id_proof, 'ID proof', { max: 30 }),
  });
  if (is('POST', 'customers')) {
    need('customers:write');
    const c1 = customerBody();
    checkCustomerRules(c1);
    const row = { customer_id: nextId('customer'), ...c1 };
    db.customer.push(row);
    return { status: 201, data: row };
  }
  if (is('PUT', 'customers', '*')) {
    need('customers:write');
    const id = v.id(b, 'Customer');
    const c1 = customerBody();
    const cu = customerOf(id);
    if (!cu) throw new HttpError(404, 'Customer not found');
    checkCustomerRules(c1, id);
    Object.assign(cu, c1);
    return cu;
  }

  // ----- accounts
  if (is('GET', 'accounts')) {
    need('accounts:view');
    const { limit, offset, page } = v.paging(query, { defLimit: 60, maxLimit: 500 });
    let rows = db.account.map((x) => accountRow(x));
    if (query.q) rows = rows.filter((x) => likeOk(x.account_number, query.q) || likeOk(x.holders, query.q));
    if (query.status) { const s = v.oneOf(query.status, ['ACTIVE', 'DORMANT', 'FROZEN', 'CLOSED'], 'Status'); rows = rows.filter((x) => x.status === s); }
    if (query.branch_id) { const k = v.id(query.branch_id, 'Branch'); rows = rows.filter((x) => x.branch_id === k); }
    if (query.type_id) { const k = v.id(query.type_id, 'Account type'); rows = rows.filter((x) => x.type_id === k); }
    if (query.customer_id) {
      const k = v.id(query.customer_id, 'Customer');
      rows = rows.filter((x) => db.account_holder.some((h) => h.account_id === x.account_id && h.customer_id === k));
    }
    rows.sort((x, y) => x.account_id - y.account_id);
    return { rows: rows.slice(offset, offset + limit), total: rows.length, page, limit };
  }
  if (is('GET', 'accounts', '*')) {
    need('accounts:view');
    const id = v.id(b, 'Account');
    const x = accountOf(id);
    if (!x) throw new HttpError(404, 'Account not found');
    const holderList = db.account_holder.filter((h) => h.account_id === id).map((h) => ({ customer_id: h.customer_id, full_name: customerOf(h.customer_id).full_name, holder_type: h.holder_type, since_date: h.since_date }))
      .sort((p, q) => (p.holder_type === q.holder_type ? p.full_name.localeCompare(q.full_name) : p.holder_type === 'PRIMARY' ? -1 : 1));
    const recent = db.transaction.filter((t) => t.account_id === id).sort((p, q) => q.transaction_id - p.transaction_id).slice(0, 8)
      .map((t) => { const l = statementLine(t); const { _c, _d, ...rest } = l; return rest; });
    return { ...accountRow(x), holderList, recent };
  }
  if (is('POST', 'accounts')) {
    need('accounts:create');
    const typeId = v.id(body.type_id, 'Account type');
    const branchId = v.id(body.branch_id, 'Branch');
    const primary = v.id(body.primary_customer_id, 'Primary holder');
    const joint = (Array.isArray(body.joint_customer_ids) ? body.joint_customer_ids : []).map((x) => v.id(x, 'Joint holder')).filter((x) => x !== primary);
    const holders = [...new Set(joint)];
    const opening = body.opening_deposit === undefined || body.opening_deposit === '' || body.opening_deposit === null ? null : v.amount(body.opening_deposit, 'Opening deposit');
    const id = tx(() => {
      if (!typeOf(typeId) || !branchOf(branchId)) throw fkFail();
      const acc = { account_id: nextId('account'), account_number: nextAccountNumber(branchId), type_id: typeId, branch_id: branchId, status: 'ACTIVE', open_date: todayStr(), balance: 0 };
      db.account.push(acc);
      if (!customerOf(primary)) throw fkFail();
      db.account_holder.push({ account_id: acc.account_id, customer_id: primary, holder_type: 'PRIMARY', since_date: todayStr() });
      holders.forEach((cid) => {
        if (!customerOf(cid)) throw fkFail();
        db.account_holder.push({ account_id: acc.account_id, customer_id: cid, holder_type: 'JOINT', since_date: todayStr() });
      });
      if (opening !== null) insertTxn(acc.account_id, 'DEPOSIT', opening, 'Opening deposit');
      return acc.account_id;
    });
    return { status: 201, data: accountRow(accountOf(id)) };
  }
  if (is('PATCH', 'accounts', '*', 'status')) {
    need('accounts:status');
    const id = v.id(b, 'Account');
    const status = v.oneOf(body.status, ['ACTIVE', 'DORMANT', 'FROZEN', 'CLOSED'], 'Status');
    const x = accountOf(id);
    if (!x) throw new HttpError(404, 'Account not found');
    x.status = status;
    return accountRow(x);
  }

  // ----- transactions
  const postTxn = (type) => {
    need('transactions:post');
    const accountId = v.id(body.account_id, 'Account');
    const amt = v.amount(body.amount);
    const description = v.text(body.description, 'Description', { max: 150, required: false }) || (type === 'DEPOSIT' ? 'Cash deposit' : 'Cash withdrawal');
    const t = insertTxn(accountId, type, amt, description);
    return { status: 201, data: { transaction_id: t.transaction_id, transaction_date: t.transaction_date, transaction_type: t.transaction_type, amount: fmt(t.amount), description: t.description, balance_after: fmt(t.balance_after), account_number: accountOf(accountId).account_number } };
  };
  if (is('POST', 'transactions', 'deposit')) return postTxn('DEPOSIT');
  if (is('POST', 'transactions', 'withdraw')) return postTxn('WITHDRAWAL');
  if (is('GET', 'transactions', 'recent')) {
    need('transactions:recent');
    return [...db.transaction].sort((x, y) => y.transaction_id - x.transaction_id).slice(0, 12).map((x) => {
      const r = auditRow(x);
      return { transaction_id: r.transaction_id, transaction_date: r.transaction_date, transaction_type: r.transaction_type, amount: r.amount, account_number: r.account_number, branch_name: r.branch_name, holders: r.holders, balance_after: r.balance_after };
    });
  }
  if (is('GET', 'transactions', '*')) {
    need('transactions:recent');
    const t = db.transaction.find((x) => x.transaction_id === v.id(b, 'Transaction'));
    if (!t) throw new HttpError(404, 'Transaction not found');
    return auditRow(t);
  }

  // ----- transfers
  if (is('GET', 'transfers')) {
    need('transfers:view');
    const { limit, offset, page } = v.paging(query, { defLimit: 25 });
    let rows = db.transfer.map(transferRow);
    if (query.account_id) {
      const acc = accountOf(v.id(query.account_id, 'Account'));
      if (!acc) throw new HttpError(404, 'Account not found');
      rows = rows.filter((r) => r.from_account === acc.account_number || r.to_account === acc.account_number);
    }
    const numToAcc = (n) => db.account.find((x) => x.account_number === n);
    rows.sort((p, q) => (p.transaction_date === q.transaction_date ? q.transfer_id - p.transfer_id : p.transaction_date < q.transaction_date ? 1 : -1));
    return {
      rows: rows.slice(offset, offset + limit).map((r) => ({ ...r, from_holders: holdersOf(numToAcc(r.from_account).account_id), to_holders: holdersOf(numToAcc(r.to_account).account_id) })),
      total: rows.length, page, limit,
    };
  }
  if (is('POST', 'transfers')) {
    need('transfers:create');
    const from = v.id(body.from_account_id, 'From account');
    const amt = v.amount(body.amount);
    const remarks = v.text(body.remarks, 'Remarks', { max: 150, required: false });
    let to = v.optId(body.to_account_id, 'To account');
    if (!to && body.beneficiary_id) {
      const ben = db.beneficiary.find((x) => x.beneficiary_id === v.id(body.beneficiary_id, 'Beneficiary'));
      if (!ben) throw new HttpError(404, 'Beneficiary not found');
      const acc = db.account.find((x) => x.account_number === ben.account_number);
      if (!acc) throw new HttpError(422, 'This beneficiary has no account at Woxsen Co-operative Bank, so it cannot be settled here');
      to = acc.account_id;
    }
    if (!to) throw new HttpError(400, 'Choose a beneficiary or a destination account');
    const tf = spTransfer(from, to, amt, remarks);
    return { status: 201, data: transferRow(tf) };
  }

  // ----- beneficiaries
  if (is('GET', 'beneficiaries')) {
    need('transfers:view');
    let rows = db.beneficiary;
    if (query.customer_id) { const k = v.id(query.customer_id, 'Customer'); rows = rows.filter((x) => x.customer_id === k); }
    if (query.account_id) {
      const k = v.id(query.account_id, 'Account');
      const owners = new Set(db.account_holder.filter((h) => h.account_id === k).map((h) => h.customer_id));
      rows = rows.filter((x) => owners.has(x.customer_id));
    }
    return [...rows].sort((p, q) => p.beneficiary_name.localeCompare(q.beneficiary_name)).map((x) => {
      const acc = x.type === 'INTERNAL' ? db.account.find((y) => y.account_number === x.account_number) : null;
      return { beneficiary_id: x.beneficiary_id, customer_id: x.customer_id, owner_name: customerOf(x.customer_id).full_name, beneficiary_name: x.beneficiary_name,
        account_number: x.account_number, bank_name: x.bank_name, ifsc_code: x.ifsc_code, type: x.type, created_at: x.created_at,
        account_id: acc ? acc.account_id : null, account_status: acc ? acc.status : null };
    });
  }
  if (is('POST', 'beneficiaries')) {
    need('beneficiaries:write');
    const type = v.oneOf(body.type || 'INTERNAL', ['INTERNAL', 'EXTERNAL'], 'Type');
    const row = {
      customer_id: v.id(body.customer_id, 'Customer'), beneficiary_name: v.text(body.beneficiary_name, 'Beneficiary name', { max: 100 }),
      account_number: v.text(body.account_number, 'Account number', { max: 20 }), bank_name: v.text(body.bank_name, 'Bank name', { max: 80 }),
      ifsc_code: v.text(body.ifsc_code, 'IFSC code', { max: 11 }).toUpperCase(), type,
    };
    if (!customerOf(row.customer_id)) throw fkFail();
    if (db.beneficiary.some((x) => x.customer_id === row.customer_id && x.account_number === row.account_number && x.ifsc_code.toLowerCase() === row.ifsc_code.toLowerCase())) {
      throw new DbError(1062, `Duplicate entry '${row.customer_id}-${row.account_number}-${row.ifsc_code}' for key 'beneficiary.uq_beneficiary'`);
    }
    const full = { beneficiary_id: nextId('beneficiary'), ...row, created_at: nowStr() };
    db.beneficiary.push(full);
    return { status: 201, data: full };
  }
  if (is('DELETE', 'beneficiaries', '*')) {
    need('beneficiaries:write');
    const id = v.id(b, 'Beneficiary');
    const i = db.beneficiary.findIndex((x) => x.beneficiary_id === id);
    if (i < 0) throw new HttpError(404, 'Beneficiary not found');
    db.beneficiary.splice(i, 1);
    return { ok: true };
  }

  // ----- statements
  if (is('GET', 'statements', 'history')) {
    need('statements:view');
    let rows = db.statement;
    if (query.account_id) { const k = v.id(query.account_id, 'Account'); rows = rows.filter((x) => x.account_id === k); }
    return [...rows].sort((p, q) => (p.generated_date === q.generated_date ? q.statement_id - p.statement_id : p.generated_date < q.generated_date ? 1 : -1))
      .slice(0, 20).map((x) => ({ statement_id: x.statement_id, account_id: x.account_id, account_number: accountOf(x.account_id).account_number, from_date: x.from_date, to_date: x.to_date, generated_date: x.generated_date }));
  }
  if (is('GET', 'statements')) {
    need('statements:view');
    const from = v.date(query.from, 'From date'), to = v.date(query.to, 'To date');
    return buildStatement(v.id(query.account_id, 'Account'), from, to);
  }
  if (is('POST', 'statements')) {
    need('statements:view');
    const accountId = v.id(body.account_id, 'Account');
    const from = v.date(body.from, 'From date'), to = v.date(body.to, 'To date');
    if (!accountOf(accountId)) throw fkFail();
    if (to < from) throw new DbError(3819, "Check constraint 'ck_statement_period' is violated.");
    db.statement.push({ statement_id: nextId('statement'), account_id: accountId, from_date: from, to_date: to, generated_date: nowStr() });
    return { status: 201, data: buildStatement(accountId, from, to) };
  }

  // ----- loans
  if (is('GET', 'loans')) {
    need('loans:view');
    const all = db.loan.map(loanView).filter(Boolean);
    let rows = all;
    if (query.status) { const s = v.oneOf(query.status, ['ACTIVE', 'CLOSED', 'DEFAULTED'], 'Status'); rows = rows.filter((x) => x.status === s); }
    if (query.customer_id) { const k = v.id(query.customer_id, 'Customer'); rows = rows.filter((x) => x.customer_id === k); }
    if (query.q) rows = rows.filter((x) => likeOk(x.full_name, query.q) || likeOk(x.loan_type, query.q) || String(x.loan_id) === String(query.q).trim());
    if (query.overdue === '1') rows = rows.filter((x) => x.overdue_instalments > 0);
    rows = [...rows].sort((p, q) => q.loan_id - p.loan_id);
    const od = db.loan_schedule.filter((s) => s.status === 'OVERDUE');
    return {
      rows: rows.map(strip),
      summary: {
        loans: all.length,
        outstanding: fmt(all.filter((x) => x.status === 'ACTIVE').reduce((s, x) => s + x._outstanding, 0)),
        principal: fmt(all.filter((x) => x.status === 'ACTIVE').reduce((s, x) => s + x._principal, 0)),
        overdue: { instalments: od.length, loans: new Set(od.map((s) => s.loan_id)).size, amount: fmt(od.reduce((s, x) => s + x.due_amount - applied(x.schedule_id), 0)) },
      },
    };
  }
  if (is('GET', 'loans', '*')) {
    need('loans:view');
    const id = v.id(b, 'Loan');
    const l = db.loan.find((x) => x.loan_id === id);
    const view = l && loanView(l);
    if (!view) throw new HttpError(404, 'Loan not found');
    const schedule = db.loan_schedule.filter((s) => s.loan_id === id).sort((p, q) => (p.due_date < q.due_date ? -1 : 1))
      .map((s) => ({ schedule_id: s.schedule_id, due_date: s.due_date, due_amount: fmt(s.due_amount), status: s.status, paid_amount: fmt(applied(s.schedule_id)) }));
    const ids = new Set(schedule.map((s) => s.schedule_id));
    const repayments = db.repayment.filter((r) => ids.has(r.schedule_id)).map((r) => {
      const s = db.loan_schedule.find((x) => x.schedule_id === r.schedule_id);
      const t = db.transaction.find((x) => x.transaction_id === r.transaction_id);
      return { due_date: s.due_date, due_amount: fmt(s.due_amount), paid_on: t.transaction_date, paid_amount: fmt(r.amount), instalment_status: s.status };
    }).sort((p, q) => (p.paid_on < q.paid_on ? 1 : -1));
    return { ...strip(view), schedule, repayments };
  }
  if (is('POST', 'loans')) {
    need('loans:create');
    const customerId = v.id(body.customer_id, 'Customer');
    const accountId = v.id(body.account_id, 'Disbursement account');
    const type = v.oneOf(body.loan_type, ['PERSONAL', 'VEHICLE', 'EDUCATION', 'HOME'], 'Loan type');
    const amt = v.amount(body.amount, 'Loan amount');
    const rate = String(body.interest_rate ?? '').trim();
    if (!/^-?\d{1,3}(\.\d{1,2})?$/.test(rate)) throw new HttpError(400, 'Interest rate must be a number with at most 2 decimals');
    const start = v.date(body.start_date, 'Start date');
    const months = Number(body.tenure_months);
    if (!Number.isInteger(months) || months < 1 || months > 360) throw new HttpError(400, 'Tenure must be a whole number of months between 1 and 360');
    if (!db.account_holder.some((h) => h.account_id === accountId && h.customer_id === customerId)) throw new HttpError(400, 'The disbursement account must be held by the borrower');
    const loanId = tx(() => {
      if (paise(amt) <= 0) throw new DbError(3819, "Check constraint 'ck_loan_amount' is violated.");
      if (Number(rate) <= 0) throw new DbError(3819, "Check constraint 'ck_loan_rate' is violated.");
      const loan = { loan_id: nextId('loan'), customer_id: customerId, account_id: accountId, loan_type: type, amount: paise(amt), interest_rate: Number(rate).toFixed(2), start_date: start, end_date: addMonthsStr(start, months), status: 'ACTIVE' };
      db.loan.push(loan);
      insertTxn(accountId, 'LOAN_DISBURSEMENT', amt, `${type.charAt(0)}${type.slice(1).toLowerCase()} loan #${loan.loan_id} disbursement`);
      buildSchedule(loan.loan_id, start, months, todayStr());
      return loan.loan_id;
    });
    return { status: 201, data: strip(loanView(loanOf(loanId))) };
  }
  if (is('POST', 'loans', '*', 'repay')) {
    need('loans:repay');
    const loanId = v.id(b, 'Loan');
    const scheduleId = v.id(body.schedule_id, 'Instalment');
    const amt = v.amount(body.amount, 'Repayment amount');
    const item = db.loan_schedule.find((s) => s.schedule_id === scheduleId && s.loan_id === loanId);
    if (item && item.status === 'PAID') throw new HttpError(409, 'This instalment is already fully paid');
    spLoanRepayment(loanId, scheduleId, amt);
    const inst = db.loan_schedule.find((s) => s.schedule_id === scheduleId);
    return { loan: strip(loanView(loanOf(loanId))), instalment: { schedule_id: inst.schedule_id, due_date: inst.due_date, due_amount: fmt(inst.due_amount), status: inst.status } };
  }

  // ----- audit
  if (is('GET', 'audit')) {
    need('audit:view');
    const { limit, offset, page } = v.paging(query, { defLimit: 25 });
    const TYPES = ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER_DEBIT', 'TRANSFER_CREDIT', 'SERVICE_CHARGE', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT'];
    let rows = db.transaction.map((t) => ({ t, r: auditRow(t) }));
    if (query.type) { const s = v.oneOf(query.type, TYPES, 'Type'); rows = rows.filter((x) => x.r.transaction_type === s); }
    if (query.account) rows = rows.filter((x) => likeOk(x.r.account_number, query.account));
    if (query.branch) { const s = v.text(query.branch, 'Branch', { max: 80 }); rows = rows.filter((x) => x.r.branch_name.toLowerCase() === s.toLowerCase()); }
    if (query.status) { const s = v.oneOf(query.status, ['ACTIVE', 'DORMANT', 'FROZEN', 'CLOSED'], 'Status'); rows = rows.filter((x) => x.r.account_status === s); }
    if (query.holder) rows = rows.filter((x) => likeOk(x.r.holders, query.holder));
    if (query.from) { const s = v.date(query.from, 'From date'); rows = rows.filter((x) => x.r.transaction_date >= s); }
    if (query.to) { const s = addDaysStr(v.date(query.to, 'To date'), 1); rows = rows.filter((x) => x.r.transaction_date < s); }
    if (query.min_amount) { const s = paise(v.amount(query.min_amount, 'Minimum amount')); rows = rows.filter((x) => x.t.amount >= s); }
    if (query.max_amount) { const s = paise(v.amount(query.max_amount, 'Maximum amount')); rows = rows.filter((x) => x.t.amount <= s); }
    rows.sort((p, q) => (p.r.transaction_date === q.r.transaction_date ? q.t.transaction_id - p.t.transaction_id : p.r.transaction_date < q.r.transaction_date ? 1 : -1));
    return { rows: rows.slice(offset, offset + limit).map((x) => x.r), total: rows.length, total_amount: fmt(rows.reduce((s, x) => s + x.t.amount, 0)), page, limit };
  }

  // ----- lookups
  if (is('GET', 'branches')) {
    need('branches:view');
    return db.branch.map((br) => {
      const accs = db.account.filter((x) => x.branch_id === br.branch_id);
      const total = accs.reduce((s, x) => s + x.balance, 0);
      return { branch_id: br.branch_id, branch_name: br.branch_name, address: br.address, city: br.city, phone: br.phone, branch_manager: br.branch_manager,
        accounts: accs.length, total_deposits: fmt(total), avg_balance: fmt(accs.length ? Math.round(total / accs.length) : 0), inactive_accounts: accs.filter((x) => x.status !== 'ACTIVE').length };
    });
  }
  if (is('GET', 'account-types')) {
    return db.account_type.map((t) => ({ type_id: t.type_id, type_name: t.type_name, description: t.description, min_balance: t.min_balance, is_interest_bearing: t.is_interest_bearing }));
  }

  // ----- rule tester (every run is rolled back)
  if (is('GET', 'rule-tests', 'scenarios')) {
    need('ruletester:run');
    return Object.entries(SCENARIOS).map(([key, s]) => ({ key, title: s.title, rule: s.rule, needs: s.needs }));
  }
  if (method === 'POST' && a === 'rule-tests' && parts.length === 2) {
    need('ruletester:run');
    const sc = SCENARIOS[b];
    if (!sc) throw new HttpError(404, 'Unknown scenario');
    const p = {
      account_id: v.id(body.account_id, 'Account'),
      to_account_id: sc.needs.includes('to_account_id') ? v.id(body.to_account_id, 'Second account') : null,
      amount: sc.needs.includes('amount') ? v.amount(body.amount) : '0',
    };
    const before = clone(db);
    let outcome;
    try {
      sc.run(p);
      outcome = { rejected: false };
    } catch (e) {
      if (!(e instanceof DbError)) throw e;
      outcome = { rejected: true, sqlState: e.sqlState, errno: e.errno, message: e.sqlMessage };
    } finally {
      db = before; // always rolled back: nothing a probe does survives
    }
    return { scenario: b, title: sc.title, rule: sc.rule, sql: sc.sql(p), rolledBack: true, ...outcome };
  }

  throw new HttpError(404, 'No such API endpoint');
}

/** Same error mapping as describeError() in db.js. */
function describe(err) {
  if (err instanceof HttpError) return { status: err.status, body: { error: err.message, ...err.extra } };
  if (err instanceof DbError) {
    const body = { error: err.sqlMessage, source: 'database', sqlState: err.sqlState, errno: err.errno };
    if (err.sqlState === '45000') return { status: 422, body };
    return { status: err.errno === 1062 ? 409 : 422, body };
  }
  console.error(err);
  return { status: 500, body: { error: 'Internal server error' } };
}

seed();

/** Entry point called by api.js in place of fetch('/api' + url). Resolves with the JSON body or throws ApiError. */
export async function demoRequest(method, url, body) {
  await new Promise((r) => setTimeout(r, 70 + Math.random() * 110)); // feels like a round trip to a server
  const [path, qs = ''] = url.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  try {
    const out = route(method, path, query, body || {});
    return out && out.status && Object.prototype.hasOwnProperty.call(out, 'data') ? clone(out.data) : clone(out);
  } catch (err) {
    const { status, body: b } = describe(err);
    throw new ApiError(b.error || `Request failed (${status})`, status, b);
  }
}
