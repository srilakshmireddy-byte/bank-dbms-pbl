import { api } from '../api.js';
import { h, icon, money, fmtDate, badge, cap, toast, field, validateForm, formData, withBusy, accountOption,
  skeletonRows, emptyState, pager, pageHead, errorBox, hashParams, AMOUNT_PATTERN, AMOUNT_MSG } from '../ui.js';

const TYPES = ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER_DEBIT', 'TRANSFER_CREDIT', 'SERVICE_CHARGE', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT'];

export async function render(page, { session }) {
  const canPost = session.can('transactions:post');
  const canAudit = session.can('audit:view');
  const wanted = hashParams().get('account');
  const left = h('div', { class: 'stack' });
  const right = h('div', { class: 'stack' });

  // ---------- deposit / withdraw ----------
  if (canPost) {
    const { rows: accounts } = await api.get('/accounts', { limit: 500 });
    let kind = 'deposit';
    const info = h('div', { class: 'hint' });
    const receipt = h('div');
    const acct = field({ label: 'Account', name: 'account_id', type: 'select', required: true,
      options: [{ value: '', label: 'Select account' }, ...accounts.map(accountOption)], value: wanted || '' });
    const sel = acct.querySelector('select');
    const showInfo = () => {
      const a = accounts.find((x) => String(x.account_id) === sel.value);
      info.textContent = a ? `${a.type_name} · ${a.status} · balance ${money(a.balance)} · minimum ${money(a.min_balance)}` : '';
    };
    sel.addEventListener('change', showInfo); showInfo();
    const amount = field({ label: 'Amount', name: 'amount', required: true, prefix: '₹', pattern: AMOUNT_PATTERN, patternMessage: AMOUNT_MSG, placeholder: '0.00', attrs: { inputmode: 'decimal' } });
    const desc = field({ label: 'Description (optional)', name: 'description', attrs: { maxlength: 150 } });
    const btn = h('button', { class: 'btn btn-primary', type: 'submit', style: 'width:100%;min-height:46px' }, 'Post deposit');
    const mk = (k, label) => h('button', { type: 'button', class: `${k}${k === kind ? ' on' : ''}`, onClick: () => {
      kind = k; seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.classList.contains(k)));
      btn.textContent = k === 'deposit' ? 'Post deposit' : 'Post withdrawal'; } }, label);
    const seg = h('div', { class: 'segmented' }, mk('deposit', 'Deposit'), mk('withdraw', 'Withdrawal'));
    const form = h('form', { class: 'form', novalidate: true, onSubmit: (e) => {
      e.preventDefault();
      withBusy(btn, async () => {
        if (!validateForm(form)) return;
        try {
          const t = await api.post(`/transactions/${kind}`, formData(form));
          receipt.replaceChildren(h('div', { class: 'receipt' }, h('b', null, icon('check'), `Posted as transaction #${t.transaction_id}`),
            h('div', { class: 'big' }, money(t.amount)), h('div', { class: 'muted' }, `${cap(t.transaction_type)} on ${t.account_number} · balance now ${money(t.balance_after)}`)));
          toast(`${cap(t.transaction_type)} of ${money(t.amount)} posted.`, { type: 'success' });
          const a = accounts.find((x) => x.account_number === t.account_number); if (a) { a.balance = t.balance_after; sel.options[sel.selectedIndex].textContent = accountOption(a).label; showInfo(); }
          form.elements.amount.value = ''; loadRecent(); loadAudit();
        } catch (err) {
          receipt.replaceChildren();
          toast(err.message, { type: 'error', title: err.data && err.data.source === 'database' ? 'Rejected by the database' : 'Rejected' });
        }
      });
    } }, seg, acct, info, amount, desc, btn, receipt);
    left.append(h('section', { class: 'card card-pad' }, h('h2', { class: 'panel-title' }, 'Cash posting'), form,
      h('p', { class: 'hint', style: 'margin-top:12px' }, 'Amount, account status and balance rules are applied by the database. Any rejection is shown exactly as MySQL reports it.')));
  } else {
    left.append(h('div', { class: 'alert info' }, icon('lock'), 'Your role can view postings but not create them.'));
  }

  // ---------- recent postings ----------
  const recentBody = h('tbody');
  async function loadRecent() {
    try {
      const rows = await api.get('/transactions/recent');
      recentBody.replaceChildren(...rows.map((r) => h('tr', null, h('td', { class: 'when' }, fmtDate(r.transaction_date, true)), h('td', { class: 'mono' }, r.account_number), h('td', null, badge(r.transaction_type)), h('td', { class: 'right num' }, money(r.amount)), h('td', { class: 'right num' }, money(r.balance_after)))));
    } catch (e) { recentBody.replaceChildren(h('tr', null, h('td', { colspan: 5 }, errorBox(e)))); }
  }
  right.append(h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Latest postings')),
    h('div', { class: 'table-wrap' }, h('table', { class: 'data compact' }, h('thead', null, h('tr', null, h('th', null, 'When'), h('th', null, 'Account'), h('th', null, 'Type'), h('th', { class: 'right' }, 'Amount'), h('th', { class: 'right' }, 'Balance after'))), recentBody))));

  // ---------- audit ----------
  let loadAudit = () => {};
  let auditCard = null;
  if (canAudit) {
    const { rows: branches } = { rows: await api.get('/branches') };
    const f = {}; let pg = 1;
    const body = h('tbody'), foot = h('div'), summary = h('span', { class: 'muted' });
    const inp = (name, label, type = 'text', extra = {}) => field({ label, name, type, ...extra });
    const filters = h('form', { class: 'form-grid', style: 'grid-template-columns:repeat(auto-fit,minmax(160px,1fr))', onSubmit: (e) => { e.preventDefault(); apply(); } },
      field({ label: 'Type', name: 'type', type: 'select', options: [{ value: '', label: 'All types' }, ...TYPES.map((t) => ({ value: t, label: cap(t) }))] }),
      inp('account', 'Account no.'), inp('holder', 'Holder name'),
      field({ label: 'Branch', name: 'branch', type: 'select', options: [{ value: '', label: 'All branches' }, ...branches.map((b) => ({ value: b.branch_name, label: b.branch_name }))] }),
      field({ label: 'Account status', name: 'status', type: 'select', options: [{ value: '', label: 'Any' }, ...['ACTIVE', 'DORMANT', 'FROZEN', 'CLOSED'].map((s) => ({ value: s, label: cap(s) }))] }),
      inp('from', 'From', 'date'), inp('to', 'To', 'date'), inp('min_amount', 'Min amount'), inp('max_amount', 'Max amount'),
      h('div', { class: 'row', style: 'align-self:end' }, h('button', { class: 'btn btn-dark', type: 'submit' }, icon('search'), 'Apply'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { filters.reset(); apply(); } }, 'Reset')));
    function apply() { Object.assign(f, formData(filters)); pg = 1; loadAudit(); }
    loadAudit = async () => {
      body.replaceChildren(...skeletonRows(7, 6));
      try {
        const res = await api.get('/audit', { ...f, page: pg, limit: 15 });
        summary.textContent = `${res.total} postings · total ${money(res.total_amount)}`;
        body.replaceChildren(...(res.rows.length ? res.rows.map((r) => h('tr', null,
          h('td', { class: 'num' }, `#${r.transaction_id}`), h('td', { class: 'when' }, fmtDate(r.transaction_date, true)),
          h('td', null, h('div', { class: 'mono' }, r.account_number), h('div', { class: 'sub' }, r.holders)), h('td', null, r.branch_name),
          h('td', null, badge(r.transaction_type)), h('td', null, badge(r.account_status)),
          h('td', { class: 'right num' }, h('b', null, money(r.amount))), h('td', { class: 'right num' }, money(r.balance_after))))
          : [h('tr', null, h('td', { colspan: 8 }, emptyState('No postings match', 'Loosen the filters.')))]));
        foot.replaceChildren(pager(res, (n) => { pg = n; loadAudit(); }));
      } catch (e) { body.replaceChildren(h('tr', null, h('td', { colspan: 8 }, errorBox(e)))); }
    };
    auditCard = h('section', { class: 'card', style: 'margin-top:32px' }, h('div', { class: 'card-head' }, h('div', null, h('h2', null, 'Transaction audit'), h('p', null, 'Every posting with account, branch and holder (manager only)')), summary),
      h('div', { class: 'card-pad', style: 'border-bottom:1px solid var(--line-2)' }, filters),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data compact', style: 'min-width:900px' }, h('thead', null, h('tr', null, ...['Ref', 'Date', 'Account / holder', 'Branch', 'Type', 'Acct status'].map((t) => h('th', null, t)), h('th', { class: 'right' }, 'Amount'), h('th', { class: 'right' }, 'Balance after'))), body)), foot);
  }

  page.append(pageHead('Transactions', 'Post cash deposits and withdrawals and review the ledger.'),
    h('div', { class: 'split' }, left, right), auditCard || h('div', { class: 'alert info', style: 'margin-top:32px' }, icon('lock'), 'The full transaction audit with filters is available to managers.'));
  await loadRecent(); await loadAudit();
}
