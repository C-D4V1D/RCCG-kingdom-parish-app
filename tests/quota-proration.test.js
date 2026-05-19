import test from 'node:test';
import assert from 'node:assert/strict';

function assertClose(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) < epsilon, `Expected ${actual} to be close to ${expected}`);
}

function makeElement() {
  return {
    style: {},
    innerHTML: '',
    textContent: '',
    value: '',
    disabled: false,
    files: [],
    appendChild() {},
    insertBefore() {},
    remove() {},
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; }
    }
  };
}

const documentStub = {
  readyState: 'complete',
  body: makeElement(),
  getElementById() { return null; },
  createElement() { return makeElement(); },
  addEventListener() {}
};

const localStorageStub = {
  getItem() { return null; },
  setItem() {},
  removeItem() {}
};

globalThis.document = documentStub;
globalThis.window = {
  document: documentStub,
  location: { pathname: '/' },
  addEventListener() {}
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageStub, configurable: true });
Object.defineProperty(globalThis, 'history', { value: { replaceState() {} }, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
globalThis.window.localStorage = localStorageStub;
globalThis.window.history = globalThis.history;
globalThis.window.navigator = globalThis.navigator;

await import(new URL(`../src/js/app.js?quota-test=${Date.now()}`, import.meta.url).href);

const App = globalThis.window.App;

test('countSundaysInRange counts calendar Sundays inclusively', () => {
  assert.equal(App._countSundaysInRange('2026-02-01', '2026-02-28'), 4);
  assert.equal(App._countSundaysInRange('2026-02-22', '2026-03-08'), 3);
});

test('all fixed quotas are prorated by Sundays for the selected period', () => {
  const lines = App._getQuotaLinesForPeriod([
    { label: 'RMF (Camp Clearing)', amount: 4000 },
    { label: 'Regional Contribution', amount: 2000 },
    { label: 'Zonal Mummy Stipend', amount: 8000 },
    { label: 'Future Fixed Quota', amount: 12000 }
  ], '2026-02-01', '2026-02-01');

  assertClose(lines.find(l => l.label === 'RMF (Camp Clearing)').amount, 1000);
  assertClose(lines.find(l => l.label === 'Regional Contribution').amount, 500);
  assertClose(lines.find(l => l.label === 'Zonal Mummy Stipend').amount, 2000);
  assertClose(lines.find(l => l.label === 'Future Fixed Quota').amount, 3000);
  assert.ok(lines.every(l => l.isProrated));
});

test('authority quota proration sums correctly across month boundaries', () => {
  const lines = App._getQuotaLinesForPeriod([
    { label: 'RMF (Camp Clearing)', amount: 4000 }
  ], '2026-02-22', '2026-03-08');

  assertClose(lines[0].amount, 4000 * ((1 / 4) + (2 / 5)));
  assert.equal(lines[0].isProrated, true);
});
