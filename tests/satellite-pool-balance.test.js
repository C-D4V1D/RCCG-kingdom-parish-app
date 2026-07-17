// Unit tests for calcChurchBalance's handling of the Satellite / Zone Pass-Through
// Fund (held-for-satellites liability line) and its interaction with the "Transfer
// to Parish" action. Exercised directly against calcChurchBalance/summarizeSatelliteFunds
// with fully prefetched inputs, so no network/DB access is needed.
//
// Design under test (see calcChurchBalance in src/js/app.js):
//   - bankBalance INCLUDES satellite in/out mirrors — it must match the real bank
//     statement, since the money really does move through the bank account.
//   - cashWithAccountant EXCLUDES satellite "in" mirrors (tagged
//     destination==='satellite_passthrough') — that money never touched the
//     accountant, so subtracting it would manufacture a phantom cash deficit (the P1
//     bug this feature fixes).
//   - heldForSatellites = sum(in) − sum(out) − sum(transfer_out), computed from the
//     satellite_funds table (the single source of truth), never from cash_transactions.
//   - total = cashWithAccountant + bankBalance + pettyFloat − heldForSatellites.
//   - A 'transfer_out' entry has NO bank mirror (the cash is already in the bank —
//     it arrived via a prior 'in' deposit) — it only reduces heldForSatellites,
//     which alone is the complete and correct balance effect.

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

await import(new URL(`../src/js/app.js?satpool-test=${Date.now()}`, import.meta.url).href);

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

test('satellite pool: inbound X raises bank and held by X, leaves cash and total unchanged', async () => {
  const cashTx = [{ type: 'cash_deposit', date: '2026-06-01', amount: 5000, destination: 'satellite_passthrough' }];
  const satelliteFunds = [{ direction: 'in', date: '2026-06-01', amount: 5000 }];
  const bal = await balance({ cashTx, satelliteFunds });

  assert.equal(bal.bankBalance, 5000, 'bank balance must match the real bank statement');
  assert.equal(bal.cashWithAccountant, 0, 'accountant never received this cash');
  assert.equal(bal.cashDeficit, 0, 'must not manufacture a phantom cash deficit (P1 bug)');
  assert.equal(bal.heldForSatellites, 5000);
  assert.equal(bal.total, 0, 'held money is excluded from the available total');
});

test('satellite pool: outbound X lowers bank and held by X, total unchanged', async () => {
  const afterIn = await balance({
    cashTx: [{ type: 'cash_deposit', date: '2026-06-01', amount: 5000, destination: 'satellite_passthrough' }],
    satelliteFunds: [{ direction: 'in', date: '2026-06-01', amount: 5000 }]
  });
  const afterOut = await balance({
    cashTx: [
      { type: 'cash_deposit', date: '2026-06-01', amount: 5000, destination: 'satellite_passthrough' },
      { type: 'withdrawal', date: '2026-06-05', amount: 5000, destination: 'satellite_passthrough' }
    ],
    satelliteFunds: [
      { direction: 'in', date: '2026-06-01', amount: 5000 },
      { direction: 'out', date: '2026-06-05', amount: 5000 }
    ]
  });

  assert.equal(afterOut.bankBalance, afterIn.bankBalance - 5000);
  assert.equal(afterOut.heldForSatellites, afterIn.heldForSatellites - 5000);
  assert.equal(afterOut.cashWithAccountant, afterIn.cashWithAccountant);
  assert.equal(afterOut.total, afterIn.total, 'outbound satellite money must not move the parish total');
});

test('satellite pool: full cycle (in X, out X) nets bank/cash/held/total all to zero', async () => {
  const cashTx = [
    { type: 'cash_deposit', date: '2026-06-01', amount: 7500, destination: 'satellite_passthrough' },
    { type: 'withdrawal', date: '2026-06-05', amount: 7500, destination: 'satellite_passthrough' }
  ];
  const satelliteFunds = [
    { direction: 'in', date: '2026-06-01', amount: 7500 },
    { direction: 'out', date: '2026-06-05', amount: 7500 }
  ];
  const bal = await balance({ cashTx, satelliteFunds });

  assert.equal(bal.bankBalance, 0);
  assert.equal(bal.cashWithAccountant, 0);
  assert.equal(bal.heldForSatellites, 0);
  assert.equal(bal.total, 0);
});

test('satellite pool: a normal (non-satellite) accountant deposit still reduces cash with accountant', async () => {
  // Regression guard: the destination!=='satellite_passthrough' exclusion must only
  // skip satellite mirrors, never an ordinary Sunday-collection cash deposit.
  const income = [{ source: 'other', totalCollection: 8000, bankTransferAmount: 0, directPettyCash: 0 }];
  const cashTx = [{ type: 'cash_deposit', date: '2026-06-01', amount: 3000 }]; // no destination tag — a normal deposit
  const bal = await balance({ income, cashTx });

  assert.equal(bal.bankBalance, 3000);
  assert.equal(bal.cashWithAccountant, 5000, 'the accountant deposit must still reduce cash with accountant as before');
  assert.equal(bal.heldForSatellites, 0);
});

