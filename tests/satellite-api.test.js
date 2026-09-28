// Satellite parishes (/api/sat/...): each parish's own database, a pastor sign-in locked to its two pages, the
// Area's cut-offs / rates / that parish's quotas copied in, and the month-end signal naming the parish.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';
import { createSqliteD1 } from './sqlite-d1.mjs';
import { FINANCE_AUTH_HEADER, financeToken, TEST_AUTOMATION_KEY } from './finance-auth-helper.mjs';

function req(path, { method = 'GET', body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  return new Request(`https://x/api/${path}`, init);
}

async function setup() {
  const DB = createSqliteD1();
  const SAT = createSqliteD1();
  const waits = [];
  const env = { DB, SAT_659840: SAT };
  const call = (path, opts = {}, extraEnv = {}) =>
    onRequest({ request: req(path, opts), env: { ...env, ...extraEnv }, waitUntil: p => waits.push(p) });
  assert.equal((await call('init', { headers: FINANCE_AUTH_HEADER })).status, 200);
  const put = (k, v) => DB.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)`).bind(k, JSON.stringify(v)).run();
  await put('remCutoffDatesByYear', { 2026: [18, 22, 22, 19, 24, 21, 19, 23, 20, 18, 22, 13] });
  await put('satParishes', [{ code: '659840', name: 'Sanctuary of Favour Parish', active: true }, { code: '597445', name: 'Good Shepherd Parish', active: false }]);
  await put('satQuotas', { '659840': [{ label: 'CSR', amount: 1500 }, { label: 'Camp', amount: 2500 }] });
  const created = await (await call('users', { method: 'POST', headers: FINANCE_AUTH_HEADER,
    body: { name: 'Pastor Tunde', role: 'satellite', pin: '4321', parishCode: '659840' } })).json();
  const pastor = { Authorization: `Bearer ${await financeToken({ uid: created.id, role: 'satellite' })}` };
  return { DB, SAT, call, pastor, waits, created };
}

test('a satellite user needs a parish code, and login options carry it', async () => {
  const { call, created } = await setup();
  assert.equal(created.parishCode, '659840');
  const bad = await call('users', { method: 'POST', headers: FINANCE_AUTH_HEADER, body: { name: 'X', role: 'satellite', pin: '1234' } });
  assert.equal(bad.status, 400);
  const opts = await (await call('auth/options')).json();
  assert.equal(opts.find(o => o.id === created.id).parishCode, '659840');
});

test('a pastor sign-in is refused everywhere outside /api/sat, reads included', async () => {
  const { call, pastor } = await setup();
  for (const path of ['income', 'settings', 'users', 'expenses', 'attendance?from=2026-09-01&to=2026-10-31', 'remittances', 'init']) {
    assert.equal((await call(path, { headers: pastor })).status, 403, path);
  }
});

test('the pastor works in the parish database, which gets the Area settings and its own quotas', async () => {
  const { DB, SAT, call, pastor } = await setup();
  const ctx = await (await call('sat/context', { headers: pastor })).json();
  assert.deepEqual([ctx.code, ctx.name, ctx.active], ['659840', 'Sanctuary of Favour Parish', true]);
  const s = await (await call('sat/settings', { headers: pastor })).json();
  assert.deepEqual(s.remCutoffDatesByYear, { 2026: [18, 22, 22, 19, 24, 21, 19, 23, 20, 18, 22, 13] });
  assert.deepEqual(s.quotaList, [{ label: 'CSR', amount: 1500 }, { label: 'Camp', amount: 2500 }]);
  assert.equal(s.churchName, 'Sanctuary of Favour Parish');
  // an income row lands in the parish database only, as a Sunday collection recorded by the pastor
  const r = await call('sat/income', { method: 'POST', headers: pastor,
    body: { date: '2026-09-27', membersTithe: 42000, thanksgiving: 8500, totalCollection: 50500, source: 'other', bankTransferAmount: 99, recordedBy: 'someone else' } });
  const saved = await r.json();
  assert.equal(r.status, 200, JSON.stringify(saved));
  const row = await SAT.prepare(`SELECT * FROM income WHERE id=?`).bind(saved.id).first();
  assert.equal(row.source, 'sunday_collection');
  assert.equal(row.bank_transfer_amount, 0);
  assert.equal(row.members_tithe, 42000);
  assert.equal((await DB.prepare(`SELECT COUNT(*) n FROM income WHERE id=?`).bind(saved.id).first()).n, 0);
  const list = await (await call('sat/income', { headers: pastor })).json();
  assert.ok(list.some(x => x.id === saved.id));
  // Kingdom's attendance rule runs on the parish database: once it applies, a Sunday needs its attendance first
  await SAT.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('attendanceGateFrom','2026-01-05')`).run();
  const blocked = await call('sat/income', { method: 'POST', headers: pastor, body: { date: '2026-10-04', membersTithe: 1000, totalCollection: 1000 } });
  assert.notEqual(blocked.status, 200);
  assert.match(await blocked.text(), /attendance/i);
});

