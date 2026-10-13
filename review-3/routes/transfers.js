'use strict';
const router = require('express').Router();
const { pool, query, HttpError } = require('../db');
const { requirePerm } = require('../middleware/auth');
const v = require('../lib/validate');

router.get('/', requirePerm('transfers:view'), async (req, res) => {
  const { limit, offset, page } = v.paging(req.query, { defLimit: 25 });
  const where = [], params = [];
  if (req.query.account_id) {
    const [acc] = await query('SELECT account_number FROM account WHERE account_id = ?', [v.id(req.query.account_id, 'Account')]);
    if (!acc) throw new HttpError(404, 'Account not found');
    where.push('(t.from_account = ? OR t.to_account = ?)');
    params.push(acc.account_number, acc.account_number);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query(
    `SELECT t.transfer_id, t.transaction_date, t.from_account, t.to_account, t.debited, t.credited, t.balanced, t.remarks,
            fb.holders AS from_holders, tb.holders AS to_holders
       FROM v_transfers t
       JOIN v_account_balances fb ON fb.account_number = t.from_account
       JOIN v_account_balances tb ON tb.account_number = t.to_account
       ${w} ORDER BY t.transaction_date DESC, t.transfer_id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM v_transfers t ${w}`, params);
  res.json({ rows: rows.map((r) => ({ ...r, balanced: Boolean(Number(r.balanced)) })), total: Number(total), page, limit });
});

router.post('/', requirePerm('transfers:create'), async (req, res) => {
  const b = req.body;
  const from = v.id(b.from_account_id, 'From account');
  const amt = v.amount(b.amount);
  const remarks = v.text(b.remarks, 'Remarks', { max: 150, required: false });

  // Destination: a saved beneficiary (must be an account held at this bank) or a direct account id.
  let to = v.optId(b.to_account_id, 'To account');
  if (!to && b.beneficiary_id) {
    const [ben] = await query(
      `SELECT b.type, a.account_id FROM beneficiary b LEFT JOIN account a ON a.account_number = b.account_number
        WHERE b.beneficiary_id = ?`, [v.id(b.beneficiary_id, 'Beneficiary')]);
    if (!ben) throw new HttpError(404, 'Beneficiary not found');
    if (!ben.account_id) throw new HttpError(422, 'This beneficiary has no account at Woxsen Co-operative Bank, so it cannot be settled here');
    to = ben.account_id;
  }
  if (!to) throw new HttpError(400, 'Choose a beneficiary or a destination account');

  // sp_transfer owns the rules and the atomicity; we only call it. Same connection so LAST_INSERT_ID() is ours.
  const conn = await pool.getConnection();
  try {
    await conn.execute('CALL sp_transfer(?, ?, ?, ?, NULL)', [from, to, amt, remarks]);
    const [[idRow]] = await conn.execute('SELECT LAST_INSERT_ID() AS id');
    const [[row]] = await conn.execute(
      `SELECT t.transfer_id, t.transaction_date, t.from_account, t.to_account, t.debited, t.credited, t.balanced, t.remarks
         FROM v_transfers t WHERE t.transfer_id = ?`, [idRow.id]);
    res.status(201).json({ ...row, balanced: Boolean(Number(row.balanced)) });
  } finally {
    conn.release();
  }
});

module.exports = router;
