// GET /api/budget-summary: the budget and spent figures the Dashboard shows, for the box's Saturday note.
import test from 'node:test';
import assert from 'node:assert/strict';

const documentStub = { readyState: 'complete', getElementById() { return null; }, createElement() { return {}; }, addEventListener() {}, body: {} };
globalThis.document = documentStub;
globalThis.window = { document: documentStub, location: { pathname: '/' }, addEventListener() {} };
for (const k of ['localStorage', 'history', 'navigator']) {
  Object.defineProperty(globalThis, k, { value: k === 'localStorage' ? { getItem() { return null; }, setItem() {}, removeItem() {} } : {}, configurable: true });
  globalThis.window[k] = globalThis[k];
}
await import(new URL('../src/js/budget-engine.js', import.meta.url).href);
const { onRequest } = await import('../functions/api/[[route]].js');
const { createSqliteD1 } = await import('./sqlite-d1.mjs');
const { FINANCE_AUTH_HEADER, TEST_AUTOMATION_KEY, financeToken } = await import('./finance-auth-helper.mjs');
const engine = globalThis.window.BudgetEngine;

async function setup() {
  const DB = createSqliteD1();
  const call = (path, { method = 'GET', body, headers } = {}) => {
    const init = { method, headers: { ...(headers || {}) } };
    if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    return onRequest({ request: new Request(`https://x/api/${path}`, init), env: { DB }, waitUntil() {} });
  };
  assert.equal((await call('init', { headers: FINANCE_AUTH_HEADER })).status, 200);
  const plans = async p => DB.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('monthlyBudgets',?)`).bind(JSON.stringify(p)).run();
  const exp = (id, o) => DB.prepare(`INSERT INTO expenses (id,date,category,amount,status,created_at) VALUES (?,?,?,?,?,?)`)
    .bind(id, o.date ?? '2026-10-05', o.category ?? 'power', o.amount, o.status ?? 'pending', o.createdAt ?? '2026-10-05T10:00:00Z').run();
  const get = async (q = 'month=2026-10&from=2026-09-25&to=2026-10-24', headers = { 'X-Automation-Key': TEST_AUTOMATION_KEY }) => call(`budget-summary?${q}`, { headers });
  return { DB, call, plans, exp, get };
}
const json = async r => r.json();

test('saved plan: 102,979 with <6 periods -> cushion 10,298, budget 113,277; no-store', async () => {
  const { plans, get } = await setup();
  await plans({ '2026-10': { version: 2, status: 'draft', normalMonthly: 102979, periodTotals: [1, 2] } });
  const r = await get();
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  const d = await json(r);
  assert.deepEqual(d, { monthKey: '2026-10', planSource: 'saved', budgetTotal: 113277, normalMonthly: 102979, cushion: 10298, spent: 0, spentWeek: null });
});

test('spent: rejected out, pending in, remittance-like out, range and boundaries; spentWeek', async () => {
  const { plans, exp, get } = await setup();
  await plans({ '2026-10': { version: 2, normalMonthly: 1000, periodTotals: [] } });
  await exp('a', { amount: 100, date: '2026-09-25' });                    // lower boundary in
  await exp('b', { amount: 200, date: '2026-10-24', status: 'approved' }); // upper boundary in
  await exp('c', { amount: 400, status: 'rejected' });
  await exp('d', { amount: 800, category: 'zonal_area_joint' });
  await exp('e', { amount: 1600, date: '2026-09-24' });
  await exp('f', { amount: 3200, date: '2026-10-25' });
  await exp('g', { amount: 50.4, date: '2026-10-10' });
  await exp('h', { amount: 0, date: '2026-10-10' });
  await exp('i', { amount: 7, date: '', createdAt: '2026-10-12T09:00:00Z' }); // falls back to createdAt
  const d = await json(await get('month=2026-10&from=2026-09-25&to=2026-10-24&weekFrom=2026-10-10&weekTo=2026-10-12'));
  assert.equal(d.spent, 100 + 200 + 50 + 7);
  assert.equal(d.spentWeek, 50 + 7);
});

test('no plan for the month: previous v2 plan is used; otherwise nulls (spent still returned)', async () => {
  const { plans, exp, get } = await setup();
  await exp('a', { amount: 500 });
  await plans({ '2026-09': { version: 2, normalMonthly: 100000, periodTotals: [] } });
  let d = await json(await get());
  assert.equal(d.planSource, 'previous');
  assert.equal(d.normalMonthly, 100000);
  assert.equal(d.budgetTotal, 110000);
  await plans({ '2026-09': { version: 1, normalMonthly: 100000 } });
  d = await json(await get());
  assert.deepEqual([d.planSource, d.budgetTotal, d.normalMonthly, d.cushion, d.spent], ['none', null, null, null, 500]);
});

test('auth: box key and finance roles allowed; ordinary user 403; bad params 400', async () => {
  const { call, get } = await setup();
  assert.equal((await get()).status, 200);
  const q = 'budget-summary?month=2026-10&from=2026-09-25&to=2026-10-24';
  assert.equal((await call(q, { headers: { Authorization: `Bearer ${await financeToken({ role: 'viewer' })}` } })).status, 403);
  assert.equal((await call(q, { headers: { Authorization: `Bearer ${await financeToken({ role: 'usher' })}` } })).status, 403);
  assert.equal((await call(q, { headers: FINANCE_AUTH_HEADER })).status, 200);
  assert.equal((await get('month=2026-10&from=bad&to=2026-10-24')).status, 400);
});

test('route figures equal what the Dashboard code (App.computeAvailableForNewSpending) computes', async () => {
  await import(new URL(`../src/js/app.js?budget-summary=${Date.now()}`, import.meta.url).href);
  const App = globalThis.window.App;
  const { plans, exp, get, call } = await setup();
  const plan = { version: 2, status: 'accepted', monthKey: '2026-10', lines: [{ key: 'power', expenseCategory: 'power', amount: 50000 }],
    normalMonthly: 102979, periodTotals: [90000, 100000, 110000], knownBillsMonthly: 0, expectedIncome: { sunday: 0, other: 0, total: 0 } };
  await plans({ '2026-10': plan });
  await exp('a', { amount: 1234, date: '2026-10-02' });
  await exp('b', { amount: 999, date: '2026-10-03', status: 'rejected' });
  await exp('c', { amount: 5000, date: '2026-10-04', category: 'zonal_area_joint' });
  await exp('d', { amount: 77, date: '2026-10-05', category: 'other' });
  const d = await json(await get());
  const settings = await json(await call('settings', { headers: FINANCE_AUTH_HEADER }));
  const allExpenses = await json(await call('expenses', { headers: FINANCE_AUTH_HEADER }));
  const range = { from: '2026-09-25', to: '2026-10-24' };
  const cfg = App._getBudgetConfig(settings);
  const dash = await App._computeAvailableForNewSpending('2026-10', {
    settings, cfg, allExpenses, allRems: [], plan, range, today: new Date('2026-10-10T12:00:00Z'),
    spendableInfo: { spendable: 0, churchBal: { pettyFloat: 0 } },
    prevPlan: null, pack: { periods: [], knownBills: [] },
  });
  assert.equal(d.budgetTotal, dash.budgetTotal);
  assert.equal(d.spent, dash.budgetSpent);
  assert.equal(d.spent, 1234 + 77);
  assert.equal(d.normalMonthly, dash.normalMonthly);
  assert.equal(d.budgetTotal, d.normalMonthly + Math.round(engine.safetyCushion({ mode: cfg.safetyMode, percent: cfg.safetyPercent, periodTotals: plan.periodTotals, normal: plan.normalMonthly, floorPercent: cfg.cushionFloorPercent, minPeriods: cfg.cushionMinPeriods })));
});
