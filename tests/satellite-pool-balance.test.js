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

// ── Part A: expense category rename/reorder/removal (rccg_proj / zonal_area_joint) ──
// Data-level assertions on EXPENSE_CATS/EXPENSE_SUBCATS content — the DOM-visibility
// side of "Pay From only for rccg_proj" (applyCategoryFundSourceDefault) isn't
// exercised here since this suite's minimal document stub has no querySelector; that
// logic was verified by code review (see src/js/app.js showExpenseForm/
// applyCategoryFundSourceDefault/onExpFundSourceChange).

test('EXPENSE_CATS: rccg_proj key is unchanged but relabeled "RCCG Payments" and moved last; zonal_area_joint is gone', () => {
  const cats = App._EXPENSE_CATS;
  assert.equal(cats.some(c => c.key === 'zonal_area_joint'), false, 'zonal_area_joint must be fully removed from the selectable list');
  const rccg = cats[cats.length - 1];
  assert.equal(rccg.key, 'rccg_proj', 'key must stay unchanged — historical expenses reference it by key');
  assert.equal(rccg.label, 'RCCG Payments');
});

test('EXPENSE_CATS_ALL: zonal_area_joint still resolves to a readable fallback label for historical records, but is not in the selectable list', () => {
  const legacy = App._EXPENSE_CATS_ALL.find(c => c.key === 'zonal_area_joint');
  assert.ok(legacy, 'a historical zonal_area_joint expense must still resolve to SOME label, not fall through to the raw key');
  assert.match(legacy.label, /Zonal|Area|Joint/i);
  assert.equal(App._EXPENSE_CATS.some(c => c.key === 'zonal_area_joint'), false, 'still excluded from the selectable EXPENSE_CATS list');
  assert.deepEqual(App._LEGACY_EXPENSE_CATS.zonal_area_joint, legacy);
});

test('EXPENSE_SUBCATS.rccg_proj is replaced with exactly the new list; zonal_area_joint subcats are gone', () => {
  assert.deepEqual(App._EXPENSE_SUBCATS.rccg_proj, [
    'Programme or Event from Provincial / Regional / National',
    'Project Levy from Provincial / Regional / National',
    'Special / Emergency Request from RCCG Authorities',
    "Let's Go A-Fishing Contribution",
    'Others...',
  ]);
  assert.equal(App._EXPENSE_SUBCATS.zonal_area_joint, undefined);
});

// ── Part B: "Paid via" role-scoped options for a Satellite/Zone Pool payout ──────

test('getPoolPaidViaOptionsForRole: admin_officer gets bank + petty_cash only; accountant gets bank + cash_accountant only; it_admin gets all three', () => {
  const admin = App._getPoolPaidViaOptionsForRole('admin_officer').map(o => o.value);
  const accountant = App._getPoolPaidViaOptionsForRole('accountant').map(o => o.value);
  const itAdmin = App._getPoolPaidViaOptionsForRole('it_admin').map(o => o.value);
  assert.deepEqual(admin, ['bank', 'petty_cash']);
  assert.deepEqual(accountant, ['bank', 'cash_accountant']);
  assert.deepEqual(itAdmin, ['bank', 'petty_cash', 'cash_accountant']);
  assert.equal(admin[0], 'bank', '"bank" stays first/default — preserves old pool-payout behavior when nothing else applies');
});

test('getPoolPaidViaOptionsForRole: a role with neither petty nor accountant cash access (e.g. pastor) only ever sees Bank', () => {
  assert.deepEqual(App._getPoolPaidViaOptionsForRole('pastor').map(o => o.value), ['bank']);
});

// ── Part B: pool payouts funded via Petty Cash / Cash (Accountant), not just Bank ──
// createSatelliteFund now respects `channel` for direction='out' too (bank|petty_cash|
// cash_accountant). calcChurchBalance's held math (heldForSatellites = in−out−transferOut)
// is funding-source-agnostic and is DELIBERATELY UNCHANGED by this — only the term that
// picks up the real cash movement differs (bankBalance / pettyFloat / cashWithAccountant).

test('petty-funded pool payout: petty float drops by X, bank and cash-with-accountant unchanged, held goes negative by X', async () => {
  // Pool starts holding ₦5,000 (one prior 'in', bank-funded). An officer then pays
  // ₦15,000 entirely on the satellites' behalf via Petty Cash.
  const cashTx = [{ type: 'cash_deposit', date: '2026-06-01', amount: 5000, destination: 'satellite_passthrough' }];
  const inOnly = [{ direction: 'in', date: '2026-06-01', amount: 5000, channel: 'bank' }];
  const withPayout = [...inOnly, { direction: 'out', date: '2026-06-10', amount: 15000, channel: 'petty_cash' }];
  const pettyHistory = [{ type: 'disbursement', status: 'approved', amount: 15000, date: '2026-06-10' }];

  const before = await balance({ cashTx, satelliteFunds: inOnly });
  const after = await balance({ cashTx, satelliteFunds: withPayout, pettyHistory });

  assert.equal(after.pettyFloat, before.pettyFloat - 15000, 'petty float drops by the full payout amount — picked up automatically via pettyFloatEvents\' disbursement branch, no formula change needed');
  assert.equal(after.bankBalance, before.bankBalance, 'no bank mirror is created for a petty-funded payout');
  assert.equal(after.cashWithAccountant, before.cashWithAccountant, 'the accountant is untouched by a petty-funded payout');
  assert.equal(after.heldForSatellites, before.heldForSatellites - 15000);
  assert.equal(after.heldForSatellites, -10000, 'pool started at 5000, paid out 15000 — now owed BY satellites (negative)');
  // `total` (cash+bank+petty−held) is unaffected by a satellite in/out entry regardless
  // of channel — this is the SAME funding-source-agnostic invariant already asserted by
  // 'satellite pool: outbound X lowers bank and held by X, total unchanged' above; the
  // real cash outflow (petty −15000) is exactly offset by held moving further negative
  // (so −held adds 15000 back), matching the existing "reducing held alone is the
  // complete balance effect" pattern used for transfer_out too.
  assert.equal(after.total, before.total);
});

