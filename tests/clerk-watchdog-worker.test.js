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
