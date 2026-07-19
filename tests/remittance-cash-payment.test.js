import test from 'node:test';
import assert from 'node:assert/strict';

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

await import(new URL(`../src/js/app.js?remittance-cash-payment-test=${Date.now()}`, import.meta.url).href);

const App = globalThis.window.App;

test('splitRemittancePaid reads the bankAmount/cashAmount split when present', () => {
  const cashPaid = { amount: 14200, paymentMethod: 'cash', bankAmount: 0, cashAmount: 14200 };
  const bankPaid = { amount: 20000, paymentMethod: 'bank_transfer', bankAmount: 20000, cashAmount: 0 };
  const splitPaid = { amount: 10000, paymentMethod: 'split', bankAmount: 6000, cashAmount: 4000 };

  assert.deepEqual(App._splitRemittancePaid(cashPaid), { bank: 0, cash: 14200 });
  assert.deepEqual(App._splitRemittancePaid(bankPaid), { bank: 20000, cash: 0 });
  assert.deepEqual(App._splitRemittancePaid(splitPaid), { bank: 6000, cash: 4000 });
});

test('splitRemittancePaid falls back to paymentMethod for legacy records with no bank/cash split', () => {
  const legacyCash = { amount: 5000, paymentMethod: 'cash' };
  const legacyBank = { amount: 7000, paymentMethod: 'bank_transfer' };

  assert.deepEqual(App._splitRemittancePaid(legacyCash), { bank: 0, cash: 5000 });
  assert.deepEqual(App._splitRemittancePaid(legacyBank), { bank: 7000, cash: 0 });
});

test('a cash-funded remittance payment reduces Cash with Accountant, not the Bank balance', async () => {
  // Regression test: previously calcChurchBalance always subtracted the full remittance
  // amount from bankBalance regardless of paymentMethod, so a Part A payment made from
  // the accountant's own cash on hand silently inflated Cash with Accountant (it was
  // never deducted) and understated the Bank balance (which was never actually touched).
  const income = [{
    id: 'INC-1',
    source: 'sunday_collection',
    date: '2026-07-05',
    totalCollection: 50000,
    membersTithe: 50000,
    bankTransferAmount: 0,
    directPettyCash: 0,
    childrenTeacherHoldCash: 0
  }];
  const remittances = [{
    id: 'REM-A',
    status: 'paid',
    part: 'a',
    amount: 14200,
    paidDate: '2026-07-10',
    paymentMethod: 'cash',
    bankAmount: 0,
    cashAmount: 14200,
    periodFrom: '2026-07-01',
    periodTo: '2026-07-31'
  }];

  const bal = await App._calcChurchBalance(null, {
    income, expenses: [], remittances, cashTx: [], pettyHistory: [], satelliteFunds: [],
    remRates: {}
  });

  // The full 50,000 came in as cash with the accountant; the 14,200 Part A cash payment
  // must reduce that cash balance, not the (untouched) bank balance.
  assert.equal(bal.cashWithAccountant, 50000 - 14200);
  assert.equal(bal.bankBalance, 0);
  // Total church balance must still drop by the payment exactly once either way.
  assert.equal(bal.total, 50000 - 14200);
});

test('a bank-funded remittance payment still reduces the Bank balance as before', async () => {
  const income = [{
    id: 'INC-1',
    source: 'sunday_collection',
    date: '2026-07-05',
    totalCollection: 50000,
    membersTithe: 50000,
    bankTransferAmount: 50000,
    directPettyCash: 0,
    childrenTeacherHoldCash: 0
  }];
  const remittances = [{
    id: 'REM-A',
    status: 'paid',
    part: 'a',
    amount: 14200,
    paidDate: '2026-07-10',
    paymentMethod: 'bank_transfer',
    bankAmount: 14200,
    cashAmount: 0,
    periodFrom: '2026-07-01',
    periodTo: '2026-07-31'
  }];

  const bal = await App._calcChurchBalance(null, {
    income, expenses: [], remittances, cashTx: [], pettyHistory: [], satelliteFunds: [],
    remRates: {}
  });

  assert.equal(bal.cashWithAccountant, 0);
  assert.equal(bal.bankBalance, 50000 - 14200);
  assert.equal(bal.total, 50000 - 14200);
});

test('calcUnsettledPeriodsSettledAmount nets a Part-A-only payment out of a still-open period', () => {
  const remittances = [{
    id: 'REM-A',
    status: 'paid',
    part: 'a',
    amount: 14200,
    periodFrom: '2026-07-01',
    periodTo: '2026-07-31'
  }];
  // This period has only Part A paid, so it never enters the settled-period-keys set —
  // Part B is still outstanding.
  const settledPeriodKeys = [];

  assert.equal(App._calcUnsettledPeriodsSettledAmount(remittances, settledPeriodKeys), 14200);
});

test('calcUnsettledPeriodsSettledAmount ignores periods already fully settled (both parts paid)', () => {
  const remittances = [
    { id: 'REM-A', status: 'paid', part: 'a', amount: 14200, periodFrom: '2026-06-01', periodTo: '2026-06-30' },
    { id: 'REM-B', status: 'paid', part: 'b', amount: 8000, periodFrom: '2026-06-01', periodTo: '2026-06-30' }
  ];
  const settledPeriodKeys = ['2026-06-01|2026-06-30'];

  assert.equal(App._calcUnsettledPeriodsSettledAmount(remittances, settledPeriodKeys), 0);
});
