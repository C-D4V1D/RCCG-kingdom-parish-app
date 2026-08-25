// Top Up Petty Cash can be entered either way round: the amount being added, or the
// balance the Admin Officer should be left holding. The parish usually decides the
// latter, and should not have to do the subtraction — least of all when the float is
// negative and he is owed his own money back.
import test from 'node:test';
import assert from 'node:assert/strict';

// A DOM stub with real element identity, so the handlers can read and write fields.
const fields = new Map();
function makeElement(id) {
  return {
    id, style: {}, innerHTML: '', textContent: '', value: '', disabled: false, files: [],
    appendChild() {}, insertBefore() {}, remove() {}, addEventListener() {}, setAttribute() {},
    getAttribute() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
}
let checkedMode = 'amount';
const documentStub = {
  readyState: 'complete', body: makeElement('body'),
  getElementById(id) { return fields.get(id) || null; },
  createElement() { return makeElement('new'); },
  querySelector(sel) {
    if (sel === 'input[name="ref_entry_mode"]:checked') return { value: checkedMode };
    return null;
  },
  addEventListener() {},
};
globalThis.document = documentStub;
globalThis.window = { document: documentStub, location: { pathname: '/' }, addEventListener() {} };
Object.defineProperty(globalThis, 'localStorage', { value: { getItem() { return null; }, setItem() {}, removeItem() {} }, configurable: true });
Object.defineProperty(globalThis, 'history', { value: { replaceState() {} }, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
globalThis.window.localStorage = globalThis.localStorage;
globalThis.window.history = globalThis.history;
globalThis.window.navigator = globalThis.navigator;

await import(new URL(`../src/js/app.js?petty-topup-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;

/** Set up the modal fields for a given float and approved maximum. */
function openModal({ float, max }) {
  fields.clear();
  for (const id of ['ref_current_float','ref_max_float','ref_target','ref_amt',
                    'ref_target_group','ref_amt_label','ref_amt_hint','ref_target_hint','ref_amt_resulting']) {
    fields.set(id, makeElement(id));
  }
  fields.get('ref_current_float').value = String(float);
  fields.get('ref_max_float').value = String(max);
}
const amt    = () => fields.get('ref_amt').value;
const hint   = () => fields.get('ref_target_hint').textContent;
const result = () => fields.get('ref_amt_resulting').innerHTML;

test('entering the target balance works out the top-up needed', () => {
  openModal({ float: 5850, max: 100000 });          // the wallet in the screenshot
  checkedMode = 'target';
  App.onRefillEntryModeChange();
  fields.get('ref_target').value = '100000';
  App.onRefillTargetChange();

  assert.equal(amt(), 94150, 'to reach ₦100,000 from ₦5,850');
  assert.match(hint(), /5,850/);
  assert.match(hint(), /94,150/);
  assert.match(result(), /100,000/);
});

test('a negative float is covered first — he gets his own money back on top', () => {
  openModal({ float: -4000, max: 100000 });
  checkedMode = 'target';
  App.onRefillEntryModeChange();
  fields.get('ref_target').value = '50000';
  App.onRefillTargetChange();

  assert.equal(amt(), 54000, 'clears the ₦4,000 owed and leaves ₦50,000');
  assert.match(result(), /50,000/);
});

test('a target at or below the current balance asks for nothing', () => {
  openModal({ float: 80000, max: 100000 });
  checkedMode = 'target';
  App.onRefillEntryModeChange();

  fields.get('ref_target').value = '80000';
  App.onRefillTargetChange();
  assert.equal(amt(), 0);
  assert.match(hint(), /already holds exactly/);

  fields.get('ref_target').value = '60000';
  App.onRefillTargetChange();
  assert.equal(amt(), 0, 'never proposes a negative top-up');
  assert.match(hint(), /more than/);
});

test('a target above the approved maximum is flagged, not silently accepted', () => {
  openModal({ float: 5850, max: 100000 });
  checkedMode = 'target';
  App.onRefillEntryModeChange();
  fields.get('ref_target').value = '120000';
  App.onRefillTargetChange();

  assert.equal(amt(), 114150);
  assert.match(result(), /over the approved maximum/);
  assert.match(result(), /100,000/);
});

test('the amount stays editable in target mode — the figure is a starting point', () => {
  openModal({ float: 5850, max: 100000 });
  checkedMode = 'target';
  App.onRefillEntryModeChange();
  fields.get('ref_target').value = '100000';
  App.onRefillTargetChange();
  assert.equal(amt(), 94150);

  // The accountant rounds down to what they can actually hand over.
  fields.get('ref_amt').value = '90000';
  App.onRefillAmountChange();
  assert.match(result(), /95,850/, 'the resulting balance follows the edited amount');
});

test('amount mode hides the target field and reports the resulting balance', () => {
  openModal({ float: 5850, max: 100000 });
  checkedMode = 'amount';
  App.onRefillEntryModeChange();
  assert.equal(fields.get('ref_target_group').style.display, 'none');

  fields.get('ref_amt').value = '66650';
  App.onRefillAmountChange();
  assert.match(result(), /72,500/);
});

test('an empty or non-numeric target neither guesses nor throws', () => {
  openModal({ float: 5850, max: 100000 });
  checkedMode = 'target';
  App.onRefillEntryModeChange();
  fields.get('ref_target').value = '';
  App.onRefillTargetChange();
  assert.match(hint(), /Enter the balance/);
});
