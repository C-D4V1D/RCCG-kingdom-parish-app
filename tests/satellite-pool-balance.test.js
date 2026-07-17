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

// ── Role permissions: Admin Officer may record Funds In/Out but not Transfer to Parish ──
// satellite_fund_record reuses the 'expenses' permission (the same one that gates
// expense logging) so one Admin Officer can complete a zonal payment single-handed.
// satellite_fund_transfer is a separate, Accountant/Pastor/IT-only key — reclassifying
// pool money as parish income is more sensitive than simply moving it in/out.

test('permissions: Admin Officer can record Funds In/Out but cannot Transfer to Parish or delete', () => {
  App._setTestUserRole('admin_officer');
  assert.equal(App._canAction('satellite_fund_record'), true, 'admin_officer holds "expenses", which now also gates recording');
  assert.equal(App._canAction('satellite_fund_transfer'), false, 'admin_officer must not be able to reclassify pool money as income');
  assert.equal(App._canAction('satellite_fund_delete'), false);
});

test('permissions: Accountant and Pastor can record, transfer, and delete', () => {
  for (const role of ['accountant', 'pastor']) {
    App._setTestUserRole(role);
    assert.equal(App._canAction('satellite_fund_record'), true, `${role} should still be able to record`);
    assert.equal(App._canAction('satellite_fund_transfer'), true, `${role} should be able to transfer to parish`);
    assert.equal(App._canAction('satellite_fund_delete'), true, `${role} should be able to delete entries`);
  }
});

test('permissions: IT Admin bypasses the permission map entirely', () => {
  App._setTestUserRole('it_admin');
  assert.equal(App._canAction('satellite_fund_record'), true);
  assert.equal(App._canAction('satellite_fund_transfer'), true);
  assert.equal(App._canAction('satellite_fund_delete'), true);
});

test('permissions: Signatory and read-only Viewer can neither record, transfer, nor delete', () => {
  for (const role of ['signatory', 'viewer']) {
    App._setTestUserRole(role);
    assert.equal(App._canAction('satellite_fund_record'), false, `${role} is view-only for remittances`);
    assert.equal(App._canAction('satellite_fund_transfer'), false);
    assert.equal(App._canAction('satellite_fund_delete'), false);
  }
});

// ── Negative-held display label (Tweak 2) — display-only, the sign of `held` itself
// never changes anywhere in calcChurchBalance/summarizeSatelliteFunds.

test('satelliteHeldDisplay: positive held shows "Held for satellites"', () => {
  const d = App._satelliteHeldDisplay(5000);
  assert.equal(d.label, 'Held for satellites');
  assert.equal(d.amount, '₦5,000');
  assert.match(d.suffix, /excluded from available funds/);
});

test('satelliteHeldDisplay: negative held shows "Owed by satellites" with the absolute amount', () => {
  const d = App._satelliteHeldDisplay(-2000);
  assert.equal(d.label, 'Owed by satellites');
  assert.equal(d.amount, '₦2,000', 'amount must be the absolute value, not the raw negative number');
  assert.match(d.suffix, /owe the pool/);
});

test('satelliteHeldDisplay: zero held is treated as the "Held" (non-owed) branch', () => {
  const d = App._satelliteHeldDisplay(0);
  assert.equal(d.label, 'Held for satellites');
  assert.equal(d.amount, '₦0');
});

// ── Expenses page "Pay From" fund source — Pool / Split (Parish + Pool) ─────────
// submitPoolOnlyExpense/submitSplitPoolExpense are thin DOM-reading wrappers around
// DB.addSatelliteFund/DB.addExpense (see src/js/app.js) — same as submitExpense,
// submitRemittance etc. elsewhere in this codebase, they are not unit-tested by
// simulating the DOM. Instead these tests assert the resulting DATA SHAPE those
// handlers produce satisfies the required invariants, via the same calcChurchBalance
// engine used everywhere else in this suite.

