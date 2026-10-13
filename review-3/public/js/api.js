// Thin fetch wrapper. Every failure becomes an ApiError whose message is what the server (and so MySQL) said.
export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data || {}; }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(method, url, body) {
  if (window.__DEMO__) {
    // GitHub Pages demo: the same API answered inside the page (see demo.js); never set on the real server.
    const { demoRequest } = await import('./demo.js');
    try {
      return await demoRequest(method, url, body);
    } catch (err) {
      if (err.status === 401 && !url.startsWith('/auth/login')) onUnauthorized();
      throw err;
    }
  }
  let res;
  try {
    res = await fetch('/api' + url, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch (_) {
    throw new ApiError('Cannot reach the server. Is it running?', 0);
  }
  let data = null;
  try { data = await res.json(); } catch (_) { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/login')) onUnauthorized();
    throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

const qs = (params = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? '?' + s : '';
};

export const api = {
  get: (url, params) => request('GET', url + qs(params)),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  patch: (url, body = {}) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
};
