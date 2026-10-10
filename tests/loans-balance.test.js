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

// ── Budget block: how money owed to us is absorbed ──
// Order: savings (held back) -> known bills saved -> available for new spending -> set aside for next budget.
const budgetAvail = (over = {}) => ({
  monthKey: '2026-10', budgetTotal: 0, budgetSpent: 0, status: 'yes', free: 55000, freeEnd: 60000,
  progress: { pct: 0 },
  parts: { currentFloat: 0, nextPeriodFloat: 20000, cushion: 0, knownBillsSaved: 10000, heldBack: 15000 },
  ...over
});
const strip = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('budget block: nothing owed leaves the block exactly as before', () => {
  const t = strip(App._renderDashBudgetBreakdown(budgetAvail(), '2026-10-25', 100000, '#000', 0));
  assert.match(t, /Held back for savings ₦15,000/);
  assert.match(t, /Known bills saved ₦10,000/);
  assert.match(t, /Available for new spending .*₦55,000/);
  assert.doesNotMatch(t, /owed to us/);
  assert.match(t, /Could rise to ₦60,000/);
});

test('budget block: money owed is taken from savings, then known bills, so new spending is not affected', () => {
  const t = strip(App._renderDashBudgetBreakdown(budgetAvail(), '2026-10-25', 100000, '#000', 20000));
  assert.match(t, /Held back for savings ₦0/);
  assert.match(t, /Known bills saved \(target: ₦10,000\) ₦5,000/);
  assert.match(t, /₦5,000 is lent out or owed to us, not in hand yet/);
  assert.match(t, /₦15,000 is lent out or owed to us, not in hand yet/);
  assert.match(t, /Available for new spending .*₦55,000/);
  assert.match(t, /₦20,000 owed to us is taken from savings, then known bills saved\. New spending is not affected\./);
  assert.match(t, /Could rise to ₦60,000/);
});

test('budget block: only what spills past savings and known bills reduces new spending and "could rise to"', () => {
  const t = strip(App._renderDashBudgetBreakdown(budgetAvail(), '2026-10-25', 100000, '#000', 40000));
  assert.match(t, /Held back for savings ₦0/);
  assert.match(t, /Known bills saved \(target: ₦10,000\) ₦0/);
  assert.match(t, /Available for new spending .*₦40,000/);
  assert.match(t, /Could rise to ₦45,000/);
  assert.match(t, /₦40,000 owed to us is taken from savings, then known bills saved, then new spending\./);
  assert.doesNotMatch(t, /New spending is not affected/);
});

test('budget block: order of the sentences is "could rise", then the owed note, then the red warning', () => {
  const t = strip(App._renderDashBudgetBreakdown(budgetAvail({ parts: { currentFloat: 0, nextPeriodFloat: 20000, cushion: 0, knownBillsSaved: 10000, heldBack: 15000 } }), '2026-10-25', 30000, '#000', 10000));
  const rise = t.indexOf('Could rise to'), owed = t.indexOf('owed to us is taken'), warn = t.indexOf('underfunded');
  assert.ok(rise >= 0 && owed > rise, `${rise} ${owed}`);
  assert.ok(warn === -1 || warn > owed);
});

test('budget block: when new spending is used up by money owed, the badge no longer says Yes', () => {
  const t = strip(App._renderDashBudgetBreakdown(budgetAvail(), '2026-10-25', 100000, '#000', 90000));
  assert.match(t, /Nothing spare/);
});

test('petty cash loans: moved through the petty ledger, never double counted on the accountant\'s cash line', async () => {
  // lent 12,000 from petty: petty disbursement mirror; total unchanged
  const pettyHistory = [{ type: 'disbursement', status: 'approved', amount: 12000, date: '2026-10-05', dateNeeded: '2026-10-05' }];
  const b = await balance({ income, pettyHistory, loans: [loan({ channel: 'petty', amount: 12000 })] });
  assert.equal(b.cashWithAccountant, 100000);   // untouched
  assert.equal(b.pettyFloat, -12000);
  assert.equal(b.loansOwedToUs, 12000);
  assert.equal(b.total, 100000);
  // borrowed into petty: petty refill paid by 'loan'
  const refill = [{ type: 'refill', status: 'approved', amount: 7000, paymentMethod: 'loan', date: '2026-10-06', dateNeeded: '2026-10-06' }];
  const b2 = await balance({ income, pettyHistory: refill, loans: [loan({ channel: 'petty', direction: 'borrowed', amount: 7000, date: '2026-10-06' })] });
  assert.equal(b2.cashWithAccountant, 100000);
  assert.equal(b2.bankBalance, 0);               // a 'loan' refill is not taken from the bank
  assert.equal(b2.pettyFloat, 7000);
  assert.equal(b2.loansWeOwe, 7000);
  assert.equal(b2.total, 100000);
});