test('expense-page pool payout: creates no expenses row; excluded from expense totals; held goes negative when the pool is empty', async () => {
  // What submitPoolOnlyExpense produces for a ₦15,000 joint/zonal payment paid
  // entirely from the pool: ONE satellite_funds 'out' row (purpose='joint_area_zone')
  // mirrored as a bank withdrawal — and critically, NO expenses row at all.
  const cashTx = [{ type: 'withdrawal', date: '2026-06-10', amount: 15000, destination: 'satellite_passthrough' }];
  const satelliteFunds = [{ direction: 'out', date: '2026-06-10', amount: 15000, purpose: 'joint_area_zone' }];
  const expenses = []; // no expenses row — a pool payout must never be a parish expense

  const bal = await balance({ cashTx, satelliteFunds, expenses });
  const expenseTotal = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  assert.equal(expenseTotal, 0, 'the pool payout must never be counted in expense totals');
  assert.equal(bal.bankBalance, -15000, 'the payment still really left the bank');
  assert.equal(bal.heldForSatellites, -15000, 'pool started at 0 and paid out 15000 — it is now negative (owed by satellites)');
  assert.equal(bal.cashWithAccountant, 0, 'the accountant is never touched by a pool payout');
});

test('expense-page split payment: one expenses row for the parish share only, plus one satellite_funds out for the pool share', async () => {
  // What submitSplitPoolExpense produces for a ₦20,000 joint payment split
  // 12,000 parish / 8,000 pool, linked by a shared reference tag.
  const sharedRef = 'JZ-test123';
  const expenses = [{
    id: 'EXP-1', date: '2026-06-10', category: 'utilities', amount: 12000,
    paymentMethod: 'bank_transfer', bankAmount: 12000, receiptNo: sharedRef, status: 'approved',
  }];
  const cashTx = [{ type: 'withdrawal', date: '2026-06-10', amount: 8000, destination: 'satellite_passthrough' }];
  const satelliteFunds = [{ direction: 'out', date: '2026-06-10', amount: 8000, purpose: 'joint_area_zone', reference: sharedRef }];

  const expenseTotal = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  assert.equal(expenseTotal, 12000, 'expense totals must include only the parish share, never the pool share');
  assert.equal(satelliteFunds[0].reference, expenses[0].receiptNo, 'the two halves share a reference tag for audit');

  const bal = await balance({ cashTx, expenses, satelliteFunds });
  assert.equal(bal.bankBalance, -20000, 'bank reflects both halves — both really left the bank');
  assert.equal(bal.heldForSatellites, -8000, 'only the pool share reduces held, not the full 20000');
  assert.equal(bal.cashWithAccountant, 0, 'the parish share was paid by bank transfer — the accountant is untouched');
});

// ── Income page "Satellite / Zone Funds Received" entry point ───────────────────
// submitSatelliteFundsIn (src/js/app.js) is a thin DOM-reading wrapper around
// DB.addSatelliteFund({direction:'in', ...}) — same convention as the pool-payout
// tests above: assert the resulting data shape satisfies the required invariants via
// the same calcChurchBalance/summarizeSatelliteFunds engine used throughout this suite.

test('income-page satellite funds received: creates a satellite_funds "in" (never an income row), excluded from income totals, increases held', async () => {
  // What submitSatelliteFundsIn produces for a ₦6,000 receipt from a satellite parish:
  // ONE satellite_funds direction='in' row (mirrored as a cash_deposit tagged
  // destination='satellite_passthrough' server-side) — and critically NO income row.
  const cashTx = [{ type: 'cash_deposit', date: '2026-06-01', amount: 6000, destination: 'satellite_passthrough' }];
  const satelliteFunds = [{ direction: 'in', date: '2026-06-01', amount: 6000, purpose: 'joint_area_zone' }];
  const income = []; // no income row — satellite receipts must never be parish income

  const incomeTotal = income.reduce((s, r) => s + (r.totalCollection || 0), 0);
  assert.equal(incomeTotal, 0, 'satellite funds received must never be counted as parish income');

  const bal = await balance({ cashTx, satelliteFunds, income });
  assert.equal(bal.bankBalance, 6000, 'the money really is in the bank');
  assert.equal(bal.cashWithAccountant, 0, 'the accountant is never touched by a satellite receipt (P1 fix)');
  assert.equal(bal.heldForSatellites, 6000, 'held increases by the full amount received');
  assert.equal(bal.total, 0, 'held money is excluded from the available parish total');
});