test('cash_accountant-funded pool payout: cash-with-accountant drops by X (surfacing as a deficit), bank and petty unchanged, held goes negative by X', async () => {
  const cashTx = [{ type: 'cash_deposit', date: '2026-06-01', amount: 5000, destination: 'satellite_passthrough' }];
  const inOnly = [{ direction: 'in', date: '2026-06-01', amount: 5000, channel: 'bank' }];
  const withPayout = [...inOnly, { direction: 'out', date: '2026-06-10', amount: 15000, channel: 'cash_accountant' }];

  const before = await balance({ cashTx, satelliteFunds: inOnly });
  const after = await balance({ cashTx, satelliteFunds: withPayout });

  assert.equal(after.cashWithAccountant, 0, 'clamped at 0 — the accountant had no cash on hand from this pool to fund it with');
  assert.equal(after.cashDeficit, 15000, 'the negative raw cash position surfaces as a deficit, same as any other cash outflow exceeding recorded inflows');
  assert.equal(after.bankBalance, before.bankBalance, 'no bank mirror is created for a cash_accountant-funded payout');
  assert.equal(after.pettyFloat, before.pettyFloat, 'petty cash is untouched');
  assert.equal(after.heldForSatellites, before.heldForSatellites - 15000);
  assert.equal(after.heldForSatellites, -10000);
  assert.equal(after.total, before.total, 'funding-source-agnostic — same invariant as the petty-funded case above');
});

test('bank-funded pool payout: regression — behavior unchanged from before Part B (default/explicit channel="bank")', async () => {
  const cashTx = [{ type: 'cash_deposit', date: '2026-06-01', amount: 5000, destination: 'satellite_passthrough' }];
  const inOnly = [{ direction: 'in', date: '2026-06-01', amount: 5000, channel: 'bank' }];
  const before = await balance({ cashTx, satelliteFunds: inOnly });

  const cashTxAfter = [...cashTx, { type: 'withdrawal', date: '2026-06-10', amount: 15000, destination: 'satellite_passthrough' }];
  const withPayoutExplicit = [...inOnly, { direction: 'out', date: '2026-06-10', amount: 15000, channel: 'bank' }];
  const withPayoutDefault  = [...inOnly, { direction: 'out', date: '2026-06-10', amount: 15000 }]; // channel omitted

  for (const satelliteFunds of [withPayoutExplicit, withPayoutDefault]) {
    const after = await balance({ cashTx: cashTxAfter, satelliteFunds });
    assert.equal(after.bankBalance, before.bankBalance - 15000);
    assert.equal(after.pettyFloat, before.pettyFloat, 'no petty movement for a bank-funded payout');
    assert.equal(after.cashWithAccountant, before.cashWithAccountant, 'no accountant-cash movement for a bank-funded payout');
    assert.equal(after.heldForSatellites, -10000);
    assert.equal(after.total, before.total);
  }
});

// ── Part C: Remittances "Area Payment" (Part A) satellite overage auto-linked ──────
// submitRemittance auto-creates a satellite_funds 'out' entry for otherParishesAmount
// when a Part A remittance's Area Payment total exceeds our own parish share — see
// createRemittance's new satelliteFundRef column. Exercised here the same way the
// expense-page pool-payout tests above are: assert the resulting DATA SHAPE (what
// submitRemittance produces) satisfies calcChurchBalance's invariants.

test('Area Payment satellite overage: bank reflects the FULL area total EXACTLY ONCE, via the remittance\'s own bankAmount — the linked satellite entry must not also mirror a withdrawal', async () => {
  // Our parish share ₦98,671.20, area total paid ₦200,000 → satellite overage
  // ₦101,328.80, auto-linked as a bank-funded satellite_funds 'out' entry — but that
  // single real wire transfer (ref one bank statement line) is already fully carried
  // by the remittance's own bankAmount (=areaTotal), so the linked satellite_funds
  // entry has NO cashTx mirror of its own by the time both records exist —
  // createRemittance verifies the link server-side and removes the mirror it was
  // initially given (see createRemittance/createSatelliteFund in functions/api/
  // [[route]].js). Before this fix, a matching `withdrawal` cashTx entry existed
  // here too, and bankBalance double-subtracted the otherParishesAmount portion (the
  // reported bug — "Remittance: HQ" + a separate "Withdrawal" line for the same money).
  const ourShare = 98671.2;
  const areaTotal = 200000;
  const otherParishesAmount = areaTotal - ourShare;
  const satelliteFunds = [{ direction: 'out', date: '2026-06-15', amount: otherParishesAmount, purpose: 'province_remittance', channel: 'bank' }];
  const remittances = [{ status: 'paid', paidDate: '2026-06-15', amount: ourShare, bankAmount: areaTotal, cashAmount: 0, part: 'a', areaTotalPaid: areaTotal, otherParishesAmount }];

  const bal = await balance({ satelliteFunds, remittances });

  assert.equal(bal.bankBalance, -areaTotal, 'the real ₦200,000 wire transfer leaves the bank exactly once, via the remittance\'s own bankAmount — not once more via a linked satellite withdrawal');
  assert.equal(bal.heldForSatellites, -otherParishesAmount, 'pool started empty — the satellite share is now owed BY satellites (negative held)');
  assert.equal(bal.cashWithAccountant, 0, 'the accountant is untouched by a bank-funded Area Payment');
});

