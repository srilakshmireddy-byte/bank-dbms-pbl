import { api } from '../api.js';
import { h, sectionTitle, icon, money, field, withBusy, accountOption, pageHead, errorBox, AMOUNT_PATTERN } from '../ui.js';

export async function render(page) {
  const [{ rows: accounts }, scenarios] = await Promise.all([api.get('/accounts', { limit: 500 }), api.get('/rule-tests/scenarios')]);
  const byStatus = (s) => accounts.find((a) => a.status === s);
  const active = accounts.filter((a) => a.status === 'ACTIVE');
  const richest = active[0] || accounts[0];
  const defaults = {
    overdraw: { account: active.find((a) => a.account_id === 3) || richest, amount: (a) => String(Math.ceil(Number(a.balance) * 10)) },
    frozen: { account: byStatus('FROZEN') || richest, amount: () => '100' },
    negative: { account: richest, amount: () => '-500' },
    zero: { account: richest, amount: () => '0' },
    closed: { account: byStatus('CLOSED') || richest, amount: () => '100' },
    same_account: { account: richest, amount: () => '100' },
    unbalanced: { account: richest, amount: () => '100' },
  };
  const MAIN = ['overdraw', 'frozen', 'negative'];
  const runners = [];

  function card(sc, n) {
    const d = defaults[sc.key];
    const acctF = field({ label: sc.key === 'unbalanced' ? 'Debit account' : 'Account', name: 'account_id', type: 'select', value: d.account.account_id, options: accounts.map(accountOption) });
    const needsAmt = sc.needs.includes('amount');
    const amtF = needsAmt ? field({ label: 'Amount', name: 'amount', prefix: '₹', pattern: AMOUNT_PATTERN, value: d.amount(d.account), attrs: { inputmode: 'decimal' } }) : null;
    const toF = sc.needs.includes('to_account_id') ? field({ label: 'Credit account', name: 'to_account_id', type: 'select', value: (accounts.find((a) => a.account_id !== d.account.account_id) || d.account).account_id, options: accounts.map(accountOption) }) : null;
    const result = h('div');
    const btn = h('button', { class: 'btn btn-dark', type: 'button' }, icon('play'), 'Run test');
    const run = () => withBusy(btn, async () => {
      const body = { account_id: acctF.querySelector('select').value, amount: amtF ? amtF.querySelector('input').value : undefined, to_account_id: toF ? toF.querySelector('select').value : undefined };
      try {
        const r = await api.post(`/rule-tests/${sc.key}`, body);
        result.replaceChildren(h('div', { class: `verdict ${r.rejected ? 'rejected' : 'accepted'}` },
          h('div', { class: 'v-title' }, icon(r.rejected ? 'shield' : 'alert'), r.rejected ? 'Rejected by the database' : 'Database accepted this (rolled back)'),
          r.rejected ? h('div', { class: 'v-msg' }, r.message) : h('div', { class: 'v-msg' }, 'No rule was violated with these inputs.'),
          r.rejected ? h('div', { class: 'codes' }, h('span', null, `SQLSTATE ${r.sqlState}`), h('span', null, `errno ${r.errno}`)) : null,
          h('pre', { class: 'sql' }, r.sql), h('div', { class: 'v-note' }, 'Run inside a transaction that was rolled back. No data changed.')));
        return r.rejected;
      } catch (e) { result.replaceChildren(errorBox(e)); return false; }
    });
    btn.addEventListener('click', run);
    runners.push({ key: sc.key, run: () => run() });
    return h('article', { class: 'card rule-card' }, h('h3', null, h('span', { class: 'rule-num' }, n), sc.title), h('p', { class: 'muted' }, `Rule: ${sc.rule}`),
      h('div', { class: 'form-grid' }, acctF, toF, amtF), h('div', null, btn), result);
  }

  const score = h('div', { hidden: true, class: 'score' });
  const all = h('button', { class: 'btn btn-primary' }, icon('play'), 'Run all tests');
  all.addEventListener('click', () => withBusy(all, async () => {
    const res = [];
    for (const r of runners) res.push(await r.run());
    const ok = res.filter(Boolean).length;
    score.hidden = false; score.replaceChildren(icon('shield'), h('b', null, `${ok} of ${res.length}`), h('span', null, ok === res.length ? 'rules enforced by the database. Every illegal operation was refused.' : 'rules enforced by the database.'));
  }));

  const main = scenarios.filter((s) => MAIN.includes(s.key)), more = scenarios.filter((s) => !MAIN.includes(s.key));
  page.append(pageHead('Rule Tester', 'Try to break the bank. Each test attempts an illegal operation straight against MySQL (triggers and procedures) inside a transaction that is always rolled back, and shows the database\'s own refusal.', all),
    score, h('div', { class: 'grid cols-3', style: 'margin-top:24px' }, ...main.map((s, i) => card(s, i + 1))),
    sectionTitle('More rules'), h('div', { class: 'grid cols-2' }, ...more.map((s, i) => card(s, i + 4))));
}
