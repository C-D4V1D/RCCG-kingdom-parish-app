// Drilling from the Dashboard's Expense Breakdown into the Transactions list.
// The contract that matters: the filtered list adds up to the figure that was clicked.
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

await import(new URL(`../src/js/app.js?tx-category-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;

// Mirrors the June 2026 dashboard in the screenshot that prompted this.
const LEDGER = [
  { id: 'e1', module: 'expenses', kind: 'expense', category: 'rccg_proj',   amount: 137000, date: '2026-06-04', direction: 'debit' },
  { id: 'e2', module: 'expenses', kind: 'expense', category: 'hospitality', amount: 31400,  date: '2026-06-11', direction: 'debit' },
  { id: 'e3', module: 'expenses', kind: 'expense', category: 'power',       amount: 28000,  date: '2026-06-18', direction: 'debit' },
  { id: 'e4', module: 'expenses', kind: 'expense', category: 'security',    amount: 14000,  date: '2026-06-20', direction: 'debit' },
  // The two smallest categories are what the aggregated "Other" slice stands for.
  { id: 'e5', module: 'expenses', kind: 'expense', category: 'bank',        amount: 3050.40,date: '2026-06-22', direction: 'debit' },
  { id: 'e6', module: 'expenses', kind: 'expense', category: 'comms',       amount: 1500,   date: '2026-06-25', direction: 'debit' },
  // Same category, but outside the period the card covers.
  { id: 'e7', module: 'expenses', kind: 'expense', category: 'power',       amount: 99000,  date: '2026-05-18', direction: 'debit' },
  // Income has no category at all and must never be caught by the filter.
  { id: 'i1', module: 'income',   kind: 'income',  amount: 500000, date: '2026-06-07', direction: 'credit' },
];

const FILTER_KEYS = ['txSearch','txTypeFilter','txStatusFilter','txMethodFilter','txModuleFilter',
                     'txCategoryFilter','txFromDate','txToDate','txMinAmount','txMaxAmount',
                     'txSortField','txSortDir'];

/** Apply a clean set of filters, then run the real filter pipeline over the ledger. */
function filterWith(overrides) {
  App._setTxFilterState({
    ...Object.fromEntries(FILTER_KEYS.map(k => [k, ''])),
    txSortField: 'date', txSortDir: 'desc',
    ...overrides,
  });
  return App._applyTxFilters(LEDGER);
}

const sum = rows => Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;

test('a single category drills down to exactly that category within the period', () => {
  const rows = filterWith({ txModuleFilter: 'expenses', txCategoryFilter: 'power',
                            txFromDate: '2026-06-01', txToDate: '2026-06-30' });
  assert.deepEqual(rows.map(r => r.id), ['e3']);
  assert.equal(sum(rows), 28000, 'the list must add up to the figure shown on the card');
});

test('the aggregated "Other" slice drills into every category it stands for', () => {
  const rows = filterWith({ txModuleFilter: 'expenses', txCategoryFilter: 'bank,comms',
                            txFromDate: '2026-06-01', txToDate: '2026-06-30' });
  assert.deepEqual(rows.map(r => r.id).sort(), ['e5', 'e6']);
  assert.equal(sum(rows), 4550.40, 'matches the ₦4,550.40 "Other" row');
});

test('the period is respected — the same category outside it is left out', () => {
  const inJune = filterWith({ txModuleFilter: 'expenses', txCategoryFilter: 'power',
                              txFromDate: '2026-06-01', txToDate: '2026-06-30' });
  const allTime = filterWith({ txModuleFilter: 'expenses', txCategoryFilter: 'power' });
  assert.equal(sum(inJune), 28000);
  assert.equal(sum(allTime), 127000, 'without a period both months are counted');
});

test('income rows are never caught by a category filter', () => {
  const rows = filterWith({ txCategoryFilter: 'power' });
  assert.ok(rows.every(r => r.kind === 'expense'));
  assert.ok(!rows.some(r => r.id === 'i1'));
});

test('no category filter leaves the ledger untouched', () => {
  assert.equal(filterWith({}).length, LEDGER.length);
  assert.equal(filterWith({ txCategoryFilter: '' }).length, LEDGER.length);
});

test('the filter value parses into keys, tolerating spacing and empty entries', () => {
  const cases = [
    ['power', ['power']],
    ['bank,comms', ['bank', 'comms']],
    [' bank , comms ', ['bank', 'comms']],
    ['bank,,', ['bank']],
    ['', []],
  ];
  for (const [value, expected] of cases) {
    App._setTxFilterState({ txCategoryFilter: value });
    assert.deepEqual(App._txCategoryFilterKeys(), expected, `for ${JSON.stringify(value)}`);
  }
});

test('the drill-down clears stale filters before applying the clicked category and period', async () => {
  // Whatever the Transactions page was left showing must not leak into the drill-down.
  App._setTxFilterState({
    txSearch: 'diesel', txTypeFilter: 'income', txStatusFilter: 'pending',
    txMethodFilter: 'cash', txMinAmount: '5000', txMaxAmount: '9000',
    txSortField: 'amount', txSortDir: 'asc', txPage: 4,
  });
  App._setTestUserRole('it_admin');

  // navigate() needs a live DOM; the filter state is set before it runs, which is what
  // this asserts, so a failure there is irrelevant to the contract under test.
  await App.showExpenseCategoryTransactions('bank,comms', '2026-06-01', '2026-06-30').catch(() => {});

  const s = App._txFilterState();
  assert.equal(s.txCategoryFilter, 'bank,comms');
  assert.equal(s.txModuleFilter, 'expenses');
  assert.equal(s.txFromDate, '2026-06-01');
  assert.equal(s.txToDate, '2026-06-30');
  assert.equal(s.txSearch, '', 'a leftover search would silently shrink the list');
  assert.equal(s.txTypeFilter, '', 'a leftover type filter would hide every expense');
  assert.equal(s.txStatusFilter, '');
  assert.equal(s.txMethodFilter, '');
  assert.equal(s.txMinAmount, '');
  assert.equal(s.txMaxAmount, '');
  assert.equal(s.txPage, 1, 'must land on the first page');
  assert.equal(s.txSortField, 'date');
  assert.equal(s.txSortDir, 'desc');
});

test('the drill-down is refused for a role that cannot view transactions', async () => {
  App._setTxFilterState({ txCategoryFilter: '', txModuleFilter: '' });
  App._setTestUserRole('admin_officer');
  const before = App._txFilterState().txCategoryFilter;
  // admin_officer has the 'transactions' permission; a role without it must be blocked.
  App._setTestUserRole('nobody');
  await App.showExpenseCategoryTransactions('power', '2026-06-01', '2026-06-30').catch(() => {});
  assert.equal(App._txFilterState().txCategoryFilter, before, 'no filter state should be applied');
});
