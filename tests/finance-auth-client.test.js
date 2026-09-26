// Browser side of Finance sign-in: the token goes on every /api call (including
// the direct fetch() call sites), renewed tokens are picked up from responses,
// and an ended session opens ONE PIN prompt over the page and retries the
// request exactly once — so a save is never lost and never doubled.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Minimal DOM: enough for app.js to load and for the PIN prompt to be driven.
const appended = [];
function makeElement(tag = 'div') {
  const children = new Map();
  const el = {
    tagName: tag, style: {}, innerHTML: '', textContent: '', value: '', disabled: false, files: [], id: '', className: '',
    _handlers: {},
    appendChild(c) { appended.push(c); }, insertBefore() {}, remove() { el._removed = true; },
    addEventListener(type, fn) { (el._handlers[type] ||= []).push(fn); },
    fire(type, ev = {}) { for (const fn of el._handlers[type] || []) fn(ev); },
    setAttribute() {}, getAttribute() { return null; },
    querySelector(sel) { if (!children.has(sel)) children.set(sel, makeElement()); return children.get(sel); },
    querySelectorAll() { return []; }, closest() { return null; }, focus() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
  return el;
}
const documentStub = {
  readyState: 'complete', body: makeElement('body'),
  getElementById(id) { return appended.find(e => e.id === id && !e._removed) || null; },
  createElement: makeElement, addEventListener() {}, querySelector() { return null; },
};
const store = new Map();
globalThis.document = documentStub;
globalThis.window = { document: documentStub, location: { pathname: '/' }, addEventListener() {} };
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }, configurable: true });
Object.defineProperty(globalThis, 'history', { value: { replaceState() {} }, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });

