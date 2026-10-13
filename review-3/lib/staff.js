'use strict';
const bcrypt = require('bcryptjs');
const { query } = require('../db');

// bank_review2.sql has no login table, so the app adds one beside it (bank_review2.sql itself is untouched).
const DDL = `CREATE TABLE IF NOT EXISTS staff_user (
  staff_id       INT AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(40)  NOT NULL UNIQUE,
  full_name      VARCHAR(80)  NOT NULL,
  role           ENUM('TELLER','LOAN_OFFICER','MANAGER') NOT NULL,
  password_hash  VARCHAR(100) NOT NULL,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login     DATETIME     NULL
) ENGINE=InnoDB`;

// Demo staff for a local classroom install. Change these passwords (or run `npm run seed:staff`) for anything real.
const DEMO_STAFF = [
  { username: 'teller',  full_name: 'M. Srilakshmi Reddy', role: 'TELLER',       password: 'Teller@123' },
  { username: 'loans',   full_name: 'Deekshan Raj', role: 'LOAN_OFFICER', password: 'Loans@123' },
  { username: 'manager', full_name: 'Sri Lakshmi',   role: 'MANAGER',      password: 'Manager@123' },
];

async function ensureStaffTable() {
  await query(DDL);
  const [{ n }] = await query('SELECT COUNT(*) AS n FROM staff_user');
  if (Number(n) === 0) await seedStaff();
}

/** Insert the demo staff, or reset their passwords if they already exist. */
async function seedStaff() {
  for (const s of DEMO_STAFF) {
    const hash = await bcrypt.hash(s.password, 10);
    await query(
      `INSERT INTO staff_user (username, full_name, role, password_hash) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), role = VALUES(role), password_hash = VALUES(password_hash), is_active = TRUE`,
      [s.username, s.full_name, s.role, hash]
    );
  }
}

module.exports = { ensureStaffTable, seedStaff, DEMO_STAFF };
