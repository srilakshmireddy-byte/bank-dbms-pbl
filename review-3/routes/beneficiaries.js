'use strict';
const router = require('express').Router();
const { query, HttpError } = require('../db');
const { requirePerm } = require('../middleware/auth');
const v = require('../lib/validate');

// List beneficiaries for a customer, or for every holder of an account (what the transfer picker uses).
// `account_id` on each row is filled in when the beneficiary is an account held at this bank.
router.get('/', requirePerm('transfers:view'), async (req, res) => {
  const where = [], params = [];
  if (req.query.customer_id) { where.push('b.customer_id = ?'); params.push(v.id(req.query.customer_id, 'Customer')); }
  if (req.query.account_id) {
    where.push('b.customer_id IN (SELECT customer_id FROM account_holder WHERE account_id = ?)');
    params.push(v.id(req.query.account_id, 'Account'));
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  res.json(await query(
    `SELECT b.beneficiary_id, b.customer_id, c.full_name AS owner_name, b.beneficiary_name, b.account_number,
            b.bank_name, b.ifsc_code, b.type, b.created_at, a.account_id, a.status AS account_status
       FROM beneficiary b JOIN customer c ON c.customer_id = b.customer_id
       LEFT JOIN account a ON a.account_number = b.account_number AND b.type = 'INTERNAL'
       ${w} ORDER BY b.beneficiary_name`, params));
});

router.post('/', requirePerm('beneficiaries:write'), async (req, res) => {
  const b = req.body;
  const type = v.oneOf(b.type || 'INTERNAL', ['INTERNAL', 'EXTERNAL'], 'Type');
  const r = await query(
    'INSERT INTO beneficiary (customer_id, beneficiary_name, account_number, bank_name, ifsc_code, type) VALUES (?, ?, ?, ?, ?, ?)',
    [v.id(b.customer_id, 'Customer'), v.text(b.beneficiary_name, 'Beneficiary name', { max: 100 }),
     v.text(b.account_number, 'Account number', { max: 20 }), v.text(b.bank_name, 'Bank name', { max: 80 }),
     v.text(b.ifsc_code, 'IFSC code', { max: 11 }).toUpperCase(), type]);
  const [row] = await query('SELECT * FROM beneficiary WHERE beneficiary_id = ?', [r.insertId]);
  res.status(201).json(row);
});

router.delete('/:id', requirePerm('beneficiaries:write'), async (req, res) => {
  const r = await query('DELETE FROM beneficiary WHERE beneficiary_id = ?', [v.id(req.params.id, 'Beneficiary')]);
  if (r.affectedRows === 0) throw new HttpError(404, 'Beneficiary not found');
  res.json({ ok: true });
});

module.exports = router;
