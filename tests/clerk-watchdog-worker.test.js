import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import worker from '../workers/clerk-watchdog/worker.js';
import { DEFAULT_CONFIG, validateConfig } from '../workers/clerk-watchdog/config.js';

const TEST_TOKEN = 'test-watchdog-token';

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// In-memory KV stub over a Map, matching the {get, put, list} surface the worker uses.
// list() paginates for real (small fixed page size) so tests can exercise cursor-following —
// Cloudflare's real KV list() is page-limited the same way, just at a much larger page size.
const KV_LIST_PAGE_SIZE = 3;
function createKV(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async put(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix = '', cursor = '' } = {}) {
      const all = [...map.keys()].filter(k => k.startsWith(prefix)).sort();
      const start = cursor ? all.indexOf(cursor) + 1 : 0;
      const page = all.slice(start, start + KV_LIST_PAGE_SIZE);
      const list_complete = start + page.length >= all.length;
      return { keys: page.map(name => ({ name })), list_complete, cursor: list_complete ? '' : page[page.length - 1] };
    },
    _map: map,
  };
}

function createEnv(seed = {}) {
  return { KV: createKV({ token_hash: sha256Hex(TEST_TOKEN), ...seed }) };
}

async function readJson(response) {
  return JSON.parse(await response.text());
}

function req(path, { method = 'GET', body, token = TEST_TOKEN, rawBody } = {}) {
  const headers = {};
  if (token !== null) headers['x-watchdog-token'] = token;
  const init = { method, headers };
  if (rawBody !== undefined) {
    init.body = rawBody;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return new Request(`https://example.com${path}`, init);
}

test('unauthorized requests without a valid token get 401', async () => {
  const env = createEnv();
  const res = await worker.fetch(req('/ping', { method: 'POST', token: 'wrong' }), env);
  assert.equal(res.status, 401);
  const body = await readJson(res);
  assert.equal(body.error, 'unauthorized');
});

test('legacy ping with no body still returns 200 and updates last_ping', async () => {
  const env = createEnv();
  const res = await worker.fetch(new Request('https://example.com/ping', {
    method: 'POST',
    headers: { 'x-watchdog-token': TEST_TOKEN },
  }), env);
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.ok, true);
  assert.equal(body.config_version, 0);
  assert.equal(body.config_update, false);
  assert.ok(await env.KV.get('last_ping'));
});

test('ping with health payload stores health and reports config_update', async () => {
  const env = createEnv({ config_version: '3' });

  const resStale = await worker.fetch(req('/ping', {
    method: 'POST',
    body: { health: { runners: {}, activity: {}, errors_7d: 0, last_sync: null, next_statement: null }, config_version: 1 },
  }), env);
  const bodyStale = await readJson(resStale);
  assert.equal(resStale.status, 200);
  assert.equal(bodyStale.config_version, 3);
  assert.equal(bodyStale.config_update, true);

  const storedHealth = JSON.parse(await env.KV.get('health'));
  assert.equal(storedHealth.errors_7d, 0);
  assert.ok(storedHealth.received_at);

  const resFresh = await worker.fetch(req('/ping', {
    method: 'POST',
    body: { config_version: 3 },
  }), env);
  const bodyFresh = await readJson(resFresh);
  assert.equal(bodyFresh.config_update, false);
});

test('GET /health returns stored health and last_ping', async () => {
  const now = Date.now();
  const env = createEnv({
    last_ping: String(now),
    health: JSON.stringify({ runners: {}, activity: {}, errors_7d: 2, last_sync: null, next_statement: null, received_at: 'x' }),
  });
  const res = await worker.fetch(req('/health'), env);
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.last_ping, new Date(now).toISOString());
  assert.equal(body.health.errors_7d, 2);
});

test('GET /health with nothing stored returns nulls', async () => {
  const env = createEnv();
  const res = await worker.fetch(req('/health'), env);
  const body = await readJson(res);
  assert.equal(res.status, 200);
  assert.equal(body.last_ping, null);
  assert.equal(body.health, null);
});

