import test from 'node:test';
import assert from 'node:assert/strict';
import {
  signRemitActionToken, verifyRemitActionToken, buildRemitActionLinks, remitActionExpForCutoff,
} from '../functions/_lib/remit-action-token.js';
import { onRequest } from '../functions/remit-action.js';

const KEY = 'k-test-secret-123';
const base = { v: 1, parish: '602757', month: '2026-10', person: 'david', action: 'generate_rrr' };
const future = () => Math.floor(Date.now() / 1000) + 3600;

test('token: sign/verify round trip; tamper, wrong key and expiry are rejected', async () => {
  const t = await signRemitActionToken(KEY, { ...base, exp: future() });
  assert.match(t, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  const ok = await verifyRemitActionToken(KEY, t);
  assert.equal(ok.ok, true);
  assert.equal(ok.payload.person, 'david');

  assert.equal((await verifyRemitActionToken('other-key', t)).reason, 'signature');
  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ ...base, person: 'divine', exp: future() })).toString('base64url');
  assert.equal((await verifyRemitActionToken(KEY, `${forged}.${sig}`)).reason, 'signature');
  assert.equal((await verifyRemitActionToken(KEY, `${body}.${sig.slice(0, -2)}AA`)).reason, 'signature');
  assert.equal((await verifyRemitActionToken(KEY, 'garbage')).reason, 'malformed');
  assert.equal((await verifyRemitActionToken(KEY, '')).reason, 'malformed');
  assert.equal((await verifyRemitActionToken('', t)).reason, 'malformed');

  const old = await signRemitActionToken(KEY, { ...base, exp: Math.floor(Date.now() / 1000) - 1 });
  assert.equal((await verifyRemitActionToken(KEY, old)).reason, 'expired');
  const bad = await signRemitActionToken(KEY, { ...base, person: 'pastor', exp: future() });
  assert.equal((await verifyRemitActionToken(KEY, bad)).reason, 'invalid');
});

test('links: four personal links, exp 21 days after the cut-off, null without a key', async () => {
  const exp = remitActionExpForCutoff('2026-10-18');
  assert.equal(new Date(exp * 1000).toISOString(), '2026-11-08T23:59:59.000Z');
  const links = await buildRemitActionLinks({ REMIT_WEBHOOK_KEY: KEY }, 'https://app.example', { month: '2026-10', exp });
  assert.deepEqual(Object.keys(links), ['david', 'divine']);
  for (const person of ['david', 'divine']) {
    for (const action of ['generate_rrr', 'refresh']) {
      const u = new URL(links[person][action]);
      assert.equal(u.origin + u.pathname, 'https://app.example/remit-action');
      const v = await verifyRemitActionToken(KEY, u.searchParams.get('t'), Date.parse('2026-10-19T00:00:00Z'));
      assert.deepEqual(v.payload, { v: 1, parish: '602757', month: '2026-10', person, action, exp });
    }
  }
  assert.equal(await buildRemitActionLinks({}, 'https://app.example', { month: '2026-10', exp }), null);
});

async function run(req, env) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response('ok'); };
  try {
    const res = await onRequest({ request: req, env });
    return { res, html: await res.text(), calls };
  } finally { globalThis.fetch = realFetch; }
}
const env = { REMIT_WEBHOOK_URL: 'https://hooks.example/remit', REMIT_WEBHOOK_KEY: KEY };

test('confirm page: GET shows the button and never calls the webhook; POST sends one remit_action', async () => {
  const t = await signRemitActionToken(KEY, { ...base, person: 'divine', action: 'refresh', exp: future(), test: true });
  const get = await run(new Request(`https://app.example/remit-action?t=${t}`), env);
  assert.equal(get.res.status, 200);
  assert.equal(get.calls.length, 0);
  assert.match(get.html, /Confirm Refresh/);
  assert.match(get.html, /Bro\. Divine/);
  assert.match(get.html, /October 2026/);
  assert.ok(!get.html.includes(KEY) && !get.html.includes('hooks.example'));
  assert.equal(get.res.headers.get('Cache-Control'), 'no-store');

  const post = await run(new Request('https://app.example/remit-action', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `t=${t}`,
  }), env);
  assert.equal(post.res.status, 200);
  assert.match(post.html, /Church Clerk is working on it/);
  assert.equal(post.calls.length, 1);
  assert.equal(post.calls[0].url, env.REMIT_WEBHOOK_URL);
  assert.equal(post.calls[0].init.headers.Authorization, `Bearer ${KEY}`);
  const n = JSON.parse(post.calls[0].init.body);
  assert.deepEqual(Object.keys(n).sort(), ['action', 'clickedAt', 'event', 'month', 'parish', 'person', 'test']);
  assert.deepEqual({ ...n, clickedAt: 'x' }, { event: 'remit_action', action: 'refresh', parish: '602757', month: '2026-10', person: 'divine', test: true, clickedAt: 'x' });

  const bad = await run(new Request('https://app.example/remit-action', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `t=${t}x`,
  }), env);
  assert.equal(bad.res.status, 400);
  assert.equal(bad.calls.length, 0);
});
