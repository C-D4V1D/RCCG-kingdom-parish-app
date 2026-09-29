// Server-side proxy routes /api/automations/health and /api/automations/config
// (see "App API" in the Automations spec, and the AUTOMATIONS section in
// functions/api/[[route]].js). The watchdog token must never reach the browser:
// these tests stub fetch to the Worker and assert on both the outgoing request
// (token header sent) and the response body (token never echoed back).
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';
import { financeToken } from './finance-auth-helper.mjs';

const readJson = async (res) => JSON.parse(await res.text());

function req(path, { method = 'GET', body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  return new Request(`https://x/api/${path}`, init);
}
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

// The automations routes never touch D1 — this fails the test if they do.
function untouchableDB() {
  return { prepare(sql) { throw new Error(`automations handler queried DB: ${sql.slice(0, 60)}`); } };
}

const WATCHDOG_URL = 'https://watchdog.example.test';
const WATCHDOG_TOKEN = 'test-watchdog-token';
const baseEnv = { DB: untouchableDB(), CLERK_WATCHDOG_TOKEN: WATCHDOG_TOKEN, CLERK_WATCHDOG_URL: WATCHDOG_URL };

let fetchCalls;
function stubFetch(handler) {
  fetchCalls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    return handler(url, init);
  };
  return () => { globalThis.fetch = original; };
}
function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('automations: it_admin GET /api/automations/health proxies the Worker and hides the token', async () => {
  const restore = stubFetch(() => jsonResponse(200, { last_ping: '2026-09-27T00:00:00Z', health: { errors_7d: 0 } }));
  try {
    const token = await financeToken({ role: 'it_admin' });
    const res = await onRequest({ request: req('automations/health', { headers: bearer(token) }), env: baseEnv });
    assert.equal(res.status, 200);
    const data = await readJson(res);
    assert.equal(data.last_ping, '2026-09-27T00:00:00Z');
    assert.equal(JSON.stringify(data).includes(WATCHDOG_TOKEN), false);

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, `${WATCHDOG_URL}/health`);
    assert.equal(fetchCalls[0].init.headers['x-watchdog-token'], WATCHDOG_TOKEN);
  } finally { restore(); }
});

test('automations: it_admin GET /api/automations/config gets the full Worker config', async () => {
  const workerBody = {
    config_version: 3, is_default: false,
    config: { people: [{ key: 'david', app_role: 'it_admin' }, { key: 'divine', app_role: 'accountant' }], parishes: [{ code: '602757' }], routing: {}, automations: { memo: { enabled: true } } },
  };
  const restore = stubFetch(() => jsonResponse(200, workerBody));
  try {
    const token = await financeToken({ role: 'it_admin' });
    const res = await onRequest({ request: req('automations/config', { headers: bearer(token) }), env: baseEnv });
    assert.equal(res.status, 200);
    const data = await readJson(res);
    assert.deepEqual(data, workerBody);
    assert.equal(fetchCalls[0].url, `${WATCHDOG_URL}/config`);
    assert.equal(fetchCalls[0].init.headers['x-watchdog-token'], WATCHDOG_TOKEN);
  } finally { restore(); }
});

test('automations: it_admin PUT /api/automations/config forwards body and token, hides token from response', async () => {
  const restore = stubFetch((url, init) => {
    assert.equal(init.method, 'PUT');
    assert.equal(init.headers['x-watchdog-token'], WATCHDOG_TOKEN);
    const sent = JSON.parse(init.body);
    assert.deepEqual(sent, { config: { people: [] }, base_version: 3 });
    return jsonResponse(200, { ok: true, config_version: 4 });
  });
  try {
    const token = await financeToken({ role: 'it_admin' });
    const res = await onRequest({
      request: req('automations/config', { method: 'PUT', headers: bearer(token), body: { config: { people: [] }, base_version: 3 } }),
      env: baseEnv,
    });
    assert.equal(res.status, 200);
    const data = await readJson(res);
    assert.deepEqual(data, { ok: true, config_version: 4 });
    assert.equal(JSON.stringify(data).includes(WATCHDOG_TOKEN), false);
    assert.equal(fetchCalls.length, 1);
  } finally { restore(); }
});