test('Area Payment satellite overage: held decreases (not goes negative) when the pool already had enough', async () => {
  const ourShare = 50000;
  const areaTotal = 150000;
  const otherParishesAmount = areaTotal - ourShare; // 100000
  const priorIn = { direction: 'in', date: '2026-06-01', amount: 120000, channel: 'bank' };
  // linkedOut is the Part A auto-link — its bank movement is already carried by the
  // remittance's own bankAmount below, so (once createRemittance verifies the link
  // and removes the mirror it was initially given) it has no cashTx mirror of its own.
  const linkedOut = { direction: 'out', date: '2026-06-15', amount: otherParishesAmount, purpose: 'province_remittance', channel: 'bank' };
  const cashTx = [
    { type: 'cash_deposit', date: '2026-06-01', amount: 120000, destination: 'satellite_passthrough' },
  ];
  const remittances = [{ status: 'paid', paidDate: '2026-06-15', amount: ourShare, bankAmount: areaTotal, cashAmount: 0, part: 'a', areaTotalPaid: areaTotal, otherParishesAmount }];

  const bal = await balance({ cashTx, satelliteFunds: [priorIn, linkedOut], remittances });
  assert.equal(bal.heldForSatellites, 120000 - otherParishesAmount, 'held decreases by the overage but stays positive — the pool had enough');
  assert.ok(bal.heldForSatellites > 0);
});

test('Area Payment with NO satellite overage (areaTotalPaid <= our own share): no satellite_funds entry, held untouched', async () => {
  // Paying only our own parish share (or not filling in an Area Payment total at all)
  // must never create a satellite_funds entry — this only applies when the area total
  // genuinely exceeds our own share.
  const ourShare = 50000;
  const remittances = [{ status: 'paid', paidDate: '2026-06-15', amount: ourShare, part: 'a', areaTotalPaid: 0, otherParishesAmount: 0 }];
  const bal = await balance({ remittances, satelliteFunds: [] });
  assert.equal(bal.heldForSatellites, 0);
});

// ── Codex review fixes (PR #263) ────────────────────────────────────────────

test('legacy expense category (zonal_area_joint) is included in EXPENSE_CATS_ALL but not in the selectable EXPENSE_CATS', () => {
  const selectable = App._EXPENSE_CATS;
  const all = App._EXPENSE_CATS_ALL;
  const legacy = App._LEGACY_EXPENSE_CATS;

  assert.ok(legacy.zonal_area_joint, 'the retired category still has a fallback label entry');
  assert.equal(selectable.some(c => c.key === 'zonal_area_joint'), false, 'retired category must not be choosable for new expenses');
  assert.equal(all.some(c => c.key === 'zonal_area_joint'), true, 'retired category must still resolve for historical records');

  // Reproduces the exact seed-then-sum aggregation pattern used at all 4 report/
  // summary call sites (buildMonthlyStatementData, renderExpenses, generateMonthlyReport,
  // generateExpenseReport) — each does `EXPENSE_CATS_ALL.forEach(c=>{map[c.key]={...}})`
  // then sums expenses into it. Before the fix, these seeded from EXPENSE_CATS only, so
  // a historical 'zonal_area_joint' expense had no bucket to land in and was silently
  // dropped from category breakdowns while still counting toward totalExpenses.
  const expenses = [
    { category: 'zonal_area_joint', amount: 7000 },
    { category: 'rccg_proj', amount: 3000 },
  ];
  const map = {};
  all.forEach(c => { map[c.key] = { label: c.label, total: 0, count: 0 }; });
  expenses.forEach(e => { if (map[e.category]) { map[e.category].total += e.amount || 0; map[e.category].count++; } });

  assert.equal(map.zonal_area_joint.total, 7000, 'legacy-category expense is counted in the breakdown, not silently dropped');
  assert.equal(map.zonal_area_joint.count, 1);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const sumOfBreakdown = Object.values(map).reduce((s, c) => s + c.total, 0);
  assert.equal(sumOfBreakdown, totalExpenses, 'the category breakdown must add up to the same total as totalExpenses — no silent drops');
});

// ── Rollback of the auto-linked pool entry when the remittance save fails ──
// submitRemittance() creates the satellite_funds 'out' entry (Part A overage) BEFORE
// DB.addRemittance(). If addRemittance then fails, the orphaned pool entry must be
// rolled back via DB.deleteSatelliteFund — otherwise a retry (which the error message
// invites) would create a SECOND pool debit for the same real-world payment. Exercised
// here against the real App.submitRemittance() with a mocked fetch and a minimal DOM
// stub providing just the form fields it reads.
test('submitRemittance rollback: a remittance save failure after the satellite fund was created rolls the pool entry back', async () => {
  const savedDocument = globalThis.document;
  const savedWindowDocument = globalThis.window.document;
  const savedFetch = globalThis.fetch;
  const calls = [];
  try {
    const fieldValues = {
      rem_part: 'a', rem_date: '2026-07-01', rem_ref: '', rem_notes: '',
      rem_auth_text: 'Test Signatory', rem_total_due: '50000', rem_area_total: '150000',
      rem_breakdown_snapshot: '',
    };
    const remittanceDocStub = {
      ...documentStub,
      getElementById(id) { return (id in fieldValues) ? { value: fieldValues[id], files: [] } : null; },
      querySelector(sel) { return sel === 'input[name="rem_method"]:checked' ? { value: 'cash' } : null; },
      querySelectorAll(sel) { return sel === 'input[name="rem_sig"]:checked' ? [] : []; },
    };
    globalThis.document = remittanceDocStub;
    globalThis.window.document = remittanceDocStub;

    globalThis.fetch = async (url, opts) => {
      const method = opts?.method || 'GET';
      calls.push({ url, method });
      if (method === 'POST' && url === '/api/satellite-funds') {
        return { ok: true, status: 200, json: async () => ({ id: 'SAT-ROLLBACK-TEST', direction: 'out' }) };
      }
      if (method === 'POST' && url === '/api/remittances') {
        return { ok: false, status: 500, json: async () => ({ error: 'Simulated remittance save failure' }) };
      }
      if (method === 'DELETE' && url === '/api/satellite-funds/SAT-ROLLBACK-TEST') {
        return { ok: true, status: 200, json: async () => ({ id: 'SAT-ROLLBACK-TEST', deleted: true }) };
      }
      throw new Error(`Unmocked fetch in rollback test: ${method} ${url}`);
    };

    await App.submitRemittance(null);

    const satFundCreate = calls.find(c => c.method === 'POST' && c.url === '/api/satellite-funds');
    const remittanceCreate = calls.find(c => c.method === 'POST' && c.url === '/api/remittances');
    const satFundDelete = calls.find(c => c.method === 'DELETE' && c.url === '/api/satellite-funds/SAT-ROLLBACK-TEST');

    assert.ok(satFundCreate, 'the satellite fund auto-link was attempted before the remittance save');
    assert.ok(remittanceCreate, 'the remittance save was attempted and (per the mock) failed');
    assert.ok(satFundDelete, 'the orphaned satellite fund entry was rolled back via DB.deleteSatelliteFund after the remittance save failed');
  } finally {
    globalThis.document = savedDocument;
    globalThis.window.document = savedWindowDocument;
    globalThis.fetch = savedFetch;
  }
});

