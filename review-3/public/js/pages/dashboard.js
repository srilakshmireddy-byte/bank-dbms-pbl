import { api } from '../api.js';
import { h, icon, money, money0, compactMoney, fmtDate, badge, emptyState, sectionTitle, countUp, statTile } from '../ui.js';
import { barChart } from '../charts.js';

const greeting = () => { const hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'; };
const whole = (n) => Math.round(n).toLocaleString('en-IN');

const tile = (label, value, format, sub, ico, alert = false) => statTile({ label, value, format, sub, ico, alert });

export async function render(page, { session }) {
  page.classList.add('flush-top');
  page.append(h('div', { class: 'hero' }, h('div', { class: 'hero-inner' }, h('div', { class: 'skel', style: 'height:120px;opacity:.15' }))),
    h('div', { class: 'page overlap' }, h('div', { class: 'stat-tiles' }, ...Array.from({ length: 5 }, () => h('div', { class: 'tile' }, h('div', { class: 'skel', style: 'height:100%' }))))));

  const d = await api.get('/dashboard');
  const t = d.totals;
  const first = session.user.name.split(' ')[0];
  // The backend's txns_month counts every posting dated in the current calendar month (all types).
  const cur = d.monthly[d.monthly.length - 1];
  const monthName = cur ? new Date(Number(cur.month.slice(0, 4)), Number(cur.month.slice(5, 7)) - 1, 1).toLocaleString('en-IN', { month: 'long' }) : 'this month';

  const actions = h('div', { class: 'hero-actions' },
    session.can('transactions:post') ? h('a', { class: 'btn btn-white', href: '#/transactions' }, 'Post cash') : null,
    session.can('transfers:create') ? h('a', { class: 'btn btn-light', href: '#/transfers' }, 'Transfer') : null,
    session.can('loans:create') ? h('a', { class: 'btn btn-light', href: '#/loans' }, 'Loan desk') : null,
    h('a', { class: 'btn btn-light', href: '#/statements' }, 'Statements'));

  const big = h('div', { class: 'big' });
  countUp(big, t.total_deposits, money0, 2000);
  const hero = h('section', { class: 'hero' }, h('div', { class: 'hero-inner' },
    h('div', null,
      h('div', { class: 'caps' }, new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
      h('h1', null, `${greeting()}, `, h('em', null, first)),
      h('p', null, `The bank's position across its ${d.branches.length} branches, as of this morning's ledger.`),
      actions),
    h('div', { class: 'hero-figure' },
      h('div', { class: 'caps' }, 'Total deposits held'), big,
      h('p', null, `${t.accounts} accounts held by ${t.customers} customers`))));

  const tiles = h('div', { class: 'stat-tiles' },
    tile('Customers', t.customers, whole, `${t.accounts} accounts on the books`, 'users'),
    tile('Active accounts', t.active_accounts, whole, `${t.restricted_accounts} frozen or dormant`, 'card'),
    tile(`Postings in ${monthName}`, t.txns_month, whole, `${t.txns_today} posted today`, 'trend'),
    tile('Loans outstanding', t.loan_outstanding, compactMoney, `Across ${t.active_loans} active loans`, 'coins'),
    tile('Overdue instalments', t.overdue_instalments, whole, t.overdue_instalments ? 'Awaiting repayment' : 'None outstanding', 'clock', t.overdue_instalments > 0));

  const chartCard = h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('div', null, h('h2', null, 'Deposits and withdrawals'), h('p', null, 'Cash postings per month. Hover a bar for the exact amount.')),
      h('div', { class: 'legend' }, h('span', null, h('i', { class: 's0' }), 'Deposits'), h('span', null, h('i', { class: 's1' }), 'Withdrawals'))),
    h('div', { class: 'card-pad' }, barChart(d.monthly, { series: [{ key: 'deposits', label: 'Deposits' }, { key: 'withdrawals', label: 'Withdrawals' }] })));

  const recent = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, 'Latest postings'), h('a', { class: 'btn btn-ghost btn-sm', href: '#/transactions' }, 'View all')),
    d.recent.length ? h('div', { class: 'mini-list', style: 'padding:0 32px' }, ...d.recent.map((r) => h('div', { class: 'mini-account' },
      h('div', null, h('div', null, r.holders), h('div', { class: 'sub mono' }, r.account_number)),
      h('div', { class: 'right' }, h('div', { class: 'num' }, money(r.amount)), h('div', { class: 'sub' }, `${fmtDate(r.transaction_date)}`), badge(r.transaction_type)))))
      : emptyState('No postings yet', 'Transactions will appear here.'));

  const maxDep = Math.max(1, ...d.branches.map((b) => Number(b.total_deposits)));
  const branchCards = d.branches.map((b) => h('article', { class: 'branch-card' },
    h('div', { class: 'branch-head' }, h('div', null, h('h3', null, b.branch_name), h('div', { class: 'city' }, `${b.city}, managed by ${b.branch_manager}`)), h('span', { class: 'tile-ico' }, icon('bank'))),
    h('div', null, h('div', { class: 'figure' }, money0(b.total_deposits)),
      h('div', { class: 'progress', style: 'margin-top:8px', 'aria-hidden': 'true' }, h('i', { style: `width:${(Number(b.total_deposits) / maxDep) * 100}%` }))),
    h('dl', { class: 'branch-stats' },
      h('div', null, h('dt', null, 'Accounts'), h('dd', null, b.accounts)),
      h('div', null, h('dt', null, 'Average'), h('dd', null, compactMoney(b.avg_balance))),
      h('div', null, h('dt', null, 'Restricted'), h('dd', null, b.inactive_accounts)))));

  page.replaceChildren(hero,
    h('div', { class: 'page overlap' }, tiles,
      sectionTitle('Activity', 'I'),
      h('div', { class: 'dash-grid' }, chartCard, recent),
      sectionTitle('Branches', 'II'),
      h('div', { class: 'grid cols-4' }, ...branchCards)));
}
