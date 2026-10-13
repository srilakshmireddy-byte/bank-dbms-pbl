import { api } from '../api.js';
import { h, crest, icon, money, fmtDate, badge, cap, toast, field, validateForm, formData, withBusy, accountOption, todayISO,
  emptyState, pageHead, errorBox, hashParams } from '../ui.js';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function render(page) {
  const { rows: accounts } = await api.get('/accounts', { limit: 500 });
  const wanted = hashParams().get('account') || '';
  const out = h('div', { style: 'margin-top:32px' });
  const histBody = h('tbody');

  const acct = field({ label: 'Account', name: 'account_id', type: 'select', required: true, value: wanted, options: [{ value: '', label: 'Select account' }, ...accounts.map(accountOption)] });
  const now = new Date();
  const from = field({ label: 'From', name: 'from', type: 'date', required: true, value: iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)) });
  const to = field({ label: 'To', name: 'to', type: 'date', required: true, value: todayISO() });
  const setRange = (a, b) => { from.querySelector('input').value = iso(a); to.querySelector('input').value = iso(b); };
  const chips = h('div', { class: 'chips' },
    h('button', { type: 'button', class: 'chip', onClick: () => setRange(new Date(now.getFullYear(), now.getMonth(), 1), now) }, 'This month'),
    h('button', { type: 'button', class: 'chip', onClick: () => setRange(new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0)) }, 'Last month'),
    h('button', { type: 'button', class: 'chip', onClick: () => setRange(new Date(now.getFullYear(), now.getMonth() - 2, 1), now) }, 'Last 3 months'),
    h('button', { type: 'button', class: 'chip', onClick: () => setRange(new Date(2000, 0, 1), now) }, 'All time'));
  const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, icon('file'), 'Generate statement');

  function sheet(s) {
    const a = s.account;
    return h('div', null,
      h('div', { class: 'row no-print', style: 'justify-content:flex-end;margin-bottom:16px' },
        h('button', { class: 'btn btn-dark', onClick: () => window.print() }, icon('print'), 'Print / Save as PDF')),
      h('article', { class: 'sheet' },
        h('div', { class: 'sheet-head' },
          h('div', { class: 'brand' }, crest(), h('span', null, h('span', { class: 'wordmark' }, 'Woxsen Co-operative Bank'), h('small', null, `${a.branch_name} branch`))),
          h('div', null, h('h2', null, 'Statement of Account'), h('div', { class: 'muted right' }, `${fmtDate(s.from)} to ${fmtDate(s.to)}`))),
        h('dl', { class: 'kv' },
          h('div', null, h('dt', null, 'Account holder(s)'), h('dd', null, a.holders)), h('div', null, h('dt', null, 'Account number'), h('dd', { class: 'mono' }, a.account_number)),
          h('div', null, h('dt', null, 'Type'), h('dd', null, a.type_name)), h('div', null, h('dt', null, 'Status'), h('dd', null, cap(a.status)))),
        h('div', { class: 'sheet-summary' },
          h('div', null, h('small', null, 'Opening balance'), h('b', null, money(s.opening_balance))),
          h('div', null, h('small', null, 'Total credits'), h('b', { class: 'credit' }, money(s.total_credits))),
          h('div', null, h('small', null, 'Total debits'), h('b', { class: 'debit' }, money(s.total_debits))),
          h('div', null, h('small', null, 'Closing balance'), h('b', null, money(s.closing_balance)))),
        h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', null, 'Ref'), h('th', null, 'Description'), h('th', { class: 'right' }, 'Debit'), h('th', { class: 'right' }, 'Credit'), h('th', { class: 'right' }, 'Balance'))),
          h('tbody', null,
            h('tr', { class: 'opening' }, h('td', { colspan: 5 }, 'Opening balance'), h('td', { class: 'right num' }, money(s.opening_balance))),
            ...(s.lines.length ? s.lines.map((l) => h('tr', null, h('td', { class: 'when' }, fmtDate(l.transaction_date, true)), h('td', { class: 'num' }, `#${l.transaction_id}`),
              h('td', null, l.description || cap(l.transaction_type), h('div', { class: 'sub' }, cap(l.transaction_type))),
              h('td', { class: 'right num debit' }, Number(l.debit) ? money(l.debit) : ''), h('td', { class: 'right num credit' }, Number(l.credit) ? money(l.credit) : ''), h('td', { class: 'right num' }, money(l.balance))))
              : [h('tr', null, h('td', { colspan: 6 }, emptyState('No transactions in this period', ''))) ]),
            h('tr', { class: 'closing' }, h('td', { colspan: 5 }, 'Closing balance'), h('td', { class: 'right num' }, h('b', null, money(s.closing_balance))))))),
        h('div', { class: 'sheet-foot' }, h('span', null, `${s.count} transaction${s.count === 1 ? '' : 's'} · generated ${fmtDate(todayISO())}`), h('span', null, 'Computer-generated statement, no signature required.'))));
  }

  async function generate(params, log = true) {
    out.replaceChildren(h('div', { class: 'skel skel-block', style: 'height:320px' }));
    try {
      const s = log ? await api.post('/statements', params) : await api.get('/statements', params);
      out.replaceChildren(sheet(s));
      if (log) loadHistory();
    } catch (e) { out.replaceChildren(errorBox(e)); toast(e.message, { type: 'error' }); }
  }

  const form = h('form', { class: 'form no-print', novalidate: true, onSubmit: (e) => { e.preventDefault(); withBusy(btn, async () => { if (validateForm(form)) { const d = formData(form); await generate(d); } }); } },
    h('div', { class: 'form-grid', style: 'grid-template-columns:2fr 1fr 1fr' }, acct, from, to), chips, h('div', null, btn));

  async function loadHistory() {
    try {
      const rows = await api.get('/statements/history');
      histBody.replaceChildren(...(rows.length ? rows.map((r) => h('tr', null, h('td', { class: 'mono' }, r.account_number), h('td', null, `${fmtDate(r.from_date)} to ${fmtDate(r.to_date)}`), h('td', { class: 'when' }, fmtDate(r.generated_date, true)),
        h('td', { class: 'right' }, h('button', { class: 'btn btn-ghost btn-sm', onClick: () => { generate({ account_id: r.account_id, from: r.from_date, to: r.to_date }, false); window.scrollTo({ top: 0, behavior: 'smooth' }); } }, 'Open'))))
        : [h('tr', null, h('td', { colspan: 4 }, emptyState('Nothing generated yet', '')))]));
    } catch (e) { histBody.replaceChildren(h('tr', null, h('td', { colspan: 4 }, errorBox(e)))); }
  }

  page.append(h('div', { class: 'no-print' }, pageHead('Statements', 'Pick an account and a period. Running balances are rebuilt in date order from the v_account_statement view.')),
    h('section', { class: 'card card-pad no-print' }, form), out,
    h('section', { class: 'card no-print', style: 'margin-top:32px' }, h('div', { class: 'card-head' }, h('h2', null, 'Recently generated')),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, 'Account'), h('th', null, 'Period'), h('th', null, 'Generated'), h('th'))), histBody))));
  await loadHistory();
  if (wanted) form.requestSubmit();
}
