// DOM helpers. Text is always inserted as text nodes (never innerHTML), so data from the database cannot inject markup.
const SVG_NS = 'http://www.w3.org/2000/svg';
const PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'readOnly', 'indeterminate']);

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  applyProps(el, props);
  append(el, kids);
  return el;
}
export function s(tag, props, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  append(el, kids);
  return el;
}
function applyProps(el, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

// ---------- icons (24x24 stroke) ----------
const ICONS = {
  home: 'M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  card: 'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM2 10h20M6 15h4',
  swap: 'M17 3l4 4-4 4M21 7H7M7 21l-4-4 4-4M3 17h14',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  coins: 'M12 3a8 4 0 1 0 0 8 8 4 0 0 0 0-8zM4 7v5c0 2.2 3.6 4 8 4s8-1.8 8-4V7M4 12v5c0 2.2 3.6 4 8 4s8-1.8 8-4v-5',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  print: 'M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  lock: 'M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  bank: 'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18',
  trend: 'M3 17l6-6 4 4 8-9M15 6h6v6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  play: 'M7 4l13 8-13 8z',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
};
export function icon(name) {
  return s('svg', { class: 'icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d: ICONS[name] || ICONS.info }));
}

// ---------- formatting ----------
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const money = (v) => inr.format(Number(v) || 0);
export const money0 = (v) => inr0.format(Number(v) || 0);
export function compactMoney(v) {
  const n = Math.abs(Number(v) || 0), sign = Number(v) < 0 ? '-' : '';
  if (n >= 1e7) return `${sign}₹${+(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `${sign}₹${+(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `${sign}₹${+(n / 1e3).toFixed(1)}K`;
  return `${sign}₹${n}`;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 'YYYY-MM-DD[ HH:MM:SS]' -> '09 Oct 2026[, 13:45]' without touching timezones. */
export function fmtDate(v, withTime = false) {
  if (!v) return '-';
  const [d, t] = String(v).split(/[ T]/);
  const [y, m, day] = d.split('-');
  const base = `${day} ${MONTHS[Number(m) - 1]} ${y}`;
  return withTime && t ? `${base}, ${t.slice(0, 5)}` : base;
}
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const cap = (str) => String(str).toLowerCase().replace(/_/g, ' ').replace(/^\w|\s\w/g, (c) => c.toUpperCase());
export const initials = (name) => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
export const groupNumber = (n) => String(n).replace(/(.{4})/g, '$1 ').trim();

const BADGE = {
  ACTIVE: 'green', PAID: 'green', DEPOSIT: 'green', TRANSFER_CREDIT: 'green', LOAN_DISBURSEMENT: 'green', APPLIED: 'green',
  WITHDRAWAL: 'red', OVERDUE: 'red', DEFAULTED: 'red', TRANSFER_DEBIT: 'blue', LOAN_REPAYMENT: 'navy',
  FROZEN: 'blue', DORMANT: 'amber', PENDING: 'amber', SERVICE_CHARGE: 'amber', CLOSED: 'plain', INTERNAL: 'blue', EXTERNAL: 'plain',
};
export function badge(value, label) {
  const kind = BADGE[value] || '';
  return h('span', { class: `badge ${kind}`.trim() }, label ?? cap(value));
}

// ---------- toasts ----------
export function toast(message, { type = 'info', title, timeout } = {}) {
  const root = document.getElementById('toasts');
  const icons = { success: 'check', error: 'x', info: 'info' };
  const el = h('div', { class: `toast ${type}`, role: type === 'error' ? 'alert' : 'status' },
    h('span', { class: 't-ico' }, icon(icons[type] || 'info')),
    h('div', null, h('b', null, title || { success: 'Done', error: 'Rejected', info: 'Notice' }[type]), h('p', null, message)),
    h('button', { 'aria-label': 'Dismiss', onClick: () => dismiss() }, icon('x')));
  let timer;
  function dismiss() { clearTimeout(timer); el.classList.add('out'); setTimeout(() => el.remove(), 260); }
  timer = setTimeout(dismiss, timeout ?? (type === 'error' ? 8000 : 4500));
  root.append(el);
  while (root.children.length > 4) root.firstChild.remove();
}

// ---------- modal (native <dialog>: focus trap + Esc for free) ----------
export function openModal({ title, body, footer, wide = false, onClose }) {
  const dlg = h('dialog', { class: `modal${wide ? ' wide' : ''}`, 'aria-label': title });
  const close = () => { if (dlg.open) dlg.close(); };
  // append() would turn a null into the text "null", so only pass real nodes.
  dlg.append(...[
    h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { class: 'modal-close', 'aria-label': 'Close', type: 'button', onClick: close }, icon('x'))),
    h('div', { class: 'modal-body' }, body),
    footer ? h('div', { class: 'modal-foot' }, footer) : null].filter(Boolean));
  dlg.addEventListener('close', () => { dlg.remove(); onClose && onClose(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  dlg.showModal();
  return { el: dlg, close, body: dlg.querySelector('.modal-body'), setFooter(nodes) { let f = dlg.querySelector('.modal-foot'); if (!f) { f = h('div', { class: 'modal-foot' }); dlg.append(f); } clear(f).append(...[].concat(nodes).filter(Boolean)); } };
}

// ---------- buttons with a loading state ----------
export async function withBusy(btn, fn) {
  if (btn.getAttribute('aria-busy') === 'true') return;
  btn.setAttribute('aria-busy', 'true');
  try { return await fn(); } finally { btn.removeAttribute('aria-busy'); }
}

// ---------- form fields + validation ----------
/**
 * field({label, name, type, required, options, ...}) -> <div class="field">
 * Validation is shape-only (required / format). Business rules such as "amount must be positive" are
 * deliberately left to the database so its own message is what the user sees.
 */
export function field({ label, name, type = 'text', required = false, options, value = '', placeholder, hint, full, pattern, patternMessage, prefix, attrs = {}, id }) {
  const fid = id || `f-${name}-${Math.random().toString(36).slice(2, 7)}`;
  let control;
  if (type === 'select') {
    control = h('select', { class: 'select', name, id: fid, required, ...attrs },
      ...(options || []).map((o) => h('option', { value: o.value, selected: String(o.value) === String(value), disabled: o.disabled }, o.label)));
  } else if (type === 'textarea') {
    control = h('textarea', { class: 'textarea input', name, id: fid, required, rows: 3, placeholder, ...attrs }, value);
  } else {
    control = h('input', { class: 'input', name, id: fid, type, required, value, placeholder, pattern, autocomplete: 'off', ...attrs });
  }
  if (patternMessage) control.dataset.patternMessage = patternMessage;
  const wrap = h('div', { class: `field${full ? ' full' : ''}` },
    h('label', { for: fid }, label, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, '*') : null),
    prefix ? h('div', { class: 'input-affix' }, h('span', null, prefix), control) : control,
    hint ? h('div', { class: 'hint' }, hint) : null,
    h('div', { class: 'field-error', role: 'alert' }));
  control.addEventListener('input', () => setFieldError(control, ''));
  control.addEventListener('change', () => setFieldError(control, ''));
  return wrap;
}
function setFieldError(control, msg) {
  const f = control.closest('.field');
  if (!f) return;
  f.classList.toggle('invalid', Boolean(msg));
  f.querySelector('.field-error').textContent = msg;
  control.setAttribute('aria-invalid', msg ? 'true' : 'false');
}
/** Returns true when the form's controls are valid; otherwise marks each bad field and focuses the first. */
export function validateForm(form) {
  let first = null;
  for (const c of form.querySelectorAll('input, select, textarea')) {
    if (c.disabled || !c.name) continue;
    let msg = '';
    if (c.required && !String(c.value).trim()) msg = 'This field is required';
    else if (c.value && c.pattern && !new RegExp(`^(?:${c.pattern})$`).test(c.value.trim())) msg = c.dataset.patternMessage || 'Check the format';
    else if (c.type === 'email' && c.value && !c.checkValidity()) msg = 'Enter a valid email address';
    setFieldError(c, msg);
    if (msg && !first) first = c;
  }
  if (first) first.focus();
  return !first;
}
export const formData = (form) => Object.fromEntries(new FormData(form).entries());
export const AMOUNT_PATTERN = '-?\\d{1,13}(\\.\\d{1,2})?';
export const AMOUNT_MSG = 'Enter an amount in rupees, up to 2 decimals';

// ---------- tables ----------
export function skeletonRows(cols, rows = 5) {
  return Array.from({ length: rows }, () => h('tr', null, ...Array.from({ length: cols }, () => h('td', null, h('div', { class: 'skel', style: 'height:16px' })))));
}
export function emptyState(title, text) { return h('div', { class: 'empty' }, h('b', null, title), text); }
export function pager({ page, limit, total }, go) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1, to = Math.min(total, page * limit);
  return h('div', { class: 'pager' },
    h('span', null, `Showing ${from}-${to} of ${total}`),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-ghost btn-sm', disabled: page <= 1, onClick: () => go(page - 1) }, 'Previous'),
      h('span', null, `Page ${page} of ${pages}`),
      h('button', { class: 'btn btn-ghost btn-sm', disabled: page >= pages, onClick: () => go(page + 1) }, 'Next')));
}
export function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function tabId() { return Math.random().toString(36).slice(2); }

export function accountOption(a) {
  return { value: a.account_id, label: `${a.account_number} · ${a.holders} · ${money0(a.balance)}${a.status !== 'ACTIVE' ? ` [${a.status}]` : ''}` };
}
export function pageHead(title, subtitle, ...actions) {
  return h('div', { class: 'page-head' },
    h('div', { class: 'head-top' }, h('h1', null, title), h('div', { class: 'row' }, ...actions)),
    subtitle ? h('p', null, subtitle) : null);
}
/** Engraved divider with a centred diamond; optional roman numeral, e.g. sectionTitle('Branches', 'III'). */
export function sectionTitle(label, roman) {
  return h('div', { class: 'section-title', role: 'heading', 'aria-level': '2' },
    h('span', null, roman ? h('span', { class: 'roman' }, `${roman}.`) : null, label));
}
export function errorBox(err) { return h('div', { class: 'alert error', role: 'alert' }, icon('alert'), err.message || String(err)); }

/** Query params that follow the route in the hash, e.g. #/statements?account=3 */
export const hashParams = () => new URLSearchParams(location.hash.split('?')[1] || '');

// ---------- heritage + motion helpers ----------
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The bank's "W" roundel. Drawn as strokes so the login page can draw it in. */
export function crest(cls = 'crest') {
  return s('svg', { class: cls, viewBox: '0 0 64 64', 'aria-hidden': 'true' },
    s('circle', { class: 'c-ring', cx: 32, cy: 32, r: 30, pathLength: 400 }),
    s('circle', { class: 'c-ring thin', cx: 32, cy: 32, r: 26, pathLength: 400 }),
    s('path', { class: 'c-w', d: 'M17 22 L24.5 44 L32 28 L39.5 44 L47 22', pathLength: 400 }),
    s('path', { class: 'c-gem', d: 'M32 11.5 L34 14 L32 16.5 L30 14 Z' }));
}

/** Ease-out count from 0 to `value`, writing format(n) into el. Instant when motion is reduced. */
export function countUp(el, value, format, duration = 1600) {
  const target = Number(value) || 0;
  if (reducedMotion() || target === 0) { el.textContent = format(target); return; }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 4);
    el.textContent = format(t === 1 ? target : target * eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  el.textContent = format(0);
  requestAnimationFrame(tick);
}

/** Staggered reveal (60ms steps) for the cards inside root. */
export function stagger(root, selector = '.card, .tile, .acard-wrap, .branch-card, .rule-card, .sheet, .score') {
  [...root.querySelectorAll(selector)].forEach((el, i) => {
    el.classList.remove('reveal');
    void el.offsetWidth;
    el.style.setProperty('--i', String(Math.min(i, 12)));
    el.classList.add('reveal');
  });
}

/** Subtle 3D tilt that follows the pointer, with a moving highlight. Fine pointers only. */
export function tilt(card) {
  if (reducedMotion() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return card;
  let frame = 0;
  card.addEventListener('pointermove', (e) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.classList.add('tilting');
      card.style.setProperty('--ry', `${(x - 0.5) * 9}deg`);
      card.style.setProperty('--rx', `${(0.5 - y) * 7}deg`);
      card.style.setProperty('--mx', `${x * 100}%`);
      card.style.setProperty('--my', `${y * 100}%`);
    });
  });
  card.addEventListener('pointerleave', () => {
    cancelAnimationFrame(frame);
    card.classList.remove('tilting');
    ['--rx', '--ry'].forEach((v) => card.style.setProperty(v, '0deg'));
    card.style.setProperty('--mx', '70%'); card.style.setProperty('--my', '0%');
  });
  return card;
}

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// ---------- theme (light / dark), remembered per browser ----------
const THEME_KEY = 'wcb-theme';
export function currentTheme() { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0B0B0C' : '#FAF7F0');
  try { localStorage.setItem(THEME_KEY, theme); } catch (_) { /* storage unavailable: theme still applies for this visit */ }
}

/** Stat tile shared by the dashboard and the loan desk: label + icon, the figure (counted up), one line of context. */
export function statTile({ label, value, format = (n) => Math.round(n).toLocaleString('en-IN'), sub, ico, alert = false }) {
  const val = h('div', { class: 'tile-value' });
  countUp(val, value, format);
  return h('div', { class: `tile${alert ? ' is-alert' : ''}` },
    h('div', { class: 'tile-top' }, h('div', { class: 'tile-label' }, label), ico ? h('span', { class: 'tile-ico' }, icon(ico)) : null),
    val, h('div', { class: 'tile-sub' }, sub));
}
