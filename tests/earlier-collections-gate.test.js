// The cut-off Sunday's collection (the last Sunday of a remittance period) can only be saved
// once every earlier Sunday of the period has its collection: saving it starts the month-end
// filing, and a missing Sunday would be filed as zero.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, sundaysBetween } from '../functions/api/[[route]].js';
import { createD1 } from '../scripts/demo/d1-sqlite-adapter.mjs';
import { FINANCE_AUTH_HEADER } from './finance-auth-helper.mjs';

function call(DB, path, method = 'GET', body) {
  const init = { method, headers: { ...FINANCE_AUTH_HEADER } };
  if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  return onRequest({ request: new Request(`https://example.com/api/${path}`, init), env: { DB } })
    .then(async r => ({ status: r.status, body: JSON.parse(await r.text()) }));
}

const full = {
  services: [
    { key: 'digging_deep', men: 2, women: 3, children: 7, preacher: 'Pst. Henry' },
    { key: 'faith_clinic', noService: true, reason: 'Public holiday' },
    { key: 'sunday_service', men: 3, women: 6, children: 14, firstTimers: 2 },
    { key: 'sunday_school', men: 2, women: 4, children: 10 },
  ],
};
const LAST = '2026-01-25';                 // cut-off Sunday; period Mon 29 Dec 2025 – Sun 25 Jan 2026
const sunday = date => ({ date, source: 'sunday_collection', membersTithe: 100, totalCollection: 100, recordedBy: 'Accountant' });

async function periodDB() {
  const DB = createD1(':memory:');
  await call(DB, 'init');
  await DB.prepare(`UPDATE settings SET value='2026-01-05' WHERE key='attendanceGateFrom'`).run();
  await DB.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('remCutoffDatesByYear',?)`).bind(JSON.stringify({
    2025: [26, 23, 30, 27, 25, 29, 27, 31, 28, 26, 30, 28],
    2026: [25, 22, 29, 26, 31, 28, 26, 30, 27, 25, 29, 27],
  })).run();
  // Attendance is in for every gated week, and week N carries the Monthly report.
  for (const wk of ['2026-01-11', '2026-01-18']) {
    assert.equal((await call(DB, `attendance/${wk}/submit`, 'POST', { by: 'Usher', data: full })).status, 200);
  }
  assert.equal((await call(DB, `attendance/${LAST}/submit`, 'POST', { by: 'Usher', data: full, further: { data: { births: 1 } } })).status, 200);
  return DB;
}

test('sundaysBetween lists every Sunday in the range, both ends included', () => {
  assert.deepEqual(sundaysBetween('2025-12-29', '2026-01-25'), ['2026-01-04', '2026-01-11', '2026-01-18', '2026-01-25']);
  assert.deepEqual(sundaysBetween('2026-01-04', '2026-01-04'), ['2026-01-04']);
  assert.deepEqual(sundaysBetween('2026-01-05', '2026-01-10'), []);
  assert.deepEqual(sundaysBetween('bad', '2026-01-10'), []);
});

test('the cut-off Sunday collection is refused until every earlier Sunday of the period is in', async () => {
  const DB = await periodDB();
  let r = await call(DB, 'income', 'POST', sunday(LAST));
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'earlier_collections_missing');
  // 4 Jan is before the gate start (5 Jan), so only the gated Sundays are asked for.
  assert.deepEqual(r.body.missing, ['2026-01-11', '2026-01-18']);
  assert.match(r.body.error, /Sun 11 Jan and Sun 18 Jan first/);
  assert.equal(await DB.prepare(`SELECT id FROM income WHERE date=?`).bind(LAST).first(), null);

  assert.equal((await call(DB, 'income', 'POST', sunday('2026-01-11'))).status, 200);
  r = await call(DB, 'income', 'POST', sunday(LAST));
  assert.equal(r.status, 409);
  assert.deepEqual(r.body.missing, ['2026-01-18']);
  assert.match(r.body.error, /Record the Sunday collection for Sun 18 Jan first/);

  assert.equal((await call(DB, 'income', 'POST', sunday('2026-01-18'))).status, 200);
  assert.equal((await call(DB, 'income', 'POST', sunday(LAST))).status, 200);
});

test('a second sitting on an already-saved cut-off Sunday is never refused', async () => {
  const DB = await periodDB();
  for (const d of ['2026-01-11', '2026-01-18', LAST]) assert.equal((await call(DB, 'income', 'POST', sunday(d))).status, 200);
  await DB.prepare(`DELETE FROM income WHERE date='2026-01-11'`).run();     // an earlier Sunday removed later
  const r = await call(DB, 'income', 'POST', { ...sunday(LAST), holyCommunionOffering: 50, membersTithe: 0, totalCollection: 50 });
  assert.equal(r.status, 200);
});

test('other Sundays and other income are never held by this gate', async () => {
  const DB = await periodDB();
  assert.equal((await call(DB, 'income', 'POST', sunday('2026-01-18'))).status, 200);   // not a cut-off date
  const other = await call(DB, 'income', 'POST', { date: LAST, source: 'other_income', membersTithe: 0, totalCollection: 10, recordedBy: 'Accountant' });
  assert.notEqual(other.body.code, 'earlier_collections_missing');
});
