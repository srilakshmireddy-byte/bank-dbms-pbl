'use strict';
const { ensureStaffTable, seedStaff, DEMO_STAFF } = require('../lib/staff');
const { pool } = require('../db');

(async () => {
  await ensureStaffTable();
  await seedStaff();
  console.log('Demo staff reset:', DEMO_STAFF.map((s) => `${s.username} (${s.role})`).join(', '));
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
