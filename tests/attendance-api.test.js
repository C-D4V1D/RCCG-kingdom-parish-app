// Attendance weeks: draft → submitted → locked (by the Sunday collection) → unlocked by
// the IT Admin, plus the forced PIN change for new users. Runs the real worker against
// an in-memory SQLite database through the demo D1 adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';
import { createD1 } from '../scripts/demo/d1-sqlite-adapter.mjs';

function call(DB, path, method = 'GET', body) {
  const init = { method };
  if (body !== undefined) { init.headers = { 'Content-Type': 'application/json' }; init.body = JSON.stringify(body); }
  return onRequest({ request: new Request(`https://example.com/api/${path}`, init), env: { DB } })
    .then(async r => ({ status: r.status, body: JSON.parse(await r.text()) }));
}

const WEEK = '2026-01-11';            // a Sunday; its week is Mon 5 – Sun 11 Jan 2026
const full = {
  services: [
    { key: 'digging_deep', men: 2, women: 3, children: 7, preacher: 'Bro. Odili' },
    { key: 'faith_clinic', noService: true, reason: 'Public holiday' },
    { key: 'sunday_service', men: 3, women: 6, children: 14, firstTimers: 2 },
    { key: 'sunday_school', men: 2, women: 4, children: 10 },
  ],
};

async function freshDB() {
  const DB = createD1(':memory:');
  await call(DB, 'init');
  // Gate every Sunday collection from 5 Jan 2026 on.
  await DB.prepare(`UPDATE settings SET value='2026-01-05' WHERE key='attendanceGateFrom'`).run();
  return DB;
}

test('init seeds the attendance gate start date as a Monday', async () => {
  const DB = createD1(':memory:');
  await call(DB, 'init');
  const row = await DB.prepare(`SELECT value FROM settings WHERE key='attendanceGateFrom'`).first();
  assert.match(row.value, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(`${row.value}T00:00:00Z`).getUTCDay(), 1);
});

test('a week cannot be submitted until Digging Deep, Faith Clinic and Sunday Service are done', async () => {
  const DB = await freshDB();
  const draft = await call(DB, `attendance/${WEEK}`, 'PUT', { by: 'Usher', data: { services: [{ key: 'sunday_service', men: 1 }] } });
  assert.equal(draft.status, 200);
  assert.equal(draft.body.status, 'draft');
  const refused = await call(DB, `attendance/${WEEK}/submit`, 'POST', { by: 'Usher' });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /Digging Deep, Faith Clinic/);

  // "No service held" needs a reason to count.
  const noReason = await call(DB, `attendance/${WEEK}/submit`, 'POST', {
    by: 'Usher', data: { services: full.services.map(s => s.key === 'faith_clinic' ? { ...s, reason: '' } : s) },
  });
  assert.equal(noReason.status, 400);
  assert.match(noReason.body.error, /Faith Clinic/);

  const ok = await call(DB, `attendance/${WEEK}/submit`, 'POST', { by: 'Bro. Chidi', data: full });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'submitted');
  assert.equal(ok.body.submittedBy, 'Bro. Chidi');
  assert.ok(ok.body.submittedAt);
  // Dates of the fixed services come from the week, not the client.
  const list = await call(DB, `attendance?from=${WEEK}&to=${WEEK}`);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].data.services.find(s => s.key === 'sunday_service').men, 3);
});

test('non-Sunday and future weeks are rejected; counts are clamped', async () => {
  const DB = await freshDB();
  assert.equal((await call(DB, 'attendance/2026-01-12', 'PUT', { data: {} })).status, 400);
  assert.equal((await call(DB, 'attendance/2099-01-04', 'PUT', { data: {} })).status, 400);
  const r = await call(DB, `attendance/${WEEK}`, 'PUT', { data: { services: [{ key: 'sunday_service', men: -4, women: 2.7 }, { key: 'bogus', men: 9 }] } });
  const s = r.body.data.services;
  assert.equal(s.length, 1);
  assert.equal(s[0].men, 0);
  assert.equal(s[0].women, 2);
});

test('a Sunday collection is refused until the week is submitted, then locks it', async () => {
  const DB = await freshDB();
  const income = { date: WEEK, source: 'sunday_collection', membersTithe: 4700, totalCollection: 4700, usher: 'Head Usher', recordedBy: 'Accountant' };
  const blocked = await call(DB, 'income', 'POST', income);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, 'attendance_not_submitted');
  assert.equal(blocked.body.weekEnd, WEEK);

  await call(DB, `attendance/${WEEK}/submit`, 'POST', { by: 'Usher', data: full });
  // A mid-week date maps to the same week.
  const saved = await call(DB, 'income', 'POST', { ...income, date: '2026-01-08' });
  assert.equal(saved.status, 200);
  const [week] = (await call(DB, `attendance?from=${WEEK}&to=${WEEK}`)).body;
  assert.equal(week.status, 'locked');
  assert.equal(week.incomeRef, saved.body.id);
  assert.equal(week.lockedBy, 'Accountant');

  const edit = await call(DB, `attendance/${WEEK}`, 'PUT', { by: 'Usher', data: full });
  assert.equal(edit.status, 409);
});

test('collections before the gate start date are never blocked', async () => {
  const DB = await freshDB();
  const r = await call(DB, 'income', 'POST', { date: '2026-01-04', source: 'sunday_collection', membersTithe: 100, totalCollection: 100 });
  assert.equal(r.status, 200);
});