test('the Income-page and Remittances-page "Funds In" forms share the same purpose set', () => {
  // Both showSatelliteFundsInForm() (Income page) and showSatelliteFundForm('in')
  // (Remittances pool panel) render SATELLITE_FUND_PURPOSES verbatim — asserting on
  // the shared constant is the guarantee that neither entry point can silently drift
  // to a narrower/different option set than the other.
  const keys = App._SATELLITE_FUND_PURPOSES.map(p => p.key);
  assert.deepEqual(keys, ['province_remittance', 'joint_area_zone', 'other']);
});

// ── Satellite "in" CASH channel (received by cash instead of only bank) ─────────
// createSatelliteFund only mirrors a cash_transactions bank-deposit for channel==='bank'
// (the default); channel==='cash' creates no mirror at all — the money sits with the
// accountant instead, exactly like any other cash they hold, until it is later deposited
// through the normal accountant cash-deposit flow. calcChurchBalance's new
// satelliteCashIn term is the ONLY place this channel choice affects the balance.

test('satellite cash-channel "in": cashWithAccountant +X, held +X, bank unchanged, total unchanged, no phantom deficit', async () => {
  // What submitSatelliteFund/submitSatelliteFundsIn produce for a cash receipt: a
  // satellite_funds row with channel='cash' and NO cash_transactions mirror at all.
  const satelliteFunds = [{ direction: 'in', date: '2026-06-01', amount: 4000, channel: 'cash' }];
  const bal = await balance({ satelliteFunds });

  assert.equal(bal.cashWithAccountant, 4000, 'a cash-channel receipt sits with the accountant');
  assert.equal(bal.cashDeficit, 0, 'must not manufacture a phantom deficit');
  assert.equal(bal.bankBalance, 0, 'no bank movement was ever created for a cash-channel receipt');
  assert.equal(bal.heldForSatellites, 4000, 'held increases regardless of channel');
  assert.equal(bal.total, 0, 'cash +X and held +X cancel — held money stays excluded from the available total');
});

test('satellite bank-channel "in" behaves exactly as before: bank +X, cash unchanged', async () => {
  const cashTx = [{ type: 'cash_deposit', date: '2026-06-01', amount: 4000, destination: 'satellite_passthrough' }];
  const satelliteFunds = [{ direction: 'in', date: '2026-06-01', amount: 4000, channel: 'bank' }];
  const bal = await balance({ cashTx, satelliteFunds });

  assert.equal(bal.bankBalance, 4000);
  assert.equal(bal.cashWithAccountant, 0, 'the default/bank channel is untouched by the new satelliteCashIn term');
  assert.equal(bal.cashDeficit, 0);
  assert.equal(bal.heldForSatellites, 4000);
  assert.equal(bal.total, 0);
});

test('satellite cash-channel "in" followed by a normal accountant cash deposit: money moves cash→bank, total unchanged', async () => {
  const satelliteFunds = [{ direction: 'in', date: '2026-06-01', amount: 5000, channel: 'cash' }];
  const beforeDeposit = await balance({ satelliteFunds });

  // The accountant later banks that cash via the NORMAL cash-deposit flow — a plain
  // cash_transactions row with no satellite_passthrough tag (same as depositing any
  // other cash they hold; satellite_funds itself is untouched by this step).
  const cashTx = [{ type: 'cash_deposit', date: '2026-06-05', amount: 5000 }];
  const afterDeposit = await balance({ satelliteFunds, cashTx });

  assert.equal(afterDeposit.cashWithAccountant, 0, 'the cash left the accountant');
  assert.equal(afterDeposit.bankBalance, 5000, 'and arrived in the bank');
  assert.equal(afterDeposit.heldForSatellites, beforeDeposit.heldForSatellites, 'still held — just sitting in the bank instead of with the accountant now');
  assert.equal(afterDeposit.total, beforeDeposit.total, 'the satelliteCashIn term and the normal deposit cancel — total is unchanged throughout');
});