test('GET /config returns DEFAULT_CONFIG with is_default true when unset', async () => {
  const env = createEnv();
  const res = await worker.fetch(req('/config'), env);
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.config_version, 0);
  assert.equal(body.is_default, true);
  assert.deepEqual(body.config, DEFAULT_CONFIG);
});

test('PUT /config with a valid config stores it and increments version', async () => {
  const env = createEnv();
  const res = await worker.fetch(req('/config', { method: 'PUT', body: { config: DEFAULT_CONFIG } }), env);
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.ok, true);
  assert.equal(body.config_version, 1);
  assert.equal(await env.KV.get('config_version'), '1');
  assert.deepEqual(JSON.parse(await env.KV.get('config')), DEFAULT_CONFIG);
  assert.ok(await env.KV.get('config_updated_at'));

  // A second valid PUT increments again.
  const res2 = await worker.fetch(req('/config', { method: 'PUT', body: { config: DEFAULT_CONFIG } }), env);
  const body2 = await readJson(res2);
  assert.equal(body2.config_version, 2);
});

test('PUT /config with invalid config returns 400 with errors', async () => {
  const env = createEnv();
  const badConfig = { ...DEFAULT_CONFIG, people: [] };
  const res = await worker.fetch(req('/config', { method: 'PUT', body: { config: badConfig } }), env);
  assert.equal(res.status, 400);
  const body = await readJson(res);
  assert.equal(body.error, 'invalid config');
  assert.ok(Array.isArray(body.errors));
  assert.ok(body.errors.length > 0);
  assert.ok(body.errors.some((e) => /people/.test(e)));
});

test('PUT /config rejects a body over 64 KB', async () => {
  const env = createEnv();
  const hugeConfig = { ...DEFAULT_CONFIG, automations: { ...DEFAULT_CONFIG.automations, statement: { ...DEFAULT_CONFIG.automations.statement, signature: 'x'.repeat(70 * 1024) } } };
  const res = await worker.fetch(req('/config', { method: 'PUT', body: { config: hugeConfig } }), env);
  assert.equal(res.status, 400);
  const body = await readJson(res);
  assert.equal(body.error, 'invalid config');
});

test('PUT /config with a stale base_version returns 409 conflict', async () => {
  const env = createEnv({ config_version: '5' });
  const res = await worker.fetch(req('/config', { method: 'PUT', body: { config: DEFAULT_CONFIG, base_version: 4 } }), env);
  assert.equal(res.status, 409);
  const body = await readJson(res);
  assert.equal(body.error, 'conflict');
  assert.equal(body.config_version, 5);
  // Storage untouched
  assert.equal(await env.KV.get('config'), null);
});

test('PUT /config with a matching base_version succeeds', async () => {
  const env = createEnv({ config_version: '5' });
  const res = await worker.fetch(req('/config', { method: 'PUT', body: { config: DEFAULT_CONFIG, base_version: 5 } }), env);
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.config_version, 6);
});

test('GET /config/version returns the stored counter', async () => {
  const env = createEnv({ config_version: '7' });
  const res = await worker.fetch(req('/config/version'), env);
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.config_version, 7);
});

test('GET /config/version defaults to 0 when unset', async () => {
  const env = createEnv();
  const res = await worker.fetch(req('/config/version'), env);
  const body = await readJson(res);
  assert.equal(body.config_version, 0);
});

test('validateConfig accepts DEFAULT_CONFIG with no errors', () => {
  assert.deepEqual(validateConfig(DEFAULT_CONFIG), []);
});

test('existing /status and /claim behaviour is unaffected', async () => {
  const env = { KV: createKV() };
  const claimRes = await worker.fetch(new Request('https://example.com/claim', { method: 'POST' }), env);
  assert.equal(claimRes.status, 200);
  const claimBody = await readJson(claimRes);
  assert.ok(claimBody.token);

  const statusRes = await worker.fetch(new Request('https://example.com/status', {
    headers: { 'x-watchdog-token': claimBody.token },
  }), env);
  assert.equal(statusRes.status, 200);
  const statusBody = await readJson(statusRes);
  assert.equal(statusBody.wake_registered, false);
});

