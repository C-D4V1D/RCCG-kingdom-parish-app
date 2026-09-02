import test from 'node:test';
import assert from 'node:assert/strict';
import { reminderDueInfo, newMonthDueInfo, periodKey, sendDayKey } from '../functions/api/[[route]].js';

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

test('reminder: not due before the send day arrives', () => {
  const d = reminderDueInfo({ year: 2026, month: 9, dayOfMonth: 2, ...SAT, lastSendKey: '' });
  assert.equal(d.due, false);
  assert.equal(d.targetDay, null);
  assert.match(d.reason, /Not a reminder send day/);
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
