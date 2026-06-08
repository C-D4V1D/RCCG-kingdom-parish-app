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

test('petty float snapshots are rebuilt from ledger events for the selected as-of date', () => {
  const pettyHistory = [
    { type:'refill', status:'approved', amount:50000, createdAt:'2026-04-20T09:00:00Z' },
    { type:'advance', status:'approved', amount:30000, approvedAt:'2026-05-10T09:00:00Z' },
    { type:'refill', status:'approved', amount:10000, createdAt:'2026-05-15T09:00:00Z' },
    { type:'advance', status:'settled', amount:10000, approvedAt:'2026-06-01T10:00:00Z', settledAt:'2026-06-03T10:00:00Z', changeReturned:2000 }
  ];
  const expenses = [
    { date:'2026-05-18', pettyAmount:4000 },
    { date:'2026-06-04', pettyAmount:6000 }
  ];
  const recDate = r => String(r?.date || r?.createdAt || '').slice(0,10);

  assert.equal(App._calcPettyFloatFromLedger(pettyHistory, expenses, '2026-04-19', recDate), 0);
  assert.equal(App._calcPettyFloatFromLedger(pettyHistory, expenses, '2026-05-24', recDate), 26000);
  assert.equal(App._calcPettyFloatFromLedger(pettyHistory, expenses, null, recDate), 12000);
});

test('actual balance helper paths stay mathematically aligned', () => {
  const openingBalance = 100000;
  const openingOutstanding = 15000;
  const totalIncome = 50000;
  const childrenTeacherHold = 5000;
  const totalExpenses = 12000;
  const remittancesPaid = 8000;
  const currentPeriodRemDue = 18000;

  const churchBalance = App._calcChurchBalanceFromOpening(
    openingBalance,
    totalIncome,
    childrenTeacherHold,
    totalExpenses,
    remittancesPaid
  );
  const outstanding = App._calcOutstandingRemittancesFromFlow(
    openingOutstanding,
    currentPeriodRemDue,
    remittancesPaid
  );
  const availableFromOpening = App._calcAvailableFundFromOpening(
    openingBalance,
    openingOutstanding,
    totalIncome,
    childrenTeacherHold,
    totalExpenses,
    currentPeriodRemDue
  );

  assert.equal(churchBalance, 125000);
  assert.equal(outstanding, 25000);
  assert.equal(churchBalance - outstanding, 100000);
  assert.equal(availableFromOpening, 100000);
});

test('current-period outstanding remittance display reflects only unpaid current due', () => {
  assert.equal(
    App._calcCurrentPeriodOutstandingRemittance(82937.70, 8342.50, 74595.20),
    74595.20
  );
  assert.equal(
    App._calcCurrentPeriodOutstandingRemittance(18000, 20000, 5000),
    0
  );
});

test('total remittance due helper sums all remittance buckets and quotas', () => {
  const total = App._totalRemittanceDue({
    totalNatl: 10000,
    totalArea: 2000,
    totalPastor: 1500,
    totalMinisters: 900,
    totalSeed: 100,
    provinceRebate: 500
  }, 3000);

  assert.equal(total, 18000);
});


test('fixed quota accrual starts at 11:30am WAT on each Sunday', () => {
  const RealDate = Date;
  class BeforeCutoffDate extends RealDate {
    constructor(...args){
      if(args.length===0) return new RealDate('2026-04-26T10:29:00Z'); // 11:29 WAT
      return new RealDate(...args);
    }
    static now(){ return new RealDate('2026-04-26T10:29:00Z').getTime(); }
  }
  globalThis.Date = BeforeCutoffDate;
  try {
    const lines = App._getQuotaLinesForPeriod([{ label:'Zonal Mummy Stipend', amount:7500 }], '2026-04-20', '2026-05-24');
    assertClose(lines[0].amount, 0);
  } finally { globalThis.Date = RealDate; }

  class AfterCutoffDate extends RealDate {
    constructor(...args){
      if(args.length===0) return new RealDate('2026-04-26T10:30:00Z'); // 11:30 WAT
      return new RealDate(...args);
    }
    static now(){ return new RealDate('2026-04-26T10:30:00Z').getTime(); }
  }
  globalThis.Date = AfterCutoffDate;
  try {
    const lines = App._getQuotaLinesForPeriod([{ label:'Zonal Mummy Stipend', amount:7500 }], '2026-04-20', '2026-05-24');
    assert.equal(lines[0].basis, 'Proportion of 1 of 5 Sundays in the rem. period.');
    assertClose(lines[0].amount, 1500);
  } finally { globalThis.Date = RealDate; }
});
