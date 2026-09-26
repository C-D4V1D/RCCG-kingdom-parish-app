// Server-side sign-in for the Finance app: signed tokens, route groups, the
// 12-hour re-check, roles, the automation key, the login throttle, settings
// secrecy and init seeding. See FINANCE APP AUTH in functions/api/[[route]].js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, __authTesting } from '../functions/api/[[route]].js';
import { createSqliteD1, seedKpscSession, TEST_SESSION_HEADER } from './sqlite-d1.mjs';
import { FINANCE_AUTH_HEADER, TEST_SIGNING_KEY, TEST_AUTOMATION_KEY, financeToken } from './finance-auth-helper.mjs';

const readJson = async (res) => JSON.parse(await res.text());

function req(path, { method = 'GET', body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  return new Request(`https://x/api/${path}`, init);
}
const call = (DB, path, opts = {}, env = {}) => onRequest({ request: req(path, opts), env: { DB, ...env } });

async function freshDB() {
  const DB = createSqliteD1();
  const res = await call(DB, 'init', { headers: FINANCE_AUTH_HEADER });
  assert.equal(res.status, 200, 'init with a token works');
  return DB;
}
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
async function tokenFor(DB, uid, extra = {}) {
  const row = DB.sqlite.prepare(`SELECT id, role, pin FROM users WHERE id=?`).get(uid);
  return financeToken({ uid: row.id, role: row.role, storedPin: row.pin, ...extra });
}

// A DB that fails the test if any handler query runs — proves the middleware
// rejected the request before the route did anything.
function untouchableDB() {
  return {
    prepare(sql) {
      if (/app_secrets/.test(sql)) {
        const st = { bind() { return st; }, async all() { return { results: [] }; }, async first() { return null; }, async run() { return { success: true }; } };
        return st;
      }
      throw new Error(`handler ran without auth: ${sql.slice(0, 60)}`);
    },
  };
}

// ── 1. Every Finance route without a token → 401 ────────────────────
const FINANCE_ROUTES = [
  ['GET', 'init'], ['GET', 'users'], ['GET', 'income'], ['GET', 'expenses'], ['GET', 'expenses?full=1'],
  ['GET', 'budget?month=2026-09'], ['GET', 'budget/share?month=2026-09'], ['GET', 'expense-receipt/e1'],
  ['GET', 'petty'], ['GET', 'petty-config'], ['GET', 'remittances'], ['GET', 'satellite-funds'],
  ['GET', 'cash-transactions'], ['GET', 'cash-transactions?full=1'], ['GET', 'cash-photo/c1'], ['GET', 'audit'],
  ['GET', 'settings'], ['GET', 'settings/api-status'], ['GET', 'church-bank-ingest-log'], ['GET', 'bank-balance-snapshot'],
  ['GET', 'notifications'], ['GET', 'dashboard'],
  ['POST', 'users'], ['POST', 'change-pin'], ['POST', 'income'], ['POST', 'expenses'], ['POST', 'petty'],
  ['POST', 'petty-config'], ['POST', 'petty-recalc'], ['POST', 'remittances'], ['POST', 'satellite-funds'],
  ['POST', 'cash-transactions'], ['POST', 'verify-deposit'], ['POST', 'audit'], ['POST', 'settings'],
  ['POST', 'notifications'], ['POST', 'notifications/read'],
  ['POST', 'budget/generate'], ['POST', 'budget/accept'], ['POST', 'budget/save'], ['POST', 'budget/reopen'],
  ['POST', 'budget/share'], ['POST', 'budget/unshare'],
  ['PUT', 'users/u1'], ['PUT', 'income/i1'], ['PUT', 'expenses/e1'], ['PUT', 'petty/p1'], ['PUT', 'remittances/r1'], ['PUT', 'cash-transactions/c1'],
  ['DELETE', 'users/u1'], ['DELETE', 'income/i1'], ['DELETE', 'expenses/e1'], ['DELETE', 'petty/p1'],
  ['DELETE', 'remittances/r1'], ['DELETE', 'satellite-funds/s1'], ['DELETE', 'cash-transactions/c1'],
  // Attendance (#316) and Further Reports (#317): Finance routes like the rest.
  ['GET', 'attendance'], ['GET', 'attendance?from=2026-01-04&to=2026-01-31'], ['PUT', 'attendance/2026-01-11'],
  ['POST', 'attendance/2026-01-11/submit'], ['POST', 'attendance/2026-01-11/unlock'],
  ['GET', 'attendance-further?end=2026-01-31'], ['PUT', 'attendance-further/2026-01-31'],
  ['GET', 'some-future-route'], ['POST', 'some-future-route'],
];

test('every Finance route (and any unknown route) returns 401 without a token, before the handler runs', async () => {
  for (const [method, path] of FINANCE_ROUTES) {
    const res = await call(untouchableDB(), path, { method, body: method === 'GET' ? undefined : {} });
    const body = await readJson(res);
    assert.equal(res.status, 401, `${method} /api/${path}`);
    assert.equal(body.code, 'auth_required', `${method} /api/${path}`);
    assert.match(body.error, /sign in again/i, 'old cached app shows a readable message');
  }
});

test('a garbage / tampered / wrong-key / expired token is refused with code "reauth"', async () => {
  const good = await financeToken();
  const [h, p, s] = good.split('.');
  const tampered = `${h}.${p.slice(0, -2)}AA.${s}`;
  const wrongKey = await __authTesting.signFinanceToken('some-other-key', { uid: 'u1', role: 'it_admin', storedPin: 'x' });
  const expired = await financeToken({ exp: Math.floor(Date.now() / 1000) - 10 });
  for (const t of ['nonsense', 'fin1.a.b', tampered, wrongKey, expired]) {
    const res = await call(untouchableDB(), 'income', { headers: bearer(t) });
    assert.equal(res.status, 401);
    assert.equal((await readJson(res)).code, 'reauth');
  }
});

// ── 2. KPSC read endpoints are locked, public routes stay open ──────
test('the previously open KPSC read endpoints now need a KPSC session', async () => {
  const routes = ['kpsc-accounts', 'kpsc-partners', 'kpsc-partner-payments', 'kpsc-partner-payments-pending-card',
    'kpsc-finance', 'kpsc-email-ingest-log', 'kpsc-reminders', 'kpsc-dashboard', 'kpsc-projects', 'action-items'];
  for (const r of routes) {
    // A Finance token is not a KPSC session.
    const res = await call(untouchableDB(), r, { headers: FINANCE_AUTH_HEADER });
    assert.equal(res.status, 401, r);
    assert.equal((await readJson(res)).error, 'KPSC session required', `${r}: KPSC app's own session-expiry handling still recognises this`);
  }
  const DB = await freshDB();
  seedKpscSession(DB, { role: 'committee_viewer', name: 'Viewer' });
  const res = await call(DB, 'kpsc-accounts', { headers: { 'X-KPSC-Session': TEST_SESSION_HEADER } });
  assert.equal(res.status, 200, 'any signed-in KPSC account can read');
});

test('route groups: public allowlist, KPSC, shared and Finance', () => {
  const c = __authTesting.classifyApiRoute;
  const pub = [['auth', 'login', 'POST'], ['auth', 'options', 'GET'], ['kpsc-login-options', null, 'GET'], ['kpsc-login', null, 'POST'],
    ['kpsc-logout', null, 'POST'], ['kpsc-change-pin', null, 'POST'], ['kpsc-policy', null, 'GET'], ['kpsc-policy', 'summary', 'GET'],
    ['kpsc-public-minutes', 'tok', 'GET'], ['kpsc-finance-report', 'tok', 'GET'], ['report-share', null, 'POST'], ['report-share', 'tok', 'GET'],
    ['partnership-public', null, 'GET'], ['partnership-og-image', null, 'GET'], ['partnership-favicon', null, 'GET'],
    ['partnership-pledge', null, 'POST'], ['partnership-feedback', null, 'POST'], ['termii-webhook', null, 'POST'],
    ['internal', 'run-all', 'POST'], ['internal', 'ingest-bank-charge-email', 'POST']];
  for (const [r, p, m] of pub) assert.equal(c(r, p, m), 'public', `${m} ${r}/${p || ''}`);
  for (const [r, p, m] of [['report-share', null, 'GET'], ['kpsc-policy', 'versions', 'GET'], ['auth', 'refresh', 'POST'], ['partnership-feedback', null, 'GET']]) {
    assert.notEqual(c(r, p, m), 'public', `${m} ${r}/${p || ''} must not be public`);
  }
  for (const r of ['settings', 'church-bank-ingest-log', 'bank-balance-snapshot']) assert.equal(c(r, null, 'GET'), 'shared');
  for (const r of ['kpsc-accounts', 'action-items', 'ai-secretary-meetings', 'voice-identify', 'admin', 'remit-webhook-test', 'partnership-pledges']) {
    assert.equal(c(r, null, 'GET'), 'kpsc', r);
  }
  for (const r of ['income', 'users', 'init', 'dashboard', 'change-pin', 'attendance', 'attendance-further', 'brand-new-route']) assert.equal(c(r, null, 'GET'), 'finance', r);
});

test('public routes still work with no sign-in (report-share POST+GET, login options, policy summary)', async () => {
  const DB = await freshDB();
  const created = await call(DB, 'report-share', { method: 'POST', body: { type: 'statement', data: { title: 'Test' } } });
  assert.equal(created.status, 200, 'Church Clerk / Share buttons can still create links');
  const { token } = await readJson(created);
  assert.ok(token);
  const fetched = await call(DB, `report-share/${token}`);
  assert.equal(fetched.status, 200, 'share links still open');
  const opts = await readJson(await call(DB, 'auth/options'));
  assert.ok(opts.length >= 7);
  for (const o of opts) assert.deepEqual(Object.keys(o).sort(), ['id', 'name', 'role'], 'no emails on the public list');
  assert.equal((await call(DB, 'kpsc-login-options')).status, 200);
  assert.equal((await call(DB, 'kpsc-policy/summary')).status, 200);
  assert.equal((await call(DB, 'partnership-public')).status, 200);
});

// ── 3. Login issues a token; the 12-hour re-check ───────────────────
test('login returns a verifiable token; the token then opens Finance routes with no DB read for the check', async () => {
  const DB = await freshDB();
  const res = await call(DB, 'auth/login', { method: 'POST', body: { role: 'it_admin', pin: '0000' } });
  const user = await readJson(res);
  assert.equal(res.status, 200);
  assert.equal(user.id, 'u1');
  assert.equal(user.pin, undefined);
  const p = await __authTesting.verifyFinanceTokenSignature(TEST_SIGNING_KEY, user.token);
  assert.equal(p.uid, 'u1');
  assert.equal(p.role, 'it_admin');
  assert.ok(p.exp - p.iat >= 30 * 24 * 3600 - 5, '30-day session');
  const income = await call(DB, 'income', { headers: bearer(user.token) });
  assert.equal(income.status, 200);
  assert.equal(income.headers.get('X-Finance-Token'), null, 'no renewal needed for a fresh token');
});

test('after 12 hours the server re-checks the account once and renews the token in a response header', async () => {
  const DB = await freshDB();
  const old = Math.floor(Date.now() / 1000) - __authTesting.FIN_RECHECK_S - 60;
  const t = await tokenFor(DB, 'u3', { rv: old, iat: old });
  const res = await call(DB, 'income', { headers: bearer(t) });
  assert.equal(res.status, 200, 'the request itself still succeeds (no extra round trip)');
  const renewed = res.headers.get('X-Finance-Token');
  assert.ok(renewed);
  const p = await __authTesting.verifyFinanceTokenSignature(TEST_SIGNING_KEY, renewed);
  assert.ok(p.rv > old + 60);
  assert.equal(p.iat, old, 'original sign-in time kept');
  assert.ok(p.exp > Math.floor(Date.now() / 1000) + 29 * 24 * 3600, 'expiry slides forward 30 days');
});

test('the re-check ends the session when the PIN, role or user changed', async () => {
  const old = Math.floor(Date.now() / 1000) - __authTesting.FIN_RECHECK_S - 60;
  for (const change of ['pin', 'role', 'delete']) {
    const DB = await freshDB();
    const t = await tokenFor(DB, 'u3', { rv: old });
    if (change === 'pin') DB.sqlite.prepare(`UPDATE users SET pin='sha256$changed' WHERE id='u3'`).run();
    if (change === 'role') DB.sqlite.prepare(`UPDATE users SET role='viewer' WHERE id='u3'`).run();
    if (change === 'delete') DB.sqlite.prepare(`DELETE FROM users WHERE id='u3'`).run();
    const res = await call(DB, 'income', { headers: bearer(t) });
    assert.equal(res.status, 401, change);
    assert.equal((await readJson(res)).code, 'reauth', change);
  }
});

test('a plaintext PIN upgraded at login still gets a token that survives the 12-hour re-check', async () => {
  const DB = await freshDB();
  DB.sqlite.prepare(`UPDATE users SET pin='4444' WHERE id='u5'`).run();
  const user = await readJson(await call(DB, 'auth/login', { method: 'POST', body: { role: 'signatory', userId: 'u5', pin: '4444' } }));
  assert.match(DB.sqlite.prepare(`SELECT pin FROM users WHERE id='u5'`).get().pin, /^sha256\$/);
  const p = await __authTesting.verifyFinanceTokenSignature(TEST_SIGNING_KEY, user.token);
  const stored = DB.sqlite.prepare(`SELECT pin FROM users WHERE id='u5'`).get().pin;
  assert.equal(p.pv, await __authTesting.pinFingerprint(TEST_SIGNING_KEY, stored));
});

test('changing your own PIN returns a fresh token for this device; you cannot change someone else\'s', async () => {
  const DB = await freshDB();
  const t = await tokenFor(DB, 'u3');
  const other = await call(DB, 'change-pin', { method: 'POST', headers: bearer(t), body: { userId: 'u2', currentPin: '1111', newPin: '5678' } });
  assert.equal(other.status, 403);
  const res = await call(DB, 'change-pin', { method: 'POST', headers: bearer(t), body: { userId: 'u3', currentPin: '2222', newPin: '5678' } });
  const body = await readJson(res);
  assert.equal(res.status, 200);
  const p = await __authTesting.verifyFinanceTokenSignature(TEST_SIGNING_KEY, body.token);
  const stored = DB.sqlite.prepare(`SELECT pin FROM users WHERE id='u3'`).get().pin;
  assert.equal(p.pv, await __authTesting.pinFingerprint(TEST_SIGNING_KEY, stored));
});

// ── 4. Roles ────────────────────────────────────────────────────────
test('viewer is read-only: GETs work, writes are 403 (audit log entries and own PIN change still allowed)', async () => {
  const DB = await freshDB();
  const t = await tokenFor(DB, 'u7');
  assert.equal((await call(DB, 'income', { headers: bearer(t) })).status, 200);
  for (const [method, path] of [['POST', 'income'], ['PUT', 'income/x'], ['DELETE', 'income/x'], ['POST', 'settings'], ['POST', 'notifications/read'], ['POST', 'budget/save']]) {
    const res = await call(DB, path, { method, headers: bearer(t), body: {} });
    assert.equal(res.status, 403, `${method} ${path}`);
    assert.match((await readJson(res)).error, /read-only/);
  }
  assert.equal((await call(DB, 'audit', { method: 'POST', headers: bearer(t), body: { type: 'login', detail: 'x', by: 'Visitor' } })).status, 200);
  const pin = await call(DB, 'change-pin', { method: 'POST', headers: bearer(t), body: { userId: 'u7', currentPin: '9999', newPin: '9876' } });
  assert.equal(pin.status, 200);
});

test('only the IT admin can create, edit or delete users', async () => {
  const DB = await freshDB();
  for (const uid of ['u2', 'u3', 'u4', 'u5']) {
    const t = await tokenFor(DB, uid);
    assert.equal((await call(DB, 'users', { method: 'POST', headers: bearer(t), body: { name: 'X', role: 'it_admin', pin: '1234' } })).status, 403, uid);
    assert.equal((await call(DB, 'users/u1', { method: 'PUT', headers: bearer(t), body: { pin: '1234' } })).status, 403, uid);
    assert.equal((await call(DB, 'users/u7', { method: 'DELETE', headers: bearer(t) })).status, 403, uid);
    assert.equal((await call(DB, 'users', { headers: bearer(t) })).status, 200, `${uid} can still list users`);
  }
  const admin = await tokenFor(DB, 'u1');
  assert.equal((await call(DB, 'users', { method: 'POST', headers: bearer(admin), body: { name: 'New', role: 'viewer', pin: '1234' } })).status, 200);
});

// ── 5. Automation key ───────────────────────────────────────────────
test('the automation key reads Finance and shared routes (GET only) and nothing else', async () => {
  const DB = await freshDB();
  const k = { 'X-Automation-Key': TEST_AUTOMATION_KEY };
  for (const path of ['income', 'remittances', 'expenses', 'settings', 'cash-transactions', 'petty', 'satellite-funds', 'dashboard']) {
    assert.equal((await call(DB, path, { headers: k })).status, 200, path);
  }
  assert.equal((await call(DB, 'income', { method: 'POST', headers: k, body: {} })).status, 403, 'read-only');
  assert.equal((await call(DB, 'settings', { method: 'POST', headers: k, body: {} })).status, 403, 'read-only');
  assert.equal((await call(DB, 'kpsc-partners', { headers: k })).status, 401, 'no KPSC data');
  const wrong = await call(DB, 'income', { headers: { 'X-Automation-Key': 'nope' } });
  assert.equal(wrong.status, 401);
  assert.equal((await readJson(wrong)).code, 'automation_key_invalid');
});

// ── 6. Shared routes and settings secrecy ───────────────────────────
test('settings accepts a Finance token or a KPSC session, and never returns the Termii key or default PIN', async () => {
  const DB = await freshDB();
  DB.sqlite.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('kpsc_termii_api_key', 'TL_secret_value')`).run();
  seedKpscSession(DB, { role: 'treasurer' });
  const viaKpsc = await call(DB, 'settings', { headers: { 'X-KPSC-Session': TEST_SESSION_HEADER } });
  const viaFinance = await call(DB, 'settings', { headers: FINANCE_AUTH_HEADER });
  const dash = await call(DB, 'dashboard', { headers: FINANCE_AUTH_HEADER });
  for (const res of [viaKpsc, viaFinance, dash]) {
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes('TL_secret_value'), 'Termii key never sent to a browser');
    const body = JSON.parse(text);
    const s = body.settings || body;
    assert.equal(s.kpsc_termii_api_key, undefined);
    assert.equal(s.kpsc_default_pin, undefined);
    assert.equal(s.kpsc_termii_api_key_set, true);
  }
});

test('saving SMS settings with the key field blank keeps the stored Termii key; the explicit clear still clears', async () => {
  const DB = await freshDB();
  DB.sqlite.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('kpsc_termii_api_key', 'TL_keep_me')`).run();
  seedKpscSession(DB, { role: 'general_secretary', name: 'Gen Sec' });
  const kh = { 'X-KPSC-Session': TEST_SESSION_HEADER };
  // Old cached page: sends the (now blank) key along with the rest.
  const save = await call(DB, 'settings', { method: 'POST', headers: kh, body: { kpsc_termii_api_key: '', kpsc_termii_sender_id: 'RCCG-KP', kpsc_termii_api_key_set: true } });
  assert.equal(save.status, 200);
  const key = () => DB.sqlite.prepare(`SELECT value FROM settings WHERE key='kpsc_termii_api_key'`).get()?.value;
  assert.equal(key(), 'TL_keep_me', 'SMS keeps working: server still reads the stored key');
  assert.equal(DB.sqlite.prepare(`SELECT COUNT(*) n FROM settings WHERE key='kpsc_termii_api_key_set'`).get().n, 0, 'derived flag not stored');
  await call(DB, 'settings', { method: 'POST', headers: kh, body: { kpsc_termii_api_key: 'TL_new' } });
  assert.equal(key(), 'TL_new');
  await call(DB, 'settings', { method: 'POST', headers: kh, body: { kpsc_termii_api_key: '' } });
  assert.equal(key(), '', '"Remove key" sends only the key and clears it');
});

