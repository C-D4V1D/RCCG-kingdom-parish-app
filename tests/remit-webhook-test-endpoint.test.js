import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, maskWebhookHost } from '../functions/api/[[route]].js';

const URL_SECRET = 'https://hooks.example.com/routine/secret-path-123';
const KEY_SECRET = 'k-super-secret-456';

// Minimal D1 stand-in: a KPSC session for `role`, nothing else.
function sessionDB(role) {
  return {
    prepare(sql) {
      const st = {
        bind() { return st; },
        async first() {
          if (/FROM kpsc_sessions/.test(sql)) return { account_id: 'ka1', expires_at: Date.now() + 3600_000 };
          if (/FROM kpsc_accounts/.test(sql)) return { id: 'ka1', name: 'Bro. Test Admin', role, status: 'active' };
          return null;
        },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all() { return { results: [] }; },
      };
      return st;
    },
  };
}

function testRequest({ session = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (session) headers['X-KPSC-Session'] = JSON.stringify({ accountId: 'ka1', token: 'tok' });
  return new Request('https://example.com/api/remit-webhook-test', { method: 'POST', headers, body: '{}' });
}

// Runs the endpoint with a stubbed global fetch; returns status, JSON body, captured calls and logs.
async function call(env, { role = 'acting_chairman', session = true, fetchImpl } = {}) {
  const calls = [], logs = [];
  const realFetch = globalThis.fetch, realLog = console.log, realErr = console.error;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return fetchImpl ? fetchImpl(url, init) : new Response('{"ok":true}'); };
  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => logs.push(a.join(' '));
  try {
    const res = await onRequest({ request: testRequest({ session }), env: { DB: sessionDB(role), ...env } });
    return { status: res.status, body: await res.json(), calls, logs };
  } finally {
    globalThis.fetch = realFetch; console.log = realLog; console.error = realErr;
  }
}

const configured = { REMIT_WEBHOOK_URL: URL_SECRET, REMIT_WEBHOOK_KEY: KEY_SECRET };

test('admin roles send one webhook_test ping with the Bearer key', async () => {
  for (const role of ['acting_chairman', 'general_secretary', 'it_admin']) {
    const { status, body, calls } = await call(configured, { role });
    assert.equal(status, 200, role);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, URL_SECRET);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY_SECRET}`);
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    assert.ok(calls[0].init.signal, 'request must carry a timeout signal');
    const p = JSON.parse(calls[0].init.body);
    assert.deepEqual(Object.keys(p).sort(), ['app', 'event', 'links', 'linksExpireAt', 'month', 'parish', 'requestedBy', 'sentAt', 'test']);
    assert.equal(p.parish, '602757');
    assert.match(p.links.david.generate_rrr, /^https:\/\/example\.com\/remit-action\?t=[\w-]+\.[\w-]+$/);
    assert.deepEqual(Object.keys(p.links.divine), ['generate_rrr', 'refresh', 'refresh_attendance']);
    assert.equal(p.event, 'webhook_test');
    assert.equal(p.test, true);
    assert.equal(p.app, 'rccg-kingdom-parish-app');
    assert.equal(p.requestedBy, 'Bro. Test Admin');
    assert.ok(!Number.isNaN(Date.parse(p.sentAt)));
    assert.equal(body.configured, true);
    assert.equal(body.ok, true);
    assert.equal(body.httpStatus, 200);
    assert.equal(body.responseSnippet, '{"ok":true}');
    assert.equal(typeof body.elapsedMs, 'number');
    assert.equal(body.sentAt, p.sentAt);
    assert.equal(body.error, null);
  }
});

test('non-admin roles and missing sessions are rejected before any request is made', async () => {
  for (const role of ['financial_secretary', 'treasurer', 'committee_viewer']) {
    const { status, body, calls } = await call(configured, { role });
    assert.equal(status, 403, role);
    assert.match(body.error, /not permitted/i);
    assert.equal(calls.length, 0);
  }
  const anon = await call(configured, { session: false });
  assert.equal(anon.status, 401);
  assert.equal(anon.calls.length, 0);
});

test('missing URL or key: no call, configured:false with the plain message', async () => {
  for (const env of [{}, { REMIT_WEBHOOK_URL: URL_SECRET }, { REMIT_WEBHOOK_KEY: KEY_SECRET }]) {
    const { status, body, calls } = await call(env);
    assert.equal(status, 200);
    assert.equal(calls.length, 0);
    assert.equal(body.configured, false);
    assert.equal(body.ok, false);
    assert.equal(body.error, 'Webhook secrets REMIT_WEBHOOK_URL / REMIT_WEBHOOK_KEY are not set for this deployment');
  }
});

test('custom key header is honoured, as for the cut-off webhook', async () => {
  const { calls } = await call({ ...configured, REMIT_WEBHOOK_KEY_HEADER: 'X-Automation-Key' });
  assert.equal(calls[0].init.headers['X-Automation-Key'], KEY_SECRET);
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

test('non-2xx, network failure and timeout are reported, and secrets never leak', async () => {
  const echo = `denied for ${KEY_SECRET} at ${URL_SECRET} ` + 'x'.repeat(600);
  const rejected = await call(configured, { fetchImpl: async () => new Response(echo, { status: 401 }) });
  assert.equal(rejected.body.ok, false);
  assert.equal(rejected.body.httpStatus, 401);
  assert.match(rejected.body.error, /401/);
  assert.ok(rejected.body.responseSnippet.length <= 300);

  const down = await call(configured, { fetchImpl: async () => { throw new Error(`connect failed to ${URL_SECRET}`); } });
  assert.equal(down.body.ok, false);
  assert.equal(down.body.httpStatus, null);
  assert.match(down.body.error, /Could not reach the webhook/);

  const slow = await call(configured, { fetchImpl: async () => { const e = new Error('timed out'); e.name = 'TimeoutError'; throw e; } });
  assert.equal(slow.body.ok, false);
  assert.equal(slow.body.error, 'No answer within 10 seconds');

  for (const r of [rejected, down, slow]) {
    const everything = JSON.stringify(r.body) + r.logs.join('\n');
    assert.ok(!everything.includes(KEY_SECRET), 'key must not appear in the response or logs');
    assert.ok(!everything.includes(URL_SECRET), 'URL must not appear in the response or logs');
    assert.ok(!everything.includes('secret-path-123'), 'URL path must not appear in the response or logs');
  }
});

test('maskWebhookHost shows only a hint of the host', () => {
  assert.equal(maskWebhookHost(URL_SECRET), 'hoo…e.com');
  assert.equal(maskWebhookHost('https://a.io/x'), 'a.…');
  assert.equal(maskWebhookHost('not a url'), '');
});
