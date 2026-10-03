// Full backup (every table, every parish database), chunked restore, and Cloudflare Time Travel restore.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequest } from '../functions/api/[[route]].js';
import { D1_DATABASE_IDS, BACKUP_FORMAT } from '../functions/_lib/backup.js';
import { createSqliteD1 } from './sqlite-d1.mjs';
import { FINANCE_AUTH_HEADER, financeToken } from './finance-auth-helper.mjs';

function call(env, path, method = 'GET', body, { host = 'x', headers = FINANCE_AUTH_HEADER } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  return onRequest({ request: new Request(`https://${host}/api/${path}`, init), env, waitUntil() {} });
}

async function setup() {
  const DB = createSqliteD1();
  const SAT = createSqliteD1();
  const env = { DB, SAT_659840: SAT };
  assert.equal((await call(env, 'init')).status, 200);
  assert.equal((await call({ DB: SAT }, 'init')).status, 200);
  await DB.prepare(`INSERT INTO users (id,name,role,pin) VALUES ('u9','Bro. Admin','it_admin','sha256$secret')`).run();
  await DB.prepare(`INSERT INTO kpsc_partners (id, full_name) VALUES ('P1','Bro. Partner')`).run();
  await DB.prepare(`INSERT INTO income (id, date, total_collection) VALUES ('INC-1','2026-09-27',5000)`).run();
  await DB.prepare(`INSERT INTO app_secrets (k, v) VALUES ('signing','top-secret')`).run().catch(() => {});
  await SAT.prepare(`INSERT INTO income (id, date, total_collection) VALUES ('SAT-INC','2026-09-27',700)`).run();
  return { DB, SAT, env };
}

test('database ids match wrangler.toml', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  const [prod, preview] = toml.split('[env.preview]');
  const idOf = (part, binding) => (new RegExp(`binding = "${binding}"[\\s\\S]*?database_id = "([^"]+)"`).exec(part) || [])[1];
  for (const [key, binding] of [['main', 'DB'], ['sat_659840', 'SAT_659840'], ['sat_597445', 'SAT_597445'], ['sat_761516', 'SAT_761516']]) {
    assert.equal(D1_DATABASE_IDS.production[key], idOf(prod, binding), `production ${key}`);
    assert.equal(D1_DATABASE_IDS.preview[key], idOf(preview, binding), `preview ${key}`);
  }
});

test('the full backup has every table of every parish, but no secrets, sessions or PINs', async () => {
  const { env } = await setup();
  const res = await call(env, 'admin/backup');
  assert.equal(res.status, 200);
  const b = await res.json();
  assert.equal(b.format, BACKUP_FORMAT);
  assert.deepEqual(Object.keys(b.databases), ['main', 'sat_659840']);
  const main = b.databases.main.tables;
  assert.deepEqual(main.kpsc_partners.map(r => r.id), ['P1']);
  assert.ok(Array.isArray(main.attendance_weeks), 'attendance is included');
  assert.ok(!('app_secrets' in main) && !('kpsc_sessions' in main) && !('auth_throttle' in main));
  assert.ok(main.users.length && main.users.every(u => !('pin' in u)), 'PINs are left out');
  assert.deepEqual(b.databases.sat_659840.tables.income.map(r => r.id), ['SAT-INC']);
});

test('restoring table by table puts the backup back and keeps sign-in accounts', async () => {
  const { DB, SAT, env } = await setup();
  const b = await (await call(env, 'admin/backup')).json();
  // Things change after the backup...
  await DB.prepare(`INSERT INTO income (id, date, total_collection) VALUES ('INC-LATER','2026-10-04',1)`).run();
  await DB.prepare(`DELETE FROM kpsc_partners`).run();
  await DB.prepare(`UPDATE users SET pin='sha256$new' WHERE id='u9'`).run();
  await SAT.prepare(`DELETE FROM income`).run();
  // ...then the backup is restored, one table at a time, as the browser does.
  for (const [db, d] of Object.entries(b.databases)) {
    for (const [table, rows] of Object.entries(d.tables)) {
      const r = await call(env, 'admin/restore-table', 'POST', { db, table, rows, first: true });
      assert.equal(r.status, 200, `${db}.${table}`);
    }
  }
  assert.deepEqual((await DB.prepare(`SELECT id FROM income ORDER BY id`).all()).results.map(r => r.id), ['INC-1']);
  assert.deepEqual((await DB.prepare(`SELECT id FROM kpsc_partners`).all()).results.map(r => r.id), ['P1']);
  assert.equal((await DB.prepare(`SELECT pin FROM users WHERE id='u9'`).first()).pin, 'sha256$new', 'the current PIN is kept');
  assert.deepEqual((await SAT.prepare(`SELECT id FROM income`).all()).results.map(r => r.id), ['SAT-INC']);
});