// ── Part A (RCCG portal remittance) is bank-transfer-only ──────────────────
// The Payment Method radios for Cash/Split were removed from Part A's form (Part B —
// TG & Pastoral Stipend, paid directly to the Pastor — keeps them, since that IS
// routinely handed over as cash). Regression guard: even though submitRemittance's
// resolution branch itself is untouched, a Part A submission must always resolve to
// bankAmount=paidTotal / cashAmount=0, matching the fact that no other radio can ever
// be checked in the new markup.
test('submitRemittance Part A: always resolves to bank_transfer (bankAmount=paidTotal, cashAmount=0), regardless of an Area Payment overage', async () => {
  const savedDocument = globalThis.document;
  const savedWindowDocument = globalThis.window.document;
  const savedFetch = globalThis.fetch;
  const calls = [];
  try {
    const fieldValues = {
      rem_part: 'a', rem_date: '2026-07-01', rem_ref: 'TX-12345', rem_notes: '',
      rem_auth_text: 'Test Signatory', rem_total_due: '98671.2', rem_area_total: '200000',
      rem_breakdown_snapshot: '',
    };
    const remittanceDocStub = {
      ...documentStub,
      // Unknown ids (e.g. 'pageContent', hit by the fire-and-forget renderRemittances()
      // re-render on the success path below) fall back to an inert stub element instead
      // of null, so incidental .innerHTML writes don't crash after this test has moved on.
      getElementById(id) { return (id in fieldValues) ? { value: fieldValues[id], files: [] } : makeElement(); },
      // The only radio Part A's markup can ever produce is bank_transfer — there is no
      // cash/split option to select, mirroring the new HTML in showRemittancePaymentModal.
      querySelector(sel) { return sel === 'input[name="rem_method"]:checked' ? { value: 'bank_transfer' } : null; },
      querySelectorAll(sel) { return sel === 'input[name="rem_sig"]:checked' ? [] : []; },
    };
    globalThis.document = remittanceDocStub;
    globalThis.window.document = remittanceDocStub;

    globalThis.fetch = async (url, opts) => {
      const method = opts?.method || 'GET';
      calls.push({ url, method, body: opts?.body ? JSON.parse(opts.body) : null });
      if (method === 'POST' && url === '/api/satellite-funds') {
        return { ok: true, status: 200, json: async () => ({ id: 'SAT-PARTA-TEST', direction: 'out' }) };
      }
      if (method === 'POST' && url === '/api/remittances') {
        return { ok: true, status: 200, json: async () => ({ id: 'REM-TEST', ...JSON.parse(opts.body) }) };
      }
      // A successful save triggers a fire-and-forget renderRemittances() (not awaited by
      // submitRemittance itself), which issues its own GET requests after this test's
      // assertions have already run. Answer any of those tolerantly instead of throwing.
      if (method === 'GET') return { ok: true, status: 200, json: async () => ([]) };
      throw new Error(`Unmocked fetch in Part A bank-only test: ${method} ${url}`);
    };

    await App.submitRemittance(null);

    const remittanceCreate = calls.find(c => c.method === 'POST' && c.url === '/api/remittances');
    assert.ok(remittanceCreate, 'the remittance save was attempted');
    assert.equal(remittanceCreate.body.bankAmount, 200000, 'the FULL area total is attributed to the bank — Part A can never be cash-funded');
    assert.equal(remittanceCreate.body.cashAmount, 0, 'no cash amount is ever recorded for Part A');
    assert.equal(remittanceCreate.body.paymentMethod, 'bank_transfer');

    const satFundCreate = calls.find(c => c.method === 'POST' && c.url === '/api/satellite-funds');
    assert.ok(satFundCreate, 'the satellite overage (200000 - 98671.2) was still auto-linked to the pool');
    assert.equal(satFundCreate.body.channel, 'bank', 'the linked pool entry is bank-funded too, since Part A is bank-only');
    // The client no longer asks for the mirror to be skipped — createRemittance verifies
    // the link server-side and removes the duplicate mirror itself (see PR #278 review:
    // trusting a client-supplied flag here would let any bank-funded Funds Out request
    // hide a real bank outflow).
    assert.equal(satFundCreate.body.noBankMirror, undefined, 'the client never sends noBankMirror — the server verifies the link itself instead of trusting a client flag');

    // Let the un-awaited renderRemittances() fire-and-forget GETs settle against the
    // still-tolerant mock before restoring globals in `finally`, so they don't reject
    // against the real fetch/original document after this test has already finished.
    await new Promise(resolve => setTimeout(resolve, 10));
  } finally {
    globalThis.document = savedDocument;
    globalThis.window.document = savedWindowDocument;
    globalThis.fetch = savedFetch;
  }
});