test('only the pastor, the IT admin (?parish) and the read-only box key reach /api/sat', async () => {
  const { call } = await setup();
  assert.equal((await call('sat/context?parish=659840', { headers: FINANCE_AUTH_HEADER })).status, 200);
  assert.equal((await call('sat/context', { headers: FINANCE_AUTH_HEADER })).status, 404);          // no parish named
  assert.equal((await call('sat/context?parish=761516', { headers: FINANCE_AUTH_HEADER })).status, 404); // no database bound
  const box = { 'X-Automation-Key': TEST_AUTOMATION_KEY };
  assert.equal((await call('sat/income?parish=659840', { headers: box })).status, 200);
  assert.equal((await call('sat/income?parish=659840', { method: 'POST', headers: box, body: {} })).status, 403);
  const treasurer = { Authorization: `Bearer ${await financeToken({ uid: 'u9', role: 'treasurer' })}` };
  assert.equal((await call('sat/context?parish=659840', { headers: treasurer })).status, 403);
  assert.equal((await call('sat/expenses?parish=659840', { headers: FINANCE_AUTH_HEADER })).status, 404);  // not a satellite page
});

test('a paused parish: its pastor is refused', async () => {
  const { DB, call } = await setup();
  const u = await (await call('users', { method: 'POST', headers: FINANCE_AUTH_HEADER,
    body: { name: 'Pastor G', role: 'satellite', pin: '1111', parishCode: '597445' } })).json();
  const h = { Authorization: `Bearer ${await financeToken({ uid: u.id, role: 'satellite' })}` };
  const r = await call('sat/context', { headers: h }, { SAT_597445: createSqliteD1() });
  assert.equal(r.status, 403);
  assert.ok(DB);
});

test('saving the cut-off Sunday sends the month-end signal naming the parish', async () => {
  const { SAT, call, pastor, waits } = await setup();
  await call('sat/context', { headers: pastor });   // prepares the parish database
  await SAT.prepare(`DELETE FROM settings WHERE key='attendanceGateFrom'`).run();   // this test is about the signal
  const sent = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => { sent.push({ url: String(url), body: JSON.parse(init.body || '{}') }); return new Response('{}'); };
  try {
    const env = { REMIT_WEBHOOK_URL: 'https://hooks.example/clerk', REMIT_WEBHOOK_KEY: 'k' };
    for (const date of ['2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18']) {
      const r = await call('sat/income', { method: 'POST', headers: pastor, body: { date, membersTithe: 1000, totalCollection: 1000 } }, env);
      assert.equal(r.status, 200, `${date}: ${await r.clone().text()}`);
    }
    await Promise.all(waits);
    const cut = sent.map(s => s.body).filter(b => b.event === 'cutoff_collection_saved' && b.periodEnd === '2026-10-18');
    assert.ok(cut.length >= 1, JSON.stringify(sent.map(s => s.body.collectionDate)));
    assert.equal(cut[cut.length - 1].parish, '659840');
    assert.equal(cut[cut.length - 1].satellite, true);
    assert.equal(cut[cut.length - 1].links, null);
  } finally { globalThis.fetch = real; }
});
