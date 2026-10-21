// The RCCG portal itemises the national Members' Tithe share as
// General Tithe 40% + Province DRDA 4% + Province Foreign Mission 4% (= the old 48%).
// The app carves the same two 4% lines out of the national share so app and portal align.
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

await import(new URL(`../src/js/app.js?drda-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;

// Live Oct 2026 settings (settings.remittanceRates) with the new carve rates.
const LIVE = {
  rates: {
    membersTithe: { natl: 0.48, local: 0.52 },
    ministersTithe: { natl: 0.47, local: 0.53 },
  },
  tgNational: 0.39, tgArea: 0.05, tgPastor: 0.10, tgMinisters: 0.09, tgSeed: 0.01, tgLocal: 0.36,
  provinceRebate: 0.10, crmAddon: 0, coastline: 0.01, insuranceGenTithe: 0.0125, insuranceMinTithe: 0.0125,
  drda: 0.04, foreignMission: 0.04,
};
const r2 = n => Math.round(n * 100) / 100;

test('Oct 2026: national tithe splits 40% + 4% DRDA + 4% Foreign Mission like the portal', async () => {
  const res = await App._calcRemittances({ membersTithe: 43500, ministersTithe: 700 }, LIVE);
  const tithe = res.lines.find(l => l.key === 'membersTithe');
  assert.equal(r2(tithe.national), 17400);       // portal "General Tithe" 40% of 43,500
  assert.equal(r2(res.drda), 1740);              // portal "Province Drda" 4%
  assert.equal(r2(res.foreignMission), 1740);    // portal "Province Foriegn Mission" 4%
  assert.equal(r2(tithe.national + res.drda + res.foreignMission), 20880); // = old 48%
});

test('parish totals are unchanged by the carve', async () => {
  const withCarve = await App._calcRemittances({ membersTithe: 43500, ministersTithe: 700 }, LIVE);
  const noCarveRates = { ...LIVE, drda: 0, foreignMission: 0 };
  const noCarve = await App._calcRemittances({ membersTithe: 43500, ministersTithe: 700 }, noCarveRates);
  assert.equal(r2(withCarve.totalNatl), r2(noCarve.totalNatl));
  assert.equal(r2(withCarve.netLocal), r2(noCarve.netLocal));
  assert.equal(r2(withCarve.provinceRebate), r2(noCarve.provinceRebate));
  assert.equal(r2(withCarve.localTithe), r2(noCarve.localTithe));
});

test('Oct 2026 full month: rebate and levies still match the portal lines', async () => {
  const res = await App._calcRemittances({ membersTithe: 43500, ministersTithe: 700 }, LIVE);
  assert.equal(r2(res.provinceRebate), 2298.4);  // 10% of local retained tithes (unchanged)
  assert.equal(r2(res.coastline), 7);
  assert.equal(r2(res.insuranceGen), 543.75);
  assert.equal(r2(res.insuranceMin), 8.75);
});

test('a rates object without the carve keys leaves the old single 48% line (defaults come from getRemRates)', async () => {
  const res = await App._calcRemittances({ membersTithe: 43500 }, {
    rates: { membersTithe: { natl: 0.48, local: 0.52 } },
  });
  const tithe = res.lines.find(l => l.key === 'membersTithe');
  assert.equal(r2(tithe.national), 20880);
  assert.equal(r2(res.drda), 0);
  assert.equal(r2(res.foreignMission), 0);
});
