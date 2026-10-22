import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';

// Fake data only. Pin the clock to Wed 21 Oct 2026 (a weekday cut-off date) and keep it there.
const TODAY = '2026-10-21';
const CUT = Array(12).fill(20); CUT[9] = 21; CUT[8] = 20;   // Sep 20 -> period 21 Sep..21 Oct
const SUNDAYS = ['2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18'];

function makeDB({ sats = [], incomeDates = null, failMarkerWrites = false } = {}) {
  const settings = new Map([['remCutoffDatesByYear', JSON.stringify({ 2026: CUT })]]);
  if (sats.length) settings.set('satParishes', JSON.stringify(sats));
  const DB = {
    settings,
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async first() { const v = settings.get(args[0]); return v === undefined ? null : { value: v }; },
        async all() {
          if (sql.includes("key IN ('remCutoffDatesByYear'")) return { results: [...settings].filter(([k]) => k === 'remCutoffDatesByYear').map(([key, value]) => ({ key, value })) };
          if (sql.includes('key IN (?)') && args[0] === 'satParishes') return { results: settings.has('satParishes') ? [{ key: 'satParishes', value: settings.get('satParishes') }] : [] };
          if (sql.includes('FROM income')) {
            const dates = incomeDates || SUNDAYS;
            return { results: dates.map(date => ({ date })) };
          }
          return { results: [] };
        },
        async run() {
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

async function runJob(DB, extraEnv = {}, { boxOk = true } = {}) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null }); return boxOk ? new Response('ok') : new Response('no', { status: 500 }); };
  try {
    const env = { DB, CRON_SECRET: 'cs', REMIT_WEBHOOK_URL: 'https://hooks.example/remit', REMIT_WEBHOOK_KEY: 'k', ...extraEnv };
    const res = await onRequest({ request: new Request('https://example.com/api/internal/run-cutoff-date-signal', { method: 'POST', headers: { Authorization: 'Bearer cs' } }), env, waitUntil() {} });
    return { json: await res.json(), calls: calls.filter(c => c.url.startsWith('https://hooks.example')) };
  } finally { globalThis.fetch = realFetch; }
}

const SATS = [{ code: '111111', name: 'Fake One Parish' }, { code: '222222', name: 'Fake Two Parish' }];
const pin = () => mock.timers.enable({ apis: ['Date'], now: new Date(`${TODAY}T10:00:00Z`) });

test('cut-off date: Kingdom is already filed, each satellite with every Sunday is started once, and not again next hour', async () => {
  pin();
  try {
    const DB = makeDB({ sats: SATS });
    DB.settings.set(`remit_cutoff_signal_${TODAY}`, 'sent:2026-10-21T09:00:00.000Z');
    const a = await runJob(DB, { SAT_111111: makeDB(), SAT_222222: makeDB() });
    assert.equal(a.json.satellites.length, 2);
    assert.deepEqual(a.json.satellites.map(s => s.status), ['started', 'started']);
    assert.equal(a.calls.length, 2);
    for (const c of a.calls) { assert.equal(c.body.satellite, true); assert.equal(c.body.trigger, 'cutoff_date'); assert.equal(c.body.links, null); assert.equal(c.body.periodEnd, TODAY); }
    assert.deepEqual(a.calls.map(c => c.body.parish).sort(), ['111111', '222222']);
    assert.match(DB.settings.get('remit_manual_signal_111111_2026-10'), /^sent:/);
    const b = await runJob(DB, { SAT_111111: makeDB(), SAT_222222: makeDB() });
    assert.equal(b.calls.length, 0);
    assert.deepEqual(b.json.satellites.map(s => s.status), ['already', 'already']);
  } finally { mock.timers.reset(); }
});

test('a satellite missing a Sunday collection is held (nothing sent, no marker); the other still starts', async () => {
  pin();
  try {
    const DB = makeDB({ sats: SATS });
    DB.settings.set(`remit_cutoff_signal_${TODAY}`, 'sent:x');
    const a = await runJob(DB, { SAT_111111: makeDB({ incomeDates: ['2026-10-18'] }), SAT_222222: makeDB() });
    const by = Object.fromEntries(a.json.satellites.map(s => [s.parish, s]));
    assert.equal(by['111111'].status, 'failed'); assert.match(by['111111'].reason, /Missing: 2026-09-27, 2026-10-04, 2026-10-11/);
    assert.equal(by['222222'].status, 'started');
    assert.equal(a.calls.length, 1); assert.equal(a.calls[0].body.parish, '222222');
    assert.equal(DB.settings.has('remit_manual_signal_111111_2026-10'), false);
  } finally { mock.timers.reset(); }
});

test('a satellite whose database is not connected sends nothing; an inactive parish is ignored', async () => {
  pin();
  try {
    const DB = makeDB({ sats: [{ code: '111111', name: 'A' }, { code: '222222', name: 'B', active: false }] });
    DB.settings.set(`remit_cutoff_signal_${TODAY}`, 'sent:x');
    const a = await runJob(DB, {});
    assert.equal(a.calls.length, 0); assert.equal(a.json.satellites.length, 1); assert.equal(a.json.satellites[0].status, 'failed');
  } finally { mock.timers.reset(); }
});

test('a rejected delivery leaves the satellite retryable next hour', async () => {
  pin();
  try {
    const DB = makeDB({ sats: [SATS[0]] });
    DB.settings.set(`remit_cutoff_signal_${TODAY}`, 'sent:x');
    const a = await runJob(DB, { SAT_111111: makeDB() }, { boxOk: false });
    assert.equal(a.json.satellites[0].status, 'failed'); assert.match(DB.settings.get('remit_manual_signal_111111_2026-10'), /^failed:/);
    const b = await runJob(DB, { SAT_111111: makeDB() });
    assert.equal(b.json.satellites[0].status, 'started');
  } finally { mock.timers.reset(); }
});

test('Kingdom still starts as before and the satellites start in the same run; a button start blocks the job', async () => {
  pin();
  try {
    const DB = makeDB({ sats: SATS });
    DB.settings.set('remit_manual_signal_222222_2026-10', 'sent:2026-10-21T08:00:00.000Z');
    const a = await runJob(DB, { SAT_111111: makeDB(), SAT_222222: makeDB() });
    assert.equal(a.json.sent, true);
    const by = Object.fromEntries(a.json.satellites.map(s => [s.parish, s.status]));
    assert.deepEqual(by, { '111111': 'started', '222222': 'already' });
    assert.equal(a.calls.length, 2);
  } finally { mock.timers.reset(); }
});

test('not a cut-off date, or a Sunday cut-off date: no satellite is touched', async () => {
  try {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-22T10:00:00Z') });
    let DB = makeDB({ sats: SATS });
    let a = await runJob(DB, { SAT_111111: makeDB() });
    assert.equal(a.calls.length, 0); assert.equal(a.json.satellites, undefined);
    mock.timers.reset();
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-25T10:00:00Z') });
    DB = makeDB({ sats: SATS });
    DB.settings.set('remCutoffDatesByYear', JSON.stringify({ 2026: Array(12).fill(20).map((v, i) => (i === 9 ? 25 : v)) }));
    a = await runJob(DB, { SAT_111111: makeDB() });
    assert.equal(a.calls.length, 0); assert.equal(a.json.satellites, undefined);
  } finally { mock.timers.reset(); }
});
