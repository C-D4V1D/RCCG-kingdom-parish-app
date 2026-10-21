import test from 'node:test';
import assert from 'node:assert/strict';

// Regression test for the print report divergence pinned 2026-10-21: the DRDA /
// Foreign Mission carve is subtracted from the Members' Tithe national share in
// calcRemittances, so Part A of printRemittanceReport must list both carve rows
// explicitly and the To-HQ total must include them - otherwise Part A, the To-HQ
// total and the closing balance all come up short by exactly the carve
// (Oct 2026: N3,480).

const mk = () => ({ style:{}, innerHTML:'', textContent:'', value:'', files:[], appendChild(){}, insertBefore(){}, remove(){}, addEventListener(){}, setAttribute(){}, getAttribute(){return null;}, querySelector(){return null;}, querySelectorAll(){return [];}, closest(){return null;}, classList:{add(){},remove(){},toggle(){},contains(){return false;}} });
const doc = { readyState:'complete', body: mk(), getElementById(){return null;}, createElement(){return mk();}, addEventListener(){}, activeElement:null };
const ls = { getItem(){return null;}, setItem(){}, removeItem(){} };
globalThis.document = doc;
globalThis.window = { document: doc, location:{pathname:'/', origin:'http://test'}, addEventListener(){} };
Object.defineProperty(globalThis,'localStorage',{value:ls,configurable:true});
Object.defineProperty(globalThis,'history',{value:{replaceState(){}},configurable:true});
Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
globalThis.window.localStorage = ls; globalThis.window.history = globalThis.history; globalThis.window.navigator = globalThis.navigator;

// Fake data. One members' tithe record of 25,000 in October 2026; natl/local
// split 48/52, DRDA 4% and Foreign Mission 4% carved out of the national share,
// every other rate zeroed so the expected figures are exact:
//   Members' Tithe -> National HQ: 25,000 x (0.48 - 0.08) = 10,000
//   DRDA 1,000 + Foreign Mission 1,000 (4% each of the full 25,000)
//   Sub-Total A / To-HQ: 12,000   Net Local Retained: 13,000
const income = [ { id:'i1', date:'2026-10-10T12:00:00', membersTithe: 25000 } ];
const settings = {
  quotaList: [],
  remittanceRates: {
    membersTithe: { natl: 0.48, local: 0.52 },
    tgNational:0, tgArea:0, tgPastor:0, tgMinisters:0, tgSeed:0, tgLocal:0,
    provinceRebate:0, crmAddon:0, coastline:0, insuranceGenTithe:0, insuranceMinTithe:0,
    drda: 0.04, foreignMission: 0.04
  }
};
globalThis.fetch = async (url) => {
  const u = String(url);
  const data = u.includes('income') ? income : u.includes('users') ? [] : u.includes('settings') ? settings : [];
  return { ok:true, status:200, json: async()=>data, text: async()=>JSON.stringify(data), headers:{ get(){ return null; } } };
};

let printed = '';
globalThis.window.open = () => ({ document:{ write(h){ printed = h; }, close(){} }, focus(){} });

async function loadApp(tag){
  await import(new URL(`../src/js/app.js?print-report-drda-${tag}=${Date.now()}`, import.meta.url).href);
  return globalThis.window.App;
}

test('carve > 0: Part A lists the DRDA and Foreign Mission rows and every total includes the carve', async () => {
  printed = '';
  const App = await loadApp('carve');
  await App.printRemittanceReport('2026-10-01', '2026-10-31');
  assert.ok(printed.length > 0, 'report rendered');
  assert.match(printed, /Members' Tithe → National HQ<\/td><td class="td-c">40% Based<\/td><td class="td-r">₦10,000<\/td>/, 'Members Tithe national share keeps the carve subtracted (10,000)');
  assert.match(printed, /Province DRDA → National HQ \(4% of Members' Tithe\)<\/td><td class="td-c">4% Based<\/td><td class="td-r">₦1,000<\/td>/, 'Part A has the DRDA row');
  assert.match(printed, /Province Foreign Mission → National HQ \(4% of Members' Tithe\)<\/td><td class="td-c">4% Based<\/td><td class="td-r">₦1,000<\/td>/, 'Part A has the Foreign Mission row');
  assert.match(printed, /Sub-Total \(A\)[^<]*<\/td><td class="td-r danger">₦12,000<\/td>/, 'Sub-Total A includes the carve (12,000, not the pre-fix 10,000)');
  assert.ok(!/₦10,000<\/td><\/tr><tr class="subtotal-row/.test(printed), 'no pre-fix subtotal');
  // Balance identity closes: 25,000 collected = 12,000 due + 13,000 net local.
  assert.match(printed, /Balance: ₦25,000 Total Collected = ₦12,000 Remittances Due \+ ₦13,000 Net Local Retained/, 'balance row identity holds');
});

test('carve = 0: no DRDA / Foreign Mission rows (gated on amount > 0)', async () => {
  printed = '';
  settings.remittanceRates.drda = 0;
  settings.remittanceRates.foreignMission = 0;
  const App = await loadApp('nocarve');
  await App.printRemittanceReport('2026-10-01', '2026-10-31');
  assert.ok(printed.length > 0, 'report rendered');
  assert.ok(!/Province DRDA/.test(printed), 'no DRDA row when the rate is zero');
  assert.ok(!/Province Foreign Mission/.test(printed), 'no Foreign Mission row when the rate is zero');
  assert.match(printed, /Members' Tithe → National HQ<\/td><td class="td-c">48% Based<\/td><td class="td-r">₦12,000<\/td>/, 'full national share when nothing is carved');
  assert.match(printed, /Balance: ₦25,000 Total Collected = ₦12,000 Remittances Due \+ ₦13,000 Net Local Retained/, 'balance row identity still holds');
});
