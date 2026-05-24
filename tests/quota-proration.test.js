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

test('fixed quotas use remittance-period amount when selected period Sundays are fully covered', () => {
  const lines = App._getQuotaLinesForPeriod([
    { label: 'RMF (Camp Clearing)', amount: 4000 },
    { label: 'Regional Contribution', amount: 2000 },
    { label: 'Zonal Mummy Stipend', amount: 8000 },
    { label: 'Future Fixed Quota', amount: 12000 }
  ], '2026-02-01', '2026-02-01');

  assertClose(lines.find(l => l.label === 'RMF (Camp Clearing)').amount, 4000);
  assertClose(lines.find(l => l.label === 'Regional Contribution').amount, 2000);
  assertClose(lines.find(l => l.label === 'Zonal Mummy Stipend').amount, 8000);
  assertClose(lines.find(l => l.label === 'Future Fixed Quota').amount, 12000);
  assert.ok(lines.every(l => l.isProrated));
});

test('authority quota amount is unchanged across month boundaries for same remittance period', () => {
  const lines = App._getQuotaLinesForPeriod([
    { label: 'RMF (Camp Clearing)', amount: 4000 }
  ], '2026-02-22', '2026-03-08');

  assertClose(lines[0].amount, 4000);
  assert.equal(lines[0].isProrated, true);
});


test('multi-month basis text uses Sundays in remittance period', () => {
  const lines = App._getQuotaLinesForPeriod([
    { label: 'RMF (Camp Clearing)', amount: 4000 }
  ], '2026-02-22', '2026-03-08');

  assert.equal(lines[0].basis, 'Proportion of 3 of 3 Sundays in the rem. period.');
});


test('fixed quotas accrue week-by-week when cut-off end is in the future', () => {
  const RealDate = Date;
  class MockDate extends RealDate {
    constructor(...args){
      if(args.length===0) return new RealDate('2026-05-11T12:00:00Z');
      return new RealDate(...args);
    }
    static now(){ return new RealDate('2026-05-11T12:00:00Z').getTime(); }
  }
  globalThis.Date = MockDate;
  try {
    const lines = App._getQuotaLinesForPeriod([
      { label: 'Zonal Mummy Stipend', amount: 7500 }
    ], '2026-04-20', '2026-05-24');

    assert.equal(lines[0].basis, 'Proportion of 3 of 5 Sundays in the rem. period.');
    assertClose(lines[0].amount, 4500);
  } finally {
    globalThis.Date = RealDate;
  }
});