// ── month-end mailbox ─────────────────────────────────────────────
test('POST /events stores a signal and GET /events returns it after the cursor', async () => {
  const env = createEnv();
  const first = await readJson(await worker.fetch(req('/events', { method: 'POST', body: { event: 'cutoff_collection_saved', month: '2026-10', handler: 'box' } }), env));
  assert.equal(first.ok, true);
  await new Promise(r => setTimeout(r, 2));
  const second = await readJson(await worker.fetch(req('/events', { method: 'POST', body: { event: 'remit_action', action: 'generate_rrr' } }), env));
  assert.ok(second.id > first.id);

  const all = await readJson(await worker.fetch(req('/events'), env));
  assert.deepEqual(all.events.map(e => e.event), ['cutoff_collection_saved', 'remit_action']);
  assert.equal(all.events[0].handler, 'box');
  assert.ok(all.events[0].received_at);
  assert.equal(all.last, second.id);

  const after = await readJson(await worker.fetch(req(`/events?after=${first.id}`), env));
  assert.deepEqual(after.events.map(e => e.id), [second.id]);
  const none = await readJson(await worker.fetch(req(`/events?after=${second.id}`), env));
  assert.deepEqual(none, { events: [], last: second.id });

  const ver = await readJson(await worker.fetch(req('/config/version'), env));
  assert.equal(ver.events_last, second.id);
});

test('POST /events needs the token, JSON and an event name', async () => {
  const env = createEnv();
  assert.equal((await worker.fetch(req('/events', { method: 'POST', body: { event: 'x' }, token: 'wrong' }), env)).status, 401);
  assert.equal((await worker.fetch(req('/events', { method: 'POST', rawBody: 'nope' }), env)).status, 400);
  assert.equal((await worker.fetch(req('/events', { method: 'POST', body: { month: '2026-10' } }), env)).status, 400);
  assert.equal((await worker.fetch(req('/events', { method: 'POST', rawBody: JSON.stringify({ event: 'x', pad: 'y'.repeat(17000) }) }), env)).status, 413);
});

test('remittance settings: optional, and checked when present', () => {
  const { remittance, ...old } = DEFAULT_CONFIG;
  assert.deepEqual(validateConfig(old), []);                      // configs saved before it existed
  assert.deepEqual(validateConfig(DEFAULT_CONFIG), []);
  assert.equal(DEFAULT_CONFIG.remittance.handler, 'clerk_ai');
  const bad = structuredClone(DEFAULT_CONFIG);
  bad.remittance.handler = 'someone';
  bad.remittance.lines['bad key'] = 'X';
  bad.remittance.lines.slo = '';
  const errors = validateConfig(bad);
  assert.ok(errors.some(e => e.includes('remittance.handler')));
  assert.ok(errors.some(e => e.includes('"bad key"')));
  assert.ok(errors.some(e => e.includes('remittance.lines.slo')));
});

test('daily check: the silence allowed before waking Church Clerk comes from Automations > Box connection', async () => {
  const run = async (hoursAgo, config) => {
    const env = createEnv({ last_ping: String(Date.now() - hoursAgo * 3600000), ...(config ? { config: JSON.stringify(config) } : {}) });
    const waits = [];
    await worker.scheduled({}, env, { waitUntil: p => waits.push(p) });
    await Promise.all(waits);
    return env.KV._map.get('last_result');  // written only when it tried to wake (no webhook registered here)
  };
  assert.equal(await run(2, null), undefined);                                                        // default 3 h: still fine
  assert.ok(await run(4, null));                                                                      // default 3 h: too long
  assert.equal(await run(4, { automations: { supervisor: { alert_after_hours: 6 } } }), undefined);   // 6 h allowed
  assert.ok(await run(2, { automations: { supervisor: { alert_after_hours: 1 } } }));                 // 1 h allowed
  assert.ok(await run(4, { automations: { supervisor: { alert_after_hours: 'x' } } }));               // bad value: default
});