test('automations: accountant GET /api/automations/config is filtered to their own rows and read_only', async () => {
  const workerBody = {
    config_version: 5, is_default: false,
    config: {
      people: [
        { key: 'david', name: 'David', app_role: 'it_admin' },
        { key: 'divine', name: 'Divine', app_role: 'accountant' },
      ],
      parishes: [{ code: '602757', name: 'Kingdom Parish' }],
      routing: { memo_forwarded: { david: { telegram: true, email: false }, divine: { telegram: true, email: true } } },
      automations: { memo: { enabled: true } },
    },
  };
  const restore = stubFetch(() => jsonResponse(200, workerBody));
  try {
    const token = await financeToken({ role: 'accountant' });
    const res = await onRequest({ request: req('automations/config', { headers: bearer(token) }), env: baseEnv });
    assert.equal(res.status, 200);
    const data = await readJson(res);
    assert.equal(data.config_version, 5);
    assert.equal(data.config.read_only, true);
    assert.deepEqual(data.config.people.map(p => p.key), ['divine']);
    assert.deepEqual(Object.keys(data.config.routing.memo_forwarded), ['divine']);
    assert.deepEqual(data.config.parishes, workerBody.config.parishes);
    assert.equal(data.config.automations, undefined);
  } finally { restore(); }
});

test('automations: accountant PUT /api/automations/config is forbidden and never calls the Worker', async () => {
  const restore = stubFetch(() => { throw new Error('Worker should not be called'); });
  try {
    const token = await financeToken({ role: 'accountant' });
    const res = await onRequest({
      request: req('automations/config', { method: 'PUT', headers: bearer(token), body: { config: {} } }),
      env: baseEnv,
    });
    assert.equal(res.status, 403);
    assert.equal(fetchCalls.length, 0);
  } finally { restore(); }
});

test('automations: viewer role is forbidden from health and config', async () => {
  const restore = stubFetch(() => { throw new Error('Worker should not be called'); });
  try {
    const token = await financeToken({ role: 'viewer' });
    const resHealth = await onRequest({ request: req('automations/health', { headers: bearer(token) }), env: baseEnv });
    assert.equal(resHealth.status, 403);
    const resConfig = await onRequest({ request: req('automations/config', { headers: bearer(token) }), env: baseEnv });
    assert.equal(resConfig.status, 403);
    assert.equal(fetchCalls.length, 0);
  } finally { restore(); }
});

test('automations: automation read-key and KPSC sessions are forbidden, not proxied', async () => {
  const restore = stubFetch(() => { throw new Error('Worker should not be called'); });
  try {
    const resAuto = await onRequest({
      request: req('automations/health', { headers: { 'X-Automation-Key': 'test-automation-key' } }),
      env: baseEnv,
    });
    assert.equal(resAuto.status, 403);

    const resKpsc = await onRequest({
      request: req('automations/health', { headers: { 'X-KPSC-Session': JSON.stringify({ accountId: 'ka1', token: 'kt1' }) } }),
      env: baseEnv,
    });
    // No Finance token and no matching route group => the shared auth-required response.
    assert.ok(resKpsc.status === 401 || resKpsc.status === 403);
    assert.equal(fetchCalls.length, 0);
  } finally { restore(); }
});

test('automations: missing CLERK_WATCHDOG_TOKEN returns 503 with a plain-English message', async () => {
  const restore = stubFetch(() => { throw new Error('Worker should not be called'); });
  try {
    const token = await financeToken({ role: 'it_admin' });
    const env = { DB: untouchableDB(), CLERK_WATCHDOG_URL: WATCHDOG_URL }; // no token
    const res = await onRequest({ request: req('automations/health', { headers: bearer(token) }), env });
    assert.equal(res.status, 503);
    const data = await readJson(res);
    assert.match(data.error, /clerk box service/i);
    assert.equal(fetchCalls.length, 0);
  } finally { restore(); }
});

test('automations: Worker unreachable (fetch throws) returns 502 with the spec message', async () => {
  const restore = stubFetch(() => { throw new Error('network down'); });
  try {
    const token = await financeToken({ role: 'it_admin' });
    const res = await onRequest({ request: req('automations/health', { headers: bearer(token) }), env: baseEnv });
    assert.equal(res.status, 502);
    const data = await readJson(res);
    assert.equal(data.error, 'Could not reach the Clerk box service. Try again in a minute.');
  } finally { restore(); }
});

test('automations: Worker 409 conflict on PUT /config is passed through as-is', async () => {
  const restore = stubFetch(() => jsonResponse(409, { error: 'conflict', config_version: 7 }));
  try {
    const token = await financeToken({ role: 'it_admin' });
    const res = await onRequest({
      request: req('automations/config', { method: 'PUT', headers: bearer(token), body: { config: {}, base_version: 3 } }),
      env: baseEnv,
    });
    assert.equal(res.status, 409);
    const data = await readJson(res);
    assert.deepEqual(data, { error: 'conflict', config_version: 7 });
  } finally { restore(); }
});

