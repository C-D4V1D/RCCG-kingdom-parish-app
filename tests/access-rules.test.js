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

test('ushers and admin assistants can only open the Attendance page', () => {
  const pages = Object.keys(App._ACCESS_RULES.pages);
  for (const role of ['usher', 'admin_assistant']) {
    App._setTestUserRole(role);
    const reachable = pages.filter(p => App._canAccessPage(p));
    assert.deepEqual(reachable, ['attendance'], `${role} should only reach attendance`);
    assert.equal(App._canAction('attendance_record'), true);
    assert.equal(App._canAction('income_record'), false);
    assert.equal(App._canAction('attendance_unlock'), false);
  }
});

test('attendance: accountant and admin officer record, pastor/signatory/viewer only view, IT Admin unlocks', () => {
  for (const role of ['accountant', 'admin_officer', 'it_admin']) {
    App._setTestUserRole(role);
    assert.equal(App._canAction('attendance_record'), true, `${role} records attendance`);
  }
  for (const role of ['pastor', 'signatory', 'viewer']) {
    App._setTestUserRole(role);
    assert.equal(App._canAccessPage('attendance'), true, `${role} can view attendance`);
    assert.equal(App._canAction('attendance_record'), false, `${role} cannot record attendance`);
  }
  for (const role of ['accountant', 'pastor', 'admin_officer']) {
    App._setTestUserRole(role);
    assert.equal(App._canAction('attendance_unlock'), false);
  }
  App._setTestUserRole('it_admin');
  assert.equal(App._canAction('attendance_unlock'), true);
});

test('attendance weeks follow the remittance period: every Mon–Sun week whose Sunday is inside it', () => {
  const weeks = App._attWeeksInPeriod('2026-08-30', '2026-09-27');
  assert.deepEqual(weeks.map(w => w.weekEnd), ['2026-08-30', '2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27']);
  assert.equal(weeks[0].weekStart, '2026-08-24');
  assert.equal(weeks[4].index, 5);
  // Period starting mid-week: the first Sunday on/after the start.
  assert.deepEqual(App._attWeeksInPeriod('2026-09-28', '2026-10-25').map(w => w.weekEnd),
    ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']);
  assert.equal(App._attWeekEnd('2026-09-22'), '2026-09-27');
  assert.equal(App._attWeekEnd('2026-09-27'), '2026-09-27');
});

test('attendance: normalising a week always carries Tue Digging Deep, Thu Faith Clinic, Sunday Service and Sunday School', () => {
  const data = App._attNormalizeWeekData({ services: [{ key: 'sunday_service', men: 2, date: '2020-01-01' }] }, '2026-09-27');
  const byKey = Object.fromEntries(data.services.map(s => [s.key, s]));
  assert.equal(byKey.digging_deep.date, '2026-09-22');
  assert.equal(byKey.faith_clinic.date, '2026-09-24');
  assert.equal(byKey.sunday_service.date, '2026-09-27', 'fixed dates are re-derived from the week');
  assert.equal(byKey.sunday_school.date, '2026-09-27');
  assert.deepEqual(App._attMissingRequired(data), ['Digging Deep', 'Faith Clinic']);
});

test('attendance period report lays weeks out like the paper form and averages Sunday attendance', () => {
  const weeks = App._attWeeksInPeriod('2026-09-14', '2026-09-27').map((w, i) => ({
    ...w,
    record: {
      status: i === 0 ? 'locked' : 'submitted',
      data: { services: [
        { key: 'digging_deep', men: 1, women: 0, children: 4, preacher: 'Bro. Agbu' },
        { key: 'faith_clinic', noService: true, reason: 'Holiday' },
        { key: 'sunday_service', men: 2, women: 4, children: i === 0 ? 7 : 11, firstTimers: 1 },
        { key: 'sunday_school', men: 2, women: 3, children: 6 },
        { key: 'house_fellowship', date: w.weekEnd, men: 3, women: 5, children: 2 },
      ] },
    },
  }));
  const r = App._attPeriodReport(weeks);
  assert.equal(r.complete, true);
  assert.equal(r.rows.length, 12, 'two weeks × Tue..Sun rows');
  assert.deepEqual(r.rows.slice(0, 6).map(x => x.day), ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  const tue = r.rows[0];
  assert.equal(tue.total, 5);
  assert.equal(tue.preacher, 'Bro. Agbu');
  assert.equal(r.rows[2].noService, true);
  const sun = r.rows[5];
  assert.equal(sun.total, 13);
  assert.equal(sun.sundaySchool, 11);
  assert.equal(sun.houseFellowship, 10);
  assert.equal(sun.newGuests, 1);
  assert.equal(r.sundayCount, 2);
  assert.equal(r.sundayTotal, 13 + 17);
  assert.equal(r.average, 15);
  assert.equal(r.firstTimers, 2);
  assert.deepEqual(r.portal[0].by.sunday_school, { men: 2, women: 3, children: 6, total: 11 });
  assert.equal(r.portal[0].by.faith_clinic.total, 0);

  weeks[1].record.status = 'draft';
  assert.equal(App._attPeriodReport(weeks).complete, false);
});

test('further reports (monthly): rows come back in portal order, with first timers/converts auto-filled from the report', () => {
  const report = { firstTimers: 4, newConverts: 2 };
  const data = { births: 1, deaths: 0, marriages: null, fullPastors: 2 };
  const rows = App._attFurtherRows(data, report);

  assert.equal(rows.length, 17, 'all 17 portal-order rows are returned');
  assert.deepEqual(rows.map(r => r.key), App._ATT_FURTHER.map(f => f.key), 'rows follow ATT_FURTHER portal order');

  const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
  assert.equal(byKey.firstTimers.value, 4);
  assert.equal(byKey.firstTimers.auto, true);
  assert.equal(byKey.converts.value, 2);
  assert.equal(byKey.converts.auto, true);
  assert.equal(byKey.births.value, 1);
  assert.equal(byKey.births.auto, false);
  assert.equal(byKey.deaths.value, 0, 'a typed zero is kept as 0, not treated as blank');
  assert.equal(byKey.marriages.value, null, 'an explicit null stays null');
  assert.equal(byKey.baptisedMembers.value, null, 'a field never present in data is null');
  assert.equal(byKey.fullPastors.value, 2);

  // No data recorded yet at all: every typed field is null, auto fields still come from the report.
  const empty = App._attFurtherRows(null, report);
  assert.equal(empty.find(r => r.key === 'births').value, null);
  assert.equal(empty.find(r => r.key === 'firstTimers').value, 4);
});

test('further reports: notEntered counts only the 15 typed fields, ignoring the auto ones', () => {
  assert.equal(App._attFurtherNotEntered(null), 15, 'nothing typed yet: all 15 typed fields are missing');
  assert.equal(
    App._attFurtherNotEntered({ births: 1, deaths: 0, marriages: 2, fullPastors: 1, asstPastors: 1, deacons: 1,
      unordainedMinisters: 1, newWorkers: 1, baptisedWorkers: 1, baptisedMembers: 1 }),
    5, '10 of the 15 typed fields filled in leaves 5 not entered',
  );
});
