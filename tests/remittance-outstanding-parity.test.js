// Regression test for the Statement/Dashboard "still owed to RCCG" disagreement.
//
// The bug: a payment made a few days into the NEXT period (e.g. Part A for the
// previous period, paid after the next period had already opened) got netted
// against the CURRENT period's due when "opening owed" was recalculated as
// "all past income at today's rates minus every payment ever made, floored at
// 0" (buildMonthlyStatementData / generateMonthlyReport's old priorIncome…
// priorPaidRems block). The Dashboard's period-by-period KPI never had this
// problem. calcOutstandingRemittancesAsOf is the single helper both now share.
//
// Fixture mirrors the real case:
//   P1 (previous period) 2026-07-20 .. 2026-08-23 — Part B paid on the period's
//     last day (2026-08-23), Part A paid 2 days into the next period (2026-08-25).
//   P2 (current period)  2026-08-24 .. 2026-09-20 — Sunday income only, no payments.
// Plus a fully written-off period (P0, June 2026) to confirm a write-off is
// treated as settled everywhere, never surfacing as outstanding debt.
import test from 'node:test';
import assert from 'node:assert/strict';

function makeElement() {
  return {
    style: {}, innerHTML: '', textContent: '', value: '', disabled: false, files: [],
    appendChild() {}, insertBefore() {}, remove() {}, addEventListener() {}, setAttribute() {},
    getAttribute() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
}
const documentStub = {
  readyState: 'complete', body: makeElement(),
  getElementById() { return null; }, createElement() { return makeElement(); }, addEventListener() {},
};
globalThis.document = documentStub;
globalThis.window = { document: documentStub, location: { pathname: '/' }, addEventListener() {} };
Object.defineProperty(globalThis, 'localStorage', { value: { getItem() { return null; }, setItem() {}, removeItem() {} }, configurable: true });
Object.defineProperty(globalThis, 'history', { value: { replaceState() {} }, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
globalThis.window.localStorage = globalThis.localStorage;
globalThis.window.history = globalThis.history;
globalThis.window.navigator = globalThis.navigator;

await import(new URL(`../src/js/app.js?rem-outstanding-parity-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;

const RATES = {
  rates: {
    membersTithe: { natl: 0.58, local: 0.42 }, ministersTithe: { natl: 0.62, local: 0.38 },
    sundaySchool: { natl: 1, local: 0 }, slo: { natl: 0.30, local: 0.70 },
    crm: { natl: 0.60, local: 0.40 }, workersOffering: { natl: 0.25, local: 0.75 },
    childrenOffering: { natl: 0.35, local: 0.65 },
  },
  tgNational: 0.75, tgArea: 0.05, tgPastor: 0.10, tgMinisters: 0.09, tgSeed: 0.01,
  provinceRebate: 0.20, crmAddon: 0.25, coastline: 0.01,
  insuranceGenTithe: 0.0125, insuranceMinTithe: 0.0125,
};
const settings = { quotaList: [] };
const quotas = App._getQuotaList(settings); // [] — keeps quota/period-boundary math out of this test

// P0 — a fully written-off period; no other remittance covers it.
const P0_FROM = '2026-06-01', P0_TO = '2026-06-29';
const p0Income = [{ date: '2026-06-07', membersTithe: 10000 }];

// P1 — the previous period. Part B settles on the last day; Part A settles two
// days into P2. Both real income records so the "fresh recalc" path (used
// while P1 is still unsettled) is exercised, not just the payment snapshot.
const P1_FROM = '2026-07-20', P1_TO = '2026-08-23';
const p1Income = [
  { date: '2026-08-10', membersTithe: 50000 },
  { date: '2026-07-27', membersTithe: 100000 },
];

// P2 — the current period. No payments at all.
const P2_FROM = '2026-08-24', P2_TO = '2026-09-20';
const p2Income = [
  { date: '2026-09-13', membersTithe: 40000 },
  { date: '2026-08-30', membersTithe: 80000 },
];

const allIncome = [...p2Income, ...p1Income, ...p0Income]; // newest-first, like the real API

async function p1TrueDue() {
  const rem = await App._calcRemittancesFromRecords(p1Income, RATES);
  return App._totalRemittanceDue(rem, 0);
}
async function p0TrueDue() {
  const rem = await App._calcRemittancesFromRecords(p0Income, RATES);
  return App._totalRemittanceDue(rem, 0);
}
async function p2TrueDue() {
  const rem = await App._calcRemittancesFromRecords(p2Income, RATES);
  return App._totalRemittanceDue(rem, 0);
}

test('written-off period fully offsets its own due — no shortfall, no amount field', async () => {
  const p0Due = await p0TrueDue();
  assert.ok(p0Due > 0, 'sanity: the write-off fixture actually owed something');
  const p0WriteOff = { status: 'written_off', periodFrom: P0_FROM, periodTo: P0_TO, amount: p0Due };
  const result = await App._calcOutstandingRemittancesAsOf('2026-07-01', {
    income: p0Income, remittances: [p0WriteOff], quotas, settings, remRates: RATES,
  });
  assert.equal(result.total, 0);
  assert.equal(result.settledShortfall, 0);
  assert.deepEqual(result.shortfallPeriods, []);
});

test('outstanding as of the previous period close equals the still-unpaid Part A', async () => {
  const p1Due = await p1TrueDue();
  const partBAmount = 40000;
  const partAAmount = p1Due - partBAmount;
  assert.ok(partAAmount > 0, 'sanity: Part B alone must not cover the whole period');

  const remittances = [
    { status: 'paid', part: 'b', periodFrom: P1_FROM, periodTo: P1_TO, paidDate: '2026-08-23', amount: partBAmount, dueAtTimeOfPayment: p1Due },
    { status: 'paid', part: 'a', periodFrom: P1_FROM, periodTo: P1_TO, paidDate: '2026-08-25', amount: partAAmount, dueAtTimeOfPayment: p1Due },
    { status: 'written_off', periodFrom: P0_FROM, periodTo: P0_TO, amount: await p0TrueDue() },
  ];

  const result = await App._calcOutstandingRemittancesAsOf(P1_TO, {
    income: allIncome, remittances, quotas, settings, remRates: RATES,
  });

  // As of the period's last day, Part A has not settled yet (its settle date —
  // paidDate 2026-08-25 — is after this as-of date), so P1 is still "unsettled":
  // the helper recalculates its full due fresh and nets out only the Part B
  // payment that HAS settled by then. This must equal the real, still-unpaid Part A.
  assert.equal(result.total, partAAmount);
});

test('outstanding as of the current period close equals its full due, unaffected by the next-period Part A payment', async () => {
  const p1Due = await p1TrueDue();
  const p2Due = await p2TrueDue();
  const partBAmount = 40000;
  const partAAmount = p1Due - partBAmount;

  const remittances = [
    { status: 'paid', part: 'b', periodFrom: P1_FROM, periodTo: P1_TO, paidDate: '2026-08-23', amount: partBAmount, dueAtTimeOfPayment: p1Due },
    { status: 'paid', part: 'a', periodFrom: P1_FROM, periodTo: P1_TO, paidDate: '2026-08-25', amount: partAAmount, dueAtTimeOfPayment: p1Due },
    { status: 'written_off', periodFrom: P0_FROM, periodTo: P0_TO, amount: await p0TrueDue() },
  ];

  const result = await App._calcOutstandingRemittancesAsOf(P2_TO, {
    income: allIncome, remittances, quotas, settings, remRates: RATES,
  });

  // P1 is now fully settled (both parts paid, snapshot due matches amount paid,
  // so its shortfall is 0) and P0's write-off still nets to 0 — so the only
  // thing left outstanding is P2's own, full, unpaid due. This is the exact
  // regression this fix targets: the old "opening owed" recalculation let the
  // 25 Aug Part A payment wrongly cancel out part of THIS figure.
  assert.equal(result.settledShortfall, 0);
  assert.deepEqual(result.shortfallPeriods, []);
  assert.equal(result.total, p2Due);
  assert.ok(result.total !== partAAmount, 'sanity: this must not collapse to the previous test\'s figure');
});

test('a genuine shortfall on a settled period (paid less than the snapshot due) still surfaces', async () => {
  const p1Due = await p1TrueDue();
  const shortBy = 5000;
  const remittances = [
    { status: 'paid', part: 'b', periodFrom: P1_FROM, periodTo: P1_TO, paidDate: '2026-08-23', amount: 40000, dueAtTimeOfPayment: p1Due },
    { status: 'paid', part: 'a', periodFrom: P1_FROM, periodTo: P1_TO, paidDate: '2026-08-25', amount: p1Due - 40000 - shortBy, dueAtTimeOfPayment: p1Due },
  ];
  const result = await App._calcOutstandingRemittancesAsOf(P2_TO, {
    income: allIncome, remittances, quotas, settings, remRates: RATES,
  });
  assert.equal(result.settledShortfall, shortBy);
  assert.equal(result.shortfallPeriods.length, 1);
  assert.equal(result.shortfallPeriods[0].shortfall, shortBy);
});