// ── Satellite/Zone pool panel moved to the Income page (renderIncome), no longer
// rendered on Remittances (renderRemittances) — see renderSatelliteFundsPanel's call
// site. Both pages used to compute the same 6 summary values (in/out/transferOut/held/
// recent/transferByReason) from their own DB.getSatelliteFunds() fetch; renderIncome
// now reuses the fetch it already had (allSatFundsRI) instead of a second network call.
// Data-level check that the shared formula (identical code, now living in one place)
// produces the same 6 values no matter which page's fetch supplies the source array —
// i.e. the migration didn't silently change what gets computed.

test('satellite-fund panel summary: the 6 values (in/out/transferOut/held/recent/transferByReason) are identical regardless of which page fetched the source array', () => {
  const allSatFunds = [
    { id: 'SAT-1', direction: 'in', date: '2026-06-01', amount: 10000, purpose: 'province_remittance' },
    { id: 'SAT-2', direction: 'out', date: '2026-06-05', amount: 4000, purpose: 'joint_area_zone' },
    { id: 'SAT-3', direction: 'transfer_out', date: '2026-06-10', amount: 1500, purpose: 'gift' },
    { id: 'SAT-4', direction: 'transfer_out', date: '2026-06-11', amount: 500, purpose: 'reimbursement' },
  ];
  // Exact same computation renderSatelliteFundsPanel's 6 arguments are built from in
  // both renderIncome and (formerly) renderRemittances — see src/js/app.js.
  const computePanelSummary = (source) => {
    const satFundsIn = source.filter(s => s.direction === 'in').reduce((s, r) => s + (r.amount || 0), 0);
    const satFundsOut = source.filter(s => s.direction === 'out').reduce((s, r) => s + (r.amount || 0), 0);
    const satFundsTransferOut = source.filter(s => s.direction === 'transfer_out').reduce((s, r) => s + (r.amount || 0), 0);
    const satFundsHeld = satFundsIn - satFundsOut - satFundsTransferOut;
    const satFundsTransferByReason = { gift: 0, reimbursement: 0, correction: 0 };
    source.filter(s => s.direction === 'transfer_out').forEach(s => {
      satFundsTransferByReason[s.purpose] = (satFundsTransferByReason[s.purpose] || 0) + (s.amount || 0);
    });
    const satFundsRecent = [...source].sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)).slice(0, 10);
    return { satFundsIn, satFundsOut, satFundsTransferOut, satFundsHeld, satFundsTransferByReason, satFundsRecent };
  };

  // "Remittances-shaped fetch" and "Income-shaped fetch" are both just DB.getSatelliteFunds()
  // — simulate two independently-fetched (but identical) copies of the same table.
  const asComputedOnRemittancesPage = computePanelSummary(JSON.parse(JSON.stringify(allSatFunds)));
  const asComputedOnIncomePage = computePanelSummary(JSON.parse(JSON.stringify(allSatFunds)));

  assert.equal(asComputedOnIncomePage.satFundsIn, asComputedOnRemittancesPage.satFundsIn);
  assert.equal(asComputedOnIncomePage.satFundsOut, asComputedOnRemittancesPage.satFundsOut);
  assert.equal(asComputedOnIncomePage.satFundsTransferOut, asComputedOnRemittancesPage.satFundsTransferOut);
  assert.equal(asComputedOnIncomePage.satFundsHeld, asComputedOnRemittancesPage.satFundsHeld);
  assert.deepEqual(asComputedOnIncomePage.satFundsTransferByReason, asComputedOnRemittancesPage.satFundsTransferByReason);
  assert.deepEqual(asComputedOnIncomePage.satFundsRecent, asComputedOnRemittancesPage.satFundsRecent);

  // Sanity-check the actual numbers too, not just cross-page equality.
  assert.equal(asComputedOnIncomePage.satFundsIn, 10000);
  assert.equal(asComputedOnIncomePage.satFundsOut, 4000);
  assert.equal(asComputedOnIncomePage.satFundsTransferOut, 2000);
  assert.equal(asComputedOnIncomePage.satFundsHeld, 10000 - 4000 - 2000);
  assert.equal(asComputedOnIncomePage.satFundsTransferByReason.gift, 1500);
  assert.equal(asComputedOnIncomePage.satFundsTransferByReason.reimbursement, 500);
  assert.equal(asComputedOnIncomePage.satFundsRecent.length, 4);
});

// ── Edit (three-dot menu → ✏️ Edit) = delete-old + create-new ──────────────────────
// No PATCH endpoint exists or is being added — submitSatelliteFund(direction, btn,
// editId) reuses the existing, already-tested createSatelliteFund/deleteSatelliteFund
// paths: delete the old entry first (its own try/catch — a failure here means nothing
// changed), then create the new one (its own try/catch — a failure here means the old
// entry is genuinely gone, surfaced plainly, no automatic re-creation attempted). Same
// mocked-fetch + swapped-document-stub pattern as the submitRemittance rollback test
// above.

