// Loans in calcChurchBalance: a loan only moves money between "in hand" and "owed", so the total
// (the Available Fund before remittance) never changes by lending, borrowing or repaying. Only acknowledged
// loans and confirmed repayments count. Cash loans are counted on the accountant's cash line; bank loans arrive
// through their bank mirror (destination 'satellite_passthrough').

import test from 'node:test';
import assert from 'node:assert/strict';

function makeElement() {
  return {
    style: {}, innerHTML: '', textContent: '', value: '', disabled: false, files: [],
    appendChild() {}, insertBefore() {}, remove() {}, addEventListener() {}, setAttribute() {},
    getAttribute() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }
  };
}

const documentStub = {
  readyState: 'complete',
  body: makeElement(),
  getElementById() { return null; },
  createElement() { return makeElement(); },
  addEventListener() {}
};

const localStorageStub = { getItem() { return null; }, setItem() {}, removeItem() {} };

globalThis.document = documentStub;
globalThis.window = { document: documentStub, location: { pathname: '/' }, addEventListener() {} };
Object.defineProperty(globalThis, 'localStorage', { value: localStorageStub, configurable: true });
Object.defineProperty(globalThis, 'history', { value: { replaceState() {} }, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
globalThis.window.localStorage = localStorageStub;
globalThis.window.history = globalThis.history;
globalThis.window.navigator = globalThis.navigator;

await import(new URL(`../src/js/app.js?loans-test=${Date.now()}`, import.meta.url).href);

const App = globalThis.window.App;

// Every array supplied explicitly (even empty) so calcChurchBalance never self-fetches
// via DB.getX() — no network/fetch stub needed. remRates:{} is fine since these tests
// use empty or non-Sunday income records (getIncomeCashWithAccountant for a non-Sunday
// record needs no rates at all).
function balance(overrides = {}) {
  return App._calcChurchBalance(null, {
    income: [], expenses: [], remittances: [], cashTx: [], pettyHistory: [], satelliteFunds: [],
    remRates: {},
    ...overrides
  });
}


const income = [{ source: 'other_income', date: '2026-10-01', totalCollection: 100000, bankTransferAmount: 0, directPettyCash: 0 }];
const loan = (o = {}) => ({ id: 'L1', status: 'active', direction: 'lent', amount: 30000, date: '2026-10-05', channel: 'cash', repayments: [], ...o });
const rep = (o = {}) => ({ status: 'confirmed', amount: 10000, date: '2026-10-08', channel: 'cash', ...o });
const base = () => balance({ income });

test('baseline: no loans changes nothing and onHand is bank + cash + petty', async () => {
  const b = await balance({ income, loans: [] });
  assert.equal(b.loansOwedToUs, 0);
  assert.equal(b.loansWeOwe, 0);
  assert.equal(b.onHand, b.cashWithAccountant + b.bankBalance + b.pettyFloat);
  assert.equal(b.total, 100000);
});

test('cash lent out: cash in hand drops, owed to us rises, total unchanged', async () => {
  const b0 = await base();
  const b = await balance({ income, loans: [loan()] });
  assert.equal(b.cashWithAccountant, 70000);
  assert.equal(b.onHand, b0.onHand - 30000);
  assert.equal(b.loansOwedToUs, 30000);
  assert.equal(b.total, b0.total);
});

test('bank lent out (through its bank mirror): bank drops, total unchanged', async () => {
  const cashTx = [{ type: 'withdrawal', date: '2026-10-05', amount: 30000, destination: 'satellite_passthrough' }];
  const b = await balance({ income: [{ ...income[0], bankTransferAmount: 100000 }], cashTx, loans: [loan({ channel: 'bank' })] });
  assert.equal(b.bankBalance, 70000);
  assert.equal(b.cashWithAccountant, 0);
  assert.equal(b.loansOwedToUs, 30000);
  assert.equal(b.total, 100000);
});

test('cash borrowed: cash in hand rises, we owe it, total unchanged', async () => {
  const b = await balance({ income, loans: [loan({ direction: 'borrowed' })] });
  assert.equal(b.cashWithAccountant, 130000);
  assert.equal(b.loansWeOwe, 30000);
  assert.equal(b.loansOwedToUs, 0);
  assert.equal(b.total, 100000);
});

test('bank borrowed (bank mirror is a deposit tagged as pass-through): not mistaken for the accountant\'s cash', async () => {
  const cashTx = [{ type: 'cash_deposit', date: '2026-10-05', amount: 30000, destination: 'satellite_passthrough' }];
  const b = await balance({ income, cashTx, loans: [loan({ direction: 'borrowed', channel: 'bank' })] });
  assert.equal(b.bankBalance, 30000);
  assert.equal(b.cashWithAccountant, 100000);   // no phantom cash deficit
  assert.equal(b.loansWeOwe, 30000);
  assert.equal(b.total, 100000);
});

test('pending and rejected loans change nothing', async () => {
  const b = await balance({ income, loans: [loan({ status: 'pending' }), loan({ id: 'L2', status: 'rejected' })] });
  assert.equal(b.cashWithAccountant, 100000);
  assert.equal(b.loansOwedToUs, 0);
  assert.equal(b.total, 100000);
});

test('a confirmed repayment brings cash back and reduces what is owed; a pending one is ignored', async () => {
  const l = loan({ repayments: [rep(), rep({ status: 'pending', amount: 5000 }), rep({ status: 'rejected', amount: 9000 })] });
  const b = await balance({ income, loans: [l] });
  assert.equal(b.cashWithAccountant, 80000);
  assert.equal(b.loansOwedToUs, 20000);
  assert.equal(b.total, 100000);
});

test('repaying a loan we borrowed takes cash out and reduces what we owe', async () => {
  const l = loan({ direction: 'borrowed', repayments: [rep()] });
  const b = await balance({ income, loans: [l] });
  assert.equal(b.cashWithAccountant, 120000);
  assert.equal(b.loansWeOwe, 20000);
  assert.equal(b.total, 100000);
});

test('a settled loan leaves nothing owed and cash back where it started', async () => {
  const l = loan({ status: 'settled', repayments: [rep({ amount: 30000 })] });
  const b = await balance({ income, loans: [l] });
  assert.equal(b.cashWithAccountant, 100000);
  assert.equal(b.loansOwedToUs, 0);
});

test('a bank repayment arrives through its bank mirror and still leaves total unchanged', async () => {
  const cashTx = [{ type: 'withdrawal', date: '2026-10-05', amount: 30000, destination: 'satellite_passthrough' },
                  { type: 'cash_deposit', date: '2026-10-08', amount: 10000, destination: 'satellite_passthrough' }];
  const l = loan({ channel: 'bank', repayments: [rep({ channel: 'bank' })] });
  const b = await balance({ income: [{ ...income[0], bankTransferAmount: 100000 }], cashTx, loans: [l] });
  assert.equal(b.bankBalance, 80000);
  assert.equal(b.loansOwedToUs, 20000);
  assert.equal(b.total, 100000);
});

test('as-of date: a loan made after the date is not counted', async () => {
  const b = await App._calcChurchBalance('2026-10-04', { income: [], expenses: [], remittances: [], cashTx: [], pettyHistory: [], satelliteFunds: [], remRates: {}, loans: [loan()] });
  assert.equal(b.loansOwedToUs, 0);
  const later = await App._calcChurchBalance('2026-10-06', { income: [], expenses: [], remittances: [], cashTx: [], pettyHistory: [], satelliteFunds: [], remRates: {}, loans: [loan()] });
  assert.equal(later.loansOwedToUs, 30000);
});

test('callers that pass no loans keep working (nothing owed)', async () => {
  const b = await App._calcChurchBalance(null, { income, expenses: [], remittances: [], cashTx: [], pettyHistory: [], satelliteFunds: [], remRates: {} });
  assert.equal(b.loansOwedToUs, 0);
  assert.equal(b.total, 100000);
});

test('dashboard card info: counts people (not loans), hides counts when nothing is owed, notes pending entries', () => {
  const info = App._loanDashboardInfo;
  const loans = [
    { status: 'active', direction: 'lent', person: 'Bro Sam', outstanding: 5000, repayments: [] },
    { status: 'active', direction: 'lent', person: 'bro sam ', outstanding: 2000, repayments: [] },
    { status: 'active', direction: 'lent', person: 'Sis Ada', outstanding: 1000, repayments: [] },
    { status: 'active', direction: 'borrowed', person: 'Bank X', outstanding: 9000, repayments: [{ status: 'pending' }] },
    { status: 'pending', direction: 'lent', person: 'New', outstanding: 0, repayments: [] },
  ];
  const i = info(loans, { loansOwedToUs: 8000, loansWeOwe: 9000 }, false);
  assert.equal(i.owedToUsCount, 2);
  assert.equal(i.weOweCount, 1);
  assert.match(i.pendingNote, /^2 more entries are awaiting acknowledgement\. Not counted until a second person confirms them\.$/);
  const none = info([], { loansOwedToUs: 0, loansWeOwe: 0 }, false);
  assert.deepEqual([none.owedToUsCount, none.weOweCount, none.pendingNote], [0, 0, '']);
  assert.equal(info(loans, { loansOwedToUs: 8000, loansWeOwe: 9000 }, true).owedToUsCount, 0);   // past period: no counts
});
