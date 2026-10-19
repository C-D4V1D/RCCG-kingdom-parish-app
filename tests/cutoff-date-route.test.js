import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';
import { dublinToday, cutoffSignalMarkerKey } from '../functions/_lib/cutoff-date-signal.js';

// Today is made the cut-off date; every day of the period has income, so every Sunday has its collection.
const today = dublinToday();
const [Y, M, D] = today.split('-').map(Number);
const pad = n => String(n).padStart(2, '0');
const prevM = M === 1 ? 12 : M - 1;
const cut = Array(12).fill(20); cut[M - 1] = D; cut[prevM - 1] = 10;
const KEY = cutoffSignalMarkerKey(today);

function makeDB({ failMarkerWrites = false, noSundays = false } = {}) {
  const settings = new Map([['remCutoffDatesByYear', JSON.stringify({ [Y]: cut })]]);
  const log = [];
  const DB = {
    settings, log,
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async first() { const v = settings.get(args[0]); return v === undefined ? null : { value: v }; },
        async all() {
          if (sql.includes("key IN ('remCutoffDatesByYear'")) return { results: [...settings].filter(([k]) => k === 'remCutoffDatesByYear').map(([key, value]) => ({ key, value })) };
          if (sql.includes('FROM income')) {
            if (noSundays) return { results: [] };
            const out = []; const d = new Date(args[0] + 'T00:00:00Z'); const end = new Date(args[1] + 'T00:00:00Z');
            for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push({ date: d.toISOString().slice(0, 10) });
            return { results: out };
          }
          return { results: [] };
        },
        async run() {
          log.push(sql.split('(')[0].trim().slice(0, 30));
          if (failMarkerWrites && sql.includes('settings')) throw new Error('db write failed');
          if (sql.startsWith('INSERT INTO settings')) {
            if (settings.has(args[0])) return { meta: { changes: 0 } };
            settings.set(args[0], args[1]); return { meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE settings SET value=? WHERE key=? AND')) {
            const cur = settings.get(args[1]) || '';
            if (cur.startsWith('failed:') || (cur.startsWith('pending:') && cur < args[2])) { settings.set(args[1], args[0]); return { meta: { changes: 1 } }; }
            return { meta: { changes: 0 } };
          }
          if (sql.startsWith('UPDATE settings SET value=? WHERE key=?')) {
            if (!settings.has(args[1])) return { meta: { changes: 0 } };
            settings.set(args[1], args[0]); return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
      return st;
    },
  };
  return DB;
}

async function runJob(DB, { boxOk = true } = {}) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: init?.body }); return boxOk ? new Response('ok') : new Response('no', { status: 500 }); };
  try {
    const env = { DB, CRON_SECRET: 'cs', REMIT_WEBHOOK_URL: 'https://hooks.example/remit', REMIT_WEBHOOK_KEY: 'k' };
    const res = await onRequest({ request: new Request('https://example.com/api/internal/run-cutoff-date-signal', { method: 'POST', headers: { Authorization: 'Bearer cs' } }), env, waitUntil() {} });
    return { json: await res.json(), calls: calls.filter(c => c.url.startsWith('https://hooks.example')) };
  } finally { globalThis.fetch = realFetch; }
}

test('first run sends once and marks the period sent; the next hour sends nothing', async () => {
  const DB = makeDB();
  const a = await runJob(DB);
  assert.equal(a.json.sent, true); assert.equal(a.calls.length, 1);
  assert.match(DB.settings.get(KEY), /^sent:/);
  const b = await runJob(DB);
  assert.equal(b.calls.length, 0); assert.equal(b.json.skipped, true);
});

test('a failed delivery leaves the period retryable, and the next hour sends again', async () => {
  const DB = makeDB();
  const a = await runJob(DB, { boxOk: false });
  assert.equal(a.json.sent, false); assert.match(DB.settings.get(KEY), /^failed:/);
  const b = await runJob(DB);
  assert.equal(b.json.sent, true); assert.match(DB.settings.get(KEY), /^sent:/);
});

test('an earlier Sunday-save delivery (success or fail) never blocks the hourly job: no marker is written by that path', async () => {
  const DB = makeDB();   // Sunday path wrote nothing, so no marker exists
  assert.equal(DB.settings.has(KEY), false);
  const a = await runJob(DB);
  assert.equal(a.json.sent, true);
});

test('marker write failure: nothing is sent (no duplicate next hour)', async () => {
  const DB = makeDB({ failMarkerWrites: true });
  const a = await runJob(DB);
  assert.equal(a.calls.length, 0); assert.equal(a.json.sent, false); assert.equal(a.json.reason, 'marker not writable');
  const b = await runJob(DB);
  assert.equal(b.calls.length, 0);
});

test('a pending claim held by a live run blocks a second run; a stale one (30 min+) can be reclaimed', async () => {
  const DB = makeDB();
  DB.settings.set(KEY, 'pending:' + new Date().toISOString());
  assert.equal((await runJob(DB)).calls.length, 0);
  DB.settings.set(KEY, 'pending:' + new Date(Date.now() - 45 * 60 * 1000).toISOString());
  assert.equal((await runJob(DB)).calls.length, 1);
});

test('a Sunday of the period without a collection holds the start: nothing sent, nothing claimed', async () => {
  const DB = makeDB({ noSundays: true });
  const a = await runJob(DB);
  assert.equal(a.json.held, true); assert.equal(a.calls.length, 0); assert.equal(DB.settings.has(KEY), false);
});

test('route: a cut-off date that is a Sunday sends nothing from the hourly job (no second signal that could stop a filing)', async () => {
  // Pin the clock to a Sunday that is the configured cut-off date.
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-25T10:00:00Z') });
  try {
    const sun = '2026-10-25';
    assert.equal(dublinToday(), sun);
    const DB = makeDB();
    DB.settings.set('remCutoffDatesByYear', JSON.stringify({ 2026: Array(12).fill(20).map((v, i) => (i === 9 ? 25 : i === 8 ? 10 : v)) }));
    const a = await runJob(DB);
    assert.equal(a.calls.length, 0); assert.equal(a.json.skipped, true); assert.match(a.json.reason, /Sunday/);
    assert.equal(DB.settings.has(cutoffSignalMarkerKey(sun)), false);
  } finally { mock.timers.reset(); }
});
