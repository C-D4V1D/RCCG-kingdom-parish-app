import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';
import { dublinToday, cutoffSignalMarkerKey } from '../functions/_lib/cutoff-date-signal.js';
import { financeToken } from './finance-auth-helper.mjs';

// Fake parishes, fake settings, stubbed delivery. Nothing here can reach a real box, Clerk AI or portal.
const today = dublinToday();
const [Y, M] = today.split('-').map(Number);
const MONTH = today.slice(0, 7);
const prevM = M === 1 ? 12 : M - 1;
const cut = Array(12).fill(20); cut[M - 1] = 20; cut[prevM - 1] = 10;
const PERIOD_END = `${MONTH}-20`;
const SAT = '659840';
const KEY_K = cutoffSignalMarkerKey(PERIOD_END);   // Kingdom shares ONE start marker with the cut-off date job and the Sunday save
const KEY_S = `remit_manual_signal_${SAT}_${MONTH}`;

function makeDB({ noSundays = false, sats = true } = {}) {
  const settings = new Map([['remCutoffDatesByYear', JSON.stringify({ [Y]: cut })]]);
  if (sats) settings.set('satParishes', JSON.stringify([{ code: SAT, name: 'Fake Sanctuary', active: true }, { code: '111111', name: 'Fake Off', active: false }]));
  const audit = [];
  const DB = {
    settings, audit,
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async first() { const v = settings.get(args[0]); return v === undefined ? null : { value: v }; },
        async all() {
          if (sql.includes("key IN ('remCutoffDatesByYear'")) return { results: [...settings].filter(([k]) => k === 'remCutoffDatesByYear').map(([key, value]) => ({ key, value })) };
          if (sql.includes('WHERE key IN (?')) return { results: [...settings].filter(([k]) => args.includes(k)).map(([key, value]) => ({ key, value })) };
          if (sql.includes('FROM income')) {
            if (noSundays) return { results: [] };
            const out = []; const d = new Date(args[0] + 'T00:00:00Z'); const end = new Date(args[1] + 'T00:00:00Z');
            for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push({ date: d.toISOString().slice(0, 10) });
            return { results: out };
          }
          return { results: [] };
        },
        async run() {
          if (sql.startsWith('INSERT INTO audit_log')) { audit.push(args); return { meta: { changes: 1 } }; }
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

async function call(DB, { method = 'POST', body, role = 'it_admin', boxOk = true, satDb, noToken = false, query = '' } = {}) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null }); return boxOk ? new Response('ok') : new Response('no', { status: 500 }); };
  try {
    const env = { DB, CRON_SECRET: 'cs', REMIT_WEBHOOK_URL: 'https://hooks.example/remit', REMIT_WEBHOOK_KEY: 'k' };
    if (satDb !== null) env[`SAT_${SAT}`] = satDb || makeDB();
    const headers = noToken ? {} : { Authorization: `Bearer ${await financeToken({ role })}`, 'Content-Type': 'application/json' };
    const res = await onRequest({ request: new Request('https://example.com/api/remit-file-now' + query, { method, headers, body: method === 'POST' ? JSON.stringify(body || {}) : undefined }), env, waitUntil() {} });
    return { status: res.status, json: await res.json().catch(() => null), calls: calls.filter(c => c.url.startsWith('https://hooks.example')).map(c => c.body) };
  } finally { globalThis.fetch = realFetch; }
}