test('automations: Worker 400 validation errors on PUT /config are passed through as-is', async () => {
  const restore = stubFetch(() => jsonResponse(400, { errors: ['people must be non-empty'] }));
  try {
    const token = await financeToken({ role: 'it_admin' });
    const res = await onRequest({
      request: req('automations/config', { method: 'PUT', headers: bearer(token), body: { config: {} } }),
      env: baseEnv,
    });
    assert.equal(res.status, 400);
    const data = await readJson(res);
    assert.deepEqual(data, { errors: ['people must be non-empty'] });
  } finally { restore(); }
});

test('automations: Worker rejecting the app key (401) becomes 502, not a sign-out', async () => {
  const restore = stubFetch(() => jsonResponse(401, { error: 'unauthorized' }));
  try {
    const token = await financeToken({ role: 'it_admin' });
    const res = await onRequest({ request: req('automations/health', { headers: bearer(token) }), env: baseEnv });
    assert.equal(res.status, 502);
    const data = await readJson(res);
    assert.match(data.error, /did not accept this app's key/);
  } finally { restore(); }
});

// The real bank balance card (Dashboard + Bank page): unlike /api/automations above, this is
// ordinary business data, not box administration — every role that can actually see the
// Dashboard or Bank page must be able to read it and press Refresh, viewer included. But it
// must NOT be reachable by an attendance-only sign-in (usher/admin_assistant) or a satellite
// parish session (that's Kingdom Parish's own bank balance, never theirs) just because they
// hold a valid Finance token — the browser hiding the button is not enough on its own.
test('bank-portal-balance: roles that can see Dashboard/Bank can GET the real balance', async () => {
  const restore = stubFetch(() => jsonResponse(200, { balance: 123957.0, checked_at: '2026-09-29T06:02:00Z' }));
  try {
    for (const role of ['viewer', 'accountant', 'pastor', 'signatory', 'admin_officer', 'it_admin']) {
      const token = await financeToken({ role });
      const res = await onRequest({ request: req('bank-portal-balance', { headers: bearer(token) }), env: baseEnv });
      assert.equal(res.status, 200, `role ${role} should be able to read the balance`);
      const data = await readJson(res);
      assert.equal(data.balance, 123957.0);
    }
    assert.equal(fetchCalls[0].url, `${WATCHDOG_URL}/bank-balance`);
    assert.equal(fetchCalls[0].init.headers['x-watchdog-token'], WATCHDOG_TOKEN);
  } finally { restore(); }
});

test('bank-portal-balance: attendance-only and satellite roles are refused, even with a valid token', async () => {
  const restore = stubFetch(() => jsonResponse(200, { balance: 123957.0, checked_at: '2026-09-29T06:02:00Z' }));
  try {
    for (const role of ['usher', 'admin_assistant', 'satellite']) {
      const token = await financeToken({ role });
      const res = await onRequest({ request: req('bank-portal-balance', { headers: bearer(token) }), env: baseEnv });
      assert.equal(res.status, 403, `role ${role} must not be able to read Kingdom Parish's bank balance`);
      const refresh = await onRequest({ request: req('bank-portal-balance/refresh', { method: 'POST', headers: bearer(token) }), env: baseEnv });
      assert.equal(refresh.status, 403, `role ${role} must not be able to trigger a refresh either`);
    }
    assert.equal(fetchCalls.length, 0, 'the Worker must never be called for a refused role');
  } finally { restore(); }
});

test('bank-portal-balance/refresh: roles that can see Dashboard/Bank can trigger a refresh', async () => {
  const restore = stubFetch(() => jsonResponse(200, { ok: true, id: 'ev-1' }));
  try {
    for (const role of ['viewer', 'accountant', 'it_admin']) {
      const token = await financeToken({ role });
      const res = await onRequest({ request: req('bank-portal-balance/refresh', { method: 'POST', headers: bearer(token) }), env: baseEnv });
      assert.equal(res.status, 200, `role ${role} should be able to refresh`);
    }
    assert.equal(fetchCalls[0].url, `${WATCHDOG_URL}/events`);
    const sentEvent = JSON.parse(fetchCalls[0].init.body);
    assert.equal(sentEvent.event, 'bank_balance_refresh_requested');
    assert.equal(fetchCalls[0].init.headers['x-watchdog-token'], WATCHDOG_TOKEN);
  } finally { restore(); }
});
