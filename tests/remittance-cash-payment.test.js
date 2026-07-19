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

test('buildExpenseCoveringMap deducts a cash-funded remittance payment from the covering Sunday collection', () => {
  // Regression test: previously buildExpenseCoveringMap only knew about deposits, cash
  // expenses, and petty top-ups as outflows — a remittance paid from the accountant's
  // cash was invisible to it. That meant this record's "Still with Accountant" (and the
  // sum of "Still with Accountant" across every record) stayed too HIGH after a cash
  // remittance payment, even though calcChurchBalance's aggregate Cash with Accountant
  // had already correctly dropped — the per-record view and the aggregate disagreed.
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
    cashAmount: 14200
  }];

  const map = App._buildExpenseCoveringMap(income, [], {}, [], [], remittances, []);
  const entry = map.get('INC-1');

  assert.ok(entry);
  assert.equal(entry.remitCovering, 14200);
  assert.equal(entry.stillPending, 50000 - 14200);
});

test('buildExpenseCoveringMap deducts a cash-funded Satellite/Zone Pool payout the same way', () => {
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
  const satelliteFunds = [{
    id: 'SAT-1',
    direction: 'out',
    channel: 'cash_accountant',
    amount: 500,
    date: '2026-07-12'
  }];

  const map = App._buildExpenseCoveringMap(income, [], {}, [], [], [], satelliteFunds);
  const entry = map.get('INC-1');

  assert.ok(entry);
  assert.equal(entry.poolCovering, 500);
  assert.equal(entry.stillPending, 50000 - 500);
});

test('computeCashPoolBreakdown reconciles exactly with calcChurchBalance and itemises real amounts', async () => {
  // Mirrors the parish's real July shape: a Sunday collection with a bank-transfer
  // portion, a cash remittance (₦14,200 — the WHOLE payment, not a sliced ₦13,335),
  // two cash pool payouts, a petty-funded pool payout (must NOT touch accountant cash),
  // a satellite cash-in receipt, cash expenses, and a bank deposit.
  const income = [{
    id: 'INC-1', source: 'sunday_collection', date: '2026-07-05',
    totalCollection: 50000, membersTithe: 50000,
    bankTransferAmount: 12000, directPettyCash: 0, childrenOffering: 0
  }];
  const cashTx = [
    { id: 'DEP-1', type: 'cash_deposit', amount: 6750, date: '2026-07-20', incomeRef: '' }
  ];
  const expenses = [
    { id: 'EXP-1', status: 'approved', paymentMethod: 'cash', amount: 9750, date: '2026-07-19' }
  ];
  const remittances = [
    { id: 'REM-B', status: 'paid', part: 'b', amount: 14200, paidDate: '2026-07-19', paymentMethod: 'cash', bankAmount: 0, cashAmount: 14200 }
  ];
  const satelliteFunds = [
    { id: 'SAT-IN', direction: 'in',  channel: 'cash',           amount: 11700, date: '2026-07-19' },
    { id: 'SAT-O1', direction: 'out', channel: 'cash_accountant', amount: 600,   date: '2026-07-19' },
    { id: 'SAT-O2', direction: 'out', channel: 'cash_accountant', amount: 500,   date: '2026-07-19' },
    // Petty-funded pool payout — must NOT reduce the accountant's cash pool.
    { id: 'SAT-O3', direction: 'out', channel: 'petty_cash',      amount: 15000, date: '2026-07-17' }
  ];

  const b = App._computeCashPoolBreakdown(income, cashTx, expenses, [], satelliteFunds, remittances, {});

  // Line items are whole, real amounts — no per-record slicing.
  assert.equal(b.cashFromCollections, 38000);   // 50000 − 12000
  assert.equal(b.satelliteCashIn, 11700);
  assert.equal(b.totalIn, 38000 + 11700);
  assert.equal(b.cashExpenses, 9750);
  assert.equal(b.remittancesCash, 14200);         // whole payment, not 13,335
  assert.equal(b.poolPayoutsCash, 1100);          // 600 + 500; the 15,000 petty payout excluded
  assert.equal(b.cashDeposited, 6750);
  assert.equal(b.balance, 38000 + 11700 - 9750 - 14200 - 1100 - 6750);

  // And it must equal the authoritative calcChurchBalance cash figure (raw = cwa − deficit).
  const bal = await App._calcChurchBalance(null, {
    income, expenses, remittances, cashTx, pettyHistory: [], satelliteFunds, remRates: {}
  });
  assert.equal(b.balance, bal.cashWithAccountant - bal.cashDeficit);
});

test('buildExpenseCoveringMap treats a satellite cash-in receipt as an inflow lot outflows can draw from', () => {
  // Without this, a cash expense funded partly by satellite cash-in money has nowhere
  // to draw from beyond the income lots, and the excess is silently dropped instead of
  // reducing anyone's "remaining" — inflating the sum of every record's stillPending.
  const income = [{
    id: 'INC-1',
    source: 'sunday_collection',
    date: '2026-07-05',
    totalCollection: 10000,
    membersTithe: 10000,
    bankTransferAmount: 0,
    directPettyCash: 0,
    childrenTeacherHoldCash: 0
  }];
  const satelliteFunds = [{
    id: 'SAT-IN', direction: 'in', channel: 'cash', amount: 5000, date: '2026-07-06'
  }];
  const expenses = [{
    id: 'EXP-1', status: 'approved', paymentMethod: 'cash', amount: 12000, date: '2026-07-13'
  }];

  const map = App._buildExpenseCoveringMap(income, [], {}, expenses, [], [], satelliteFunds);
  const entry = map.get('INC-1');

  // The 12,000 cash expense is covered by the 10,000 income lot plus the 5,000
  // satellite cash-in lot — only 10,000 of it can attribute to this record.
  assert.ok(entry);
  assert.equal(entry.expenseCovering, 10000);
  assert.equal(entry.stillPending, 0);
});