test('one parish: sends exactly one signed signal for Kingdom, marks it started, and nothing goes to the other parish', async () => {
  const DB = makeDB();
  const r = await call(DB, { body: { parish: 'kingdom' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.results.length, 1); assert.equal(r.json.results[0].status, 'started');
  assert.equal(r.calls.length, 1);
  const p = r.calls[0];
  assert.equal(p.event, 'cutoff_collection_saved'); assert.equal(p.trigger, 'manual_button');
  assert.equal(p.periodEnd, PERIOD_END); assert.equal(p.month, MONTH); assert.ok(p.links, 'signed links present for Kingdom');
  assert.match(DB.settings.get(KEY_K), /^sent:/); assert.equal(DB.settings.has(KEY_S), false);
  assert.equal(DB.audit.length, 1);
});

test('a second tap for a parish already started sends nothing and says already', async () => {
  const DB = makeDB();
  await call(DB, { body: { parish: 'kingdom' } });
  const r = await call(DB, { body: { parish: 'kingdom' } });
  assert.equal(r.json.results[0].status, 'already'); assert.equal(r.calls.length, 0);
});

test('all parishes: Kingdom and each active satellite once, a satellite goes out as satellite with no links, an inactive parish is left out', async () => {
  const DB = makeDB();
  const r = await call(DB, { body: { parish: 'all' } });
  assert.deepEqual(r.json.results.map(x => [x.parish, x.status]), [['kingdom', 'started'], [SAT, 'started']]);
  assert.equal(r.calls.length, 2);
  const sat = r.calls.find(c => c.parish === SAT);
  assert.equal(sat.satellite, true); assert.equal(sat.links, null); assert.equal(sat.trigger, 'manual_button');
  const again = await call(DB, { body: { parish: 'all' } });
  assert.deepEqual(again.json.results.map(x => x.status), ['already', 'already']); assert.equal(again.calls.length, 0);
});

test('a failed delivery reports failed with a reason and stays retryable; the single retry then starts it', async () => {
  const DB = makeDB();
  const a = await call(DB, { body: { parish: 'kingdom' }, boxOk: false });
  assert.equal(a.json.results[0].status, 'failed'); assert.ok(a.json.results[0].reason); assert.equal(a.json.results[0].retry, true);
  assert.match(DB.settings.get(KEY_K), /^failed:/);
  const b = await call(DB, { body: { parish: 'kingdom' } });
  assert.equal(b.json.results[0].status, 'started'); assert.match(DB.settings.get(KEY_K), /^sent:/);
});

test('all parishes waits until every parish has all its weekly collections: refused, names the parish and the weeks, sends nothing', async () => {
  const DB = makeDB();
  const r = await call(DB, { body: { parish: 'all' }, satDb: makeDB({ noSundays: true }) });
  assert.equal(r.status, 409); assert.equal(r.calls.length, 0);
  assert.match(r.json.error, /Not all weekly collections are in yet/); assert.match(r.json.error, /Fake Sanctuary: \d{4}-\d{2}-\d{2}/);
  assert.equal(r.json.blocked.length, 1); assert.equal(r.json.blocked[0].parish, SAT); assert.ok(r.json.blocked[0].missing.length > 0);
  assert.equal(DB.settings.has(KEY_K), false); assert.equal(DB.settings.has(KEY_S), false);
});

test('one parish with its collections in can still be started on its own while another parish is missing weeks', async () => {
  const DB = makeDB();
  const k = await call(DB, { body: { parish: 'kingdom' }, satDb: makeDB({ noSundays: true }) });
  assert.equal(k.json.results[0].status, 'started'); assert.equal(k.calls.length, 1);
  const s = await call(DB, { body: { parish: SAT }, satDb: makeDB({ noSundays: true }) });
  assert.equal(s.json.results[0].status, 'failed'); assert.match(s.json.results[0].reason, /Missing: \d{4}-\d{2}-\d{2}/); assert.equal(s.calls.length, 0);
});

test('all parishes goes ahead when every parish has all its weekly collections', async () => {
  const r = await call(makeDB(), { body: { parish: 'all' } });
  assert.equal(r.status, 200); assert.equal(r.calls.length, 2);
});

test('status route names the missing weeks per parish so the page can disable the button', async () => {
  const DB = makeDB();
  const g = await call(DB, { method: 'GET', satDb: makeDB({ noSundays: true }) });
  const k = g.json.parishes.find(p => p.key === 'kingdom'), s = g.json.parishes.find(p => p.key === SAT);
  assert.deepEqual(k.missingSundays, []); assert.ok(s.missingSundays.length > 0);
  assert.ok(s.missingSundays.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d)));
});

test('a missing Sunday collection holds the start: nothing sent, nothing claimed', async () => {
  const DB = makeDB({ noSundays: true });
  const r = await call(DB, { body: { parish: 'kingdom' } });
  assert.equal(r.json.results[0].status, 'failed'); assert.match(r.json.results[0].reason, /Missing:/); assert.equal(r.calls.length, 0); assert.equal(DB.settings.has(KEY_K), false);
});

test('a Kingdom start already sent by the cut-off date job is not sent a second time', async () => {
  const DB = makeDB();
  DB.settings.set(cutoffSignalMarkerKey(PERIOD_END), 'sent:' + new Date().toISOString());
  const r = await call(DB, { body: { parish: 'kingdom' } });
  assert.equal(r.json.results[0].status, 'already'); assert.equal(r.calls.length, 0);
});

test('a pending claim from a live tap blocks a second tap', async () => {
  const DB = makeDB();
  DB.settings.set(KEY_K, 'pending:' + new Date().toISOString());
  const r = await call(DB, { body: { parish: 'kingdom' } });
  assert.equal(r.json.results[0].status, 'already'); assert.equal(r.calls.length, 0);
});

