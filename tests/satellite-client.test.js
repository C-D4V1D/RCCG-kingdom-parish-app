// Satellite parish pastors: the browser sends every call except sign-in / change-PIN to
// /api/sat/…, keeps their cached data apart from Kingdom's, sees only two pages, and the
// Sunday-records helpers mirror the Kingdom rules the server enforces.
import test from 'node:test';
import assert from 'node:assert/strict';

function makeElement() {
  return {
    style: {}, innerHTML: '', textContent: '', value: '', disabled: false, files: [], id: '', className: '',
    appendChild() {}, insertBefore() {}, remove() {}, addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }, focus() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
}
const documentStub = {
  readyState: 'complete', body: makeElement(),
  getElementById() { return null; }, createElement: makeElement, addEventListener() {}, querySelector() { return null; },
};
globalThis.document = documentStub;
globalThis.window = { document: documentStub, location: { pathname: '/' }, addEventListener() {} };
Object.defineProperty(globalThis, 'localStorage', { value: { getItem() { return null; }, setItem() {}, removeItem() {} }, configurable: true });
Object.defineProperty(globalThis, 'history', { value: { replaceState() {} }, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });

await import(new URL(`../src/js/app.js?satellite-client-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET' });
    return new Response(JSON.stringify(handler(String(url))), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const satUser = () => App._setTestUser({ id: 'u9', name: 'Pastor Sat', role: 'satellite', token: 't' });
const kingdomUser = () => App._setTestUser({ id: 'u3', name: 'Accountant', role: 'accountant', token: 't' });

test('a satellite user\'s calls go to /api/sat/…, except auth and change-pin', async () => {
  satUser();
  const calls = mockFetch(() => ({}));
  await App._apiFetch('attendance?from=2026-09-01&to=2026-10-01');
  await App._apiFetch('income', 'POST', { date: '2026-10-04' });
  await App._apiFetch('attendance-further/2026-10-25', 'PUT', {});
  await App._apiFetch('auth/options');
  await App._apiFetch('change-pin', 'POST', {});
  assert.deepEqual(calls.map(c => c.url), [
    '/api/sat/attendance?from=2026-09-01&to=2026-10-01',
    '/api/sat/income',
    '/api/sat/attendance-further/2026-10-25',
    '/api/auth/options',
    '/api/change-pin',
  ]);
});

test('Kingdom users are never prefixed', async () => {
  kingdomUser();
  const calls = mockFetch(() => ({}));
  await App._apiFetch('attendance?from=a&to=b');
  await App._apiFetch('income');
  assert.deepEqual(calls.map(c => c.url), ['/api/attendance?from=a&to=b', '/api/income']);
});

test('cached reads never mix satellite and Kingdom data', async () => {
  satUser();
  mockFetch(() => ({ churchName: 'Sanctuary of Favour Parish' }));
  const sat = await App._apiFetch('settings');
  assert.equal(sat.churchName, 'Sanctuary of Favour Parish');
  kingdomUser();
  const calls = mockFetch(() => ({ churchName: 'Kingdom' }));
  const kingdom = await App._apiFetch('settings');
  assert.equal(kingdom.churchName, 'Kingdom');   // not the satellite's cached copy
  assert.equal(calls[0].url, '/api/settings');
  satUser();
  const again = mockFetch(() => ({ churchName: 'changed' }));
  assert.equal((await App._apiFetch('settings')).churchName, 'Sanctuary of Favour Parish');   // still cached, under its own key
  assert.equal(again.length, 0);
});

test('a satellite pastor can open Sunday records and Attendance only', () => {
  satUser();
  const pages = Object.keys(App._ACCESS_RULES.pages);
  assert.deepEqual(pages.filter(p => App._canAccessPage(p)).sort(), ['attendance', 'sunday_records']);
  assert.equal(App._canAction('attendance_record'), true);
  assert.equal(App._canAction('income_record'), false);
  assert.equal(App._canAction('attendance_unlock'), false);
  kingdomUser();
  assert.equal(App._canAccessPage('sunday_records'), false);
});

test('Sunday row hints follow the attendance and cut-off rules', () => {
  const sundays = [
    { date: '2026-09-27', rec: { id: 1 }, isCutoff: false },
    { date: '2026-10-04', rec: null, isCutoff: false },
    { date: '2026-10-11', rec: null, isCutoff: true },
  ];
  const att = { '2026-10-04': { status: 'submitted' }, '2026-10-11': { status: 'submitted' } };
  const st = (i, a = att, further = { current: { furtherSubmittedAt: 'x' } }) => App._satRowState(sundays[i], sundays, a, further);
  assert.equal(st(0), 'saved');
  assert.equal(st(1), 'open');
  assert.equal(st(1, {}), 'att');
  assert.equal(st(1, { '2026-10-04': { status: 'draft' } }), 'att');
  assert.equal(st(1, { '2026-10-04': { status: 'locked' } }), 'open');
  assert.equal(st(2), 'cutoff');                                   // 4 Oct not saved yet
  sundays[1].rec = { id: 2 };
  assert.equal(st(2), 'open');
  assert.equal(st(2, att, { current: { furtherSubmittedAt: '' } }), 'cutoff');   // no Monthly report
  assert.equal(st(2, att, null), 'cutoff');
});

test('remit total uses the same lines as the Remittances page', async () => {
  kingdomUser();
  mockFetch(() => ({}));   // settings without rates -> defaults
  const rem = await App._calcRemittances({ membersTithe: 1000 });
  // 58% national + 20% province rebate on the 42% local share (84) + 1.25% insurance (12.5)
  assert.equal(Math.round(App._satRemitTotal(rem) * 100) / 100, 676.5);
});