test('transfer_out: reduces held by X and raises total by X with bank and cash unchanged', async () => {
  const cashTx = [{ type: 'cash_deposit', date: '2026-06-01', amount: 5000, destination: 'satellite_passthrough' }];
  const beforeTransfer = await balance({
    cashTx,
    satelliteFunds: [{ direction: 'in', date: '2026-06-01', amount: 5000 }]
  });
  const afterTransfer = await balance({
    cashTx, // unchanged — a transfer creates NO bank mirror
    satelliteFunds: [
      { direction: 'in', date: '2026-06-01', amount: 5000 },
      { direction: 'transfer_out', date: '2026-06-10', amount: 2000, purpose: 'gift' }
    ]
  });

  assert.equal(afterTransfer.bankBalance, beforeTransfer.bankBalance, 'a transfer moves no cash — bank is untouched');
  assert.equal(afterTransfer.cashWithAccountant, beforeTransfer.cashWithAccountant, 'a transfer never touches the accountant');
  assert.equal(afterTransfer.heldForSatellites, beforeTransfer.heldForSatellites - 2000);
  assert.equal(afterTransfer.total, beforeTransfer.total + 2000, 'reducing held alone is the complete balance effect of a transfer');
});

test('transfer_out: reason (gift/reimbursement/correction) never changes the balance effect', async () => {
  const cashTx = [{ type: 'cash_deposit', date: '2026-06-01', amount: 9000, destination: 'satellite_passthrough' }];
  const base = { cashTx, satelliteFunds: [{ direction: 'in', date: '2026-06-01', amount: 9000 }] };

  const gift = await balance({ ...base, satelliteFunds: [...base.satelliteFunds, { direction: 'transfer_out', date: '2026-06-10', amount: 3000, purpose: 'gift' }] });
  const reimbursement = await balance({ ...base, satelliteFunds: [...base.satelliteFunds, { direction: 'transfer_out', date: '2026-06-10', amount: 3000, purpose: 'reimbursement' }] });
  const correction = await balance({ ...base, satelliteFunds: [...base.satelliteFunds, { direction: 'transfer_out', date: '2026-06-10', amount: 3000, purpose: 'correction' }] });

  assert.equal(gift.total, reimbursement.total);
  assert.equal(reimbursement.total, correction.total);
  assert.equal(gift.heldForSatellites, reimbursement.heldForSatellites);
  assert.equal(reimbursement.heldForSatellites, correction.heldForSatellites);
});

// ── summarizeSatelliteFunds — single source of truth for the pool panel / report note ──

test('summarizeSatelliteFunds: held excludes transfer_out and matches calcChurchBalance formula', () => {
  const satelliteFunds = [
    { direction: 'in', date: '2026-06-01', amount: 10000 },
    { direction: 'out', date: '2026-06-05', amount: 2000 },
    { direction: 'transfer_out', date: '2026-06-10', amount: 1500, purpose: 'gift' },
  ];
  const summary = App._summarizeSatelliteFunds(satelliteFunds, '2026-06-01', '2026-06-30');
  assert.equal(summary.inPeriod, 10000);
  assert.equal(summary.outPeriod, 2000);
  assert.equal(summary.transferOutPeriod, 1500);
  assert.equal(summary.giftPeriod, 1500);
  assert.equal(summary.reimbursementPeriod, 0);
  assert.equal(summary.correctionPeriod, 0);
  assert.equal(summary.heldAsOf, 10000 - 2000 - 1500);
});

test('summarizeSatelliteFunds: only "gift" is ever surfaced as income — reimbursement/correction are memo-only', () => {
  const satelliteFunds = [
    { direction: 'in', date: '2026-06-01', amount: 20000 },
    { direction: 'transfer_out', date: '2026-06-05', amount: 4000, purpose: 'gift' },
    { direction: 'transfer_out', date: '2026-06-06', amount: 5000, purpose: 'reimbursement' },
    { direction: 'transfer_out', date: '2026-06-07', amount: 6000, purpose: 'correction' },
  ];
  const summary = App._summarizeSatelliteFunds(satelliteFunds, '2026-06-01', '2026-06-30');
  assert.equal(summary.giftPeriod, 4000);
  assert.equal(summary.reimbursementPeriod, 5000);
  assert.equal(summary.correctionPeriod, 6000);
  assert.equal(summary.transferOutPeriod, 15000);
  // Only the gift portion would ever be added into a report's totalIncome (see
  // buildMonthlyStatementData/generateMonthlyReport) — reimbursement/correction must
  // never be summed as income anywhere.
  assert.notEqual(summary.giftPeriod, summary.transferOutPeriod);
});
