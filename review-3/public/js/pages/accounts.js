import { api } from '../api.js';
import { h, crest, tilt, stagger, sectionTitle, icon, money, fmtDate, badge, cap, groupNumber, toast, openModal, field, validateForm, formData, withBusy, debounce,
  emptyState, pageHead, errorBox, AMOUNT_PATTERN, AMOUNT_MSG } from '../ui.js';

const slug = (t) => 't-' + t.toLowerCase().replace(/\s+/g, '-');
/** 50010000001001 -> 5001 •••• •••• 1001 */
const masked = (n) => `${String(n).slice(0, 4)} •••• •••• ${String(n).slice(-4)}`;

export function accountCard(a, { onClick } = {}) {
  const holders = a.holders || '';
  const joint = holders.includes(',');
  const card = h(onClick ? 'button' : 'div', { class: `acard ${slug(a.type_name)} s-${a.status.toLowerCase()}${onClick ? '' : ' static'}`, type: onClick ? 'button' : null,
    'aria-label': onClick ? `${a.type_name} account ending ${String(a.account_number).slice(-4)}, ${holders}` : null, onClick },
    h('div', { class: 'acard-top' }, h('div', { class: 'acard-type' }, crest(), a.type_name),
      a.status !== 'ACTIVE' ? badge(a.status) : h('span', { class: 'chip-icon', 'aria-hidden': 'true' })),
    h('div', null, h('div', { class: 'acard-number' }, masked(a.account_number)),
      h('div', { class: 'acard-meta' }, `${a.branch_name}${a.open_date ? `, since ${fmtDate(a.open_date)}` : ''}`)),
    h('div', { class: 'acard-bottom' }, h('div', { class: 'acard-holder' }, holders, h('small', null, joint ? 'Joint holders' : 'Account holder')),
      h('div', { class: 'acard-balance' }, h('small', null, 'Balance'), h('b', null, money(a.balance)))));
  if (onClick) tilt(card);
  return h('div', { class: 'acard-wrap' }, card);
}

