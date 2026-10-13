import { api } from '../api.js';
import { h, sectionTitle, icon, money, fmtDate, badge, initials, cap, toast, openModal, field, validateForm, formData, withBusy, debounce,
  skeletonRows, emptyState, pager, pageHead, errorBox } from '../ui.js';

export async function render(page, { session }) {
  let q = '', pg = 1;
  const canWrite = session.can('customers:write');
  const body = h('tbody');
  const foot = h('div');
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search by name, email, phone or ID proof', 'aria-label': 'Search customers' });

  async function load() {
    body.replaceChildren(...skeletonRows(6));
    try {
      const res = await api.get('/customers', { q, page: pg, limit: 15 });
      body.replaceChildren(...(res.rows.length ? res.rows.map(row) : [h('tr', null, h('td', { colspan: 6 }, emptyState('No customers found', q ? 'Try a different search.' : 'Add the first customer.')))]));
      foot.replaceChildren(res.total > res.limit ? pager(res, (n) => { pg = n; load(); }) : h('div', { class: 'pager' }, `${res.total} customer${res.total === 1 ? '' : 's'}`));
    } catch (e) { body.replaceChildren(h('tr', null, h('td', { colspan: 6 }, errorBox(e)))); }
  }

  function row(c) {
    return h('tr', { class: 'clickable', tabindex: 0, onClick: () => showCustomer(c.customer_id), onKeydown: (e) => { if (e.key === 'Enter') showCustomer(c.customer_id); } },
      h('td', null, h('div', { class: 'name-cell' }, h('span', { class: 'initials' }, initials(c.full_name)), h('div', null, h('b', null, c.full_name), h('div', { class: 'sub' }, `Customer #${c.customer_id}`)))),
      h('td', null, h('div', null, c.email), h('div', { class: 'sub' }, c.phone)),
      h('td', { class: 'mono' }, c.id_proof),
      h('td', { class: 'num' }, c.accounts),
      h('td', { class: 'right num' }, h('b', null, money(c.total_balance))),
      h('td', { class: 'right' }, h('div', { class: 'row', style: 'justify-content:flex-end;flex-wrap:nowrap' },
        h('button', { class: 'btn btn-ghost btn-sm', onClick: (e) => { e.stopPropagation(); showCustomer(c.customer_id); } }, icon('eye'), 'View'),
        canWrite ? h('button', { class: 'btn btn-ghost btn-sm', onClick: (e) => { e.stopPropagation(); editCustomer(c); } }, icon('edit'), 'Edit') : null)));
  }

  async function showCustomer(id) {
    const m = openModal({ title: 'Customer profile', wide: true, body: h('div', { class: 'skel skel-block' }) });
    try {
      const c = await api.get(`/customers/${id}`);
      m.body.replaceChildren(
        h('div', { class: 'profile-head' }, h('span', { class: 'initials' }, initials(c.full_name)),
          h('div', null, h('h3', null, c.full_name), h('div', { class: 'muted' }, `Customer #${c.customer_id} · ID proof ${c.id_proof}`))),
        h('dl', { class: 'kv' },
          kv('Email', c.email), kv('Phone', c.phone), kv('Date of birth', fmtDate(c.date_of_birth)), kv('Address', c.address),
          kv('Accounts held', c.accounts), kv('Combined balance', money(c.total_balance))),
        sectionTitle('Accounts'),
        c.accountList.length ? h('div', { class: 'mini-list' }, ...c.accountList.map((a) => h('div', { class: 'mini-account' },
          h('div', null, h('b', { class: 'mono' }, a.account_number), h('div', { class: 'sub muted' }, `${a.type_name} · ${a.branch_name} · ${cap(a.holder_type)} holder`)),
          h('div', { class: 'row' }, badge(a.status), h('b', { class: 'num' }, money(a.balance)))))) : h('p', { class: 'muted' }, 'No accounts yet.'),
        sectionTitle('Loans'),
        c.loans.length ? h('div', { class: 'mini-list' }, ...c.loans.map((l) => h('div', { class: 'mini-account' },
          h('div', null, h('b', null, `Loan #${l.loan_id} · ${cap(l.loan_type)}`), h('div', { class: 'sub muted' }, `Principal ${money(l.principal)}`)),
          h('div', { class: 'row' }, badge(l.status), h('b', { class: 'num' }, `${money(l.outstanding)} due`))))) : h('p', { class: 'muted' }, 'No loans.'),
        sectionTitle('Saved beneficiaries'),
        c.beneficiaries.length ? h('div', { class: 'mini-list' }, ...c.beneficiaries.map((b) => h('div', { class: 'mini-account' },
          h('div', null, h('b', null, b.beneficiary_name), h('div', { class: 'sub muted mono' }, `${b.account_number} · ${b.bank_name} · ${b.ifsc_code}`)), badge(b.type)))) : h('p', { class: 'muted' }, 'None saved.'));
      m.setFooter([
        canWrite ? h('button', { class: 'btn btn-ghost', onClick: () => { m.close(); editCustomer(c); } }, icon('edit'), 'Edit details') : null,
        h('button', { class: 'btn btn-dark', onClick: m.close }, 'Close')]);
    } catch (e) { m.body.replaceChildren(errorBox(e)); }
  }
  const kv = (k, v) => h('div', null, h('dt', null, k), h('dd', null, v));

  function editCustomer(existing) {
    const c = existing || {};
    const form = h('form', { class: 'form', novalidate: true },
      h('div', { class: 'form-grid' },
        field({ label: 'Full name', name: 'full_name', required: true, value: c.full_name || '', full: true, attrs: { maxlength: 100 } }),
        field({ label: 'Date of birth', name: 'date_of_birth', type: 'date', required: true, value: c.date_of_birth || '' }),
        field({ label: 'Phone', name: 'phone', required: true, value: c.phone || '', pattern: '[0-9+\\- ]{6,15}', patternMessage: 'Digits only, 6-15 characters', attrs: { maxlength: 15, inputmode: 'tel' } }),
        field({ label: 'Email', name: 'email', type: 'email', required: true, value: c.email || '', full: true, attrs: { maxlength: 120 } }),
        field({ label: 'Address', name: 'address', required: true, value: c.address || '', full: true, attrs: { maxlength: 150 } }),
        field({ label: 'ID proof number', name: 'id_proof', required: true, value: c.id_proof || '', full: true, hint: 'PAN, Aadhaar or passport number. Must be unique.', attrs: { maxlength: 30 } })));
    const save = h('button', { class: 'btn btn-primary', type: 'button' }, existing ? 'Save changes' : 'Create customer');
    const m = openModal({ title: existing ? `Edit ${c.full_name}` : 'New customer', body: form,
      footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => m.close() }, 'Cancel'), save] });
    const submit = () => withBusy(save, async () => {
      if (!validateForm(form)) return;
      try {
        const saved = existing ? await api.put(`/customers/${c.customer_id}`, formData(form)) : await api.post('/customers', formData(form));
        toast(`${saved.full_name} was ${existing ? 'updated' : 'added as customer #' + saved.customer_id}.`, { type: 'success' });
        m.close(); load();
      } catch (e) { toast(e.message, { type: 'error' }); }
    });
    save.addEventListener('click', submit);
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  }

  search.addEventListener('input', debounce(() => { q = search.value.trim(); pg = 1; load(); }));
  page.append(
    pageHead('Customers', 'Search, register and update the people who bank with us.', canWrite ? h('button', { class: 'btn btn-primary', onClick: () => editCustomer() }, icon('plus'), 'New customer') : null),
    h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search'), search)),
    h('div', { class: 'card' }, h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
      h('thead', null, h('tr', null, ...['Customer', 'Contact', 'ID proof', 'Accounts'].map((t) => h('th', null, t)), h('th', { class: 'right' }, 'Total balance'), h('th'))), body)), foot));
  await load();
}
