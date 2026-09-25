// The RCCG portal ("Province Joint Church Planting") computes the province rebate on
// the local share of tithes with the Coastline Worship Centre levy taken out of the
// Ministers' Tithe first: Members' × (100 − natl) + Ministers' × (100 − natl − coastline).
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

await import(new URL(`../src/js/app.js?province-rebate-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;

// Live rates since Sep 2026: tithe 48/47 to National, 10% rebate, 1% coastline.
const LIVE = {
  rates: {
    membersTithe: { natl: 0.48, local: 0.52 },
    ministersTithe: { natl: 0.47, local: 0.53 },
  },
  tgNational: 0.39, tgArea: 0.05, tgPastor: 0.10, tgMinisters: 0.09, tgSeed: 0.01, tgLocal: 0.36,
  provinceRebate: 0.10, crmAddon: 0, coastline: 0.01, insuranceGenTithe: 0.0125, insuranceMinTithe: 0.0125,
};
const r2 = n => Math.round(n * 100) / 100;

test('Sep 2026: rebate matches the portal (16,556.80 on a base of 165,568)', async () => {
  const res = await App._calcRemittances({ membersTithe: 315500, ministersTithe: 2900 }, LIVE);
  assert.equal(r2(res.localTithe), 165568);
  assert.equal(r2(res.provinceRebate), 16556.8);
  assert.equal(r2(res.coastline), 29);
});

test('the coastline share follows the configured rates, not a hard-coded 52%', async () => {
  const noCoast = await App._calcRemittances({ ministersTithe: 10000 }, { ...LIVE, coastline: 0 });
  assert.equal(r2(noCoast.localTithe), 5300);
  const twoPct = await App._calcRemittances({ ministersTithe: 10000 }, { ...LIVE, coastline: 0.02 });
  assert.equal(r2(twoPct.localTithe), 5100);
  const oldRates = await App._calcRemittances({ ministersTithe: 10000 },
    { ...LIVE, rates: { ministersTithe: { natl: 0.62, local: 0.38 } } });
  assert.equal(r2(oldRates.localTithe), 3700);
});

test("Members' Tithe base is unchanged (100% − national)", async () => {
  const res = await App._calcRemittances({ membersTithe: 10000 }, LIVE);
  assert.equal(r2(res.localTithe), 5200);
  assert.equal(r2(res.provinceRebate), 520);
});