test('roles: IT admin and accountant can use it; pastor, signatory, viewer and no sign-in cannot (read or tap)', async () => {
  for (const role of ['it_admin', 'accountant']) {
    const g = await call(makeDB(), { method: 'GET', role });
    assert.equal(g.status, 200, role); assert.equal(g.json.parishes.length, 2);
  }
  for (const role of ['pastor', 'signatory', 'viewer', 'admin_officer', 'usher']) {
    const DB = makeDB();
    const p = await call(DB, { body: { parish: 'all' }, role });
    assert.equal(p.status, 403, role); assert.equal(p.calls.length, 0); assert.equal(DB.settings.has(KEY_K), false);
    assert.equal((await call(makeDB(), { method: 'GET', role })).status, 403, role + ' GET');
  }
  const none = await call(makeDB(), { body: { parish: 'all' }, noToken: true });
  assert.ok([401, 403].includes(none.status)); assert.equal(none.calls.length, 0);
});

test('status route: shows each parish, whether it was started this month, and the cut-off date', async () => {
  const DB = makeDB();
  await call(DB, { body: { parish: 'kingdom' } });
  const g = await call(DB, { method: 'GET' });
  assert.equal(g.json.periodEnd, PERIOD_END);
  const k = g.json.parishes.find(p => p.key === 'kingdom'), s = g.json.parishes.find(p => p.key === SAT);
  assert.equal(k.started, true); assert.equal(s.started, false);
});

test('bad input: unknown parish key is refused; a month with no cut-off date sends nothing', async () => {
  assert.equal((await call(makeDB(), { body: { parish: 'bogus' } })).status, 400);
  assert.equal((await call(makeDB(), { body: { parish: '999999' } })).status, 404);
  const DB = makeDB(); DB.settings.set('remCutoffDatesByYear', JSON.stringify({ [Y]: Array(12).fill(null) }));
  const r = await call(DB, { body: { parish: 'all' } });
  assert.equal(r.status, 409); assert.equal(r.calls.length, 0);
});

test('a satellite with no database connected is not started (single) and blocks all parishes; nothing is sent', async () => {
  const one = await call(makeDB(), { body: { parish: SAT }, satDb: null });
  assert.equal(one.json.results[0].status, 'failed'); assert.match(one.json.results[0].reason, /no database/i); assert.equal(one.calls.length, 0);
  const all = await call(makeDB(), { body: { parish: 'all' }, satDb: null });
  assert.equal(all.status, 409); assert.equal(all.calls.length, 0); assert.equal(all.json.blocked[0].noDatabase, true);
});

test('if the weekly-collections check cannot be read, all parishes and that parish refuse rather than send', async () => {
  const broken = { prepare() { throw new Error('db down'); } };
  const all = await call(makeDB(), { body: { parish: 'all' }, satDb: broken });
  assert.equal(all.status, 409); assert.equal(all.calls.length, 0);
  const one = await call(makeDB(), { body: { parish: SAT }, satDb: broken });
  assert.equal(one.json.results[0].status, 'failed'); assert.equal(one.calls.length, 0);
});

test('ordering: the cut-off date job started or is starting this period (sent / fresh pending) -> a button tap sends nothing', async () => {
  for (const v of ['sent:' + new Date().toISOString(), 'pending:' + new Date().toISOString(), 'sent:' + new Date().toISOString() + '|sunday']) {
    const DB = makeDB(); DB.settings.set(KEY_K, v);
    const r = await call(DB, { body: { parish: 'kingdom' } });
    assert.equal(r.json.results[0].status, 'already', v); assert.equal(r.calls.length, 0, v);
  }
});

test('ordering: the cut-off job failed earlier -> a button tap may start it, and the shared marker becomes sent (so the hourly job will skip it)', async () => {
  const DB = makeDB(); DB.settings.set(KEY_K, 'failed:' + new Date().toISOString());
  const r = await call(DB, { body: { parish: 'kingdom' } });
  assert.equal(r.json.results[0].status, 'started'); assert.equal(r.calls.length, 1);
  assert.match(DB.settings.get(KEY_K), /^sent:/);
  assert.equal(DB.settings.has(`remit_manual_signal_kingdom_${MONTH}`), false);
  const again = await call(DB, { body: { parish: 'kingdom' } });
  assert.equal(again.json.results[0].status, 'already'); assert.equal(again.calls.length, 0);
});

test('ordering: after a button start the cut-off job sees the shared marker as sent (its own skip rule is "marked")', async () => {
  const DB = makeDB();
  await call(DB, { body: { parish: 'kingdom' } });
  assert.ok(DB.settings.get(KEY_K).startsWith('sent:'));   // runCutoffDateSignal reads exactly this: getSettingValue(markerKey).startsWith('sent:')
});
