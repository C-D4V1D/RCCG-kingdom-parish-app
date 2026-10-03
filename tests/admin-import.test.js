// Restoring a backup (POST /api/admin/import) must only replace what the backup file carries. The app's
// backup export has no KPSC data, so a restore must never delete KPSC accounts, partners or payments.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';
import { createSqliteD1 } from './sqlite-d1.mjs';
import { FINANCE_AUTH_HEADER } from './finance-auth-helper.mjs';

function call(DB, path, method = 'GET', body) {
  const init = { method, headers: { ...FINANCE_AUTH_HEADER } };
  if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  return onRequest({ request: new Request(`https://x/api/${path}`, init), env: { DB }, waitUntil() {} });
}

test('restoring a backup keeps KPSC data and the approved petty-cash limit', async () => {
  const DB = createSqliteD1();
  assert.equal((await call(DB, 'init')).status, 200);
  await DB.prepare(`INSERT INTO kpsc_partners (id, full_name) VALUES ('P1', 'Bro. Partner')`).run();
  await DB.prepare(`UPDATE petty_config SET max_float=80000 WHERE id='main'`).run();
  await DB.prepare(`INSERT INTO income (id, date, total_collection) VALUES ('OLD', '2026-01-04', 1)`).run();

  const res = await call(DB, 'admin/import', 'POST', {
    users: [], settings: { churchName: 'RCCG Kingdom Parish' },
    income: [{ id: 'INC-1', date: '2026-09-27', membersTithe: 5000, totalCollection: 5000 }],
  });
  assert.equal(res.status, 200);

  const partners = await DB.prepare(`SELECT id FROM kpsc_partners`).all();
  assert.deepEqual(partners.results.map(r => r.id), ['P1']);
  const income = await DB.prepare(`SELECT id FROM income`).all();
  assert.deepEqual(income.results.map(r => r.id), ['INC-1']);
  const cfg = await DB.prepare(`SELECT max_float FROM petty_config WHERE id='main'`).first();
  assert.equal(cfg.max_float, 80000);
});

test('the admin routes take the Finance IT-admin sign-in and refuse other Finance roles', async () => {
  const { financeToken } = await import('./finance-auth-helper.mjs');
  const DB = createSqliteD1();
  assert.equal((await call(DB, 'init')).status, 200);
  const accountant = { Authorization: `Bearer ${await financeToken({ role: 'accountant' })}` };
  const res = await onRequest({ request: new Request('https://x/api/admin/clear-data', { method: 'POST', headers: accountant }), env: { DB }, waitUntil() {} });
  assert.equal(res.status, 403);
  assert.equal((await call(DB, 'admin/clear-data', 'POST')).status, 200);
});
