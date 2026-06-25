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

await import(new URL(`../src/js/app.js?cash-flow-test=${Date.now()}`, import.meta.url).href);

const App = globalThis.window.App;

test('cash helper keeps partial-cash other income inside accountant balance', () => {
  const record = {
    source: 'special_donation',
    totalCollection: 38350,
    bankTransferAmount: 36350,
    directPettyCash: 0,
    paymentMethod: 'split'
  };

  assert.equal(App._getIncomeCashWithAccountant(record), 2000);
});

test('expense covering map reconciles deposits and cash expenses against partial-cash other income', () => {
  const income = [{
    id: 'INC-1',
    source: 'special_donation',
    date: '2026-06-18',
    totalCollection: 38350,
    bankTransferAmount: 36350,
    directPettyCash: 0,
    paymentMethod: 'split'
  }];
  const cashTx = [{
    id: 'DEP-1',
    type: 'cash_deposit',
    incomeRef: 'INC-1',
    amount: 1200,
    date: '2026-06-18'
  }];
  const expenses = [{
    id: 'EXP-1',
    status: 'approved',
    paymentMethod: 'cash',
    amount: 300,
    date: '2026-06-18'
  }];

  const map = App._buildExpenseCoveringMap(income, cashTx, {}, expenses, []);
  const entry = map.get('INC-1');

  assert.ok(entry);
  assert.equal(entry.cashHeld, 2000);
  assert.equal(entry.deposited, 1200);
  assert.equal(entry.expenseCovering, 300);
  assert.equal(entry.stillPending, 500);
});

test('cash expense linking can target mixed-method other income with remaining cash', () => {
  const allIncome = [
    {
      id: 'INC-BANK',
      source: 'special_donation',
      date: '2026-06-17',
      totalCollection: 5000,
      bankTransferAmount: 5000,
      directPettyCash: 0,
      paymentMethod: 'bank_transfer'
    },
    {
      id: 'INC-MIXED',
      source: 'special_donation',
      date: '2026-06-18',
      totalCollection: 38350,
      bankTransferAmount: 36350,
      directPettyCash: 0,
      paymentMethod: 'split'
    }
  ];

  const linkedIncomeId = App._findIncomeRefForCashExpense('2026-06-18', allIncome, {}, []);

  assert.equal(linkedIncomeId, 'INC-MIXED');
});
