'use strict';
const router = require('express').Router();
const { query } = require('../db');
const { requirePerm } = require('../middleware/auth');

router.get('/branches', requirePerm('branches:view'), async (_req, res) => {
  res.json(await query(
    `SELECT b.branch_id, b.branch_name, b.address, b.city, b.phone, b.branch_manager,
            s.accounts, s.total_deposits, s.avg_balance, s.inactive_accounts
       FROM branch b JOIN v_branch_summary s ON s.branch_id = b.branch_id
      ORDER BY b.branch_id`));
});

router.get('/account-types', async (_req, res) => {
  res.json(await query('SELECT type_id, type_name, description, min_balance, is_interest_bearing FROM account_type ORDER BY type_id'));
});

module.exports = router;
