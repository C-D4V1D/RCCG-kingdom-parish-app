// Budget WhatsApp share (share-contract.md) — covers the pure client-side snapshot
// builder and slug helper in src/js/app.js. Follows tests/budget-client.test.js's DOM
// stub pattern exactly (app.js reads `document`/`window` at load time even though
// these tests never touch the DOM).
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

// budget-engine.js sets window.BudgetEngine as a side effect of import (mirroring the
// plain <script> load order in index.html: budget-engine.js before app.js) — app.js's
// getBudgetEngine() throws without it.
await import(new URL('../src/js/budget-engine.js', import.meta.url).href);
await import(new URL(`../src/js/app.js?budget-share-client-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;

const CONTRACT_KEYS = [
  'v', 'monthKey', 'monthLabel', 'periodFrom', 'periodTo', 'periodLabel', 'dayOf',
  'churchName', 'asOf', 'status', 'statusText', 'isCurrent', 'available',
  'totalBudget', 'spent', 'pctSpent', 'periodPct', 'normal', 'cushion', 'cushionLabel',
  'expectedIncome', 'knownBillsMonthly', 'lines', 'cushionCard', 'workings', 'knownBills', 'sharedBy',
].sort();

function baseInputs(overrides = {}) {
  return {
    monthKey: '2026-10',
    range: { from: '2026-09-21', to: '2026-10-18', remittance: true },
    progress: { day: 5, daysInMonth: 28, pct: 18 },
    plan: {
      normalMonthly: 80000, cushion: 5000, statusLabel: 'enough', shortBy: 0,
      expectedIncome: { total: 120000 }, knownBillsMonthly: 3000,
    },
    actuals: {
      totals: { budgeted: 85000, spent: 5100 },
      unplanned: [],
      lines: [
        { key: 'rccg_proj', label: 'RCCG demands', kind: 'rccg', budgeted: 33220, saved: 1000, usable: 34220, spent: 3000, leftover: 31220, pace: 'on_track', saves: true },
        { key: 'power', label: 'Power', kind: 'running', budgeted: 23900, saved: 0, usable: 23900, spent: 2100, leftover: 21800, pace: 'watch', saves: false },
        { key: 'hospitality', label: 'Hospitality', kind: 'running', budgeted: 10000, saved: 0, usable: 10000, spent: 0, leftover: 10000, pace: 'on_track', saves: false },
      ],
    },
    cushion: 5000,
    free: {
      free: 41836, freeEnd: 79600, status: 'yes',
      parts: { availableNow: 50000, expectedRestOfPeriod: 10000, spendingStillToCome: 5000, currentFloat: 2000, nextPeriodFloat: 2000, cushion: 5000, knownBillsSaved: 1000 },
    },
    billsSchedule: {
      items: [
        { name: 'Insurance', amount: 60000, dueDate: '2027-01-01', saved: 15000, monthly: 5000 },
      ],
    },
    isCurrent: true,
    churchName: 'RCCG Kingdom Parish',
    sharedBy: 'Jane Doe',
    cushionLabel: 'Fixed 10%',
    periodExpenses: [
      { id: 'EXP-1', date: '2026-09-22', category: 'power', subCategory: 'Fuel for generator', description: 'Diesel 20L', amount: 2100, status: 'approved', paymentMethod: 'cash', receiptUrl: 'x' },
      { id: 'EXP-2', date: '2026-09-23', category: 'rccg_proj', subCategory: '', description: 'Harvest levy', amount: 3000, status: 'approved' },
      { id: 'EXP-3', date: '2026-09-24', category: 'welfare', subCategory: 'Hospital visit', amount: 1500, status: 'approved' },
      { id: 'EXP-4', date: '2026-09-24', category: 'power', subCategory: 'Rejected fuel', amount: 9999, status: 'rejected' },
    ],
    ...overrides,
  };
}

test('buildBudgetShareSnapshot has exactly the contract fields', () => {
  const snapshot = App._buildBudgetShareSnapshot(baseInputs());
  assert.deepEqual(Object.keys(snapshot).sort(), CONTRACT_KEYS);
});

test('buildBudgetShareSnapshot fills header/period/status fields correctly', () => {
  const snapshot = App._buildBudgetShareSnapshot(baseInputs());
  assert.equal(snapshot.v, 2);
  assert.equal(snapshot.monthKey, '2026-10');
  assert.equal(snapshot.monthLabel, 'October 2026');
  assert.equal(snapshot.periodFrom, '2026-09-21');
  assert.equal(snapshot.periodTo, '2026-10-18');
  // fmtDateShort's month abbreviation is whatever the runtime's ICU data gives
  // en-NG (Node's bundled ICU says "Sept", browsers say "Sep") — assert the shape,
  // not the exact string.
  assert.match(snapshot.periodLabel, /^21 Sept? – 18 Oct$/);
  assert.equal(snapshot.dayOf, 'Day 5 of 28');
  assert.equal(snapshot.churchName, 'RCCG Kingdom Parish');
  assert.equal(typeof snapshot.asOf, 'string');
  assert.ok(!Number.isNaN(new Date(snapshot.asOf).getTime()));
  assert.equal(snapshot.status, 'enough');
  assert.equal(snapshot.statusText, 'Enough');
  assert.equal(snapshot.isCurrent, true);
  assert.equal(snapshot.sharedBy, 'Jane Doe');
  assert.equal(snapshot.cushionLabel, 'Fixed 10%');
});

test('buildBudgetShareSnapshot computes totals, lines and cushion card', () => {
  const snapshot = App._buildBudgetShareSnapshot(baseInputs());
  assert.equal(snapshot.normal, 80000);
  assert.equal(snapshot.cushion, 5000);
  assert.equal(snapshot.totalBudget, 85000);
  assert.equal(snapshot.spent, 5100);
  assert.equal(snapshot.pctSpent, Math.round((5100 / 85000) * 100));
  assert.equal(snapshot.periodPct, 18);
  assert.equal(snapshot.expectedIncome, 120000);
  assert.equal(snapshot.knownBillsMonthly, 3000);

  assert.equal(snapshot.lines.length, 3);
  // RCCG line sorted first regardless of input order.
  assert.equal(snapshot.lines[0].kind, 'rccg');
  assert.equal(snapshot.lines[0].label, 'RCCG demands');
  assert.equal(snapshot.lines[0].budgeted, 33220);
  assert.equal(snapshot.lines[0].saved, 1000);
  assert.equal(snapshot.lines[0].usable, 34220);
  assert.equal(snapshot.lines[0].spent, 3000);
  assert.equal(snapshot.lines[0].left, 31220);
  assert.equal(snapshot.lines[0].saves, true);
  assert.ok(snapshot.lines.slice(1).every(l => l.kind === 'running'));

  assert.deepEqual(Object.keys(snapshot.cushionCard).sort(), ['amount', 'expenses', 'left', 'pace', 'used'].sort());
  assert.equal(snapshot.cushionCard.amount, 5000);

  assert.equal(snapshot.knownBills.length, 1);
  assert.deepEqual(Object.keys(snapshot.knownBills[0]).sort(), ['amount', 'dueLabel', 'monthly', 'name', 'saved'].sort());
  assert.equal(snapshot.knownBills[0].name, 'Insurance');
});

test('buildBudgetShareSnapshot builds `available` for the current period, null otherwise', () => {
  const current = App._buildBudgetShareSnapshot(baseInputs());
  assert.ok(current.available);
  assert.equal(current.available.free, 41836);
  assert.equal(current.available.freeEnd, 79600);
  assert.equal(current.available.status, 'yes');
  assert.equal(current.available.riseBy, '18 Oct');

  const past = App._buildBudgetShareSnapshot(baseInputs({ isCurrent: false, free: null }));
  assert.equal(past.available, null);

  const noFree = App._buildBudgetShareSnapshot(baseInputs({ free: null }));
  assert.equal(noFree.available, null);
});

test('buildBudgetShareSnapshot lists each card\'s expenses (date, label, amount only)', () => {
  const snapshot = App._buildBudgetShareSnapshot(baseInputs());
  const power = snapshot.lines.find(l => l.label === 'Power');
  assert.deepEqual(power.expenses, [{ date: '2026-09-22', label: 'Fuel for generator', amount: 2100 }]);
  const rccg = snapshot.lines.find(l => l.kind === 'rccg');
  assert.deepEqual(rccg.expenses, [{ date: '2026-09-23', label: 'Harvest levy', amount: 3000 }]);
  // A category with no budget line lands on the safety cushion card.
  assert.deepEqual(snapshot.cushionCard.expenses, [{ date: '2026-09-24', label: 'Hospital visit', amount: 1500 }]);
  const json = JSON.stringify(snapshot);
  assert.doesNotMatch(json, /EXP-|receiptUrl|paymentMethod|Rejected fuel/, 'no ids, receipts, payment details or rejected items');
});

test('buildBudgetShareSnapshot workings: end of period = now + still expected − still to come', () => {
  const inputs = baseInputs({ free: {
    free: 38291, freeNow: 38291, freeEnd: 72835, status: 'yes',
    parts: { availableNow: 185560, expectedRestOfPeriod: 135643, spendingStillToCome: 101099, currentFloat: 3400, nextPeriodFloat: 106199, cushion: 10620, knownBillsSaved: 30450 },
    heldBackRows: [],
  } });
  const w = App._buildBudgetShareSnapshot(inputs).workings;
  assert.equal(w.holdForNext, 116819);
  assert.equal(w.now, 38291);
  assert.equal(w.floatAboveTarget, 0);
  assert.equal(w.now + w.stillExpected - w.stillToCome, w.endOfPeriod);
  assert.equal(App._buildBudgetShareSnapshot(baseInputs({ isCurrent: false })).workings, null);
});

test('buildBudgetShareSnapshot leaks no private fields (settings, AI summary)', () => {
  const snapshot = App._buildBudgetShareSnapshot(baseInputs());
  const json = JSON.stringify(snapshot);
  assert.doesNotMatch(json, /summary/i, 'no AI summary');
  assert.doesNotMatch(json, /churchBal/i, 'no church balance object');
  // Every line only carries the contract's plain fields — no raw plan/actuals keys
  // like `key`, `expenseCategory`, `subs`, `fromSavings`, `why`.
  for (const line of snapshot.lines) {
    assert.deepEqual(Object.keys(line).sort(), ['budgeted', 'expenses', 'kind', 'label', 'left', 'pace', 'saved', 'saves', 'spent', 'usable'].sort());
  }
});

test('budgetShareSlug builds the month-year slug used for the public link', () => {
  assert.equal(App._budgetShareSlug('2026-10'), 'october-2026');
  assert.equal(App._budgetShareSlug('2026-01'), 'january-2026');
  assert.equal(App._budgetShareSlug('2026-12'), 'december-2026');
});

test('budgetShareSlug returns an empty string for bad input', () => {
  assert.equal(App._budgetShareSlug(''), '');
  assert.equal(App._budgetShareSlug(null), '');
  assert.equal(App._budgetShareSlug('2026-13'), '');
  assert.equal(App._budgetShareSlug('not-a-key'), '');
});
