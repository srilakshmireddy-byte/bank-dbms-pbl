import { api } from '../api.js';
import { h, field, validateForm, formData, withBusy, cap, crest } from '../ui.js';

export function render({ onSuccess }) {
  const error = h('div', { class: 'alert error', role: 'alert', hidden: true });
  const user = field({ label: 'Username', name: 'username', required: true, attrs: { autocomplete: 'username', autofocus: true } });
  const pass = field({ label: 'Password', name: 'password', type: 'password', required: true, attrs: { autocomplete: 'current-password' } });
  const btn = h('button', { class: 'btn btn-primary', type: 'submit', style: 'width:100%;min-height:52px' }, 'Sign in');
  const demo = h('div', { hidden: true });

  const form = h('form', { class: 'form', novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    error.hidden = true;
    if (!validateForm(form)) return;
    await withBusy(btn, async () => {
      try {
        const { user: u } = await api.post('/auth/login', formData(form));
        onSuccess(u);
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      }
    });
  } }, error, user, pass, btn);

  api.get('/auth/demo').then(({ accounts }) => {
    if (!accounts.length) return;
    demo.hidden = false;
    demo.className = 'demo-box';
    demo.append(h('small', null, 'Demo logins'),
      h('div', { class: 'chips' }, ...accounts.map((a) => h('button', { type: 'button', class: 'chip', onClick: () => {
        form.elements.username.value = a.username; form.elements.password.value = a.password; form.elements.password.focus();
      } }, `${cap(a.role)}`))));
  }).catch(() => {});

  const name = 'Woxsen Co-operative Bank';
  const word = h('div', { class: 'login-word', 'aria-label': name }, ...[...name].map((c, i) => h('span', { class: 'ch', style: `--c:${i}`, 'aria-hidden': 'true' }, c)));
  return h('div', { class: 'login' },
    h('section', { class: 'login-art' },
      h('div', null, crest('crest login-crest'), word, h('span', { class: 'login-word-rule', 'aria-hidden': 'true' }), h('div', { class: 'login-est' }, 'Est. 2026')),
      h('h2', null, 'Every rupee, ', h('em', null, 'accounted for.')),
      h('div', { class: 'foot' }, 'Bank Account and Transaction Management System')),
    h('section', { class: 'login-form-side' },
      h('div', { class: 'login-card' },
        h('div', null, h('h1', null, 'Staff sign in'), h('p', { class: 'lede' }, 'Use the credentials issued by your branch.')),
        form, demo)));
}
