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

await import(new URL(`../src/js/app.js?carry-test=${Date.now()}`, import.meta.url).href);

const App = globalThis.window.App;

const sun = (id, date, total, bank = 0) => ({ id, source: 'sunday_collection', date, totalCollection: total, bankTransferAmount: bank, directPettyCash: 0, childrenOffering: 0 });
const lent = (amount, date) => ({ id: 'L' + date + amount, direction: 'lent', person: 'Person A', amount, date, status: 'active', channel: 'cash', repayments: [] });
const dep = (amount, date, ref) => ({ type: 'cash_deposit', amount, date, cashCycleIncomeRef: ref, status: 'confirmed' });
const exp200 = { date: '2026-10-27', amount: 200, status: 'approved', paymentMethod: 'cash' };
const cyc = (rec, income, cashTx, exps) => App._computeSundayCashCycle(rec, cashTx, exps || [], [], [], [], {}, income);

// Earlier Sunday 2026-10-04: 10000 cash, fully deposited. Loans 10000+40000 lent in the week after => pool -> -50000... adjust via earlier cash.
function scenario(earlierCash, loans, earlierDeposit = earlierCash) {
  const earlier = sun('E1', '2026-10-04', earlierCash);
  const target = sun('T1', '2026-10-25', 38500, 3000);
  App._setLoansLatest(loans);
  return { earlier, target, income: [earlier, target], cashTx: [dep(earlierDeposit, '2026-10-05', 'E1'), dep(33300, '2026-10-26', 'T1')] };
}

test('earlier loans overdrew the pool: shortfall is absorbed, Sunday is not pending', () => {
  // earlier cash 96000, 48000 deposited, then 50000 lent => pool -2000 before 25 Oct
  const s = scenario(96000, [lent(10000, '2026-10-12'), lent(40000, '2026-10-13')], 48000);
  const c = cyc(s.target, s.income, s.cashTx, [exp200]);
  assert.equal(c.earlierShortfallCovered, 2000);
  assert.equal(c.netCashToDeposit, 33300);
  assert.equal(c.stillWithAccountant, 0);
  assert.notEqual(c.status, 'pending');
  const html = App._renderSundayCashCycleSectionHTML(c, {});
  assert.match(html, /Covers earlier cash already given out/);
  App._setLoansLatest([]);
});

test('positive opening: old result, no extra row', () => {
  const s = scenario(55000, []);
  s.cashTx[0].amount = 50000; // pool before = 5000
  const c = cyc(s.target, s.income, s.cashTx, [exp200]);
  assert.equal(c.earlierShortfallCovered, 0);
  assert.equal(c.stillWithAccountant, 2000);
  assert.equal(c.status, 'pending');
  assert.doesNotMatch(App._renderSundayCashCycleSectionHTML(c, {}), /Covers earlier cash/);
  // without income list: unchanged legacy behaviour
  assert.equal(App._computeSundayCashCycle(s.target, s.cashTx, [exp200], [], [], [], {}).stillWithAccountant, 2000);
});

test('deficit larger than the week cash: covers only what exists; next week uses the real pool', () => {
  const s = scenario(10000, [lent(40000, '2026-10-12')]); // pool before 25 Oct = -40000
  const c = cyc(s.target, s.income, [s.cashTx[0]], [exp200]);
  assert.equal(c.earlierShortfallCovered, 35300); // week net 35500 - 200
  assert.equal(c.netCashToDeposit, 0);
  assert.equal(c.stillWithAccountant, 0);
  // pool at end of 25 Oct week: -40000 + 35500 - 200 = -4700, so next week is charged only 4700
  const next = sun('N1', '2026-11-01', 20000);
  const income = [...s.income, next];
  const n = cyc(next, income, [s.cashTx[0]], [exp200]);
  assert.equal(n.earlierShortfallCovered, 4700);
  assert.equal(n.netCashToDeposit, 15300);
  App._setLoansLatest([]);
});
