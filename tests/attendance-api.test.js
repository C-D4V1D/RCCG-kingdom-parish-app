// Attendance weeks: draft → submitted → locked (by the Sunday collection) → unlocked by
// the IT Admin, plus the forced PIN change for new users. Runs the real worker against
// an in-memory SQLite database through the demo D1 adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';
import { createD1 } from '../scripts/demo/d1-sqlite-adapter.mjs';
import { FINANCE_AUTH_HEADER } from './finance-auth-helper.mjs';

// Finance routes need a signed token (#313); the default is the IT-admin test token.
function call(DB, path, method = 'GET', body, headers = FINANCE_AUTH_HEADER) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  return onRequest({ request: new Request(`https://example.com/api/${path}`, init), env: { DB } })
    .then(async r => ({ status: r.status, body: JSON.parse(await r.text()) }));
}

const WEEK = '2026-01-11';            // a Sunday; its week is Mon 5 – Sun 11 Jan 2026
const full = {
  services: [
    { key: 'digging_deep', men: 2, women: 3, children: 7, preacher: 'Pst. Henry' },
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
  assert.ok(first.body.token, 'the forced-PIN-change login still gets a session token');
  const usherAuth = { Authorization: `Bearer ${first.body.token}` };

  const same = await call(DB, 'change-pin', 'POST', { userId: created.body.id, currentPin: '1234', newPin: '1234' }, usherAuth);
  assert.equal(same.status, 400);
  const changed = await call(DB, 'change-pin', 'POST', { userId: created.body.id, currentPin: '1234', newPin: '5678' }, usherAuth);
  assert.equal(changed.status, 200);
  assert.ok(changed.body.token, 'this device keeps a fresh token after the PIN change');
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

// ── Sign-in (#313) ───────────────────────────────────────────────

test('attendance and further-reports routes need a Finance sign-in', async () => {
  const DB = await freshDB();
  for (const [path, method, body] of [
    [`attendance?from=${WEEK}&to=${WEEK}`, 'GET'], [`attendance/${WEEK}`, 'PUT', { data: full }],
    [`attendance/${WEEK}/submit`, 'POST', { by: 'Usher', data: full }], [`attendance/${WEEK}/unlock`, 'POST', { userId: 'u1', pin: '0000' }],
    ['attendance-further?end=2026-01-31', 'GET'], ['attendance-further/2026-01-31', 'PUT', { data: { births: 1 } }],
  ]) {
    const r = await call(DB, path, method, body, {});
    assert.equal(r.status, 401, `${method} ${path}`);
    assert.equal(r.body.code, 'auth_required');
  }
  const rows = await DB.prepare(`SELECT COUNT(*) AS n FROM attendance_weeks`).first();
  assert.equal(rows.n, 0, 'nothing was written without a sign-in');
});

test('the unlock PIN check is throttled like sign-in (5 wrong PINs, then a pause)', async () => {
  const DB = await freshDB();
  for (let i = 0; i < 5; i++) {
    assert.equal((await call(DB, `attendance/${WEEK}/unlock`, 'POST', { userId: 'u1', pin: '9999' })).status, 403, `try ${i + 1}`);
  }
  const locked = await call(DB, `attendance/${WEEK}/unlock`, 'POST', { userId: 'u1', pin: '0000' });
  assert.equal(locked.status, 429);
  assert.match(locked.body.error, /Too many incorrect PIN attempts/);
});

// ── Last week of the period + Monthly report, and re-locking corrected weeks ──
// Cut-offs: Sun 28 Dec 2025 and Sun 25 Jan 2026, so the January period is 29 Dec – 25 Jan
// with weeks ending 4, 11, 18 and 25 Jan; week 4 (25 Jan) is the last week.
const LAST = '2026-01-25';
const cutoffDays = (dec, jan) => ({
  2025: [26, 23, 30, 27, 25, 29, 27, 31, 28, 26, 30, dec],
  2026: [jan, 22, 29, 26, 31, 28, 26, 30, 27, 25, 29, 27],
});
async function periodDB(jan = 25) {
  const DB = await freshDB();
  await DB.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('remCutoffDatesByYear',?)`)
    .bind(JSON.stringify(cutoffDays(28, jan))).run();
  return DB;
}
const auditTypes = async DB => (await DB.prepare(`SELECT type FROM audit_log`).all()).results.map(r => r.type);
const sunday = date => ({ date, source: 'sunday_collection', membersTithe: 100, totalCollection: 100, recordedBy: 'Accountant' });

test('the last week of a period cannot be submitted without the Monthly report (old clients get a plain 409)', async () => {
  const DB = await periodDB();
  const r = await call(DB, `attendance/${LAST}/submit`, 'POST', { by: 'Usher', data: full });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'further_not_submitted');
  assert.equal(r.body.weekNo, 4);
  assert.match(r.body.error, /Week 4 is the last week of the month/);
  assert.equal(await DB.prepare(`SELECT * FROM attendance_weeks WHERE week_end=?`).bind(LAST).first(), null);
  // Other weeks of the period are unchanged.
  assert.equal((await call(DB, `attendance/2026-01-18/submit`, 'POST', { by: 'Usher', data: full })).status, 200);
});

test('week N and the Monthly report are submitted together; blanks stay blank', async () => {
  const DB = await periodDB();
  const r = await call(DB, `attendance/${LAST}/submit`, 'POST', {
    by: 'Bro. Chidi', data: full, further: { data: { births: 2, deaths: null, fullPastors: 1, bogus: 9 } },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'submitted');
  assert.equal(r.body.further.periodEnd, LAST);
  assert.equal(r.body.further.periodStart, '2025-12-29');
  assert.deepEqual(r.body.further.data, { births: 2, deaths: null, fullPastors: 1 });
  assert.equal(r.body.further.furtherSubmittedBy, 'Bro. Chidi');
  const got = await call(DB, `attendance-further?end=${LAST}`);
  assert.equal(got.body.current.furtherSubmittedBy, 'Bro. Chidi');
  assert.ok(got.body.current.furtherSubmittedAt);
  assert.ok((await auditTypes(DB)).includes('attendance_further_submitted'));
});

test('a refused combined submit writes neither the week nor the Monthly report', async () => {
  const DB = await periodDB();
  const r = await call(DB, `attendance/${LAST}/submit`, 'POST', {
    by: 'Usher', data: { services: [{ key: 'sunday_service', men: 1 }] }, further: { data: { births: 3 } },
  });
  assert.equal(r.status, 400);
  assert.equal(await DB.prepare(`SELECT * FROM attendance_further WHERE period_end=?`).bind(LAST).first(), null);
  assert.equal(await DB.prepare(`SELECT * FROM attendance_weeks WHERE week_end=?`).bind(LAST).first(), null);
});

test('when the cut-off is not a Sunday, the last week is the one ending on the Sunday before it', async () => {
  const DB = await periodDB(24);                         // Saturday 24 Jan 2026
  const r = await call(DB, `attendance/2026-01-18/submit`, 'POST', { by: 'Usher', data: full });
  assert.equal(r.body.code, 'further_not_submitted');
  assert.equal((await call(DB, `attendance/${LAST}/submit`, 'POST', { by: 'Usher', data: full })).status, 200);
});

test('the cut-off Sunday collection gate names week N and the Monthly report', async () => {
  const DB = await periodDB();
  const r = await call(DB, 'income', 'POST', sunday(LAST));
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'attendance_not_submitted');
  assert.match(r.body.error, /Week 4's attendance and the Monthly report must be submitted first/);
});

test('editing a submitted Monthly report sends week N back to draft; editing week N clears the report confirmation', async () => {
  const DB = await periodDB();
  await call(DB, `attendance/${LAST}/submit`, 'POST', { by: 'Usher', data: full, further: { data: { births: 1 } } });
  const put = await call(DB, `attendance-further/${LAST}`, 'PUT', { periodStart: '2025-12-29', by: 'Usher', data: { births: 2 } });
  assert.equal(put.status, 200);
  assert.equal(put.body.furtherSubmittedBy, '');
  assert.equal((await call(DB, `attendance?from=${LAST}&to=${LAST}`)).body[0].status, 'draft');

  await call(DB, `attendance/${LAST}/submit`, 'POST', { by: 'Usher', data: full, further: { data: {} } });
  await call(DB, `attendance/${LAST}`, 'PUT', { by: 'Usher', data: full });
  const got = await call(DB, `attendance-further?end=${LAST}`);
  assert.equal(got.body.current.furtherSubmittedBy, '');
  assert.equal(got.body.current.data.births, 2, 'the figures themselves are kept');
});

test('the Monthly report is read-only once week N is locked, and editable again after the IT Admin unlocks it', async () => {
  const DB = await periodDB();
  await call(DB, `attendance/${LAST}/submit`, 'POST', { by: 'Usher', data: full, further: { data: { births: 1 } } });
  assert.equal((await call(DB, 'income', 'POST', sunday(LAST))).status, 200);
  const locked = await call(DB, `attendance-further/${LAST}`, 'PUT', { by: 'Usher', data: { births: 5 } });
  assert.equal(locked.status, 409);
  assert.equal(locked.body.code, 'further_locked');
  assert.match(locked.body.error, /Ask the IT Administrator to unlock week 4/);

  assert.equal((await call(DB, `attendance/${LAST}/unlock`, 'POST', { userId: 'u1', pin: '0000' })).status, 200);
  assert.equal((await call(DB, `attendance-further/${LAST}`, 'PUT', { by: 'Usher', data: { births: 5 } })).status, 200);
  assert.equal((await call(DB, `attendance?from=${LAST}&to=${LAST}`)).body[0].status, 'draft');
});

test('a corrected week locks again on re-submit when its Sunday collection is already saved', async () => {
  const DB = await periodDB();
  await call(DB, `attendance/${WEEK}/submit`, 'POST', { by: 'Usher', data: full });
  const income = await call(DB, 'income', 'POST', sunday(WEEK));
  await call(DB, `attendance/${WEEK}/unlock`, 'POST', { userId: 'u1', pin: '0000' });
  await call(DB, `attendance/${WEEK}`, 'PUT', { by: 'Usher', data: full });
  const again = await call(DB, `attendance/${WEEK}/submit`, 'POST', { by: 'Usher' });
  assert.equal(again.body.status, 'locked');
  assert.equal(again.body.incomeRef, income.body.id);
  assert.equal(again.body.lockedBy, 'Accountant');
  assert.ok((await auditTypes(DB)).includes('attendance_relocked'));

  // The last week re-locks too, together with its Monthly report.
  await call(DB, `attendance/${LAST}/submit`, 'POST', { by: 'Usher', data: full, further: { data: {} } });
  await call(DB, 'income', 'POST', sunday(LAST));
  await call(DB, `attendance/${LAST}/unlock`, 'POST', { userId: 'u1', pin: '0000' });
  const last = await call(DB, `attendance/${LAST}/submit`, 'POST', { by: 'Usher', data: full, further: { data: { births: 1 } } });
  assert.equal(last.body.status, 'locked');
  assert.equal((await call(DB, `attendance-further/${LAST}`, 'PUT', { data: { births: 2 } })).body.code, 'further_locked');
});

test('weeks before the gate date keep the old behaviour (no re-lock)', async () => {
  const DB = await periodDB();
  const before = '2026-01-04';                           // gate starts Mon 5 Jan
  await call(DB, 'income', 'POST', sunday(before));
  const r = await call(DB, `attendance/${before}/submit`, 'POST', { by: 'Usher', data: full });
  assert.equal(r.body.status, 'submitted');
  assert.equal(r.body.incomeRef, '');
});