// Direct Telegram box-down alerts (no AI): hourly check, once a day while silent, "reporting again" on the next ping.
function tgStub() {
  const sent = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('https://api.telegram.org/bot')) { sent.push(JSON.parse(init.body)); return new Response('{"ok":true}'); }
    return new Response('{}', { status: 200 });  // the AI wake webhook
  };
  return { sent, restore: () => { globalThis.fetch = real; } };
}
const alertConfig = { people: [{ key: 'david', telegram_chat_id: '111' }, { key: 'divine', telegram_chat_id: '222' }, { key: 'pastor', telegram_chat_id: null }],
  routing: { watchdog_down: { david: { telegram: true, email: false }, divine: { telegram: false, email: false }, pastor: { telegram: true, email: false } } },
  automations: { supervisor: { alert_after_hours: 2 } } };
async function tick(env, cron) {
  const waits = [];
  await worker.scheduled({ cron }, env, { waitUntil: p => waits.push(p) });
  await Promise.all(waits);
}

test('box-down alert: hourly Telegram to the people ticked, once a day, and no AI wake when it was sent', async () => {
  const s = tgStub();
  try {
    const env = createEnv({ last_ping: String(Date.now() - 3 * 3600000), config: JSON.stringify(alertConfig),
      wake_config: JSON.stringify({ url: 'https://hooks.example/wake', method: 'POST', headers: {}, body: null }) });
    env.TELEGRAM_BOT_TOKEN = 'bot-key';
    await tick(env, '17 * * * *');
    assert.deepEqual(s.sent.map(m => m.chat_id), ['111']);          // david only: divine unticked, pastor has no chat id
    assert.match(s.sent[0].text, /Clerk box not reporting[\s\S]*for 3 hours/);
    await tick(env, '17 * * * *');
    assert.equal(s.sent.length, 1);                                   // not again within the day
    await tick(env, '30 6 * * *');
    assert.equal(env.KV._map.get('last_result'), undefined);          // alert reached someone: the AI is not woken
    // the box pings again: one "reporting again" message, and the alert state is cleared
    const r = await worker.fetch(req('/ping', { method: 'POST', body: {} }), env);
    assert.equal(r.status, 200);
    assert.equal(s.sent.length, 2);
    assert.match(s.sent[1].text, /reporting again[\s\S]*about 3 hours/);
    assert.equal(env.KV._map.get('down_alert'), undefined);
    await worker.fetch(req('/ping', { method: 'POST', body: {} }), env);
    assert.equal(s.sent.length, 2);
  } finally { s.restore(); }
});

test('box-down alert: under the hours set, nothing; without the bot key the daily AI wake still happens', async () => {
  const s = tgStub();
  try {
    const quiet = createEnv({ last_ping: String(Date.now() - 1 * 3600000), config: JSON.stringify(alertConfig) });
    quiet.TELEGRAM_BOT_TOKEN = 'bot-key';
    await tick(quiet, '17 * * * *');
    assert.equal(s.sent.length, 0);
    const nokey = createEnv({ last_ping: String(Date.now() - 5 * 3600000), config: JSON.stringify(alertConfig) });
    await tick(nokey, '17 * * * *');
    assert.equal(nokey.KV._map.get('last_result'), undefined);        // hourly run never wakes the AI
    await tick(nokey, '30 6 * * *');
    assert.ok(nokey.KV._map.get('last_result'));                      // daily run: no alert could be sent -> AI wake path
    assert.equal(s.sent.length, 0);
  } finally { s.restore(); }
});

test('POST /test-alert sends one test message (and needs the token)', async () => {
  const s = tgStub();
  try {
    const env = createEnv({ config: JSON.stringify(alertConfig) });
    env.TELEGRAM_BOT_TOKEN = 'bot-key';
    const r = await readJson(await worker.fetch(req('/test-alert', { method: 'POST' }), env));
    assert.deepEqual(r, { ok: true, sent: 1, of: 1 });
    assert.match(s.sent[0].text, /Test/);
    assert.equal((await worker.fetch(req('/test-alert', { method: 'POST', token: null }), env)).status, 401);
    const nokey = await readJson(await worker.fetch(req('/test-alert', { method: 'POST' }), createEnv({})));
    assert.equal(nokey.ok, false);
    assert.match(nokey.error, /no bot key/);
  } finally { s.restore(); }
});

