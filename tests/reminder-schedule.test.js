import test from 'node:test';
import assert from 'node:assert/strict';
import { reminderSendDayInfo, computeUnpaidMonths, smsPagesInfo } from '../functions/api/[[route]].js';

// ── reminderSendDayInfo: "Saturday before last Sunday" ──────────────────────
test('sat_before_last_sun: May 2026 send day is the 30th (Sat before Sun 31)', () => {
  // The last Sunday of May 2026 is the 31st, so the send day is Sat the 30th.
  const info = reminderSendDayInfo(2026, 5, 30, 'sat_before_last_sun', 'monthly', 10);
  assert.equal(info.isSendDay, true);
  assert.deepEqual(info.sendDays, [30]);
});

test('sat_before_last_sun: the 29th and 31st of May 2026 are NOT send days', () => {
  assert.equal(reminderSendDayInfo(2026, 5, 29, 'sat_before_last_sun', 'monthly', 10).isSendDay, false);
  assert.equal(reminderSendDayInfo(2026, 5, 31, 'sat_before_last_sun', 'monthly', 10).isSendDay, false);
});

test('sat_before_last_sun: June 2026 send day is the 27th (Sat before Sun 28)', () => {
  const info = reminderSendDayInfo(2026, 6, 27, 'sat_before_last_sun', 'monthly', 10);
  assert.equal(info.isSendDay, true);
  assert.deepEqual(info.sendDays, [27]);
});

// ── reminderSendDayInfo: day_of_month modes ─────────────────────────────────
test('day_of_month monthly: fires only on the configured day (clamped to month end)', () => {
  assert.equal(reminderSendDayInfo(2026, 5, 10, 'day_of_month', 'monthly', 10).isSendDay, true);
  assert.equal(reminderSendDayInfo(2026, 5, 11, 'day_of_month', 'monthly', 10).isSendDay, false);
  // Day 31 requested in February clamps to the 28th.
  assert.equal(reminderSendDayInfo(2026, 2, 28, 'day_of_month', 'monthly', 31).isSendDay, true);
});

test('day_of_month biweekly: fires on day N and N+14', () => {
  const info = reminderSendDayInfo(2026, 5, 24, 'day_of_month', 'biweekly', 10);
  assert.deepEqual(info.sendDays, [10, 24]);
  assert.equal(info.isSendDay, true);
  assert.equal(reminderSendDayInfo(2026, 5, 17, 'day_of_month', 'biweekly', 10).isSendDay, false);
});

// ── computeUnpaidMonths: pre-registration months excluded ───────────────────
test('computeUnpaidMonths: partner who joined this May only owes May (not Jan–Apr)', () => {
  // Nothing paid yet; current month May 2026; joined 2026-05-12.
  const months = computeUnpaidMonths(new Set(), { year: 2026, month: 5, startDate: '2026-05-12' });
  assert.deepEqual(months, ['May']);
});

test('computeUnpaidMonths: registration month included even when joined mid-month', () => {
  // A mid-month start date must NOT drop the join month itself.
  const months = computeUnpaidMonths(new Set(), { year: 2026, month: 6, startDate: '2026-05-31' });
  assert.deepEqual(months, ['May', 'June']);
});

test('computeUnpaidMonths: paid months are excluded', () => {
  const paid = new Set(['2026-5']); // year-month key format used by the engine
  const months = computeUnpaidMonths(paid, { year: 2026, month: 6, startDate: '2026-05-01' });
  assert.deepEqual(months, ['June']);
});

test('computeUnpaidMonths: no start date falls back to the full 12-month lookback', () => {
  const months = computeUnpaidMonths(new Set(), { year: 2026, month: 5, startDate: null });
  // 12 months ending May 2026 → Jun 2025 … May 2026 (12 entries).
  assert.equal(months.length, 12);
  assert.equal(months[months.length - 1], 'May');
  assert.equal(months[0], 'June');
});

// ── smsPagesInfo: segment / page counting ───────────────────────────────────
test('smsPagesInfo: short GSM-7 message is 1 page', () => {
  const r = smsPagesInfo('Dear John, your May pledge is outstanding.');
  assert.equal(r.encoding, 'GSM-7');
  assert.equal(r.pages, 1);
});

test('smsPagesInfo: 161 GSM-7 chars spills to 2 pages', () => {
  const r = smsPagesInfo('a'.repeat(161));
  assert.equal(r.encoding, 'GSM-7');
  assert.equal(r.pages, 2);
});

test('smsPagesInfo: an emoji forces Unicode and 70-char pages', () => {
  // A single 🙏 makes the whole message Unicode (70 chars/page).
  const r = smsPagesInfo('Thank you 🙏 ' + 'a'.repeat(65));
  assert.equal(r.encoding, 'Unicode');
  assert.equal(r.pages, 2); // 76 chars > 70 → 2 pages
});

test('smsPagesInfo: empty message costs 0 pages', () => {
  assert.equal(smsPagesInfo('').pages, 0);
});
