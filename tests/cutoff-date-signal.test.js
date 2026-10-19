import test from 'node:test';
import assert from 'node:assert/strict';
import { decideCutoffSignal, dublinToday, cutoffSignalMarkerKey } from '../functions/_lib/cutoff-date-signal.js';

const period = { periodStart: '2026-09-22', periodEnd: '2026-10-21' };
const sundays = ['2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18'];
const all = new Set(sundays);

test('on the cut-off date (a Wednesday) with every Sunday in: send', () => {
  assert.equal(decideCutoffSignal({ today: '2026-10-21', period, sundays, haveSundays: all, marked: false }).action, 'send');
});
test('before the cut-off date nothing is sent', () => {
  assert.equal(decideCutoffSignal({ today: '2026-10-20', period, sundays, haveSundays: all, marked: false }).action, 'skip');
});
test('today is not a cut-off date: skip', () => {
  assert.equal(decideCutoffSignal({ today: '2026-10-21', period: null, sundays, haveSundays: all, marked: false }).action, 'skip');
});
test('a Sunday without a collection holds the start and names it', () => {
  const r = decideCutoffSignal({ today: '2026-10-21', period, sundays, haveSundays: new Set(['2026-09-27', '2026-10-04', '2026-10-18']), marked: false });
  assert.equal(r.action, 'wait');
  assert.deepEqual(r.missing, ['2026-10-11']);
});
test('a Sunday ON the cut-off date also needs its collection', () => {
  const p = { periodStart: '2026-10-19', periodEnd: '2026-10-25' };
  const r = decideCutoffSignal({ today: '2026-10-25', period: p, sundays: ['2026-10-25'], haveSundays: new Set(), marked: false });
  assert.equal(r.action, 'wait');
});
test('once only: already sent means skip', () => {
  assert.equal(decideCutoffSignal({ today: '2026-10-21', period, sundays, haveSundays: all, marked: true }).action, 'skip');
});
test('a period with no Sundays in scope sends', () => {
  assert.equal(decideCutoffSignal({ today: '2026-10-21', period, sundays: [], haveSundays: new Set(), marked: false }).action, 'send');
});
test('dublinToday uses the Dublin date near midnight', () => {
  assert.equal(dublinToday(new Date('2026-10-21T23:30:00Z')), '2026-10-22');   
  assert.equal(dublinToday(new Date('2026-07-01T23:30:00Z')), '2026-07-02');
});
test('marker key is per period', () => {
  assert.equal(cutoffSignalMarkerKey('2026-10-21'), 'remit_cutoff_signal_2026-10-21');
});
test("a Sunday AFTER the cut-off date without a collection does not hold the start", () => {
  const r = decideCutoffSignal({ today: "2026-10-21", period, sundays: [...sundays, "2026-10-25"], haveSundays: all, marked: false });
  assert.equal(r.action, "send");
});
