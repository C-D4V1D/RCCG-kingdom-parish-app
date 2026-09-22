// Thanksgiving local retained is a sixth TG split line. Default is 0% so the
// historic 75/5/10/9/1 split is unchanged. When configured, the parish share
// must raise local retained income and must not inflate remittance due.
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

await import(new URL(`../src/js/app.js?tg-local-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;

const BASE = {
  rates: {
    membersTithe: { natl: 0.58, local: 0.42 },
    slo: { natl: 0.30, local: 0.70 },
  },
  tgNational: 0.75, tgArea: 0.05, tgPastor: 0.10, tgMinisters: 0.09, tgSeed: 0.01, tgLocal: 0,
  provinceRebate: 0.20, crmAddon: 0, coastline: 0, insuranceGenTithe: 0, insuranceMinTithe: 0,
};

test('default TG split keeps parish retained at zero and still sums to 100%', async () => {
  const res = await App._calcRemittances({ thanksgiving: 10000 }, BASE);
  const line = res.lines.find(l => l.isTg);
  assert.equal(line.national, 7500);
  assert.equal(line.area, 500);
  assert.equal(line.pastor, 1000);
  assert.equal(line.ministers, 900);
  assert.equal(line.seed, 100);
  assert.equal(line.local, 0);
  assert.equal(res.localBefore, 0);
  const due = App._totalRemittanceDue(res);
  assert.equal(due, 7500 + 500 + 1000 + 900 + 100);
});

test('configured TG local retained increases parish share and is excluded from remittance due', async () => {
  const rates = {
    ...BASE,
    tgNational: 0.70,
    tgArea: 0.05,
    tgPastor: 0.10,
    tgMinisters: 0.09,
    tgSeed: 0.01,
    tgLocal: 0.05,
  };
  const res = await App._calcRemittances({ thanksgiving: 20000 }, rates);
  const line = res.lines.find(l => l.isTg);
  assert.equal(line.national, 14000);
  assert.equal(line.local, 1000);
  assert.equal(res.localBefore, 1000);
  assert.equal(res.localTithe, 0, 'TG local is not tithe and must not enter the province rebate base');
  assert.equal(res.provinceRebate, 0);
  const due = App._totalRemittanceDue(res);
  assert.equal(due, 14000 + 1000 + 2000 + 1800 + 200, 'parish TG share is not remittance due');
  assert.equal(due + line.local, 20000);
});

test('TG local stacks with other local-retained collections and still skips the rebate', async () => {
  const rates = { ...BASE, tgNational: 0.70, tgLocal: 0.05 };
  const res = await App._calcRemittances({ thanksgiving: 10000, slo: 10000 }, rates);
  assert.equal(res.lines.find(l => l.isTg).local, 500);
  assert.equal(res.localBefore, 500 + 7000);
  assert.equal(res.localTithe, 0);
  assert.equal(res.provinceRebate, 0);
});