test('POST /notify is rejected without a valid token', async () => {
  const env = createEnv({ config: JSON.stringify(alertConfig) });
  const r = await worker.fetch(req('/notify', { method: 'POST', token: 'wrong', body: { type: 'bank_transaction_needs_review', text: 'hi' } }), env);
  assert.equal(r.status, 401);
});

test('POST /notify requires both type and text', async () => {
  const env = createEnv({ config: JSON.stringify(alertConfig) });
  const noType = await readJson(await worker.fetch(req('/notify', { method: 'POST', body: { text: 'hi' } }), env));
  assert.match(noType.error, /type and text are required/);
  const noText = await readJson(await worker.fetch(req('/notify', { method: 'POST', body: { type: 'bank_transaction_needs_review' } }), env));
  assert.match(noText.error, /type and text are required/);
});

test('POST /notify sends a Telegram message to whoever is routed for that type', async () => {
  const s = tgStub();
  try {
    const cfg = { ...alertConfig, routing: { ...alertConfig.routing, bank_transaction_needs_review: { david: { telegram: true, email: false } } } };
    const env = createEnv({ config: JSON.stringify(cfg) });
    env.TELEGRAM_BOT_TOKEN = 'bot-key';
    const r = await readJson(await worker.fetch(req('/notify', { method: 'POST', body: { type: 'bank_transaction_needs_review', text: 'A bank movement needs review.' } }), env));
    assert.deepEqual(r, { ok: true, sent: 1, of: 1 });
    assert.equal(s.sent[0].text, 'A bank movement needs review.');
  } finally { s.restore(); }
});

test('POST /notify with nobody routed for the type still succeeds, with ok:false (no network needed)', async () => {
  const env = createEnv({ config: JSON.stringify(alertConfig) }); // alertConfig has no routing for this type
  env.TELEGRAM_BOT_TOKEN = 'bot-key';
  const r = await readJson(await worker.fetch(req('/notify', { method: 'POST', body: { type: 'bank_transaction_needs_review', text: 'hi' } }), env));
  assert.deepEqual(r, { ok: false, error: 'nobody is ticked for Telegram on bank_transaction_needs_review' });
});

test('GET /bank-balance is null before the box ever reports one', async () => {
  const env = createEnv();
  const r = await readJson(await worker.fetch(req('/bank-balance'), env));
  assert.deepEqual(r, { balance: null, checked_at: null });
});

test('POST /bank-balance stores the figure with a server-stamped time; GET returns it', async () => {
  const env = createEnv();
  const post = await readJson(await worker.fetch(req('/bank-balance', { method: 'POST', body: { balance: 123957.0 } }), env));
  assert.deepEqual(post, { ok: true });
  const get = await readJson(await worker.fetch(req('/bank-balance'), env));
  assert.equal(get.balance, 123957.0);
  assert.ok(get.checked_at && !Number.isNaN(Date.parse(get.checked_at)));
});

test('POST /bank-balance rejects a non-numeric balance and needs the token', async () => {
  const env = createEnv();
  const bad = await worker.fetch(req('/bank-balance', { method: 'POST', body: { balance: 'not-a-number' } }), env);
  assert.equal(bad.status, 400);
  const unauth = await worker.fetch(req('/bank-balance', { method: 'POST', token: null, body: { balance: 1 } }), env);
  assert.equal(unauth.status, 401);
});

test('POST /bank-balance rejects a missing/null/blank balance rather than silently storing ₦0', async () => {
  const env = createEnv();
  // Seed a real, valid balance first...
  await worker.fetch(req('/bank-balance', { method: 'POST', body: { balance: 123957.0 } }), env);
  // ...then confirm a failed portal check (no figure, or an empty/null one) can never overwrite it.
  for (const bad of [{}, { balance: null }, { balance: '' }]) {
    const res = await worker.fetch(req('/bank-balance', { method: 'POST', body: bad }), env);
    assert.equal(res.status, 400, `body ${JSON.stringify(bad)} must be rejected`);
  }
  const get = await readJson(await worker.fetch(req('/bank-balance'), env));
  assert.equal(get.balance, 123957.0, 'the last valid balance must still be the one stored');
});

