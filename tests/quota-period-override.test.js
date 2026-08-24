// Per-period quota overrides — marking a fixed quota "not due" for one remittance
// period. The quota list is global and every unpaid period is recomputed from it, so
// the point of these tests is that a single period changes and no other one does.
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

await import(new URL(`../src/js/app.js?quota-override-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.window?.App || globalThis.window.App;

const lines  = (quotas, from, to) => App._getQuotaLinesForPeriod(quotas, from, to);
const total  = (quotas, from, to) => App._sumQuotaLines(lines(quotas, from, to));
const lineFor = (quotas, from, to, label) => lines(quotas, from, to).find(l => l.label === label);

// All three periods are fully in the past, so proration is complete and each figure is
// the quota's whole amount — that keeps the assertions about the override exact. A
// period still running would prorate by Sundays accrued, which is tested separately.
const JUN = ['2026-05-20', '2026-06-23'];
const JUL = ['2026-06-24', '2026-07-23'];
const AUG = ['2026-07-24', '2026-08-23'];

test('the period key comes from the period end month, not the capped working date', () => {
  assert.equal(App._quotaPeriodKey(new Date(2026, 7, 23)), '2026-08');
  assert.equal(App._quotaPeriodKey(new Date(2026, 0, 5)), '2026-01');
  assert.equal(App._quotaPeriodKey(new Date('nonsense')), '');
  // 20 Jul – 23 Aug is the "August" period even though it starts in July.
  assert.equal(lineFor([{ label: 'Regional Contribution', amount: 4500 }], ...AUG, 'Regional Contribution').periodKey, '2026-08');
});

test('a quota marked not due for one period is dropped from that period only', () => {
  const quotas = [{ label: 'Regional Contribution', amount: 4500, overrides: { '2026-08': 0 } }];

  const aug = lineFor(quotas, ...AUG, 'Regional Contribution');
  assert.equal(aug.amount, 0);
  assert.equal(aug.isWaived, true);
  assert.equal(aug.basis, 'Not due for this period');
  assert.equal(total(quotas, ...AUG), 0, 'a waived quota must add nothing to the period total');

  // The neighbouring periods are untouched — this is the whole point.
  assert.equal(lineFor(quotas, ...JUN, 'Regional Contribution').amount, 4500);
  assert.equal(lineFor(quotas, ...JUL, 'Regional Contribution').amount, 4500);
  assert.equal(total(quotas, ...JUN), 4500);
  assert.equal(total(quotas, ...JUL), 4500);
});

test('zeroing the monthly amount instead would wipe every period — the behaviour the override avoids', () => {
  const zeroed = [{ label: 'Regional Contribution', amount: 0 }];
  assert.equal(total(zeroed, ...JUN), 0);
  assert.equal(total(zeroed, ...JUL), 0);
  assert.equal(total(zeroed, ...AUG), 0);
  assert.equal(lines(zeroed, ...AUG).length, 0, 'an unconfigured quota produces no line at all');
});

test('the waived line is kept for display but excluded from anything that carries money', () => {
  const quotas = [
    { label: 'Regional Contribution', amount: 4500, overrides: { '2026-08': 0 } },
    { label: 'RMF', amount: 5000 },
  ];
  const all = lines(quotas, ...AUG);
  assert.equal(all.length, 2, 'the waived quota stays on screen so its absence is explained');
  assert.deepEqual(App._payableQuotaLines(all).map(l => l.label), ['RMF']);
  assert.equal(App._sumQuotaLines(all), 5000);
});

test('an override can also set a different amount for one period', () => {
  const quotas = [{ label: 'Regional Contribution', amount: 4500, overrides: { '2026-08': 9000 } }];
  const aug = lineFor(quotas, ...AUG, 'Regional Contribution');
  assert.equal(aug.amount, 9000);
  assert.equal(aug.isWaived, false);
  assert.equal(aug.isOverridden, true);
  assert.equal(aug.baseMonthlyAmount, 4500, 'the normal figure is kept so the UI can show what changed');
  assert.equal(lineFor(quotas, ...JUL, 'Regional Contribution').amount, 4500);
});

test('malformed override entries fall back to the normal monthly amount', () => {
  const cases = [
    { '2026-08': 'abc' }, { '2026-08': -5 }, { '2026-08': null },
    [], null, 'nope',
  ];
  for (const overrides of cases) {
    const line = lineFor([{ label: 'RMF', amount: 5000, overrides }], ...AUG, 'RMF');
    assert.equal(line.amount, 5000, `overrides ${JSON.stringify(overrides)} should be ignored`);
    assert.equal(line.isOverridden, false);
  }
  // A key for a different period never applies to this one.
  assert.equal(lineFor([{ label: 'RMF', amount: 5000, overrides: { '2026-07': 0 } }], ...AUG, 'RMF').amount, 5000);
});

test('a waived quota has nothing left to prorate', () => {
  const quotas = [{ label: 'RMF', amount: 5000, overrides: { '2026-08': 0 } }];
  const waived = lineFor(quotas, ...AUG, 'RMF');
  assert.equal(waived.amount, 0);
  assert.equal(waived.isProrated, false, 'there is nothing to prorate when nothing is due');
});

test('period labels read the way the parish refers to them', () => {
  assert.equal(App._quotaPeriodLabel('2026-08'), 'August 2026');
  assert.equal(App._quotaPeriodLabel('2026-01'), 'January 2026');
  assert.equal(App._quotaPeriodLabel('rubbish'), 'rubbish');
});
