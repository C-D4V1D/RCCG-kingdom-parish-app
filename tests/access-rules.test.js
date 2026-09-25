// Guards the permission map itself. canAction() resolves against ACCESS_RULES.actions
// only, and evaluateAccessRule() denies an undefined rule for EVERY role — IT Admin
// included — so a name that looks plausible but is not declared there silently hides
// the control from everyone, with no error anywhere. That is exactly how the
// "Not due this period" button came to render for nobody: it asked for 'remittances',
// which is a page key, not an action.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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

await import(new URL(`../src/js/app.js?access-rules-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;

test('every action name passed to canAction() is declared in ACCESS_RULES.actions', async () => {
  const source = await readFile(new URL('../src/js/app.js', import.meta.url), 'utf8');
  const declared = new Set(Object.keys(App._ACCESS_RULES.actions));
  const used = new Set(
    [...source.matchAll(/canAction\(\s*'([a-z0-9_]+)'/g)].map(m => m[1]),
  );
  const undeclared = [...used].filter(name => !declared.has(name));
  assert.deepEqual(
    undeclared, [],
    `canAction() is called with ${undeclared.join(', ')}, which ACCESS_RULES.actions does not define. ` +
    'An undefined rule denies every role silently — check whether the name belongs under pages instead.',
  );
  assert.ok(used.size > 5, 'the scan should actually be finding call sites');
});

test('the quota waiver is available to the roles that handle remittances, and no others', () => {
  const allowed = ['it_admin', 'accountant', 'pastor'];
  const denied  = ['admin_officer', 'signatory', 'viewer'];
  for (const role of allowed) {
    App._setTestUserRole(role);
    assert.equal(App._canAction('quota_period_waiver'), true, `${role} should be able to waive a quota period`);
  }
  for (const role of denied) {
    App._setTestUserRole(role);
    assert.equal(App._canAction('quota_period_waiver'), false, `${role} should not be able to waive a quota period`);
  }
});

test('admin_officer, signatory, and viewer can access the budget page when allowed', () => {
  App._setTestUserRole('admin_officer');
  assert.equal(App._canAccessPage('budget'), true);
  App._setTestUserRole('signatory');
  assert.equal(App._canAccessPage('budget'), true);
  App._setTestUserRole('viewer');
  assert.equal(App._canAccessPage('budget'), true, 'viewer inherits budget visibility only through expenses_view');
});

test('only accountant, pastor and it_admin can generate/edit/accept/reopen a budget plan', () => {
  const allowed = ['it_admin', 'accountant', 'pastor'];
  const denied  = ['admin_officer', 'signatory', 'viewer'];
  for (const role of allowed) {
    App._setTestUserRole(role);
    assert.equal(App._canAction('budget_manage'), true, `${role} should have budget_manage`);
  }
  for (const role of denied) {
    App._setTestUserRole(role);
    assert.equal(App._canAction('budget_manage'), false, `${role} should not have budget_manage`);
  }
});

test('an action name that is not declared denies every role, including IT Admin', () => {
  for (const role of ['it_admin', 'accountant', 'viewer']) {
    App._setTestUserRole(role);
    assert.equal(App._canAction('not_a_real_action'), false);
    // 'remittances' is a PAGE key — asking for it as an action is the original mistake.
    assert.equal(App._canAction('remittances'), false);
  }
});

test('petty-cash health uses the Budget float: spending + safety cushion is the target', () => {
  // Budget-derived policy: next-period spending ₦106,200 + cushion ₦10,620.
  const policy = { fromBudget: true, spending: 106200, cushion: 10620, target: 116820, manageable: 60000, minimum: 40000 };
  const float = 20000;
  assert.equal(App._pettyHealth(185560, float, policy).label, 'Healthy');   // can hold spending + full cushion
  assert.equal(App._pettyHealth(110000, float, policy).label, 'Adequate');  // spending covered, cushion only partly
  assert.equal(App._pettyHealth(80000, float, policy).label, 'Caution');    // below spending, above manageable
  assert.equal(App._pettyHealth(50000, float, policy).label, 'Tight');
  assert.equal(App._pettyHealth(30000, float, policy).label, 'Critical');
  assert.equal(App._pettyHealth(185560, float, policy).afterTarget, 185560 - 116820);
});

test('petty-cash health falls back to the manual target + buffer before a Budget plan exists', () => {
  const policy = { fromBudget: false, spending: 90000, cushion: 30000, target: 120000, manageable: 60000, minimum: 40000 };
  assert.equal(App._pettyHealth(125000, 20000, policy).label, 'Healthy');  // same as the old rule: after target ≥ buffer
  assert.equal(App._pettyHealth(100000, 20000, policy).label, 'Adequate');
});