export async function render(page, { session }) {
  const f = { q: '', status: '', branch_id: '', type_id: '' };
  const grid = h('div', { class: 'cards' });
  const count = h('div', { class: 'muted', style: 'margin-bottom:16px' });
  const [branches, types] = await Promise.all([api.get('/branches'), api.get('/account-types')]);

  async function load() {
    grid.replaceChildren(...Array.from({ length: 6 }, () => h('div', { class: 'skel', style: 'aspect-ratio:1.586;border-radius:12px' })));
    try {
      const res = await api.get('/accounts', { ...f, limit: 200 });
      count.textContent = `${res.total} account${res.total === 1 ? '' : 's'}`;
      grid.replaceChildren(...(res.rows.length ? res.rows.map((a) => accountCard(a, { onClick: () => showAccount(a.account_id) })) : [emptyState('No accounts match', 'Adjust the filters or open a new account.')]));
      stagger(grid);
    } catch (e) { grid.replaceChildren(errorBox(e)); }
  }

  async function showAccount(id) {
    const m = openModal({ title: 'Account details', wide: true, body: h('div', { class: 'skel skel-block' }) });
    try {
      const a = await api.get(`/accounts/${id}`);
      const statusSel = h('select', { class: 'select', 'aria-label': 'Account status', style: 'width:auto' },
        ...['ACTIVE', 'DORMANT', 'FROZEN', 'CLOSED'].map((s) => h('option', { value: s, selected: s === a.status }, cap(s))));
      const saveStatus = h('button', { class: 'btn btn-dark btn-sm' }, 'Update status');
      saveStatus.addEventListener('click', () => withBusy(saveStatus, async () => {
        try {
          await api.patch(`/accounts/${id}/status`, { status: statusSel.value });
          toast(`Account ${a.account_number} is now ${statusSel.value}.`, { type: 'success' });
          m.close(); load();
        } catch (e) { toast(e.message, { type: 'error' }); }
      }));
      m.body.replaceChildren(...[
        h('div', { class: 'modal-grid' },
          accountCard(a),
          h('div', null,
            h('dl', { class: 'kv' },
              h('div', null, h('dt', null, 'Account number'), h('dd', { class: 'mono' }, a.account_number)), h('div', null, h('dt', null, 'Type'), h('dd', null, a.type_name)), h('div', null, h('dt', null, 'Branch'), h('dd', null, a.branch_name)),
              h('div', null, h('dt', null, 'Opened'), h('dd', null, fmtDate(a.open_date))), h('div', null, h('dt', null, 'Minimum balance'), h('dd', null, money(a.min_balance))),
              h('div', null, h('dt', null, 'Status'), h('dd', null, badge(a.status)))),
            sectionTitle('Holders'),
            h('div', { class: 'mini-list' }, ...a.holderList.map((p) => h('div', { class: 'mini-account' }, h('div', null, h('b', null, p.full_name), h('div', { class: 'sub muted' }, `Since ${fmtDate(p.since_date)}`)), badge(p.holder_type, cap(p.holder_type)))))),
        ),
        sectionTitle('Recent activity'),
        a.recent.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data', style: 'min-width:520px' },
          h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', null, 'Type'), h('th', null, 'Description'), h('th', { class: 'right' }, 'Amount'))),
          h('tbody', null, ...a.recent.map((t) => h('tr', null, h('td', { class: 'when' }, fmtDate(t.transaction_date, true)), h('td', null, badge(t.transaction_type)), h('td', null, t.description || '-'),
            h('td', { class: `right num ${Number(t.credit) > 0 ? 'credit' : 'debit'}` }, (Number(t.credit) > 0 ? '+ ' : '- ') + money(Number(t.credit) > 0 ? t.credit : t.debit))))))) : h('p', { class: 'muted' }, 'No activity yet.'),
        session.can('accounts:status') ? sectionTitle('Manager controls') : null,
        session.can('accounts:status') ? h('div', { class: 'row' }, statusSel, saveStatus, h('span', { class: 'hint' }, 'Frozen, dormant and closed accounts reject postings (enforced by the database).')) : null].filter(Boolean));
      m.setFooter([
        h('a', { class: 'btn btn-ghost', href: `#/statements?account=${a.account_id}`, onClick: () => m.close() }, icon('file'), 'Statement'),
        session.can('transactions:post') ? h('a', { class: 'btn btn-primary', href: `#/transactions?account=${a.account_id}`, onClick: () => m.close() }, 'Deposit / withdraw') : null]);
    } catch (e) { m.body.replaceChildren(errorBox(e)); }
  }

  async function openAccount() {
    const { rows: customers } = await api.get('/customers', { limit: 200 });
    const jointRows = h('div', { class: 'stack', style: 'gap:10px' });
    const custOpts = (blank) => [{ value: '', label: blank }, ...customers.map((c) => ({ value: c.customer_id, label: `${c.full_name} (#${c.customer_id})` }))];
    const addJoint = () => {
      const sel = h('select', { class: 'select', 'aria-label': 'Joint holder' }, ...custOpts('Select joint holder').map((o) => h('option', { value: o.value }, o.label)));
      const row = h('div', { class: 'row', style: 'flex-wrap:nowrap' }, h('div', { style: 'flex:1' }, sel), h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': 'Remove', onClick: () => row.remove() }, icon('x')));
      row.sel = sel; jointRows.append(row);
    };
    const typeNote = h('div', { class: 'hint' });
    const typeField = field({ label: 'Account type', name: 'type_id', type: 'select', required: true, options: types.map((t) => ({ value: t.type_id, label: t.type_name })) });
    const showMin = () => { const t = types.find((x) => String(x.type_id) === typeField.querySelector('select').value); typeNote.textContent = t ? `${t.description}. Minimum balance ${money(t.min_balance)}.` : ''; };
    typeField.querySelector('select').addEventListener('change', showMin); showMin();
    const form = h('form', { class: 'form', novalidate: true },
      h('div', { class: 'form-grid' },
        field({ label: 'Primary holder', name: 'primary_customer_id', type: 'select', required: true, options: custOpts('Select customer'), full: true }),
        typeField, field({ label: 'Branch', name: 'branch_id', type: 'select', required: true, options: branches.map((b) => ({ value: b.branch_id, label: b.branch_name })) }),
        h('div', { class: 'full' }, typeNote),
        field({ label: 'Opening deposit (optional)', name: 'opening_deposit', prefix: '₹', pattern: AMOUNT_PATTERN, patternMessage: AMOUNT_MSG, placeholder: '0.00', attrs: { inputmode: 'decimal' }, full: true })),
      h('div', null, h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:8px' }, h('span', { class: 'label' }, 'Joint holders (optional)'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: addJoint }, icon('plus'), 'Add joint holder')), jointRows));
    const create = h('button', { class: 'btn btn-primary', type: 'button' }, 'Open account');
    const m = openModal({ title: 'Open a new account', body: form, footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => m.close() }, 'Cancel'), create] });
    create.addEventListener('click', () => withBusy(create, async () => {
      if (!validateForm(form)) return;
      const d = formData(form);
      const body = { type_id: d.type_id, branch_id: d.branch_id, primary_customer_id: d.primary_customer_id,
        joint_customer_ids: [...jointRows.children].map((r) => r.sel.value).filter(Boolean), opening_deposit: d.opening_deposit };
      try {
        const a = await api.post('/accounts', body);
        toast(`Account ${a.account_number} opened for ${a.holders}.`, { type: 'success', title: 'Account opened' });
        m.close(); load();
      } catch (e) { toast(e.message, { type: 'error' }); }
    }));
  }

  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search by account number or holder', 'aria-label': 'Search accounts' });
  search.addEventListener('input', debounce(() => { f.q = search.value.trim(); load(); }));
  const sel = (key, label, options) => {
    const s = h('select', { class: 'select', 'aria-label': label }, h('option', { value: '' }, label), ...options.map((o) => h('option', { value: o.value }, o.label)));
    s.addEventListener('change', () => { f[key] = s.value; load(); });
    return s;
  };

  page.append(
    pageHead('Accounts', 'Every account at a glance. Open one to see holders, activity and controls.', session.can('accounts:create') ? h('button', { class: 'btn btn-primary', onClick: openAccount }, icon('plus'), 'Open account') : null),
    h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search'), search),
      sel('status', 'All statuses', ['ACTIVE', 'DORMANT', 'FROZEN', 'CLOSED'].map((s) => ({ value: s, label: cap(s) }))),
      sel('branch_id', 'All branches', branches.map((b) => ({ value: b.branch_id, label: b.branch_name }))),
      sel('type_id', 'All types', types.map((t) => ({ value: t.type_id, label: t.type_name })))),
    count, grid);
  await load();
}
