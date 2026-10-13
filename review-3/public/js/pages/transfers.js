import { api } from '../api.js';
import { h, icon, money, fmtDate, badge, toast, openModal, field, validateForm, formData, withBusy, accountOption,
  skeletonRows, emptyState, pager, pageHead, errorBox, AMOUNT_PATTERN, AMOUNT_MSG } from '../ui.js';

export async function render(page, { session }) {
  const canCreate = session.can('transfers:create');
  const { rows: accounts } = await api.get('/accounts', { limit: 500 });
  const top = h('div');
  const proof = h('div', null, h('div', { class: 'skel skel-block' }));
  let proofShown = false;
  function showProof(t, fresh = false) {
    proofShown = true;
    proof.replaceChildren(
      h('p', { class: fresh ? 'credit' : 'muted', style: 'margin-bottom:24px' }, fresh ? `Transfer #${t.transfer_id} completed just now.` : `Transfer #${t.transfer_id}, ${fmtDate(t.transaction_date, true)}`),
      h('div', { class: 'balanced-proof' },
        h('div', { class: 'side' }, h('div', { class: 'sub' }, 'Debit'), h('div', { class: 'amt debit' }, money(t.debited)), h('div', { class: 'sub mono' }, t.from_account)),
        h('div', { class: 'eq', 'aria-label': 'equals' }, '='),
        h('div', { class: 'side' }, h('div', { class: 'sub' }, 'Credit'), h('div', { class: 'amt credit' }, money(t.credited)), h('div', { class: 'sub mono' }, t.to_account))),
      h('p', { class: 'hint', style: 'margin-top:24px' }, t.balanced ? 'Both legs match, as trg_transfer_before_insert requires.' : 'These legs do not match.'));
  }
  let mode = 'ben', bens = [];
  let hpg = 1, hacct = '';
  const body = h('tbody'), foot = h('div');

  async function loadHistory() {
    body.replaceChildren(...skeletonRows(7, 5));
    try {
      const res = await api.get('/transfers', { account_id: hacct, page: hpg, limit: 10 });
      body.replaceChildren(...(res.rows.length ? res.rows.map((t) => h('tr', null,
        h('td', { class: 'num' }, `#${t.transfer_id}`), h('td', { class: 'when' }, fmtDate(t.transaction_date, true)),
        h('td', null, h('div', { class: 'mono' }, t.from_account), h('div', { class: 'sub' }, t.from_holders)),
        h('td', { class: 'arrow-cell' }, icon('arrow')),
        h('td', null, h('div', { class: 'mono' }, t.to_account), h('div', { class: 'sub' }, t.to_holders)),
        h('td', { class: 'right num debit' }, money(t.debited)), h('td', { class: 'right num credit' }, money(t.credited)),
        h('td', null, t.balanced ? badge('ACTIVE', 'Debit = Credit') : badge('OVERDUE', 'Unbalanced')), h('td', null, t.remarks || '-')))
        : [h('tr', null, h('td', { colspan: 9 }, emptyState('No transfers yet', 'Completed transfers appear here.')))]));
      foot.replaceChildren(pager(res, (n) => { hpg = n; loadHistory(); }));
      if (!proofShown && res.rows[0]) showProof(res.rows[0]);
      if (!proofShown && !res.rows.length) proof.replaceChildren(h('p', { class: 'muted' }, 'No transfers have been posted yet.'));
    } catch (e) { body.replaceChildren(h('tr', null, h('td', { colspan: 9 }, errorBox(e)))); }
  }

  if (canCreate) {
    const fromF = field({ label: 'From account', name: 'from_account_id', type: 'select', required: true, options: [{ value: '', label: 'Select account' }, ...accounts.map(accountOption)] });
    const fromSel = fromF.querySelector('select');
    const benF = field({ label: 'Beneficiary', name: 'beneficiary_id', type: 'select', required: true, options: [{ value: '', label: 'Select account first' }] });
    const toF = field({ label: 'Destination account', name: 'to_account_id', type: 'select', required: true, options: [{ value: '', label: 'Select account' }, ...accounts.map(accountOption)] });
    const benWrap = h('div', { class: 'stack', style: 'gap:10px' }, benF, h('div', null, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'add-ben' }, icon('plus'), 'Add beneficiary')));
    const toWrap = h('div', { hidden: true }, toF);
    const amount = field({ label: 'Amount', name: 'amount', required: true, prefix: '₹', pattern: AMOUNT_PATTERN, patternMessage: AMOUNT_MSG, placeholder: '0.00', attrs: { inputmode: 'decimal' } });
    const remarks = field({ label: 'Remarks (optional)', name: 'remarks', attrs: { maxlength: 150 } });
    const btn = h('button', { class: 'btn btn-primary', type: 'submit', style: 'width:100%;min-height:46px' }, icon('swap'), 'Transfer now');

    async function loadBens() {
      const sel = benF.querySelector('select');
      if (!fromSel.value) { sel.replaceChildren(h('option', { value: '' }, 'Select account first')); return; }
      bens = await api.get('/beneficiaries', { account_id: fromSel.value });
      sel.replaceChildren(h('option', { value: '' }, bens.length ? 'Select beneficiary' : 'No beneficiaries saved'),
        ...bens.map((b) => h('option', { value: b.beneficiary_id, disabled: !b.account_id }, `${b.beneficiary_name} · ${b.account_number} · ${b.bank_name}${b.account_id ? '' : ' (external, cannot be settled here)'}`)));
    }
    fromSel.addEventListener('change', loadBens);
    const mkMode = (m, label) => h('button', { type: 'button', class: m === mode ? 'on' : '', onClick: () => {
      mode = m; seg.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', (i === 0) === (m === 'ben')));
      benWrap.hidden = m !== 'ben'; toWrap.hidden = m === 'ben';
      benF.querySelector('select').required = m === 'ben'; toF.querySelector('select').required = m !== 'ben'; } }, label);
    const seg = h('div', { class: 'segmented' }, mkMode('ben', 'Beneficiary'), mkMode('acct', 'Any account'));
    toF.querySelector('select').required = false;

    benWrap.querySelector('#add-ben').addEventListener('click', async () => {
      if (!fromSel.value) return toast('Choose the From account first. Beneficiaries belong to its holders.', { type: 'info' });
      const acc = await api.get(`/accounts/${fromSel.value}`);
      const bf = h('form', { class: 'form', novalidate: true }, h('div', { class: 'form-grid' },
        field({ label: 'Saved for', name: 'customer_id', type: 'select', required: true, full: true, options: acc.holderList.map((p) => ({ value: p.customer_id, label: p.full_name })) }),
        field({ label: 'Beneficiary name', name: 'beneficiary_name', required: true, full: true, attrs: { maxlength: 100 } }),
        field({ label: 'Account number', name: 'account_number', required: true, attrs: { maxlength: 20 } }),
        field({ label: 'IFSC code', name: 'ifsc_code', required: true, pattern: '[A-Za-z0-9]{4,11}', patternMessage: 'Up to 11 letters/digits', attrs: { maxlength: 11 } }),
        field({ label: 'Bank name', name: 'bank_name', required: true, value: 'Woxsen Co-operative Bank', attrs: { maxlength: 80 } }),
        field({ label: 'Type', name: 'type', type: 'select', options: [{ value: 'INTERNAL', label: 'Internal (this bank)' }, { value: 'EXTERNAL', label: 'External' }] })));
      const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save beneficiary');
      const m = openModal({ title: 'Add beneficiary', body: bf, footer: [h('button', { class: 'btn btn-ghost', onClick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', () => withBusy(save, async () => {
        if (!validateForm(bf)) return;
        try { const b = await api.post('/beneficiaries', formData(bf)); toast(`${b.beneficiary_name} saved.`, { type: 'success' }); m.close(); await loadBens(); }
        catch (e) { toast(e.message, { type: 'error' }); }
      }));
    });

    const form = h('form', { class: 'form', novalidate: true, onSubmit: (e) => {
      e.preventDefault();
      withBusy(btn, async () => {
        if (!validateForm(form)) return;
        const d = formData(form);
        try {
          const t = await api.post('/transfers', { from_account_id: d.from_account_id, amount: d.amount, remarks: d.remarks,
            ...(mode === 'ben' ? { beneficiary_id: d.beneficiary_id } : { to_account_id: d.to_account_id }) });
          showProof(t, true);
          toast(`${money(t.debited)} moved from ${t.from_account} to ${t.to_account}.`, { type: 'success', title: 'Transfer complete' });
          const fresh = await api.get('/accounts', { limit: 500 });
          for (const a of fresh.rows) { const i = accounts.findIndex((x) => x.account_id === a.account_id); if (i >= 0) accounts[i] = a; }
          [fromSel, toF.querySelector('select')].forEach((s) => [...s.options].forEach((o) => { const a = accounts.find((x) => String(x.account_id) === o.value); if (a) o.textContent = accountOption(a).label; }));
          form.elements.amount.value = ''; hpg = 1; loadHistory();
        } catch (err) { toast(err.message, { type: 'error', title: err.data && err.data.source === 'database' ? 'Rejected by the database' : 'Rejected' }); }
      });
    } }, fromF, seg, benWrap, toWrap, amount, remarks, btn);
    top.className = 'split';
    top.append(h('section', { class: 'card card-pad' }, h('h2', { class: 'panel-title' }, 'New transfer'), form,
      h('p', { class: 'hint', style: 'margin-top:16px' }, 'Both legs post together through sp_transfer. If either leg fails, neither is saved.')),
      h('section', { class: 'card card-pad feature' }, h('h2', { class: 'panel-title' }, 'Latest transfer'), proof));
  } else top.append(h('div', { class: 'alert info' }, icon('lock'), 'Your role can view transfers but not create them.'));

  const filter = h('select', { class: 'select', style: 'width:auto;max-width:300px', 'aria-label': 'Filter by account' }, h('option', { value: '' }, 'All accounts'),
    ...accounts.map((a) => h('option', { value: a.account_id }, `${a.account_number} · ${a.holders}`)));
  filter.addEventListener('change', () => { hacct = filter.value; hpg = 1; loadHistory(); });

  page.append(pageHead('Transfers', 'Move money between accounts. Every transfer shows its debit and credit side by side.'), top,
    h('section', { class: 'card', style: 'margin-top:32px' }, h('div', { class: 'card-head' }, h('div', null, h('h2', null, 'Transfer history'), h('p', null, 'The balanced flag comes straight from the v_transfers view')), filter),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data compact', style: 'min-width:960px' }, h('thead', null, h('tr', null, h('th', null, 'Ref'), h('th', null, 'Date'), h('th', null, 'From'), h('th'), h('th', null, 'To'),
        h('th', { class: 'right' }, 'Debited'), h('th', { class: 'right' }, 'Credited'), h('th', null, 'Check'), h('th', null, 'Remarks'))), body)), foot));
  await loadHistory();
}
