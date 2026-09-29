// Clerk box (parishes-20261003): with SAT_PARISH set, the box's own scripts (compute-remit.js, att-fill.js) read a
// satellite parish's database: every request to the parish app gets X-Sat-Parish (the app honours it only with the
// read-only automation key). Loaded with NODE_OPTIONS=--require; does nothing when SAT_PARISH is not set.
'use strict';
const code = String(process.env.SAT_PARISH || '').trim();
if (/^\d{4,8}$/.test(code) && typeof globalThis.fetch === 'function') {
  const real = globalThis.fetch;
  const base = String(process.env.KP_BASE || 'https://rccg-kingdom-parish-app.pages.dev').replace(/\/+$/, '');
  globalThis.fetch = function satFetch(url, opts) {
    const u = typeof url === 'string' ? url : (url && url.url) || String(url || '');
    if (u.startsWith(base + '/api/')) {
      const o = { ...(opts || {}) };
      const h = new Headers(o.headers || {});
      h.set('X-Sat-Parish', code);
      o.headers = h;
      return real(url, o);
    }
    return real(url, opts);
  };
}