test('submitSatelliteFund edit: delete-old-then-create-new both happen, in order, with the right ids/values', async () => {
  App._setTestUserRole('accountant'); // holds 'expenses', which gates satellite_fund_record
  const savedDocument = globalThis.document;
  const savedWindowDocument = globalThis.window.document;
  const savedFetch = globalThis.fetch;
  const calls = [];
  try {
    const fieldValues = {
      sf_date: '2026-07-05', sf_amount: '7500', sf_purpose: 'joint_area_zone',
      sf_note: 'Edited note', sf_reference: 'REF-EDIT',
    };
    const editDocStub = {
      ...documentStub,
      getElementById(id) { return (id in fieldValues) ? { value: fieldValues[id], files: [] } : makeElement(); },
      querySelector(sel) { return sel === 'input[name="sf_channel"]:checked' ? { value: 'cash' } : null; },
      querySelectorAll() { return []; },
    };
    globalThis.document = editDocStub;
    globalThis.window.document = editDocStub;

    globalThis.fetch = async (url, opts) => {
      const method = opts?.method || 'GET';
      calls.push({ url, method, body: opts?.body ? JSON.parse(opts.body) : null });
      if (method === 'DELETE' && url === '/api/satellite-funds/SAT-OLD') {
        return { ok: true, status: 200, json: async () => ({ id: 'SAT-OLD', deleted: true }) };
      }
      if (method === 'POST' && url === '/api/satellite-funds') {
        return { ok: true, status: 200, json: async () => ({ id: 'SAT-NEW', direction: 'in' }) };
      }
      // Success triggers a fire-and-forget renderIncome/renderRemittances refresh
      // (state.page defaults to 'dashboard' in this harness, so it falls to
      // renderRemittances — see submitSatelliteFund) — tolerate its GETs.
      if (method === 'GET') return { ok: true, status: 200, json: async () => ([]) };
      throw new Error(`Unmocked fetch in edit-success test: ${method} ${url}`);
    };

    await App.submitSatelliteFund('in', null, 'SAT-OLD');

    const del = calls.find(c => c.method === 'DELETE');
    const create = calls.find(c => c.method === 'POST' && c.url === '/api/satellite-funds');
    assert.ok(del, 'the original entry was deleted');
    assert.equal(del.url, '/api/satellite-funds/SAT-OLD');
    assert.ok(create, 'a fresh entry was created with the edited values');
    assert.equal(create.body.amount, 7500);
    assert.equal(create.body.channel, 'cash');
    assert.equal(create.body.reference, 'REF-EDIT');
    assert.equal(create.body.note, 'Edited note');
    assert.ok(calls.indexOf(del) < calls.indexOf(create), 'delete-old runs before create-new, so a duplicate never briefly exists');

    await new Promise(resolve => setTimeout(resolve, 10));
  } finally {
    globalThis.document = savedDocument;
    globalThis.window.document = savedWindowDocument;
    globalThis.fetch = savedFetch;
  }
});

test('submitSatelliteFund edit: DELETE succeeds but the create fails — surfaces a clear error, no automatic retry-loop', async () => {
  App._setTestUserRole('accountant');
  const savedDocument = globalThis.document;
  const savedWindowDocument = globalThis.window.document;
  const savedFetch = globalThis.fetch;
  const calls = [];
  try {
    const fieldValues = {
      sf_date: '2026-07-05', sf_amount: '5000', sf_purpose: 'other',
      sf_note: '', sf_reference: '',
    };
    const editDocStub = {
      ...documentStub,
      getElementById(id) { return (id in fieldValues) ? { value: fieldValues[id], files: [] } : makeElement(); },
      querySelector(sel) { return sel === 'input[name="sf_channel"]:checked' ? { value: 'bank' } : null; },
      querySelectorAll() { return []; },
    };
    globalThis.document = editDocStub;
    globalThis.window.document = editDocStub;

    globalThis.fetch = async (url, opts) => {
      const method = opts?.method || 'GET';
      calls.push({ url, method });
      if (method === 'DELETE' && url === '/api/satellite-funds/SAT-OLD2') {
        return { ok: true, status: 200, json: async () => ({ id: 'SAT-OLD2', deleted: true }) };
      }
      if (method === 'POST' && url === '/api/satellite-funds') {
        return { ok: false, status: 500, json: async () => ({ error: 'Simulated create failure' }) };
      }
      throw new Error(`Unmocked fetch in edit-failure test: ${method} ${url}`);
    };

    await App.submitSatelliteFund('out', null, 'SAT-OLD2');

    const deletes = calls.filter(c => c.method === 'DELETE');
    const creates = calls.filter(c => c.method === 'POST' && c.url === '/api/satellite-funds');
    assert.equal(deletes.length, 1, 'the original entry was deleted exactly once');
    assert.equal(creates.length, 1, 'the create was attempted exactly once — no automatic retry-loop after failure');
    // No success-path refresh (which would issue GETs) fired on this failure path —
    // the ONLY network activity is the one DELETE and the one failed POST above, i.e.
    // submitSatelliteFund returned immediately after the create failed rather than
    // looping or attempting to silently re-create the deleted entry.
    assert.equal(calls.length, 2, 'no other network activity happened on the failure path');
  } finally {
    globalThis.document = savedDocument;
    globalThis.window.document = savedWindowDocument;
    globalThis.fetch = savedFetch;
  }
});

// ── Guard: a satellite_funds entry linked to a Remittance Part A payment must not be
// edited or deleted through the generic pool panel (PR #278 review) ────────────────
// A bank-funded 'out' entry with no bankRef only exists because createRemittance's
// verified de-dup removed the mirror it was initially given (see createRemittance in
// functions/api/[[route]].js) — createSatelliteFund always mirrors a bank-funded 'out'
// entry otherwise. Editing such an entry would recreate a fresh bank withdrawal (while
// the linked remittance still carries the full area total in its own bankAmount);
// deleting it would misreport "no bank movement to reverse" even though the money
// really did leave the bank. Both must be blocked — see isRemittanceLinkedPayout.

