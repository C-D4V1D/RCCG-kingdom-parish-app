// Regression test for the Dashboard "Cash with Accountant ⚠ Owes −₦0" defect.
//
// calcChurchBalance clamps cashWithAccountant to 0 when the raw position is within
// half a kobo of zero (paise-level residue from percentage splits such as the
// children-offering teacher share at 0.65). cashDeficit previously had no such
// clamp, so a raw of e.g. -0.0049 produced cashDeficit = 0.0049 > 0 and the
// Dashboard rendered a red "Owes −₦0" row for what is really a zero balance.
// cashDeficit now applies the same epsilon.

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

await import(new URL(`../src/js/app.js?cashdeficit-test=${Date.now()}`, import.meta.url).href);

const App = globalThis.window.App;

function balance(overrides = {}) {
  return App._calcChurchBalance(null, {
    income: [], expenses: [], remittances: [], cashTx: [], pettyHistory: [], satelliteFunds: [],
    remRates: {},
    ...overrides
  });
}

test('cash deficit: sub-half-kobo negative raw clamps to zero (no phantom "Owes −₦0")', async () => {
  // 100 in, 100.0049 out: the 0.0049 shortfall is below half a kobo — split residue,
  // not a real debt. Before the fix this produced cashDeficit = 0.0049 > 0.
  const bal = await balance({
    cashTx: [{ type: 'withdrawal', date: '2026-10-01', amount: 100, destination: 'accountant_cash' }],
    expenses: [{ status: 'approved', date: '2026-10-02', amount: 100.0049, paymentMethod: 'cash' }]
  });
  assert.equal(bal.cashWithAccountant, 0);
  assert.equal(bal.cashDeficit, 0, 'sub-half-kobo shortfall must not surface as a deficit');
});

test('cash deficit: float residue from a percentage split does not surface as a deficit', async () => {
  // Sunday collection of 100 with a children offering of 51.30 at the 0.65 teacher
  // rate: teacher share 33.345, cash to accountant 66.655. Depositing/expensing the
  // same nominal amount leaves only float residue.
  const cash = 100 - 51.3 * 0.65;
  const bal = await balance({
    income: [{ source: 'sunday_collection', date: '2026-10-04', totalCollection: 100, childrenOffering: 51.3, bankTransferAmount: 0, directPettyCash: 0 }],
    expenses: [{ status: 'approved', date: '2026-10-05', amount: Math.round(cash * 100) / 100, paymentMethod: 'cash' }]
  });
  assert.ok(bal.cashDeficit < 0.005, `residual deficit must be clamped, got ${bal.cashDeficit}`);
  assert.equal(bal.cashDeficit, 0);
});

test('cash deficit: a real deficit still surfaces', async () => {
  const bal = await balance({
    cashTx: [{ type: 'withdrawal', date: '2026-10-01', amount: 100, destination: 'accountant_cash' }],
    expenses: [{ status: 'approved', date: '2026-10-02', amount: 125, paymentMethod: 'cash' }]
  });
  assert.equal(bal.cashDeficit, 25, 'genuine shortfall must keep reporting as a deficit');
  assert.equal(bal.cashWithAccountant, 0);
});

test('cash deficit: positive balance unaffected by the clamp', async () => {
  const bal = await balance({
    cashTx: [{ type: 'withdrawal', date: '2026-10-01', amount: 100, destination: 'accountant_cash' }]
  });
  assert.equal(bal.cashWithAccountant, 100);
  assert.equal(bal.cashDeficit, 0);
});
