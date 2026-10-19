// The shared start marker, end to end on real SQLite databases: Sunday save, the hourly cut-off job and the Filing buttons.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';
import { dublinToday } from '../functions/_lib/cutoff-date-signal.js';
import { createSqliteD1 } from './sqlite-d1.mjs';
import { FINANCE_AUTH_HEADER, financeToken } from './finance-auth-helper.mjs';

const mkReq = (path, { method = 'GET', body, headers = {} } = {}) => {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  return new Request(`https://x/api/${path}`, init);
};
const ENVX = { REMIT_WEBHOOK_URL: 'https://hooks.example/clerk', REMIT_WEBHOOK_KEY: 'k', CRON_SECRET: 'cs' };

async function withFetch(sent, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => { try { sent.push(JSON.parse(init.body || '{}')); } catch { sent.push({}); } return new Response('{}'); };
  try { return await fn(); } finally { globalThis.fetch = real; }
}
const cutEvents = (sent) => sent.filter(b => b.event === 'cutoff_collection_saved');

async function setupSat() {
  const DB = createSqliteD1(), SAT = createSqliteD1(), waits = [];
  const env = { DB, SAT_659840: SAT };
  const call = (path, opts = {}, extra = {}) => onRequest({ request: mkReq(path, opts), env: { ...env, ...extra }, waitUntil: p => waits.push(p) });
  assert.equal((await call('init', { headers: FINANCE_AUTH_HEADER })).status, 200);
  const put = (k, v) => DB.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)`).bind(k, JSON.stringify(v)).run();
  await put('remCutoffDatesByYear', { 2026: [18, 22, 22, 19, 24, 21, 19, 23, 20, 18, 22, 13] });
  await put('satParishes', [{ code: '659840', name: 'Sanctuary of Favour Parish', active: true }]);
  const created = await (await call('users', { method: 'POST', headers: FINANCE_AUTH_HEADER, body: { name: 'Pastor Tunde', role: 'satellite', pin: '4321', parishCode: '659840' } })).json();
  const pastor = { Authorization: `Bearer ${await financeToken({ uid: created.id, role: 'satellite' })}` };
  await call('sat/context', { headers: pastor });
  await SAT.prepare(`DELETE FROM settings WHERE key='attendanceGateFrom'`).run();
  return { DB, SAT, call, pastor, waits };
}
const satSave = async (s, date) => { const r = await s.call('sat/income', { method: 'POST', headers: s.pastor, body: { date, membersTithe: 1000, totalCollection: 1000 } }, ENVX); assert.equal(r.status, 200); await Promise.all(s.waits); };

test('satellite Sunday save: marks the parish start in Kingdom\'s database (the one the button uses), once; a re-save still goes out', async () => {
  const s = await setupSat(); const sent = [];
  await withFetch(sent, async () => { await satSave(s, '2026-10-18'); await satSave(s, '2026-10-18'); });
  assert.equal(cutEvents(sent).length, 2);
  const m = await s.DB.prepare(`SELECT value FROM settings WHERE key='remit_manual_signal_659840_2026-10'`).first();
  assert.match(m.value, /^sent:.*\|sunday$/);
});

test('satellite Sunday save sends nothing when the button already started that parish for the month', async () => {
  const s = await setupSat(); const sent = [];
  await s.DB.prepare(`INSERT INTO settings (key,value) VALUES (?,?)`).bind('remit_manual_signal_659840_2026-10', 'sent:2026-10-18T09:00:00.000Z').run();
  await withFetch(sent, async () => { await satSave(s, '2026-10-18'); });
  assert.equal(cutEvents(sent).length, 0);
});

async function setupKingdom() {
  const DB = createSqliteD1();
  const env = { DB, ...ENVX };
  const call = (path, opts = {}) => onRequest({ request: mkReq(path, opts), env, waitUntil() {} });
  assert.equal((await call('init', { headers: FINANCE_AUTH_HEADER })).status, 200);
  const today = dublinToday(); const [Y, M, D] = today.split('-').map(Number);
  const days = Array(12).fill(10); days[M - 1] = D;           // today is a cut-off date
  await DB.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)`).bind('remCutoffDatesByYear', JSON.stringify({ [Y]: days })).run();
  await DB.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)`).bind('attendanceGateFrom', '2099-01-01').run();   // no Sundays required: this test is about the marker
  const admin = { Authorization: `Bearer ${await financeToken({ role: 'it_admin' })}` };
  const button = async () => (await (await call('remit-file-now', { method: 'POST', headers: admin, body: { parish: 'kingdom' } })).json()).results?.[0]?.status;
  const job = async () => (await call('internal/run-cutoff-date-signal', { method: 'POST', headers: { Authorization: 'Bearer cs' } })).json();
  return { DB, button, job, sunday: new Date(`${today}T00:00:00Z`).getUTCDay() === 0 };
}

test('the hourly cut-off job AFTER a button start sends nothing (one start signal in total)', async (t) => {
  const k = await setupKingdom(); if (k.sunday) return t.skip('today is a Sunday: the job never sends on a Sunday');
  const sent = [];
  await withFetch(sent, async () => {
    assert.equal(await k.button(), 'started');
    const j = await k.job(); assert.equal(j.sent, undefined);
  });
  assert.equal(cutEvents(sent).length, 1);
});

test('a button tap AFTER the hourly cut-off job started it sends nothing', async (t) => {
  const k = await setupKingdom(); if (k.sunday) return t.skip('today is a Sunday: the job never sends on a Sunday');
  const sent = [];
  await withFetch(sent, async () => {
    const j = await k.job(); assert.equal(j.sent, true);
    assert.equal(await k.button(), 'already');
  });
  assert.equal(cutEvents(sent).length, 1);
});