test('bank_balance_refresh_requested travels through the generic /events mailbox', async () => {
  const env = createEnv();
  const post = await readJson(await worker.fetch(req('/events', { method: 'POST', body: { event: 'bank_balance_refresh_requested', requested_by: 'David' } }), env));
  assert.ok(post.ok && post.id);
  const get = await readJson(await worker.fetch(req('/events'), env));
  assert.equal(get.events.length, 1);
  assert.equal(get.events[0].event, 'bank_balance_refresh_requested');
  assert.equal(get.events[0].requested_by, 'David');
});

// ── balance history ───────────────────────────────────────────────
test('POST /bank-balance also writes a history entry and updates balance_last, alongside the single bank_balance key', async () => {
  const env = createEnv();
  await worker.fetch(req('/bank-balance', { method: 'POST', body: { balance: 100 } }), env);
  const single = JSON.parse(await env.KV.get('bank_balance'));
  assert.equal(single.balance, 100);

  const last = await env.KV.get('balance_last');
  assert.ok(last);
  const entry = JSON.parse(await env.KV.get(`bal:${last}`));
  assert.equal(entry.balance, 100);
  assert.equal(entry.id, last);
  assert.ok(entry.checked_at && !Number.isNaN(Date.parse(entry.checked_at)));
  assert.equal(entry.checked_at, single.checked_at);
});

test('GET /balance-history with no after returns entries in ascending id order, capped at 50', async () => {
  const env = createEnv();
  const first = await worker.fetch(req('/bank-balance', { method: 'POST', body: { balance: 1 } }), env);
  assert.equal(first.status, 200);
  await new Promise(r => setTimeout(r, 2));
  await worker.fetch(req('/bank-balance', { method: 'POST', body: { balance: 2 } }), env);
  await new Promise(r => setTimeout(r, 2));
  await worker.fetch(req('/bank-balance', { method: 'POST', body: { balance: 3 } }), env);

  const all = await readJson(await worker.fetch(req('/balance-history'), env));
  assert.equal(all.history.length, 3);
  assert.deepEqual(all.history.map(h => h.balance), [1, 2, 3]);
  assert.equal(all.last, await env.KV.get('balance_last'));
});

test('GET /balance-history follows the KV list cursor past a single page', async () => {
  const env = createEnv();
  // KV_LIST_PAGE_SIZE is 3 — seed more than that directly so a single-page list() would
  // miss some, the way Cloudflare's real page-limited list() would once bal: entries
  // (which never expire) pass its page size.
  const ids = [];
  for (let i = 0; i < 7; i++) {
    const id = String(i).padStart(13, '0') + '-aaaaaaaa';
    ids.push(id);
    await env.KV.put(`bal:${id}`, JSON.stringify({ balance: i, checked_at: new Date().toISOString(), id }));
  }
  const all = await readJson(await worker.fetch(req('/balance-history'), env));
  assert.deepEqual(all.history.map(h => h.id), ids);
  assert.equal(all.last, ids[ids.length - 1]);
});

test('GET /balance-history?after=<id> returns only entries after that id', async () => {
  const env = createEnv();
  const post1 = await readJson(await worker.fetch(req('/bank-balance', { method: 'POST', body: { balance: 10 } }), env));
  const last1 = await env.KV.get('balance_last');
  await new Promise(r => setTimeout(r, 2));
  await worker.fetch(req('/bank-balance', { method: 'POST', body: { balance: 20 } }), env);
  const last2 = await env.KV.get('balance_last');

  const after = await readJson(await worker.fetch(req(`/balance-history?after=${last1}`), env));
  assert.deepEqual(after.history.map(h => h.id), [last2]);
  assert.equal(after.history[0].balance, 20);
  assert.equal(after.last, last2);

  const none = await readJson(await worker.fetch(req(`/balance-history?after=${last2}`), env));
  assert.deepEqual(none, { history: [], last: last2 });
  assert.ok(post1.ok);
});

