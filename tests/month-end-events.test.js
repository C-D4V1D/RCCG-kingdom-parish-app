// Month-end signals go to the Clerk AI or the Clerk box mailbox, per Automations → "Month-end run by".
import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverMonthEndEvent, monthEndHandler, monthEndConfigured } from '../functions/_lib/month-end-events.js';

const AI = 'https://hooks.example/clerk';
const BOX = 'https://clerk-watchdog.decan-inv.workers.dev';
const event = { event: 'cutoff_collection_saved', month: '2026-10' };

function stub({ handler = 'clerk_ai', isDefault = false, box = 200, ai = 200, config = 200, pingAgoMin = 5, takeover } = {}) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null });
    if (String(url) === `${BOX}/config`) {
      if (config !== 200) return new Response('{}', { status: config });
      return new Response(JSON.stringify({ is_default: isDefault, config: { remittance: { handler }, automations: takeover == null ? {} : { supervisor: { ai_takeover_minutes: takeover } } } }), { status: 200 });
    }
    if (String(url) === `${BOX}/health`) {
      return new Response(JSON.stringify({ last_ping: pingAgoMin == null ? null : new Date(Date.now() - pingAgoMin * 60000).toISOString() }), { status: 200 });
    }
    if (String(url) === `${BOX}/events`) {
      if (box === 'throw') throw new Error('mailbox down');
      return new Response('{}', { status: box });
    }
    if (String(url) === AI) {
      if (ai === 'throw') throw new Error('ai down');
      return new Response('{}', { status: ai });
    }
    throw new Error(`unexpected ${url}`);
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const env = extra => ({ REMIT_WEBHOOK_URL: AI, REMIT_WEBHOOK_KEY: 'k', CLERK_WATCHDOG_TOKEN: 'tok', ...extra });

test('without the watchdog token everything goes to the Clerk AI as before', async () => {
  const s = stub();
  try {
    const r = await deliverMonthEndEvent({ REMIT_WEBHOOK_URL: AI }, event);
    assert.deepEqual(r, { ok: true, to: 'clerk_ai' });
    assert.deepEqual(s.calls.map(c => c.url), [AI]);
  } finally { s.restore(); }
});

test('Clerk AI mode: the AI acts, the box gets a practice copy', async () => {
  const s = stub({ handler: 'clerk_ai' });
  try {
    const r = await deliverMonthEndEvent(env(), event);
    assert.deepEqual(r, { ok: true, to: 'clerk_ai' });
    const box = s.calls.find(c => c.url === `${BOX}/events`);
    assert.equal(box.body.handler, 'clerk_ai');
    assert.equal(box.headers['x-watchdog-token'], 'tok');
    assert.ok(s.calls.some(c => c.url === AI));
  } finally { s.restore(); }
});

test('Box mode: only the box mailbox gets it', async () => {
  const s = stub({ handler: 'box' });
  try {
    const r = await deliverMonthEndEvent(env(), event);
    assert.deepEqual(r, { ok: true, to: 'box' });
    assert.ok(!s.calls.some(c => c.url === AI));
    assert.equal(s.calls.find(c => c.url === `${BOX}/events`).body.handler, 'box');
  } finally { s.restore(); }
});

test('Box mode with the mailbox down falls back to the Clerk AI', async () => {
  for (const box of [500, 'throw']) {
    const s = stub({ handler: 'box', box });
    try {
      const r = await deliverMonthEndEvent(env(), event);
      assert.deepEqual(r, { ok: true, to: 'clerk_ai' });
      assert.equal(s.calls.find(c => c.url === AI).body.fallback, 'box_unreachable');
    } finally { s.restore(); }
  }
});

test('unsaved settings or an unreadable config mean Clerk AI', async () => {
  let s = stub({ handler: 'box', isDefault: true });
  try { assert.equal(await monthEndHandler(env()), 'clerk_ai'); } finally { s.restore(); }
  s = stub({ handler: 'box', config: 500 });
  try { assert.equal(await monthEndHandler(env()), 'clerk_ai'); } finally { s.restore(); }
});

test('the AI being down is reported as not accepted', async () => {
  const s = stub({ ai: 'throw' });
  try { assert.deepEqual(await deliverMonthEndEvent(env(), event), { ok: false, to: 'clerk_ai' }); } finally { s.restore(); }
});

test('configured when either destination exists', () => {
  assert.equal(monthEndConfigured({}), false);
  assert.equal(monthEndConfigured({ REMIT_WEBHOOK_URL: AI }), true);
  assert.equal(monthEndConfigured({ CLERK_WATCHDOG_TOKEN: 't' }), true);
});

test('Box mode but the box has been silent for 30+ minutes: the Clerk AI does it', async () => {
  for (const pingAgoMin of [45, null]) {
    const s = stub({ handler: 'box', pingAgoMin });
    try {
      const r = await deliverMonthEndEvent(env(), event);
      assert.deepEqual(r, { ok: true, to: 'clerk_ai' });
      assert.ok(!s.calls.some(c => c.url === `${BOX}/events`));
      assert.equal(s.calls.find(c => c.url === AI).body.fallback, 'box_silent');
    } finally { s.restore(); }
  }
});

test('the minutes before the Clerk AI takes over come from Automations > Box connection', async () => {
  for (const [takeover, pingAgoMin, to] of [[60, 45, 'box'], [60, 75, 'clerk_ai'], [10, 15, 'clerk_ai'], [5, 20, 'box'], [5, 45, 'clerk_ai']]) {
    const s = stub({ handler: 'box', pingAgoMin, takeover });
    try {
      assert.equal((await deliverMonthEndEvent(env(), event)).to, to, `takeover ${takeover}, silent ${pingAgoMin} min`);
    } finally { s.restore(); }
  }
});

test('a satellite parish signal always goes to the box (whatever Kingdom\'s handler), the AI only when the box is silent', async () => {
  for (const [handler, pingAgoMin, to, fallback] of [['clerk_ai', 5, 'box', null], ['box', 5, 'box', null], ['clerk_ai', 45, 'clerk_ai', 'box_silent']]) {
    const s = stub({ handler, pingAgoMin });
    try {
      const r = await deliverMonthEndEvent(env(), { ...event, parish: '659840', satellite: true });
      assert.equal(r.to, to, `${handler} ${pingAgoMin}`);
      if (to === 'box') assert.equal(s.calls.find(c => c.url === `${BOX}/events`).body.parish, '659840');
      if (fallback) assert.equal(s.calls.find(c => c.url === AI).body.fallback, fallback);
    } finally { s.restore(); }
  }
});