test('sensitive settings are admin-only, but a non-admin read-modify-write save with them unchanged still works', async () => {
  const DB = await freshDB();
  DB.sqlite.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('rolePermissions', '{"viewer":["dashboard"]}')`).run();
  const acct = await tokenFor(DB, 'u3');   // accountant
  const all = await readJson(await call(DB, 'settings', { headers: bearer(acct) }));
  all.budgetKnownBills = [{ name: 'Rent', amount: 1 }];
  const ok = await call(DB, 'settings', { method: 'POST', headers: bearer(acct), body: all });
  assert.equal(ok.status, 200, (await ok.clone().text()));
  assert.match(DB.sqlite.prepare(`SELECT value FROM settings WHERE key='budgetKnownBills'`).get().value, /Rent/);
  const changed = await call(DB, 'settings', { method: 'POST', headers: bearer(acct), body: { rolePermissions: { viewer: ['dashboard', 'audit'] } } });
  assert.equal(changed.status, 403);
  const termii = await call(DB, 'settings', { method: 'POST', headers: bearer(acct), body: { kpsc_termii_api_key: 'TL_evil' } });
  assert.equal(termii.status, 403);
  const admin = await tokenFor(DB, 'u1');
  assert.equal((await call(DB, 'settings', { method: 'POST', headers: bearer(admin), body: { rolePermissions: { viewer: ['dashboard', 'audit'] } } })).status, 200);
  seedKpscSession(DB, { role: 'treasurer' });
  assert.equal((await call(DB, 'settings', { method: 'POST', headers: { 'X-KPSC-Session': TEST_SESSION_HEADER }, body: { ai_openai_key: 'sk-x' } })).status, 403, 'KPSC non-admin');
});

// ── 7. Login throttle ───────────────────────────────────────────────
test('5 wrong PINs lock that account from that IP for 15 minutes; a correct PIN before that resets the count', async () => {
  __authTesting.resetThrottleTable();
  const DB = await freshDB();
  const login = (pin, ip = '1.1.1.1') => onRequest({
    request: new Request('https://x/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify({ role: 'accountant', pin }) }),
    env: { DB },
  });
  for (let i = 0; i < 4; i++) assert.equal((await login('9990')).status, 401);
  assert.equal((await login('2222')).status, 200, 'correct PIN on the 5th try works');
  for (let i = 0; i < 5; i++) assert.equal((await login('9990')).status, 401, `fail ${i + 1}`);
  const locked = await login('2222');
  assert.equal(locked.status, 429, 'locked even with the right PIN');
  assert.match((await readJson(locked)).error, /Too many incorrect PIN attempts.*15 minutes/);
  assert.equal((await login('2222', '2.2.2.2')).status, 200, 'another IP is not locked');
  // Lock expiry
  DB.sqlite.prepare(`UPDATE auth_throttle SET locked_until=? WHERE k LIKE 'fin:u3:1.1.1.1'`).run(Date.now() - 1000);
  assert.equal((await login('2222')).status, 200, 'works again after 15 minutes');
  assert.equal(DB.sqlite.prepare(`SELECT COUNT(*) n FROM auth_throttle WHERE k='fin:u3:1.1.1.1'`).get().n, 0, 'correct login clears the row');
});

test('parallel guesses cannot exceed the limit, and KPSC login is throttled too', async () => {
  __authTesting.resetThrottleTable();
  const DB = await freshDB();
  const login = (pin) => onRequest({
    request: new Request('https://x/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '3.3.3.3' }, body: JSON.stringify({ role: 'pastor', pin }) }),
    env: { DB },
  });
  const results = await Promise.all(Array.from({ length: 12 }, () => login('0001')));
  assert.ok(results.filter(r => r.status === 401).length <= 5, 'at most 5 PINs actually checked');
  assert.equal((await login('1111')).status, 429);
  const kl = (pin) => onRequest({
    request: new Request('https://x/api/kpsc-login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '4.4.4.4' }, body: JSON.stringify({ accountId: 'ka1', pin }) }),
    env: { DB },
  });
  for (let i = 0; i < 5; i++) assert.equal((await kl('0000')).status, 401);
  assert.equal((await kl('1234')).status, 429);
});

// ── 8. init ─────────────────────────────────────────────────────────
test('init never re-seeds a non-empty users table (deleted default accounts stay deleted)', async () => {
  const DB = await freshDB();
  DB.sqlite.prepare(`DELETE FROM users WHERE id IN ('u6','u7')`).run();
  DB.sqlite.prepare(`DELETE FROM kpsc_accounts WHERE id='ka5'`).run();
  assert.equal((await call(DB, 'init', { headers: FINANCE_AUTH_HEADER })).status, 200);
  assert.equal(DB.sqlite.prepare(`SELECT COUNT(*) n FROM users WHERE id IN ('u6','u7')`).get().n, 0);
  assert.equal(DB.sqlite.prepare(`SELECT COUNT(*) n FROM kpsc_accounts WHERE id='ka5'`).get().n, 0);
  assert.equal(DB.sqlite.prepare(`SELECT COUNT(*) n FROM users`).get().n, 5);
});

test('a brand-new database is set up by the first sign-in (init itself needs a token)', async () => {
  const DB = createSqliteD1();
  const res = await call(DB, 'auth/login', { method: 'POST', body: { role: 'it_admin', pin: '0000' } });
  assert.equal(res.status, 200);
  assert.equal(DB.sqlite.prepare(`SELECT COUNT(*) n FROM users`).get().n, 7);
});

// ── 9. Auto-generated keys ──────────────────────────────────────────
test('keys are generated on first use, stored in app_secrets, reused across isolates and never returned by a route', async () => {
  const DB = await freshDB();
  __authTesting.setAppSecrets(null);   // a cold isolate
  try {
    const login = await call(DB, 'auth/login', { method: 'POST', body: { role: 'it_admin', pin: '0000' } });
    assert.equal(login.status, 200);
    const rows = DB.sqlite.prepare(`SELECT name, value FROM app_secrets ORDER BY name`).all();
    assert.deepEqual(rows.map(r => r.name), ['automation_read_key', 'finance_session_signing_key']);
    for (const r of rows) assert.ok(r.value.length >= 40);
    const { token } = await readJson(login);
    // Another cold isolate reads the same key back rather than making a new one.
    __authTesting.setAppSecrets(null);
    assert.equal((await call(DB, 'income', { headers: bearer(token) })).status, 200);
    assert.equal(DB.sqlite.prepare(`SELECT COUNT(*) n FROM app_secrets`).get().n, 2);
    const autoKey = rows.find(r => r.name === 'automation_read_key').value;
    assert.equal((await call(DB, 'income', { headers: { 'X-Automation-Key': autoKey } })).status, 200);
    const signing = rows.find(r => r.name === 'finance_session_signing_key').value;
    for (const path of ['settings', 'dashboard', 'audit', 'users', 'init']) {
      const text = await (await call(DB, path, { headers: bearer(token) })).text();
      assert.ok(!text.includes(signing) && !text.includes(autoKey), `${path} leaks no key`);
    }
  } finally {
    __authTesting.setAppSecrets({ signing: TEST_SIGNING_KEY, automation: TEST_AUTOMATION_KEY });
  }
});

test('an existing key row is never overwritten (first-generation race: INSERT OR IGNORE then re-read)', async () => {
  const DB = await freshDB();
  DB.sqlite.prepare(`INSERT INTO app_secrets (name, value) VALUES ('finance_session_signing_key', 'winner-from-another-isolate-xxxxxxxxxxxxxxx')`).run();
  __authTesting.setAppSecrets(null);
  try {
    const { token } = await readJson(await call(DB, 'auth/login', { method: 'POST', body: { role: 'it_admin', pin: '0000' } }));
    assert.ok(await __authTesting.verifyFinanceTokenSignature('winner-from-another-isolate-xxxxxxxxxxxxxxx', token));
    assert.equal(DB.sqlite.prepare(`SELECT COUNT(*) n FROM app_secrets`).get().n, 2, 'automation key added alongside');
  } finally {
    __authTesting.setAppSecrets({ signing: TEST_SIGNING_KEY, automation: TEST_AUTOMATION_KEY });
  }
});

test('the very first unauthenticated request after deploy creates the keys in the background', async () => {
  const DB = await freshDB();
  __authTesting.setAppSecrets(null);
  try {
    const jobs = [];
    const res = await onRequest({ request: req('income'), env: { DB }, waitUntil: (p) => jobs.push(p) });
    assert.equal(res.status, 401);
    await Promise.all(jobs);
    assert.equal(DB.sqlite.prepare(`SELECT COUNT(*) n FROM app_secrets`).get().n, 2);
  } finally {
    __authTesting.setAppSecrets({ signing: TEST_SIGNING_KEY, automation: TEST_AUTOMATION_KEY });
  }
});

test('FINANCE_SESSION_SECRET, if set, takes precedence (optional, not required)', async () => {
  const DB = await freshDB();
  const envTok = await __authTesting.signFinanceToken('from-env', { uid: 'u1', role: 'it_admin', storedPin: 'x' });
  assert.equal((await call(DB, 'income', { headers: bearer(envTok) }, { FINANCE_SESSION_SECRET: 'from-env' })).status, 200);
  assert.equal((await call(DB, 'income', { headers: FINANCE_AUTH_HEADER }, { FINANCE_SESSION_SECRET: 'from-env' })).status, 401);
  assert.equal((await call(DB, 'income', { headers: FINANCE_AUTH_HEADER })).status, 200, 'without it, the D1 key is used');
});