test('validateConfig checks the new balance-check supervisor fields', () => {
  const base = structuredClone(DEFAULT_CONFIG);
  assert.deepEqual(validateConfig(base), []);

  const badInterval = structuredClone(DEFAULT_CONFIG);
  badInterval.automations.supervisor.balance_check_interval_minutes = 0;
  assert.ok(validateConfig(badInterval).some(e => e.includes('balance_check_interval_minutes')));
  badInterval.automations.supervisor.balance_check_interval_minutes = -5;
  assert.ok(validateConfig(badInterval).some(e => e.includes('balance_check_interval_minutes')));

  for (const field of ['balance_check_active_from', 'balance_check_active_until']) {
    const bad = structuredClone(DEFAULT_CONFIG);
    bad.automations.supervisor[field] = '25:00';
    assert.ok(validateConfig(bad).some(e => e.includes(field)), `${field} must reject an invalid time`);
    const bad2 = structuredClone(DEFAULT_CONFIG);
    bad2.automations.supervisor[field] = 'not-a-time';
    assert.ok(validateConfig(bad2).some(e => e.includes(field)), `${field} must reject a non-time string`);
  }

  const badWindow = structuredClone(DEFAULT_CONFIG);
  badWindow.automations.supervisor.balance_match_window_days = 0;
  assert.ok(validateConfig(badWindow).some(e => e.includes('balance_match_window_days')));
  badWindow.automations.supervisor.balance_match_window_days = -1;
  assert.ok(validateConfig(badWindow).some(e => e.includes('balance_match_window_days')));

  const good = structuredClone(DEFAULT_CONFIG);
  good.automations.supervisor.balance_check_interval_minutes = 30;
  good.automations.supervisor.balance_check_active_from = '07:00';
  good.automations.supervisor.balance_check_active_until = '21:00';
  good.automations.supervisor.balance_match_window_days = 14;
  assert.deepEqual(validateConfig(good), []);
});

test('validateConfig stays backward compatible with a config saved before the balance-check fields existed', () => {
  // A config saved before this change has only interval_seconds/ping_every_cycles under
  // supervisor — the admin must still be able to save unrelated settings without being
  // blocked by four fields the Settings UI doesn't even show yet.
  const legacy = structuredClone(DEFAULT_CONFIG);
  legacy.automations.supervisor = { interval_seconds: 300, ping_every_cycles: 2 };
  assert.deepEqual(validateConfig(legacy), []);
});

test('POST /bank-balance asks the app to reconcile when the balance changes, retrying until it succeeds', async () => {
  const env = { ...createEnv(), APP_URL: 'https://app.example/' };
  const calls = [];
  let appStatus = 500;
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response('{}', { status: appStatus }); };
  try {
    const post = (balance) => worker.fetch(req('/bank-balance', { method: 'POST', body: { balance } }), env);
    await post(1061.73);                       // first ever reading: sync once
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://app.example/api/internal/run-bank-recon');
    assert.equal(calls[0].init.headers['x-watchdog-token'], TEST_TOKEN);
    await post(1061.73);                       // unchanged, but the last sync failed: retry
    assert.equal(calls.length, 2);
    appStatus = 200;
    await post(1061.73);                       // retry succeeds
    assert.equal(calls.length, 3);
    await post(1061.73);                       // unchanged and synced: nothing to do
    assert.equal(calls.length, 3);
    await post(27101.73);                      // money moved
    assert.equal(calls.length, 4);
  } finally { globalThis.fetch = original; }
});

test('POST /bank-balance never calls out when APP_URL is not configured', async () => {
  const env = createEnv();
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}'); };
  try {
    await worker.fetch(req('/bank-balance', { method: 'POST', body: { balance: 5 } }), env);
    await worker.fetch(req('/bank-balance', { method: 'POST', body: { balance: 6 } }), env);
  } finally { globalThis.fetch = original; }
  assert.equal(called, false);
});
