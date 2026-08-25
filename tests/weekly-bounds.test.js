// Week bucketing for the Dashboard's Weekly Net Retained chart. The parish's week runs
// to its collection day, so the number of weeks shown must equal the number of Sundays
// in the period — August 2026 showed six weeks for five Sundays because the period's
// last day (Monday the 31st) was clipped into a week of its own that had no Sunday.
import test from 'node:test';
import assert from 'node:assert/strict';

function makeElement() {
  return {
    style: {}, innerHTML: '', textContent: '', value: '', disabled: false, files: [],
    appendChild() {}, insertBefore() {}, remove() {}, addEventListener() {}, setAttribute() {},
    getAttribute() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
}
const documentStub = {
  readyState: 'complete', body: makeElement(),
  getElementById() { return null; }, createElement() { return makeElement(); }, addEventListener() {},
};
globalThis.document = documentStub;
globalThis.window = { document: documentStub, location: { pathname: '/' }, addEventListener() {} };
Object.defineProperty(globalThis, 'localStorage', { value: { getItem() { return null; }, setItem() {}, removeItem() {} }, configurable: true });
Object.defineProperty(globalThis, 'history', { value: { replaceState() {} }, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
globalThis.window.localStorage = globalThis.localStorage;
globalThis.window.history = globalThis.history;
globalThis.window.navigator = globalThis.navigator;

await import(new URL(`../src/js/app.js?weekly-bounds-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;

const weeks = (from, to) => App._buildSundayWeekBounds(from, to);

test('August 2026 gives one week per Sunday, not a stub week for the 31st', () => {
  // Sat 1 Aug – Mon 31 Aug 2026. Sundays: 2, 9, 16, 23, 30.
  const w = weeks('2026-08-01', '2026-08-31');
  assert.equal(w.length, 5, 'five Sundays must give five weeks');
  assert.deepEqual(w, [
    { from: '2026-08-01', to: '2026-08-02' },
    { from: '2026-08-03', to: '2026-08-09' },
    { from: '2026-08-10', to: '2026-08-16' },
    { from: '2026-08-17', to: '2026-08-23' },
    { from: '2026-08-24', to: '2026-08-31' },  // the 31st folds into the last week
  ]);
});

test('the trailing days are absorbed, never dropped — spending on them still counts', () => {
  const w = weeks('2026-08-01', '2026-08-31');
  assert.equal(w[w.length - 1].to, '2026-08-31', 'the period end must still be covered');
  assert.equal(w[0].from, '2026-08-01', 'the period start must still be covered');
  // No gaps and no overlaps across the whole period.
  for (let i = 1; i < w.length; i++) {
    const prevEnd = new Date(w[i - 1].to + 'T00:00:00');
    prevEnd.setDate(prevEnd.getDate() + 1);
    assert.equal(w[i].from, prevEnd.toISOString().slice(0, 10), `week ${i} must start the day after week ${i - 1} ends`);
  }
});

test('every week holds exactly one Sunday', () => {
  for (const [from, to] of [
    ['2026-08-01', '2026-08-31'],  // starts Saturday, ends Monday
    ['2026-02-01', '2026-02-28'],  // starts Sunday
    ['2026-06-01', '2026-06-30'],  // starts Monday
    ['2026-07-20', '2026-08-23'],  // a remittance period, mid-month to mid-month
  ]) {
    const w = weeks(from, to);
    assert.equal(w.length, App._countSundaysInRange(from, to), `week count for ${from}..${to}`);
    for (const wk of w) {
      assert.equal(App._countSundaysInRange(wk.from, wk.to), 1, `${wk.from}..${wk.to} should hold one Sunday`);
    }
  }
});

test('a period with a single Sunday, or none at all, is still handled', () => {
  assert.deepEqual(weeks('2026-08-02', '2026-08-02'), [{ from: '2026-08-02', to: '2026-08-02' }]);
  // No Sunday in range: one bucket is kept so the days are not lost.
  const none = weeks('2026-08-03', '2026-08-07');
  assert.equal(none.length, 1);
  assert.deepEqual(none[0], { from: '2026-08-03', to: '2026-08-07' });
});

test('an invalid or inverted range yields no weeks rather than looping', () => {
  assert.deepEqual(weeks('2026-08-31', '2026-08-01'), []);
  assert.deepEqual(weeks('', '2026-08-31'), []);
  assert.deepEqual(weeks('2026-08-01', ''), []);
});