await import(new URL(`../src/js/app.js?auth-client-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;

function jsonResponse(status, data, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method || 'GET', headers: { ...(init.headers || {}) }, body: init.body };
    calls.push(call);
    return handler(call, calls);
  };
  return calls;
}
const flush = () => new Promise(r => setTimeout(r, 0));
async function waitFor(cond, ms = 2000) {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await flush(); }
}
const signIn = (token = 'fin1.old.sig') => App._setTestUser({ id: 'u3', name: 'Accountant', role: 'accountant', token });
const openPrompt = () => appended.find(e => e.id === 'reauthOverlay' && !e._removed);

test('every apiFetch call sends the Bearer token', async () => {
  signIn('fin1.tok.sig');
  const calls = mockFetch(() => jsonResponse(200, []));
  await App._apiFetch('audit');
  await App._apiFetch('audit', 'POST', { type: 'x' });
  assert.equal(calls.length, 2);
  for (const c of calls) assert.equal(c.headers.Authorization, 'Bearer fin1.tok.sig');
});

test('the direct fetch() call sites use authFetch, which sends the token too', async () => {
  const src = await readFile(new URL('../src/js/app.js', import.meta.url), 'utf8');
  const direct = [...src.matchAll(/\bfetch\(\s*['"`]\/api\/([^'"`]*)/g)].map(m => m[1]);
  // '' is _apiFetchOnce's fetch('/api/'+path), which adds Auth.headers() (test above);
  // 'auth/login' is the PIN prompt itself. Nothing else calls /api directly.
  assert.deepEqual(direct, ['auth/login', '']);
  assert.equal([...src.matchAll(/authFetch\('\/api\//g)].length, 6, 'the six former direct calls');
  signIn('fin1.direct.sig');
  const calls = mockFetch(() => jsonResponse(200, { ok: true }));
  await App._authFetch('/api/cash-transactions/c1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(calls[0].headers.Authorization, 'Bearer fin1.direct.sig');
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
});

test('a renewed token in X-Finance-Token replaces the stored one (12-hour re-check, no extra request)', async () => {
  signIn('fin1.old.sig');
  const calls = mockFetch(() => jsonResponse(200, [], { 'X-Finance-Token': 'fin1.new.sig' }));
  await App._apiFetch('notifications');
  assert.equal(calls.length, 1);
  assert.equal(App._getTestUser().token, 'fin1.new.sig');
  assert.equal(JSON.parse(store.get('rccgSession')).token, 'fin1.new.sig', 'survives a reload');
});

test('ended session on a save: one PIN prompt over the page, then the save is retried exactly once', async () => {
  signIn('fin1.expired.sig');
  let saves = 0;
  const calls = mockFetch((c) => {
    if (c.url === '/api/auth/login') {
      const b = JSON.parse(c.body);
      assert.deepEqual([b.role, b.userId, b.pin], ['accountant', 'u3', '2222'], 'same user re-enters their PIN');
      return jsonResponse(200, { id: 'u3', name: 'Accountant', role: 'accountant', token: 'fin1.fresh.sig' });
    }
    if (c.url === '/api/income' && c.method === 'POST') {
      saves++;
      if (c.headers.Authorization !== 'Bearer fin1.fresh.sig') return jsonResponse(401, { error: 'Your sign-in has expired.', code: 'reauth' });
      return jsonResponse(200, { id: 'INC1' });
    }
    return jsonResponse(404, {});
  });
  const pending = App._apiFetch('income', 'POST', { date: '2026-09-27', membersTithe: 1000 });
  await waitFor(() => openPrompt());
  const o = openPrompt();
  o.querySelector('#reauthPin').value = '2222';
  o.querySelector('#reauthGo').fire('click');
  const result = await pending;
  assert.deepEqual(result, { id: 'INC1' });
  assert.equal(saves, 2, 'first attempt was refused by the server, the retry saved — exactly one record');
  assert.equal(calls.filter(c => c.url === '/api/auth/login').length, 1);
  assert.equal(App._getTestUser().token, 'fin1.fresh.sig');
  assert.ok(!openPrompt(), 'prompt closed');
});

test('a wrong PIN in the prompt keeps it open; parallel requests share one prompt', async () => {
  signIn('fin1.expired.sig');
  let logins = 0;
  mockFetch((c) => {
    if (c.url === '/api/auth/login') {
      logins++;
      const b = JSON.parse(c.body);
      if (b.pin !== '2222') return jsonResponse(401, { error: 'Invalid credentials' });
      return jsonResponse(200, { id: 'u3', role: 'accountant', token: 'fin1.fresh2.sig' });
    }
    if (c.headers.Authorization !== 'Bearer fin1.fresh2.sig') return jsonResponse(401, { error: 'x', code: 'reauth' });
    return jsonResponse(200, []);
  });
  const a = App._apiFetch('petty');
  const b = App._apiFetch('remittances');
  await waitFor(() => openPrompt());
  assert.equal(appended.filter(e => e.id === 'reauthOverlay' && !e._removed).length, 1, 'one prompt');
  const o = openPrompt();
  o.querySelector('#reauthPin').value = '0000';
  o.querySelector('#reauthGo').fire('click');
  await waitFor(() => logins === 1 && o.querySelector('#reauthError').style.display === 'block');
  assert.match(o.querySelector('#reauthError').textContent, /Incorrect PIN/);
  assert.ok(!o._removed, 'still open');
  o.querySelector('#reauthPin').value = '2222';
  o.querySelector('#reauthGo').fire('click');
  assert.deepEqual(await Promise.all([a, b]), [[], []]);
});

test('cancelling the prompt leaves the save unsent-but-safe: a clear error, no second attempt', async () => {
  signIn('fin1.expired.sig');
  let saves = 0;
  mockFetch((c) => { if (c.url === '/api/expenses') saves++; return jsonResponse(401, { error: 'x', code: 'reauth' }); });
  const pending = App._apiFetch('expenses', 'POST', { amount: 5 });
  await waitFor(() => openPrompt());
  openPrompt().querySelector('#reauthCancel').fire('click');
  await assert.rejects(pending, /Not saved — please sign in again.*still on the form/);
  assert.equal(saves, 1);
});

test('if the retry is refused again, there is no loop: exactly one prompt and one retry', async () => {
  signIn('fin1.expired.sig');
  let saves = 0, prompts = 0;
  mockFetch((c) => {
    if (c.url === '/api/auth/login') return jsonResponse(200, { id: 'u3', role: 'accountant', token: 'fin1.still-bad.sig' });
    saves++;
    return jsonResponse(401, { error: 'x', code: 'reauth' });
  });
  const pending = App._apiFetch('cash-transactions', 'POST', { amount: 5 });
  await waitFor(() => openPrompt());
  prompts++;
  openPrompt().querySelector('#reauthPin').value = '2222';
  openPrompt().querySelector('#reauthGo').fire('click');
  await assert.rejects(pending, /Not saved/);
  assert.equal(saves, 2);
  assert.equal(prompts, 1);
});

test('a wrong PIN on the login form itself never opens the prompt', async () => {
  App._setTestUser(null);
  mockFetch(() => jsonResponse(401, { error: 'Invalid credentials' }));
  await assert.rejects(App._apiFetch('auth/login', 'POST', { role: 'pastor', pin: '1' }), /Invalid credentials/);
  assert.ok(!openPrompt());
});

test('a readable message reaches an old cached app: the 401 text says to reload and enter the PIN', async () => {
  // The old app shows data.error verbatim; the server's message is asserted in finance-auth.test.js.
  signIn('');
  App._Auth.reauth = async () => false;   // e.g. user cancels
  mockFetch(() => jsonResponse(401, { error: 'Please sign in again: the app was updated for security. Reload the page and enter your PIN.', code: 'auth_required' }));
  await assert.rejects(App._apiFetch('income'), /sign in again/i);
});

test('an API error keeps the server\'s code and status, so callers need not match on the message text', async () => {
  signIn('fin1.tok.sig');
  mockFetch(() => jsonResponse(409, { error: 'The Monthly report is locked because week 5\'s Sunday collection has been saved.', code: 'further_locked' }));
  await assert.rejects(App._apiFetch('attendance-further/2026-09-27', 'PUT', { data: {} }), e => {
    assert.equal(e.code, 'further_locked');
    assert.equal(e.status, 409);
    assert.match(e.message, /Monthly report is locked/);
    return true;
  });
  const src = await readFile(new URL('../src/js/app.js', import.meta.url), 'utf8');
  const flush = src.slice(src.indexOf('async function attFurtherFlush'), src.indexOf('// ── Editor events ──'));
  assert.match(flush, /e\?\.code==='further_locked'/);
  assert.doesNotMatch(flush, /\/locked\/i/, 'no longer detects the lock by matching the message');
});