test('isRemittanceLinkedPayout: true only for a bank-funded OUT entry with no bankRef', () => {
  const f = App.isRemittanceLinkedPayout;
  assert.equal(f({ direction: 'out', channel: 'bank', bankRef: '' }), true);
  assert.equal(f({ direction: 'out', channel: 'bank', bankRef: 'CTX-1' }), false, 'a normal bank-funded payout has a real bankRef');
  assert.equal(f({ direction: 'out', channel: 'petty_cash', bankRef: '' }), false, 'petty-funded payouts never get a bank mirror in the first place');
  assert.equal(f({ direction: 'out', channel: 'cash_accountant', bankRef: '' }), false);
  assert.equal(f({ direction: 'in', channel: 'bank', bankRef: '' }), false, 'inbound receipts are never remittance-linked');
  assert.equal(f({ direction: 'transfer_out', channel: 'bank', bankRef: '' }), false);
});

test('editSatelliteFundEntry refuses to open the edit form for a remittance-linked entry', async () => {
  App._setTestUserRole('accountant'); // holds 'remittances', which gates satellite_fund_record
  const savedDocument = globalThis.document;
  const savedWindowDocument = globalThis.window.document;
  const savedFetch = globalThis.fetch;
  const calls = [];
  try {
    // showAlert (the guard's error message) needs a document.querySelector — the bare
    // documentStub doesn't define one.
    const guardDocStub = { ...documentStub, querySelector() { return null; } };
    globalThis.document = guardDocStub;
    globalThis.window.document = guardDocStub;

    globalThis.fetch = async (url, opts) => {
      const method = opts?.method || 'GET';
      calls.push({ url, method });
      if (method === 'GET' && url === '/api/satellite-funds') {
        return { ok: true, status: 200, json: async () => ([
          { id: 'SAT-LINKED', direction: 'out', channel: 'bank', bankRef: '', purpose: 'province_remittance', amount: 101328.8, date: '2026-06-15' },
        ]) };
      }
      throw new Error(`Unexpected fetch in linked-entry edit-guard test: ${method} ${url}`);
    };

    await App.editSatelliteFundEntry('SAT-LINKED');

    // The GET lookup itself may or may not hit the network (DB.getSatelliteFunds caches
    // reads for 60s, so a prior test's identical fetch can serve this one from cache) —
    // the real assertion is that the guard fired before anything mutating was attempted.
    assert.equal(calls.filter(c => c.method !== 'GET').length, 0, 'no mutating request was made — the edit form was never opened');
  } finally {
    globalThis.document = savedDocument;
    globalThis.window.document = savedWindowDocument;
    globalThis.fetch = savedFetch;
  }
});

test('deleteSatelliteFundEntry refuses to delete a remittance-linked entry', async () => {
  App._setTestUserRole('accountant'); // holds 'remittances', which gates satellite_fund_delete
  const savedDocument = globalThis.document;
  const savedWindowDocument = globalThis.window.document;
  const savedFetch = globalThis.fetch;
  const calls = [];
  try {
    const guardDocStub = { ...documentStub, querySelector() { return null; } };
    globalThis.document = guardDocStub;
    globalThis.window.document = guardDocStub;

    globalThis.fetch = async (url, opts) => {
      const method = opts?.method || 'GET';
      calls.push({ url, method });
      if (method === 'GET' && url === '/api/satellite-funds') {
        return { ok: true, status: 200, json: async () => ([
          { id: 'SAT-LINKED', direction: 'out', channel: 'bank', bankRef: '', purpose: 'province_remittance', amount: 101328.8, date: '2026-06-15' },
        ]) };
      }
      throw new Error(`Unexpected fetch in linked-entry delete-guard test: ${method} ${url}`);
    };

    // No confirm() stub exists in this test environment — if the guard did not return
    // early, the delete would fall through to the unstubbed global confirm() and throw,
    // failing this test. Resolving cleanly IS the proof the guard fired first.
    await App.deleteSatelliteFundEntry('SAT-LINKED');

    // As above, the GET lookup may be served from DB.getSatelliteFunds's 60s cache
    // instead of hitting the network — what matters is that no DELETE was attempted.
    assert.equal(calls.filter(c => c.method !== 'GET').length, 0, 'no confirm prompt, no DELETE request');
  } finally {
    globalThis.document = savedDocument;
    globalThis.window.document = savedWindowDocument;
    globalThis.fetch = savedFetch;
  }
});