test('only the IT Admin (with a correct PIN) can unlock a locked week', async () => {
  const DB = await freshDB();
  await call(DB, `attendance/${WEEK}/submit`, 'POST', { by: 'Usher', data: full });
  await call(DB, 'income', 'POST', { date: WEEK, source: 'sunday_collection', membersTithe: 100, totalCollection: 100, recordedBy: 'Acc' });
  assert.equal((await call(DB, `attendance/${WEEK}/unlock`, 'POST', { userId: 'u3', pin: '2222' })).status, 403);
  assert.equal((await call(DB, `attendance/${WEEK}/unlock`, 'POST', { userId: 'u1', pin: '9999' })).status, 403);
  const ok = await call(DB, `attendance/${WEEK}/unlock`, 'POST', { userId: 'u1', pin: '0000' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'submitted');
  // Editing after unlock sends it back to draft until re-submitted.
  const edited = await call(DB, `attendance/${WEEK}`, 'PUT', { by: 'Usher', data: full });
  assert.equal(edited.body.status, 'draft');
  assert.equal(edited.body.submittedBy, '');
});

test('new users with a default PIN must change it at first sign-in', async () => {
  const DB = await freshDB();
  const created = await call(DB, 'users', 'POST', { name: 'Bro. Chidi', role: 'usher', pin: '1234', mustChangePin: true });
  await call(DB, 'users', 'POST', { name: 'Sis. Ngozi', role: 'usher', pin: '1234', mustChangePin: true });
  const noName = await call(DB, 'auth/login', 'POST', { role: 'usher', pin: '1234' });
  assert.equal(noName.body.error, 'Please select your name');
  const first = await call(DB, 'auth/login', 'POST', { role: 'usher', pin: '1234', userId: created.body.id });
  assert.equal(first.status, 200);
  assert.equal(first.body.mustChangePin, true);

  const same = await call(DB, 'change-pin', 'POST', { userId: created.body.id, currentPin: '1234', newPin: '1234' });
  assert.equal(same.status, 400);
  const changed = await call(DB, 'change-pin', 'POST', { userId: created.body.id, currentPin: '1234', newPin: '5678' });
  assert.equal(changed.status, 200);
  const again = await call(DB, 'auth/login', 'POST', { role: 'usher', pin: '5678', userId: created.body.id });
  assert.equal(again.body.mustChangePin, undefined);

  // An IT Admin PIN reset is a new default PIN.
  await call(DB, `users/${created.body.id}`, 'PUT', { pin: '4321' });
  const afterReset = await call(DB, 'auth/login', 'POST', { role: 'usher', pin: '4321', userId: created.body.id });
  assert.equal(afterReset.body.mustChangePin, true);
});

// ── Further reports (monthly) ─────────────────────────────────────

test('further reports: PUT then GET, sanitization, and merge on partial update', async () => {
  const DB = await freshDB();

  const put1 = await call(DB, 'attendance-further/2026-01-31', 'PUT', {
    by: 'Bro. Chidi',
    periodStart: '2026-01-01',
    data: { births: -5, deaths: 2.9, marriages: '', notAKey: 99 },
  });
  assert.equal(put1.status, 200);
  assert.equal(put1.body.periodEnd, '2026-01-31');
  assert.equal(put1.body.periodStart, '2026-01-01');
  assert.equal(put1.body.data.births, 0);      // clamped, not negative
  assert.equal(put1.body.data.deaths, 2);      // floored
  assert.equal(put1.body.data.marriages, null); // blank -> null
  assert.equal(put1.body.data.notAKey, undefined); // unknown key dropped
  assert.equal(put1.body.updatedBy, 'Bro. Chidi');

  const get1 = await call(DB, 'attendance-further?end=2026-01-31');
  assert.equal(get1.status, 200);
  assert.equal(get1.body.current.data.deaths, 2);
  assert.equal(get1.body.previous, null); // nothing earlier yet

  // Second PUT only touches births; deaths must survive from the earlier save.
  const put2 = await call(DB, 'attendance-further/2026-01-31', 'PUT', { by: 'Sis. Ngozi', data: { births: 4 } });
  assert.equal(put2.status, 200);
  assert.equal(put2.body.data.births, 4);
  assert.equal(put2.body.data.deaths, 2);

  // The audit entry for "started" is written once, on first insert only.
  const audit = await DB.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE type='attendance_further_started'`).first();
  assert.equal(audit.n, 1);
});

test('further reports: GET returns the latest earlier period as "previous"', async () => {
  const DB = await freshDB();
  await call(DB, 'attendance-further/2025-12-31', 'PUT', { by: 'Usher', data: { births: 1 } });
  await call(DB, 'attendance-further/2026-01-31', 'PUT', { by: 'Usher', data: { births: 2 } });

  const get = await call(DB, 'attendance-further?end=2026-01-31');
  assert.equal(get.status, 200);
  assert.equal(get.body.current.data.births, 2);
  assert.equal(get.body.previous.periodEnd, '2025-12-31');
  assert.equal(get.body.previous.data.births, 1);
});

test('further reports: bad dates are rejected with 400', async () => {
  const DB = await freshDB();
  const badPut = await call(DB, 'attendance-further/not-a-date', 'PUT', { by: 'Usher', data: {} });
  assert.equal(badPut.status, 400);
  const badGet = await call(DB, 'attendance-further?end=not-a-date');
  assert.equal(badGet.status, 400);
});
