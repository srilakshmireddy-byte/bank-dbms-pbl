import { api } from '../api.js';
import { h, sectionTitle, statTile, icon, money, money0, compactMoney, fmtDate, badge, cap, toast, openModal, field, validateForm, formData, withBusy, debounce,
  todayISO, skeletonRows, emptyState, pageHead, errorBox, AMOUNT_PATTERN, AMOUNT_MSG } from '../ui.js';

const emi = (P, rate, n) => { const r = rate / 1200; return r > 0 && n > 0 ? (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : NaN; };

export async function render(page, { session }) {
  const f = { q: '', status: '', overdue: '' };
  const body = h('tbody'), tiles = h('div', { class: 'stat-tiles', style: 'margin-bottom:24px' });


  async function load() {
    body.replaceChildren(...skeletonRows(8, 4));
    try {
      const { rows, summary } = await api.get('/loans', f);
      tiles.replaceChildren(
        statTile({ label: 'Loans on book', value: summary.loans, sub: 'All statuses', ico: 'file' }),
        statTile({ label: 'Principal, active', value: summary.principal, format: compactMoney, sub: 'Disbursed to borrowers', ico: 'coins' }),
        statTile({ label: 'Outstanding', value: summary.outstanding, format: compactMoney, sub: 'Still to be repaid', ico: 'trend' }),
        statTile({ label: 'Overdue', value: summary.overdue.amount, format: compactMoney, sub: `${summary.overdue.instalments} instalments across ${summary.overdue.loans} loans`, ico: 'clock', alert: Number(summary.overdue.instalments) > 0 }));
      body.replaceChildren(...(rows.length ? rows.map((l) => {
        const pct = Number(l.total_payable) ? Math.min(100, (Number(l.total_repaid) / Number(l.total_payable)) * 100) : 0;
        return h('tr', { class: 'clickable', tabindex: 0, onClick: () => showLoan(l.loan_id), onKeydown: (e) => { if (e.key === 'Enter') showLoan(l.loan_id); } },
          h('td', { class: 'num' }, `#${l.loan_id}`), h('td', null, h('b', null, l.full_name), h('div', { class: 'sub' }, `${cap(l.loan_type)} · ${l.interest_rate}%`)),
          h('td', { class: 'right num' }, money(l.principal)),
          h('td', { style: 'min-width:170px' }, h('div', { class: 'num' }, h('b', null, money(l.outstanding))), h('div', { class: 'progress', style: 'margin-top:6px' }, h('i', { style: `width:${pct}%` })), h('div', { class: 'sub' }, `${l.paid_instalments}/${l.instalments} paid`)),
          h('td', null, l.status === 'ACTIVE' ? fmtDate(l.next_due) : '-'),
          h('td', null, h('div', { class: 'row', style: 'gap:6px' }, badge(l.status), Number(l.overdue_instalments) ? badge('OVERDUE', `${l.overdue_instalments} overdue`) : null)),
          h('td', { class: 'right' }, h('button', { class: 'btn btn-ghost btn-sm', onClick: (e) => { e.stopPropagation(); showLoan(l.loan_id); } }, 'Open')));
      }) : [h('tr', null, h('td', { colspan: 7 }, emptyState('No loans found', '')))]));
    } catch (e) { body.replaceChildren(h('tr', null, h('td', { colspan: 7 }, errorBox(e)))); }
  }

  async function showLoan(id) {
    const m = openModal({ title: `Loan #${id}`, wide: true, body: h('div', { class: 'skel skel-block' }) });
    async function paint() {
      const l = await api.get(`/loans/${id}`);
      const pct = Number(l.total_payable) ? Math.min(100, (Number(l.total_repaid) / Number(l.total_payable)) * 100) : 0;
      m.body.replaceChildren(
        h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:14px' }, h('div', null, h('h3', { style: 'font-size:20px' }, `${l.full_name} · ${cap(l.loan_type)} loan`), h('div', { class: 'muted' }, `${l.interest_rate}% p.a. · ${fmtDate(l.start_date)} to ${fmtDate(l.end_date)} · account ${l.account_number}`)), badge(l.status)),
        h('dl', { class: 'kv' }, h('div', null, h('dt', null, 'Principal'), h('dd', null, money(l.principal))), h('div', null, h('dt', null, 'Total payable'), h('dd', null, money(l.total_payable))),
          h('div', null, h('dt', null, 'Repaid'), h('dd', { class: 'credit' }, money(l.total_repaid))), h('div', null, h('dt', null, 'Outstanding'), h('dd', null, h('b', null, money(l.outstanding))))),
        h('div', { class: 'progress', style: 'margin:16px 0 4px;height:10px' }, h('i', { style: `width:${pct}%` })), h('div', { class: 'hint' }, `${pct.toFixed(0)}% repaid`),
        sectionTitle('EMI schedule'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'data', style: 'min-width:560px' },
          h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Due date'), h('th', { class: 'right' }, 'EMI'), h('th', { class: 'right' }, 'Paid'), h('th', null, 'Status'), h('th'))),
          h('tbody', null, ...l.schedule.map((s, i) => {
            const rem = Math.max(0, Number(s.due_amount) - Number(s.paid_amount));
            return h('tr', null, h('td', null, i + 1), h('td', null, fmtDate(s.due_date)), h('td', { class: 'right num' }, money(s.due_amount)), h('td', { class: 'right num' }, money(s.paid_amount)), h('td', null, badge(s.status)),
              h('td', { class: 'right' }, s.status !== 'PAID' && l.status === 'ACTIVE' && session.can('loans:repay') ? h('button', { class: 'btn btn-primary btn-sm', onClick: () => repay(l, s, rem) }, 'Repay') : null));
          })))),
        sectionTitle('Repayment history'),
        l.repayments.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data', style: 'min-width:480px' }, h('thead', null, h('tr', null, h('th', null, 'Paid on'), h('th', null, 'Instalment due'), h('th', { class: 'right' }, 'Amount'))),
          h('tbody', null, ...l.repayments.map((r) => h('tr', null, h('td', { class: 'when' }, fmtDate(r.paid_on, true)), h('td', null, fmtDate(r.due_date)), h('td', { class: 'right num credit' }, money(r.paid_amount))))))) : h('p', { class: 'muted' }, 'No repayments yet.'));
      m.setFooter(h('button', { class: 'btn btn-dark', onClick: m.close }, 'Close'));
    }
    const repay = (l, s, rem) => {
      const form = h('form', { class: 'form', novalidate: true }, h('p', null, `Instalment due ${fmtDate(s.due_date)} · EMI ${money(s.due_amount)} · still owed ${money(rem)}`),
        field({ label: 'Amount to pay', name: 'amount', required: true, prefix: '₹', value: rem.toFixed(2), pattern: AMOUNT_PATTERN, patternMessage: AMOUNT_MSG, attrs: { inputmode: 'decimal' }, hint: `Debited from account ${l.account_number}` }));
      const pay = h('button', { class: 'btn btn-primary', type: 'button' }, 'Confirm payment');
      const rm = openModal({ title: 'Loan repayment', body: form, footer: [h('button', { class: 'btn btn-ghost', onClick: () => rm.close() }, 'Cancel'), pay] });
      pay.addEventListener('click', () => withBusy(pay, async () => {
        if (!validateForm(form)) return;
        try {
          const r = await api.post(`/loans/${l.loan_id}/repay`, { schedule_id: s.schedule_id, amount: form.elements.amount.value });
          toast(`${money(form.elements.amount.value)} received. Instalment is ${r.instalment.status}.`, { type: 'success', title: 'Repayment posted' });
          rm.close(); await paint(); load();
        } catch (e) { toast(e.message, { type: 'error', title: e.data && e.data.source === 'database' ? 'Rejected by the database' : 'Rejected' }); }
      }));
    };
    try { await paint(); } catch (e) { m.body.replaceChildren(errorBox(e)); }
  }

  async function newLoan() {
    const { rows: customers } = await api.get('/customers', { limit: 200 });
    const cust = field({ label: 'Borrower', name: 'customer_id', type: 'select', required: true, full: true, options: [{ value: '', label: 'Select customer' }, ...customers.map((c) => ({ value: c.customer_id, label: `${c.full_name} (#${c.customer_id})` }))] });
    const acct = field({ label: 'Disbursement / repayment account', name: 'account_id', type: 'select', required: true, full: true, options: [{ value: '', label: 'Select borrower first' }] });
    cust.querySelector('select').addEventListener('change', async (e) => {
      const sel = acct.querySelector('select');
      if (!e.target.value) return sel.replaceChildren(h('option', { value: '' }, 'Select borrower first'));
      const { rows } = await api.get('/accounts', { customer_id: e.target.value });
      sel.replaceChildren(h('option', { value: '' }, rows.length ? 'Select account' : 'Customer has no account'), ...rows.map((a) => h('option', { value: a.account_id }, `${a.account_number} · ${a.type_name} · ${a.status}`)));
    });
    const preview = h('div', { class: 'alert info' }, 'Enter amount, rate and tenure to preview the EMI.');
    const form = h('form', { class: 'form', novalidate: true }, h('div', { class: 'form-grid' }, cust, acct,
      field({ label: 'Loan type', name: 'loan_type', type: 'select', required: true, options: ['PERSONAL', 'VEHICLE', 'EDUCATION', 'HOME'].map((t) => ({ value: t, label: cap(t) })) }),
      field({ label: 'Loan amount', name: 'amount', required: true, prefix: '₹', pattern: AMOUNT_PATTERN, patternMessage: AMOUNT_MSG, attrs: { inputmode: 'decimal' } }),
      field({ label: 'Interest rate (% p.a.)', name: 'interest_rate', required: true, pattern: '\\d{1,3}(\\.\\d{1,2})?', patternMessage: 'Number with up to 2 decimals', attrs: { inputmode: 'decimal' } }),
      field({ label: 'Tenure (months)', name: 'tenure_months', type: 'number', required: true, attrs: { min: 1, max: 360, step: 1 } }),
      field({ label: 'Start date', name: 'start_date', type: 'date', required: true, value: todayISO() })), preview);
    const upd = () => { const e = emi(Number(form.elements.amount.value), Number(form.elements.interest_rate.value), Number(form.elements.tenure_months.value));
      preview.textContent = Number.isFinite(e) ? `Estimated EMI ${money(e)} × ${form.elements.tenure_months.value} = ${money(e * form.elements.tenure_months.value)} (the database-generated schedule is authoritative).` : 'Enter amount, rate and tenure to preview the EMI.'; };
    form.addEventListener('input', upd);
    const create = h('button', { class: 'btn btn-primary', type: 'button' }, 'Disburse loan');
    const m = openModal({ title: 'New loan', wide: true, body: form, footer: [h('button', { class: 'btn btn-ghost', onClick: () => m.close() }, 'Cancel'), create] });
    create.addEventListener('click', () => withBusy(create, async () => {
      if (!validateForm(form)) return;
      try { const l = await api.post('/loans', formData(form)); toast(`Loan #${l.loan_id} of ${money(l.principal)} disbursed to ${l.account_number}.`, { type: 'success', title: 'Loan created' }); m.close(); load(); showLoan(l.loan_id); }
      catch (e) { toast(e.message, { type: 'error', title: e.data && e.data.source === 'database' ? 'Rejected by the database' : 'Rejected' }); }
    }));
  }

  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search borrower, type or loan no.', 'aria-label': 'Search loans' });
  search.addEventListener('input', debounce(() => { f.q = search.value.trim(); load(); }));
  const status = h('select', { class: 'select', 'aria-label': 'Status' }, h('option', { value: '' }, 'All statuses'), ...['ACTIVE', 'CLOSED', 'DEFAULTED'].map((s) => h('option', { value: s }, cap(s))));
  status.addEventListener('change', () => { f.status = status.value; load(); });
  const od = h('input', { type: 'checkbox' }); od.addEventListener('change', () => { f.overdue = od.checked ? '1' : ''; load(); });

  page.append(pageHead('Loans', 'Disburse loans, follow EMI schedules and collect repayments.', session.can('loans:create') ? h('button', { class: 'btn btn-primary', onClick: newLoan }, icon('plus'), 'New loan') : null), tiles,
    h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search'), search), status, h('label', { class: 'check' }, od, 'Overdue only')),
    h('div', { class: 'card' }, h('div', { class: 'table-wrap' }, h('table', { class: 'data', style: 'min-width:860px' },
      h('thead', null, h('tr', null, h('th', null, 'Loan'), h('th', null, 'Borrower'), h('th', { class: 'right' }, 'Principal'), h('th', null, 'Outstanding'), h('th', null, 'Next due'), h('th', null, 'Status'), h('th'))), body))));
  await load();
}
