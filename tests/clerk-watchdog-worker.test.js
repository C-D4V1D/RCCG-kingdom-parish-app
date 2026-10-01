import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import worker from '../workers/clerk-watchdog/worker.js';
import { DEFAULT_CONFIG, validateConfig } from '../workers/clerk-watchdog/config.js';

const TEST_TOKEN = 'test-watchdog-token';

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// In-memory KV stub over a Map, matching the {get, put} surface the worker uses.
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
    async list({ prefix = '' } = {}) {
      return { keys: [...map.keys()].filter(k => k.startsWith(prefix)).sort().map(name => ({ name })) };
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
