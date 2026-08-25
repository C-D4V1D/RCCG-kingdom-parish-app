// The Teen/Children's Offering local share is handed to the Children Teacher. The parish
// never holds it, never banks it and never records what it is spent on, so counting it as
// retained income overstated what the parish has to spend — enough to show a surplus while
// the parish was actually in deficit.
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

await import(new URL(`../src/js/app.js?children-dept-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;

const RATES = {
  rates: {
    membersTithe: { natl: 0.58, local: 0.42 },
    childrenOffering: { natl: 0.35, local: 0.65 },
    slo: { natl: 0.30, local: 0.70 },
  },
  tgNational: 0.75, tgArea: 0.05, tgPastor: 0.10, tgMinisters: 0.09, tgSeed: 0.01,
  provinceRebate: 0.20, crmAddon: 0, coastline: 0, insuranceGenTithe: 0, insuranceMinTithe: 0,
};

test("the Children's share is tracked as a department disbursement, not retained income", async () => {
  const res = await App._calcRemittances({ childrenOffering: 11050 }, RATES);
  const line = res.lines.find(l => l.key === 'childrenOffering');

  assert.equal(line.national, 11050 * 0.35, 'the 35% HQ share is unchanged');
  assert.equal(line.local, 0, 'none of it is parish-retained');
  assert.equal(line.childrensDept, 11050 * 0.65, 'the 65% is the departmental share');
  assert.equal(res.childrenDept, 11050 * 0.65);
  assert.equal(res.localBefore, 0, "the department's money never enters local retained");
  assert.equal(res.netLocal, 0);
});

test('a collection that used to show a surplus now reports the truth', async () => {
  // ₦11,050 Teen/Children's Offering alongside ordinary collections.
  const income = { membersTithe: 63750, slo: 20000, childrenOffering: 11050 };
  const res = await App._calcRemittances(income, RATES);

  const childrenShare = 11050 * 0.65;                    // 7,182.50 to the teacher
  const expectedLocal = 63750 * 0.42 + 20000 * 0.70;     // tithe + SLO local
  const rebate = 63750 * 0.42 * 0.20;

  assert.equal(res.childrenDept, childrenShare);
  assert.equal(res.localBefore, expectedLocal);
  assert.equal(round(res.netLocal), round(expectedLocal - rebate));

  // With expenses just under what the old figure showed, the surplus was illusory.
  const expenses = res.netLocal + childrenShare - 1000;  // old maths: ₦1,000 "surplus"
  const oldNetLocal = res.netLocal + childrenShare;      // what the figure used to be
  assert.equal(round(oldNetLocal - expenses), 1000, 'the old calculation showed a surplus');
  assert.ok(res.netLocal - expenses < 0, 'the corrected figure shows the real deficit');
});

test('every other collection type still retains its local share', async () => {
  const res = await App._calcRemittances({ membersTithe: 10000, slo: 10000 }, RATES);
  assert.equal(res.childrenDept, 0);
  assert.equal(res.localBefore, 4200 + 7000);
  for (const l of res.lines) assert.equal(l.childrensDept, undefined, `${l.key} is not a department share`);
});

test("the department's share is never counted as a remittance owed", async () => {
  const res = await App._calcRemittances({ childrenOffering: 11050 }, RATES);
  // Only the 35% is owed to HQ — the 65% is already with the teacher, so nothing is due
  // on it and no payment will ever be recorded against it.
  assert.equal(App._totalRemittanceDue(res), 11050 * 0.35);
});

test('the period still reconciles: collected = remitted + department + retained', async () => {
  const income = { membersTithe: 63750, thanksgiving: 9100, childrenOffering: 11050, slo: 20000 };
  const res = await App._calcRemittances(income, RATES);
  const collected = Object.values(income).reduce((a, b) => a + b, 0);
  const distributed = res.totalArea + res.totalPastor + res.totalMinisters;
  const accounted = App._totalRemittanceDue(res) + res.childrenDept + res.netLocal;
  // totalRemittanceDue already includes the TG local distributions and the rebate.
  assert.equal(round(accounted), round(collected), `collected ${collected} must be fully accounted for`);
  assert.ok(distributed > 0, 'TG distributions are part of what is due');
});

function round(n) { return Math.round(n * 100) / 100; }