test('reversed loans and repayments count for nothing', async () => {
  const l = loan({ status: 'reversed', repayments: [rep()] });
  const b = await balance({ income, loans: [l] });
  assert.equal(b.cashWithAccountant, 100000);
  assert.equal(b.loansOwedToUs, 0);
  const l2 = loan({ repayments: [rep({ status: 'reversed' })] });
  assert.equal((await balance({ income, loans: [l2] })).loansOwedToUs, 30000);
});

// ── Cash breakdown pages must tie out to the balance ──
test('cash pool breakdown: loan cash lines are listed and the balance equals Cash with Accountant', async () => {
  const loans = [
    loan({ id: 'A', amount: 30000, repayments: [rep({ amount: 10000 }), rep({ status: 'pending', amount: 999 })] }),
    loan({ id: 'B', direction: 'borrowed', amount: 8000, date: '2026-10-02', repayments: [rep({ amount: 3000, date: '2026-10-09' })] }),
    loan({ id: 'C', channel: 'bank', amount: 5000 }),     // bank loan: not cash
    loan({ id: 'D', channel: 'petty', amount: 4000 }),    // petty loan: not cash
    loan({ id: 'E', status: 'pending', amount: 7777 }),   // not acknowledged
  ];
  App._setLoansLatest(loans);
  const pool = App._computeCashPoolBreakdown(income, [], [], [], [], [], {}, null);
  assert.equal(pool.loanCashIn, 8000 + 10000);     // borrowed 8,000 + repayment received 10,000
  assert.equal(pool.loanCashOut, 30000 + 3000);    // lent 30,000 + repayment we paid 3,000
  const bal = await balance({ income, loans });
  assert.equal(pool.balance, 100000 + 18000 - 33000);
  assert.equal(pool.balance, bal.cashWithAccountant);
  const lines = App._buildCashPoolDetailLines([], [], [], [], '', '');
  assert.deepEqual(lines.loanOutLines.map(l => l.amount).sort((a, b) => a - b), [3000, 30000]);
  assert.deepEqual(lines.loanInLines.map(l => l.amount).sort((a, b) => a - b), [8000, 10000]);
  const html = App._renderCashPoolSectionHTML(pool, lines);
  assert.match(html, /Loan money received/);
  assert.match(html, /Loans paid out in cash/);
  App._setLoansLatest([]);
});

test('cash pool as of a date and Sunday cash cycle both honour loan dates', () => {
  App._setLoansLatest([loan({ amount: 30000, date: '2026-10-05' })]);
  assert.equal(App._computeCashPoolBreakdown(income, [], [], [], [], [], {}, '2026-10-04').loanCashOut, 0);
  assert.equal(App._computeCashPoolBreakdown(income, [], [], [], [], [], {}, '2026-10-05').loanCashOut, 30000);
  const sunday = { id: 'S1', source: 'sunday_collection', date: '2026-10-04', totalCollection: 100000, bankTransferAmount: 0, directPettyCash: 0, childrenOffering: 0 };
  const cycle = App._computeSundayCashCycle(sunday, [], [], [], [], [], {});
  assert.equal(cycle.loanCashOut, 30000);              // the loan was made within the week of 4-10 Oct
  assert.equal(cycle.netCashToDeposit, 70000);         // so only 70,000 is left to deposit from that Sunday
  App._setLoansLatest([loan({ amount: 30000, date: '2026-10-12' })]);
  assert.equal(App._computeSundayCashCycle(sunday, [], [], [], [], [], {}).netCashToDeposit, 100000);
  App._setLoansLatest([]);
});

