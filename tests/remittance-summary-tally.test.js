// The Dashboard's Remittance Summary rows must add up to the period's Total Remittance
// Due. They did not: National HQ carried only the headline percentage shares, leaving
// out the Thanksgiving Seed and the four additional levies, which are all remitted to
// National HQ as well.
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

await import(new URL(`../src/js/app.js?rem-summary-test=${Date.now()}`, import.meta.url).href);
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

// August 2026 collections, as shown on the Income by Type card.
const INCOME = {
  membersTithe: 63750, ministersTithe: 11150, thanksgiving: 9100, sundaySchool: 7300,
  slo: 70200, crm: 14900, workersOffering: 3300, childrenOffering: 11050,
};

/** The card's rows, built exactly as renderDashboard builds them. */
function summaryRows(rem, { natlQuotas, regional, mummy }) {
  return {
    nationalHq: rem.totalNatl + rem.totalSeed + rem.crmAddon + rem.coastline
              + rem.insuranceGen + rem.insuranceMin + natlQuotas,
    regional,
    provincial: rem.provinceRebate,
    pastor: rem.totalPastor + rem.totalArea,
    mummy,
    ministers: rem.totalMinisters,
  };
}
const round = n => Math.round(n * 100) / 100;

test('the summary rows add up to Total Remittance Due', async () => {
  const rem = await App._calcRemittances(INCOME, RATES);
  const quotas = { natlQuotas: 5285, regional: 4500, mummy: 7000 };
  const rows = summaryRows(rem, quotas);
  const sum = round(Object.values(rows).reduce((a, b) => a + b, 0));
  const due = round(App._totalRemittanceDue(rem, quotas.natlQuotas + quotas.regional + quotas.mummy));
  assert.equal(sum, due, 'a reader must be able to add the rows and reach the total');
});

test('the old National HQ figure fell short by exactly the seed and the levies', async () => {
  const rem = await App._calcRemittances(INCOME, RATES);
  const natlQuotas = 5285;
  const oldNationalHq = rem.totalNatl + natlQuotas;                 // what the card showed
  const newNationalHq = summaryRows(rem, { natlQuotas, regional: 0, mummy: 0 }).nationalHq;
  const missing = round(rem.totalSeed + rem.crmAddon + rem.coastline + rem.insuranceGen + rem.insuranceMin);
  assert.equal(round(newNationalHq - oldNationalHq), missing);
  assert.ok(missing > 0, 'the levies and seed are real amounts, not zero');
});

test('the rows still tally when a quota is waived for the period', async () => {
  const rem = await App._calcRemittances(INCOME, RATES);
  // Regional Contribution marked "not due this period".
  const quotas = { natlQuotas: 5285, regional: 0, mummy: 7000 };
  const rows = summaryRows(rem, quotas);
  const sum = round(Object.values(rows).reduce((a, b) => a + b, 0));
  const due = round(App._totalRemittanceDue(rem, quotas.natlQuotas + quotas.regional + quotas.mummy));
  assert.equal(sum, due);
  assert.equal(rows.regional, 0);
});

test("the Children's Dept share stays outside the remittance total", async () => {
  const rem = await App._calcRemittances(INCOME, RATES);
  const quotas = { natlQuotas: 0, regional: 0, mummy: 0 };
  const sum = round(Object.values(summaryRows(rem, quotas)).reduce((a, b) => a + b, 0));
  const due = round(App._totalRemittanceDue(rem, 0));
  assert.equal(sum, due);
  assert.ok(rem.childrenDept > 0, 'there is a departmental share in this period');
  assert.ok(!Object.values(summaryRows(rem, quotas)).includes(rem.childrenDept),
    'it is shown separately, never folded into what is owed');
});
