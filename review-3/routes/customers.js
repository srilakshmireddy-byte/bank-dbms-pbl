'use strict';
const router = require('express').Router();
const { query, HttpError } = require('../db');
const { requirePerm } = require('../middleware/auth');
const v = require('../lib/validate');

const SELECT = `
  SELECT c.customer_id, c.full_name, c.date_of_birth, c.email, c.phone, c.address, c.id_proof,
         COUNT(h.account_id) AS accounts, COALESCE(SUM(a.balance), 0) AS total_balance
    FROM customer c
    LEFT JOIN account_holder h ON h.customer_id = c.customer_id
    LEFT JOIN account a ON a.account_id = h.account_id`;

router.get('/', requirePerm('customers:view'), async (req, res) => {
  const { limit, offset, page } = v.paging(req.query, { defLimit: 50 });
  const where = [], params = [];
  if (req.query.q) {
    const q = v.like(req.query.q);
    where.push('(c.full_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR c.id_proof LIKE ?)');
    params.push(q, q, q, q);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query(`${SELECT} ${w} GROUP BY c.customer_id ORDER BY c.full_name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM customer c ${w}`, params);
  res.json({ rows, total: Number(total), page, limit });
});

router.get('/:id', requirePerm('customers:view'), async (req, res) => {
  const id = v.id(req.params.id, 'Customer');
  const [customer] = await query(`${SELECT} WHERE c.customer_id = ? GROUP BY c.customer_id`, [id]);
  if (!customer) throw new HttpError(404, 'Customer not found');
  const accounts = await query(
    `SELECT a.account_id, a.account_number, t.type_name, b.branch_name, a.status, a.balance, h.holder_type
       FROM account_holder h JOIN account a ON a.account_id = h.account_id
       JOIN account_type t ON t.type_id = a.type_id JOIN branch b ON b.branch_id = a.branch_id
      WHERE h.customer_id = ? ORDER BY a.account_id`, [id]);
  const loans = await query(
    `SELECT o.loan_id, o.loan_type, o.principal, o.outstanding, o.status FROM v_loan_outstanding o
       JOIN loan l ON l.loan_id = o.loan_id WHERE l.customer_id = ? ORDER BY o.loan_id`, [id]);
  const beneficiaries = await query(
    'SELECT beneficiary_id, beneficiary_name, account_number, bank_name, ifsc_code, type FROM beneficiary WHERE customer_id = ? ORDER BY beneficiary_id', [id]);
  res.json({ ...customer, accountList: accounts, loans, beneficiaries });
});

function body(req) {
  const b = req.body;
  return [
    v.text(b.full_name, 'Full name', { max: 100 }),
    v.date(b.date_of_birth, 'Date of birth'),
    v.text(b.email, 'Email', { max: 120 }),
    v.text(b.phone, 'Phone', { max: 15 }),
    v.text(b.address, 'Address', { max: 150 }),
    v.text(b.id_proof, 'ID proof', { max: 30 }),
  ];
}

router.post('/', requirePerm('customers:write'), async (req, res) => {
  const r = await query(
    'INSERT INTO customer (full_name, date_of_birth, email, phone, address, id_proof) VALUES (?, ?, ?, ?, ?, ?)', body(req));
  const [row] = await query('SELECT * FROM customer WHERE customer_id = ?', [r.insertId]);
  res.status(201).json(row);
});

router.put('/:id', requirePerm('customers:write'), async (req, res) => {
  const id = v.id(req.params.id, 'Customer');
  const r = await query(
    'UPDATE customer SET full_name = ?, date_of_birth = ?, email = ?, phone = ?, address = ?, id_proof = ? WHERE customer_id = ?',
    [...body(req), id]);
  if (r.affectedRows === 0) throw new HttpError(404, 'Customer not found');
  const [row] = await query('SELECT * FROM customer WHERE customer_id = ?', [id]);
  res.json(row);
});

module.exports = router;
