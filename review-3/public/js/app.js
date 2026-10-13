import { api, setUnauthorizedHandler } from './api.js';
import { h, clear, icon, initials, toast, cap, crest, stagger, currentTheme, setTheme } from './ui.js';

const ROUTES = [
  { path: 'dashboard',    label: 'Dashboard',    perm: 'dashboard:view',   load: () => import('./pages/dashboard.js') },
  { path: 'customers',    label: 'Customers',    perm: 'customers:view',   load: () => import('./pages/customers.js') },
  { path: 'accounts',     label: 'Accounts',     perm: 'accounts:view',    load: () => import('./pages/accounts.js') },
  { path: 'transactions', label: 'Transactions', perm: 'transactions:recent', load: () => import('./pages/transactions.js') },
  { path: 'transfers',    label: 'Transfers',    perm: 'transfers:view',   load: () => import('./pages/transfers.js') },
  { path: 'statements',   label: 'Statements',   perm: 'statements:view',  load: () => import('./pages/statements.js') },
  { path: 'loans',        label: 'Loans',        perm: 'loans:view',       load: () => import('./pages/loans.js') },
  { path: 'rules',        label: 'Rule Tester',  perm: 'ruletester:run',   load: () => import('./pages/ruletester.js') },
];

export const session = { user: null, can: (p) => Boolean(session.user && session.user.permissions.includes(p)) };
const view = document.getElementById('view');
const topbar = document.getElementById('topbar');
let renderToken = 0;

export const go = (path) => { location.hash = `#/${path}`; };

function renderTopbar(current) {
  clear(topbar);
  const links = ROUTES.filter((r) => session.can(r.perm));
  const nav = h('nav', { class: 'nav', id: 'main-nav', 'aria-label': 'Main' },
    ...links.map((r) => h('a', { href: `#/${r.path}`, class: r.path === current ? 'active' : '', 'aria-current': r.path === current ? 'page' : null, onClick: () => nav.classList.remove('open') }, r.label)));
  const toggle = h('button', { class: 'icon-btn menu-toggle', 'aria-label': 'Menu', 'aria-controls': 'main-nav', 'aria-expanded': 'false',
    onClick: () => { const o = nav.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(o)); } }, icon('menu'));
  const themeBtn = h('button', { class: 'icon-btn', type: 'button' });
  const paintTheme = () => {
    const dark = currentTheme() === 'dark';
    themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon'));
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    themeBtn.title = themeBtn.getAttribute('aria-label');
  };
  themeBtn.addEventListener('click', () => { setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); paintTheme(); });
  paintTheme();
  topbar.append(
    h('a', { class: 'brand', href: '#/dashboard', 'aria-label': 'Woxsen Co-operative Bank, home' },
      crest(),
      h('span', null, h('span', { class: 'wordmark' }, 'Woxsen Co-operative Bank'), h('small', null, 'Est. 2026'))),
    nav, toggle,
    h('div', { class: 'user-box' }, themeBtn,
      h('div', { class: 'user-chip' }, h('span', { class: 'avatar' }, initials(session.user.name)), h('div', null, h('b', null, session.user.name), h('span', null, cap(session.user.role)))),
      h('button', { class: 'icon-btn', title: 'Sign out', 'aria-label': 'Sign out', onClick: logout }, icon('logout'))));
  topbar.hidden = false;
}

async function logout() {
  try { await api.post('/auth/logout'); } catch (_) { /* cookie may already be gone */ }
  session.user = null;
  topbar.hidden = true;
  go('login');
}

async function route() {
  const token = ++renderToken;
  const path = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'dashboard';
  document.querySelectorAll('dialog.modal[open]').forEach((d) => d.close());

  if (!session.user) {
    try { session.user = (await api.get('/auth/me')).user; } catch (_) { /* not signed in */ }
  }
  if (token !== renderToken) return;

  if (path === 'login' || !session.user) {
    if (session.user && path === 'login') return go('dashboard');
    topbar.hidden = true;
    if (path !== 'login') return go('login');
    const mod = await import('./pages/login.js');
    clear(view).append(mod.render({ onSuccess: (user) => { session.user = user; go('dashboard'); } }));
    document.title = 'Sign in · Woxsen Co-operative Bank';
    return;
  }

  const r = ROUTES.find((x) => x.path === path);
  if (!r) return go('dashboard');
  renderTopbar(r.path);
  if (!session.can(r.perm)) {
    clear(view).append(h('div', { class: 'page' }, h('div', { class: 'alert error' }, icon('lock'), 'Your role does not have access to this page.')));
    return;
  }
  document.title = `${r.label} · Woxsen Co-operative Bank`;

  const page = h('div', { class: 'page' });
  clear(view).append(page);
  window.scrollTo({ top: 0 });
  try {
    const mod = await r.load();
    if (token !== renderToken) return;
    await mod.render(page, { session, go, isCurrent: () => token === renderToken });
    if (token === renderToken) stagger(page);
  } catch (err) {
    if (token !== renderToken) return;
    clear(page).append(h('div', { class: 'alert error', role: 'alert' }, icon('alert'), `Could not load this page: ${err.message}`));
  }
  view.focus({ preventScroll: true });
}

setUnauthorizedHandler(() => {
  if (!session.user) return;
  session.user = null;
  topbar.hidden = true;
  toast('Please sign in again.', { type: 'info', title: 'Session ended' });
  go('login');
});
window.addEventListener('hashchange', route);
route();