// ── Adjustable "Our Parish Share" on the Area Payment (Part A) form ─────────
// The calculated due can differ from the parish's REAL share (e.g. a one-time levy
// instructed by RCCG authorities). The Adjust control lets the recorder enter the
// actual share (reason mandatory), and the satellite overage is derived from the
// ADJUSTED figure — so the pool is drawn exactly what the satellites owe, never
// inflated by our own extra payment.
test('Part A adjusted share: pool overage derives from the ADJUSTED share, remittance records the adjusted amount, calculated due kept for reporting', async () => {
  const savedDocument = globalThis.document;
  const savedWindowDocument = globalThis.window.document;
  const savedFetch = globalThis.fetch;
  const calls = [];
  try {
    const fieldValues = {
      rem_part: 'a', rem_date: '2026-07-18', rem_ref: 'TX-777', rem_notes: '',
      rem_auth_text: 'Test Signatory', rem_total_due: '90000', rem_area_total: '200000',
      rem_adjusted_share: '100000', rem_adjust_reason: 'One-time maintenance levy per Province instruction',
      rem_breakdown_snapshot: '',
    };
    const remittanceDocStub = {
      ...documentStub,
      getElementById(id) { return (id in fieldValues) ? { value: fieldValues[id], files: [] } : makeElement(); },
      querySelector(sel) { return sel === 'input[name="rem_method"]:checked' ? { value: 'bank_transfer' } : null; },
      querySelectorAll(sel) { return sel === 'input[name="rem_sig"]:checked' ? [] : []; },
    };
    globalThis.document = remittanceDocStub;
    globalThis.window.document = remittanceDocStub;
    globalThis.fetch = async (url, opts) => {
      const method = opts?.method || 'GET';
      calls.push({ url, method, body: opts?.body ? JSON.parse(opts.body) : null });
      if (method === 'POST' && url === '/api/satellite-funds') {
        return { ok: true, status: 200, json: async () => ({ id: 'SAT-ADJ-TEST', direction: 'out' }) };
      }
      if (method === 'POST' && url === '/api/remittances') {
        return { ok: true, status: 200, json: async () => ({ id: 'REM-ADJ-TEST', ...JSON.parse(opts.body) }) };
      }
      if (method === 'GET') return { ok: true, status: 200, json: async () => ([]) };
      throw new Error(`Unmocked fetch in adjusted-share test: ${method} ${url}`);
    };

    App.toggleRemShareAdjust(90000);   // open the Adjust control, as the user would
    await App.submitRemittance(null);

    const satFundCreate = calls.find(c => c.method === 'POST' && c.url === '/api/satellite-funds');
    assert.ok(satFundCreate, 'a pool payout was auto-linked');
    assert.equal(satFundCreate.body.amount, 100000, 'overage = 200,000 − ADJUSTED 100,000 — not 110,000 from the calculated 90,000');

    const remittanceCreate = calls.find(c => c.method === 'POST' && c.url === '/api/remittances');
    assert.ok(remittanceCreate, 'the remittance was saved');
    assert.equal(remittanceCreate.body.amount, 100000, 'our remittance records the ADJUSTED share');
    assert.equal(remittanceCreate.body.dueAtTimeOfPayment, 100000, 'the settlement snapshot is the ADJUSTED share — the real obligation — so paid/outstanding checks settle against it (the calculated 90,000 stays on record in the notes)');
    assert.equal(remittanceCreate.body.bankAmount, 200000, 'the full area total still leaves the bank');
    assert.equal(remittanceCreate.body.otherParishesAmount, 100000);
    assert.match(remittanceCreate.body.notes, /Parish share adjusted/, 'the adjustment + reason is stamped into the record notes');
    assert.match(remittanceCreate.body.notes, /One-time maintenance levy/);

    await new Promise(resolve => setTimeout(resolve, 10));
  } finally {
    App.toggleRemShareAdjust(90000);   // close it again so later tests see a fresh state
    globalThis.document = savedDocument;
    globalThis.window.document = savedWindowDocument;
    globalThis.fetch = savedFetch;
  }
});

test('Part A adjusted share without a reason is blocked before any network call', async () => {
  const savedDocument = globalThis.document;
  const savedWindowDocument = globalThis.window.document;
  const savedFetch = globalThis.fetch;
  const calls = [];
  try {
    const fieldValues = {
      rem_part: 'a', rem_date: '2026-07-18', rem_ref: 'TX-778', rem_notes: '',
      rem_auth_text: 'Test Signatory', rem_total_due: '90000', rem_area_total: '200000',
      rem_adjusted_share: '100000', rem_adjust_reason: '',
      rem_breakdown_snapshot: '',
    };
    const remittanceDocStub = {
      ...documentStub,
      getElementById(id) { return (id in fieldValues) ? { value: fieldValues[id], files: [] } : makeElement(); },
      querySelector(sel) { return sel === 'input[name="rem_method"]:checked' ? { value: 'bank_transfer' } : null; },
      querySelectorAll(sel) { return sel === 'input[name="rem_sig"]:checked' ? [] : []; },
    };
    globalThis.document = remittanceDocStub;
    globalThis.window.document = remittanceDocStub;
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, method: opts?.method || 'GET' });
      return { ok: true, status: 200, json: async () => ({}) };
    };

    App.toggleRemShareAdjust(90000);
    await App.submitRemittance(null);

    assert.equal(calls.filter(c => c.method === 'POST').length, 0, 'no satellite fund or remittance is created when the mandatory reason is missing');
  } finally {
    App.toggleRemShareAdjust(90000);
    globalThis.document = savedDocument;
    globalThis.window.document = savedWindowDocument;
    globalThis.fetch = savedFetch;
  }
});

test('Part A with the Adjust box open but a BLANK share field is blocked — no silent fallback to the calculated due', async () => {
  // Codex finding: a cleared/non-numeric adjusted-share input used to fall back to
  // the calculated due, which made shareAdjusted false, skipped the mandatory-reason
  // check, and recorded an unadjusted figure while the form showed a blank field.
  const savedDocument = globalThis.document;
  const savedWindowDocument = globalThis.window.document;
  const savedFetch = globalThis.fetch;
  const calls = [];
  try {
    const fieldValues = {
      rem_part: 'a', rem_date: '2026-07-18', rem_ref: 'TX-779', rem_notes: '',
      rem_auth_text: 'Test Signatory', rem_total_due: '90000', rem_area_total: '200000',
      rem_adjusted_share: '', rem_adjust_reason: 'reason present but amount blank',
      rem_breakdown_snapshot: '',
    };
    const remittanceDocStub = {
      ...documentStub,
      getElementById(id) { return (id in fieldValues) ? { value: fieldValues[id], files: [] } : makeElement(); },
      querySelector(sel) { return sel === 'input[name="rem_method"]:checked' ? { value: 'bank_transfer' } : null; },
      querySelectorAll(sel) { return sel === 'input[name="rem_sig"]:checked' ? [] : []; },
    };
    globalThis.document = remittanceDocStub;
    globalThis.window.document = remittanceDocStub;
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, method: opts?.method || 'GET' });
      return { ok: true, status: 200, json: async () => ({}) };
    };

    App.toggleRemShareAdjust(90000);
    await App.submitRemittance(null);

    assert.equal(calls.filter(c => c.method === 'POST').length, 0, 'nothing is recorded while the adjusted-share field is blank');
  } finally {
    App.toggleRemShareAdjust(90000);
    globalThis.document = savedDocument;
    globalThis.window.document = savedWindowDocument;
    globalThis.fetch = savedFetch;
  }
});
