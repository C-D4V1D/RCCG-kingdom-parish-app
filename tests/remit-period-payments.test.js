import test from 'node:test';
import assert from 'node:assert/strict';
const mk = () => ({ style:{}, innerHTML:'', textContent:'', value:'', files:[], appendChild(){}, insertBefore(){}, remove(){}, addEventListener(){}, setAttribute(){}, getAttribute(){return null;}, querySelector(){return null;}, querySelectorAll(){return [];}, closest(){return null;}, classList:{add(){},remove(){},toggle(){},contains(){return false;}} });
const doc = { readyState:'complete', body: mk(), getElementById(){return null;}, createElement(){return mk();}, addEventListener(){} };
const ls = { getItem(){return null;}, setItem(){}, removeItem(){} };
globalThis.document = doc;
globalThis.window = { document: doc, location:{pathname:'/'}, addEventListener(){} };
Object.defineProperty(globalThis,'localStorage',{value:ls,configurable:true});
Object.defineProperty(globalThis,'history',{value:{replaceState(){}},configurable:true});
Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
globalThis.window.localStorage = ls; globalThis.window.history = globalThis.history; globalThis.window.navigator = globalThis.navigator;
await import(new URL(`../src/js/app.js?remit-period-payments=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;

// Fake data. David's case: Part B paid on 18 Oct for 21 Sep - 18 Oct, then the October cut-off moved to 21 Oct.
const partB = { id: 'p1', status: 'paid', part: 'b', amount: 9616, periodFrom: '2026-09-21', periodTo: '2026-10-18', paymentMethod: 'cash' };
const partA = { id: 'p2', status: 'paid', part: 'a', amount: 70000, periodFrom: '2026-09-21', periodTo: '2026-10-18', dueAtTimeOfPayment: 70000 };

test('same dates: the payment matches (unchanged behaviour)', () => {
  assert.deepEqual(App._remitPeriodPayments([partB, partA], '2026-09-21', '2026-10-18').map(r => r.id), ['p1', 'p2']);
});
test('cut-off moved from 18 Oct to 21 Oct: payments made for that month stay matched', () => {
  assert.deepEqual(App._remitPeriodPayments([partB, partA], '2026-09-21', '2026-10-21').map(r => r.id), ['p1', 'p2']);
});
test('cut-off moved earlier (21 Oct -> 18 Oct) and start moved: still the same month, overlapping -> matched', () => {
  const r = { ...partB, periodFrom: '2026-09-22', periodTo: '2026-10-21' };
  assert.deepEqual(App._remitPeriodPayments([r], '2026-09-21', '2026-10-18').map(x => x.id), ['p1']);
});
test('another month\'s payment is NOT matched; unpaid / written-off / undated records are NOT matched', () => {
  const sep = { ...partB, id: 's', periodFrom: '2026-08-21', periodTo: '2026-09-20' };
  const nov = { ...partB, id: 'n', periodFrom: '2026-10-22', periodTo: '2026-11-20' };
  const pending = { ...partB, id: 'x', status: 'pending' };
  const wo = { ...partB, id: 'w', status: 'written_off' };
  const undated = { ...partB, id: 'u', periodFrom: '', periodTo: '' };
  assert.deepEqual(App._remitPeriodPayments([sep, nov, pending, wo, undated], '2026-09-21', '2026-10-21'), []);
});
test('the previous month\'s payment that only overlaps by a couple of days is NOT matched (month of its end date decides)', () => {
  const aug = { ...partB, id: 'a', periodFrom: '2026-08-22', periodTo: '2026-09-22' };
  assert.deepEqual(App._remitPeriodPayments([aug], '2026-09-21', '2026-10-21'), []);
});
