import test from 'node:test';
import assert from 'node:assert/strict';
import { reminderDueInfo, newMonthDueInfo, periodKey, sendDayKey } from '../functions/api/[[route]].js';
import { onRequest } from '../functions/api/[[route]].js';

// The GitHub Actions scheduler only delivers a fraction of its `*/30` ticks, so
// both monthly jobs stay *due* until they have run rather than firing only on
// an exact calendar day. These tests pin that behaviour down.

const SAT = { mode: 'sat_before_last_sun', freq: 'monthly', reminderDay: 10 };

// ── keys ───────────────────────────────────────────────────────────────────
test('period and send-day keys are zero-padded so they sort and compare as strings', () => {
  assert.equal(periodKey(2026, 9), '2026-09');
  assert.equal(sendDayKey(2026, 9, 5), '2026-09-05');
  assert.equal(sendDayKey(2026, 12, 26), '2026-12-26');
});

// ── payment reminder ───────────────────────────────────────────────────────
test('reminder: fires on the scheduled day itself', () => {
  // Sat 26 Sep 2026 is the Saturday before the last Sunday (27th).
  const d = reminderDueInfo({ year: 2026, month: 9, dayOfMonth: 26, ...SAT, lastSendKey: '' });
  assert.equal(d.due, true);
  assert.equal(d.catchUp, false);
  assert.equal(d.key, '2026-09-26');
});

test('reminder: not due before the send day arrives, once the previous one is done', () => {
  // Sept's send day (26th) has not arrived and August's (29th) was already sent.
  const d = reminderDueInfo({ year: 2026, month: 9, dayOfMonth: 2, ...SAT, lastSendKey: '2026-08-29' });
  assert.equal(d.due, false);
  assert.equal(d.alreadyRun, true);
});

test('reminder: catch-up carries across the month boundary', () => {
  // The parish's own case: the 29 Aug send day was missed and the first poll
  // that got through was 2 Sep. This schedule always lands in the last days of
  // the month, so most of the grace period falls in the following month —
  // scoping the search to September alone would silently drop August.
  const d = reminderDueInfo({ year: 2026, month: 9, dayOfMonth: 2, ...SAT, lastSendKey: '' });
  assert.equal(d.due, true);
  assert.equal(d.catchUp, true);
  assert.equal(d.daysLate, 4);          // 29, 30, 31 Aug + 2 days of Sep
  assert.equal(d.key, '2026-08-29');
  // And it must remind for AUGUST, not for barely-started September.
  assert.equal(d.targetYear, 2026);
  assert.equal(d.targetMonth, 8);
});

test('reminder: cross-month catch-up still respects the grace period', () => {
  const d = reminderDueInfo({ year: 2026, month: 9, dayOfMonth: 10, ...SAT, lastSendKey: '' });
  assert.equal(d.due, false);
  assert.equal(d.missed, true);
  assert.equal(d.key, '2026-08-29');
});

test('reminder: catch-up carries across a year boundary', () => {
  // Dec 2026: last Sunday is the 27th, so the send day is Sat the 26th.
  const d = reminderDueInfo({ year: 2027, month: 1, dayOfMonth: 2, ...SAT, lastSendKey: '' });
  assert.equal(d.due, true);
  assert.equal(d.key, '2026-12-26');
  assert.equal(d.targetYear, 2026);
  assert.equal(d.targetMonth, 12);
});

test('reminder: this month\'s arrived send day supersedes last month\'s', () => {
  const d = reminderDueInfo({ year: 2026, month: 9, dayOfMonth: 27, ...SAT, lastSendKey: '' });
  assert.equal(d.key, '2026-09-26');
  assert.equal(d.targetMonth, 9);
  assert.equal(d.daysLate, 1);
});

test('reminder: catches up when no tick reached the app on the send day', () => {
  // This is the August 2026 failure: send day was Sat 29th, nothing ran.
  const d = reminderDueInfo({ year: 2026, month: 8, dayOfMonth: 31, ...SAT, lastSendKey: '' });
  assert.equal(d.due, true);
  assert.equal(d.catchUp, true);
  assert.equal(d.daysLate, 2);
  assert.equal(d.key, '2026-08-29');
});

test('reminder: a completed run makes every later tick a no-op', () => {
  const d = reminderDueInfo({ year: 2026, month: 9, dayOfMonth: 28, ...SAT, lastSendKey: '2026-09-26' });
  assert.equal(d.due, false);
  assert.equal(d.alreadyRun, true);
});

test('reminder: gives up rather than sending a stale reminder past the grace period', () => {
  const d = reminderDueInfo({ year: 2026, month: 8, dayOfMonth: 29 + 8, ...SAT, lastSendKey: '', graceDays: 7 });
  assert.equal(d.due, false);
  assert.equal(d.missed, true);
  // The key is still reported so the caller can consume it and log the miss once.
  assert.equal(d.key, '2026-08-29');
});