test('Sunday spent or lent to zero is cleared, not deposited; real deposit keeps deposited', () => {
  const sunday = { id:'S1', date:'2026-10-04', totalCollection:1000, childrenOffering:0 };
  App._setLoansLatest([loan({amount:1000, date:'2026-10-05'})]);
  assert.equal(App._computeSundayCashCycle(sunday,[],[],[],[],[],{}).status,'cleared');
  App._setLoansLatest([]);
  assert.equal(App._computeSundayCashCycle(sunday,[],[{date:'2026-10-05',amount:1000,status:'approved',paymentMethod:'cash'}],[],[],[],{}).status,'cleared');
  assert.equal(App._computeSundayCashCycle(sunday,[{type:'cash_deposit',date:'2026-10-05',amount:1000,incomeRef:'S1'}],[],[],[],[],{}).status,'deposited');
  assert.equal(App._computeSundayCashCycle(sunday,[],[],[],[],[],{}).status,'pending');
});

// ── Monthly statement / report memo ──
test('statement loans memo: period movements, closing balances, nothing counted before acknowledgement, no names', () => {
  const loans = [
    loan({ id: 'A', amount: 30000, date: '2026-09-20', repayments: [rep({ amount: 10000, date: '2026-10-08' })] }),   // lent in Sept, 10k repaid in Oct
    loan({ id: 'B', direction: 'borrowed', amount: 8000, date: '2026-10-02', repayments: [rep({ amount: 3000, date: '2026-10-20' }), rep({ amount: 500, status: 'pending', date: '2026-10-21' })] }),
    loan({ id: 'C', amount: 5000, date: '2026-10-12' }),                                                                // lent in Oct
    loan({ id: 'D', status: 'pending', amount: 9999, date: '2026-10-03' }),                                              // not counted
    loan({ id: 'E', status: 'reversed', amount: 7777, date: '2026-10-03' }),                                             // not counted
  ];
  const s = App._summarizeLoans(loans, '2026-10-01', '2026-10-31');
  assert.equal(s.lentPeriod, 5000);
  assert.equal(s.borrowedPeriod, 8000);
  assert.equal(s.repaidToUsPeriod, 10000);
  assert.equal(s.repaidByUsPeriod, 3000);
  assert.equal(s.owedToUsEnd, 30000 + 5000 - 10000);
  assert.equal(s.weOweEnd, 8000 - 3000);
  assert.equal(s.anyActivity, true);
  assert.ok(!JSON.stringify(s).includes('Bro Sam'));
  // as of mid-month the later items are not yet there
  const early = App._summarizeLoans(loans, '2026-10-01', '2026-10-10');
  assert.equal(early.owedToUsEnd, 30000 - 10000);
  assert.equal(early.weOweEnd, 8000);
  // nothing at all -> no memo
  assert.equal(App._summarizeLoans([], '2026-10-01', '2026-10-31').anyActivity, false);
  // a settled old loan with nothing left and no activity this month -> no memo
  const old = loan({ status: 'settled', amount: 1000, date: '2026-01-05', repayments: [rep({ amount: 1000, date: '2026-02-01' })] });
  assert.equal(App._summarizeLoans([old], '2026-10-01', '2026-10-31').anyActivity, false);
});

test('all the cash lent out leaves exactly zero, and a tiny float leftover is shown as zero (no "not yet deposited" banner at ₦0)', async () => {
  const exact = await balance({ income: [{ source: 'other_income', date: '2026-10-01', totalCollection: 50000, bankTransferAmount: 0, directPettyCash: 0 }],
    loans: [loan({ amount: 40000 }), loan({ id: 'L2', amount: 10000 })] });
  assert.equal(exact.cashWithAccountant, 0);
  const residue = await balance({ income: [{ source: 'other_income', date: '2026-10-01', totalCollection: 50000.001, bankTransferAmount: 0, directPettyCash: 0 }],
    loans: [loan({ amount: 50000 })] });
  assert.equal(residue.cashWithAccountant, 0);
  const real = await balance({ income: [{ source: 'other_income', date: '2026-10-01', totalCollection: 50000.4, bankTransferAmount: 0, directPettyCash: 0 }],
    loans: [loan({ amount: 50000 })] });
  assert.ok(Math.abs(real.cashWithAccountant - 0.4) < 1e-9);
});