test('a big table is split into statements within the 100-value limit, and unknown tables are skipped', async () => {
  const { DB, env } = await setup();
  const rows = Array.from({ length: 250 }, (_, i) => ({ id: `N${i}`, type: 'x', message: `m${i}`, is_read: 0 }));
  const r = await call(env, 'admin/restore-table', 'POST', { db: 'main', table: 'notifications', rows, first: true });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).inserted, 250);
  assert.equal((await DB.prepare(`SELECT COUNT(*) AS n FROM notifications`).first()).n, 250);
  const skip = await (await call(env, 'admin/restore-table', 'POST', { db: 'main', table: 'no_such_table', rows: [{ a: 1 }], first: true })).json();
  assert.equal(skip.skipped, true);
  assert.equal((await call(env, 'admin/restore-table', 'POST', { db: 'sat_999', table: 'income', rows: [] })).status, 400);
});

test('only the IT admin can back up or restore', async () => {
  const { env } = await setup();
  const accountant = { Authorization: `Bearer ${await financeToken({ role: 'accountant' })}` };
  assert.equal((await call(env, 'admin/backup', 'GET', undefined, { headers: accountant })).status, 403);
  assert.equal((await call(env, 'admin/time-travel', 'GET', undefined, { headers: accountant })).status, 403);
});

test('Time Travel: not set up until CF_D1_API_TOKEN exists; restore and undo call Cloudflare for the right database', async () => {
  const { DB, env } = await setup();
  const off = await (await call(env, 'admin/time-travel')).json();
  assert.equal(off.configured, false);

  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), auth: init?.headers?.Authorization });
    const prev = calls.length === 1 ? 'bm-before-restore' : 'bm-before-undo';
    return new Response(JSON.stringify({ success: true, result: { bookmark: 'bm-now', previous_bookmark: prev } }), { status: 200 });
  };
  try {
    const live = { ...env, CF_D1_API_TOKEN: 'cf-token' };
    const host = 'rccg-kingdom-parish-app.pages.dev';
    const info = await (await call(live, 'admin/time-travel', 'GET', undefined, { host })).json();
    assert.equal(info.configured, true);
    assert.equal(info.production, true);
    assert.deepEqual(info.databases.map(d => d.key), ['main', 'sat_659840']);

    assert.equal((await call(live, 'admin/time-travel/restore', 'POST', { db: 'main', at: '2099-01-01T00:00:00Z' }, { host })).status, 400, 'future refused');
    const r = await call(live, 'admin/time-travel/restore', 'POST', { db: 'main', at: '2026-10-01T08:00:00.000Z' }, { host });
    assert.equal(r.status, 200);
    assert.match(calls[0].url, /\/d1\/database\/dcc63f58-6079-44ba-900c-ff58bc81c4e8\/time_travel\/restore\?timestamp=2026-10-01T08%3A00%3A00.000Z$/);
    assert.equal(calls[0].auth, 'Bearer cf-token');
    const undo = JSON.parse((await DB.prepare(`SELECT value FROM settings WHERE key='time_travel_undo'`).first()).value);
    assert.deepEqual(undo.bookmarks, { main: 'bm-before-restore' });

    assert.equal((await call(live, 'admin/time-travel/undo', 'POST', {}, { host })).status, 200);
    assert.match(calls[1].url, /time_travel\/restore\?bookmark=bm-before-restore$/);
    // A preview deployment talks to the preview database only.
    await call(live, 'admin/time-travel/restore', 'POST', { db: 'main', at: '2026-10-01T08:00:00.000Z' }, { host: 'abc.rccg-kingdom-parish-app.pages.dev' });
    assert.match(calls[2].url, /eb14d315-57c2-4c13-ab9b-7115e7ae7580/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('only the IT admin can set which Google app "Restore from Google Drive" signs in to', async () => {
  const { DB, env } = await setup();
  const accountant = { Authorization: `Bearer ${await financeToken({ role: 'accountant' })}` };
  const bad = await call(env, 'settings', 'POST', { googleDriveClientId: 'evil.apps.googleusercontent.com' }, { headers: accountant });
  assert.equal(bad.status, 403);
  assert.equal((await call(env, 'settings', 'POST', { googleDriveClientId: '123-abc.apps.googleusercontent.com' })).status, 200);
  assert.equal((await DB.prepare(`SELECT value FROM settings WHERE key='googleDriveClientId'`).first()).value, '123-abc.apps.googleusercontent.com');
});