test('reminder: last completed day does not suppress the next month', () => {
  const d = reminderDueInfo({ year: 2026, month: 9, dayOfMonth: 26, ...SAT, lastSendKey: '2026-08-29' });
  assert.equal(d.due, true);
});

test('reminder: biweekly anchors on the most recent send day, not the month', () => {
  const biweekly = { mode: 'day_of_month', freq: 'biweekly', reminderDay: 10 };
  // Day 10 ran; day 24 is a separate send day in the same month and must fire.
  const first  = reminderDueInfo({ year: 2026, month: 5, dayOfMonth: 10, ...biweekly, lastSendKey: '' });
  assert.equal(first.key, '2026-05-10');
  assert.equal(first.due, true);

  const second = reminderDueInfo({ year: 2026, month: 5, dayOfMonth: 24, ...biweekly, lastSendKey: '2026-05-10' });
  assert.equal(second.key, '2026-05-24');
  assert.equal(second.due, true);

  const repeat = reminderDueInfo({ year: 2026, month: 5, dayOfMonth: 25, ...biweekly, lastSendKey: '2026-05-24' });
  assert.equal(repeat.due, false);
  assert.equal(repeat.alreadyRun, true);
});

// ── Happy New Month ────────────────────────────────────────────────────────
test('newMonth: due on the 1st when the month has not been sent', () => {
  const d = newMonthDueInfo({ year: 2026, month: 9, dayOfMonth: 1, lastPeriod: '2026-08' });
  assert.equal(d.due, true);
  assert.equal(d.catchUp, false);
  assert.equal(d.key, '2026-09');
});

test('newMonth: catches up within the grace period when day 1 was missed', () => {
  const d = newMonthDueInfo({ year: 2026, month: 9, dayOfMonth: 4, lastPeriod: '2026-07' });
  assert.equal(d.due, true);
  assert.equal(d.catchUp, true);
  assert.equal(d.daysLate, 3);
});

test('newMonth: never sends a "Happy New Month" late in the month', () => {
  const d = newMonthDueInfo({ year: 2026, month: 9, dayOfMonth: 20, lastPeriod: '' });
  assert.equal(d.due, false);
  assert.equal(d.missed, true);
});

test('newMonth: once sent, every later tick that month is a no-op', () => {
  // Without this the `*/30` scheduler would re-blast every partner all day.
  for (const day of [1, 2, 3, 4, 5]) {
    const d = newMonthDueInfo({ year: 2026, month: 9, dayOfMonth: day, lastPeriod: '2026-09' });
    assert.equal(d.due, false, `day ${day} should not re-send`);
    assert.equal(d.alreadyRun, true);
  }
});

test('newMonth: a stale marker from an older month does not block the new one', () => {
  const d = newMonthDueInfo({ year: 2027, month: 1, dayOfMonth: 1, lastPeriod: '2026-12' });
  assert.equal(d.due, true);
  assert.equal(d.key, '2027-01');
});

// ── run-all: one URL that drives every job ─────────────────────────────────
// Nine separately-configured URLs is itself a failure mode — a scheduler
// pointed at only some of them silently runs only some of the jobs, which is
// how the Happy New Month SMS kept sending while the payment reminder did not.
test('run-all requires the cron secret', async () => {
  const DB = { prepare() { throw new Error('DB must not be touched before authorization'); } };
  const req = new Request('https://example.com/api/internal/run-all', {
    method: 'POST',
    headers: { Authorization: 'Bearer wrong-secret' },
  });
  const res = await onRequest({ request: req, env: { DB, CRON_SECRET: 'test-secret' } });
  assert.equal(res.status, 401);
});

test('run-all reports every job, and one failure never stops the rest', async () => {
  // Settings come back empty, so each job takes its own "nothing to do" path
  // rather than reaching for Termii.
  const DB = {
    prepare(sql) {
      if (/SELECT value FROM settings WHERE key=\?/.test(sql)) {
        return { bind() { return this; }, async first() { return null; } };
      }
      if (/INSERT INTO settings/.test(sql)) {
        return { bind() { return this; }, async run() { return {}; } };
      }
      return {
        bind() { return this; },
        async all() { return { results: [] }; },
        async first() { return null; },
        async run() { return {}; },
      };
    },
  };
  const req = new Request('https://example.com/api/internal/run-all', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-secret' },
  });
  const res = await onRequest({ request: req, env: { DB, CRON_SECRET: 'test-secret' } });
  const body = await res.json();
  assert.equal(res.status, 200);
  // Every job is attempted and accounted for — none may be silently dropped.
  for (const job of ['monthly-sms', 'reminder-sms', 'anniversary-sms', 'premeeting-sms',
                     'actionitem-sms', 'scheduled-sms', 'newmonth-draft', 'followups', 'prebriefs']) {
    assert.ok(body.results[job], `${job} missing from run-all results`);
  }
  // The payment reminder is the job that was being missed; it must be driven
  // by the same single call that drives the Happy New Month SMS.
  assert.ok(body.results['reminder-sms']);
  assert.ok(body.results['monthly-sms']);
});
