import test from 'node:test';
import assert from 'node:assert/strict';
import {
  signRemitActionToken, verifyRemitActionToken, buildRemitActionLinks, remitActionExpForCutoff,
} from '../functions/_lib/remit-action-token.js';
import { onRequest } from '../functions/remit-action.js';
import { actionButtonPeople } from '../functions/_lib/month-end-events.js';

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
  const bad = await signRemitActionToken(KEY, { ...base, person: 'Pastor <x>', exp: future() });
  assert.equal((await verifyRemitActionToken(KEY, bad)).reason, 'invalid');   // not a person key
});

test('token: refresh_attendance is a valid action; unknown actions are rejected', async () => {
  const t = await signRemitActionToken(KEY, { ...base, action: 'refresh_attendance', exp: future() });
  const ok = await verifyRemitActionToken(KEY, t);
  assert.equal(ok.ok, true);
  assert.equal(ok.payload.action, 'refresh_attendance');

  const unknown = await signRemitActionToken(KEY, { ...base, action: 'delete_all', exp: future() });
  assert.equal((await verifyRemitActionToken(KEY, unknown)).reason, 'invalid');
});

test('links: four personal links, exp 21 days after the cut-off, null without a key', async () => {
  const exp = remitActionExpForCutoff('2026-10-18');
  assert.equal(new Date(exp * 1000).toISOString(), '2026-11-08T23:59:59.000Z');
  const links = await buildRemitActionLinks({ REMIT_WEBHOOK_KEY: KEY }, 'https://app.example', { month: '2026-10', exp });
  assert.deepEqual(Object.keys(links), ['david', 'divine']);
  for (const person of ['david', 'divine']) {
    for (const action of ['generate_rrr', 'refresh', 'refresh_attendance']) {
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
  assert.match(get.html, /<th>Remittance<\/th><td>October 2026<\/td>/, 'other actions keep the Remittance label');
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

test('confirm page: refresh_attendance renders "Refresh attendance for <Month YYYY>" and forwards the right action', async () => {
  const t = await signRemitActionToken(KEY, { ...base, person: 'david', action: 'refresh_attendance', exp: future() });
  const get = await run(new Request(`https://app.example/remit-action?t=${t}`), env);
  assert.equal(get.res.status, 200);
  assert.equal(get.calls.length, 0);
  assert.match(get.html, /Refresh attendance for October 2026/);
  assert.match(get.html, /<th>Attendance<\/th><td>October 2026<\/td>/, 'month row is labelled Attendance');
  assert.ok(!get.html.includes('<th>Remittance</th>'));

  const post = await run(new Request('https://app.example/remit-action', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `t=${t}`,
  }), env);
  assert.equal(post.res.status, 200);
  assert.equal(post.calls.length, 1);
  const n = JSON.parse(post.calls[0].init.body);
  assert.deepEqual(Object.keys(n).sort(), ['action', 'clickedAt', 'event', 'month', 'parish', 'person', 'test']);
  assert.match(post.html, /<th>Attendance<\/th><td>October 2026<\/td>/, 'result page uses the same label');
  assert.deepEqual({ ...n, clickedAt: 'x' }, { event: 'remit_action', action: 'refresh_attendance', parish: '602757', month: '2026-10', person: 'david', test: false, clickedAt: 'x' });
});

// Buttons per person from Automations → People ("buttons" on), checked when the link is made AND when it is used.
const automations = (people) => ({ config_version: 9, is_default: false, config: { people } });
const PEOPLE = [
  { key: 'david', name: 'David Chukwuemeka', called: 'Bro. David', buttons: true },
  { key: 'divine', name: 'Divine Faith', called: 'Bro. Divine', buttons: true },
  { key: 'fabian', name: 'Fabian Alom', called: 'Bro. Fabian', buttons: true },
  { key: 'pastor', name: 'Pastor', buttons: false },
  { key: 'p659840', name: 'Sat pastor', parish: '659840', buttons: true },   // another parish: never Kingdom's buttons
];
async function withWatchdog(configOrStatus, fn) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/config')) {
      return typeof configOrStatus === 'number' ? new Response('no', { status: configOrStatus }) : new Response(JSON.stringify(configOrStatus));
    }
    return new Response('ok');
  };
  try { return await fn(calls); } finally { globalThis.fetch = realFetch; }
}
const wenv = { ...env, CLERK_WATCHDOG_TOKEN: 'wd-token', CLERK_WATCHDOG_URL: 'https://wd.example' };

test('buttons people: from Automations (Kingdom people with buttons on); fallback David + Bro. Divine', async () => {
  await withWatchdog(automations(PEOPLE), async () => {
    const r = await actionButtonPeople(wenv);
    assert.equal(r.fromSettings, true);
    assert.deepEqual(r.people, { david: 'Bro. David', divine: 'Bro. Divine', fabian: 'Bro. Fabian' });
  });
  for (const bad of [500, { is_default: true, config: { people: PEOPLE } }]) {
    await withWatchdog(bad, async () => {
      assert.deepEqual(await actionButtonPeople(wenv), { people: { david: 'David', divine: 'Bro. Divine' }, fromSettings: false });
    });
  }
  assert.deepEqual((await actionButtonPeople(env)).people, { david: 'David', divine: 'Bro. Divine' });   // no token: no call
});

test('links: one set per person passed in; bad keys skipped; default unchanged', async () => {
  const exp = future();
  const links = await buildRemitActionLinks({ REMIT_WEBHOOK_KEY: KEY }, 'https://app.example',
    { month: '2026-10', exp, people: ['david', 'fabian', 'Bad Key', 'fabian'] });
  assert.deepEqual(Object.keys(links), ['david', 'fabian']);
  const v = await verifyRemitActionToken(KEY, new URL(links.fabian.refresh).searchParams.get('t'));
  assert.equal(v.payload.person, 'fabian');
  assert.deepEqual(Object.keys(await buildRemitActionLinks({ REMIT_WEBHOOK_KEY: KEY }, 'https://app.example', { month: '2026-10', exp })),
    ['david', 'divine']);
});

test('confirm page: a person whose buttons are off is refused on open and on press; on -> works with their name', async () => {
  const fab = await signRemitActionToken(KEY, { ...base, person: 'fabian', exp: future() });
  const div = await signRemitActionToken(KEY, { ...base, person: 'divine', exp: future() });
  const post = (t) => new Request('https://app.example/remit-action', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `t=${t}` });
  const divineOff = PEOPLE.map(p => (p.key === 'divine' ? { ...p, buttons: false } : p));
  await withWatchdog(automations(divineOff), async (calls) => {
    const g = await onRequest({ request: new Request(`https://app.example/remit-action?t=${div}`), env: wenv });
    assert.equal(g.status, 403);
    const p = await onRequest({ request: post(div), env: wenv });
    assert.equal(p.status, 403);
    assert.ok(!calls.some(c => c.url === env.REMIT_WEBHOOK_URL || c.url.endsWith('/events')), 'nothing forwarded');
    const ok = await onRequest({ request: new Request(`https://app.example/remit-action?t=${fab}`), env: wenv });
    assert.equal(ok.status, 200);
    assert.match(await ok.text(), /Bro\. Fabian/);
  });
  await withWatchdog(500, async () => {   // settings unreadable: the old rule (David and Bro. Divine only)
    assert.equal((await onRequest({ request: new Request(`https://app.example/remit-action?t=${fab}`), env: wenv })).status, 403);
    assert.equal((await onRequest({ request: new Request(`https://app.example/remit-action?t=${div}`), env: wenv })).status, 200);
  });
});
