import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import BudgetEngine, {
  monthKey,
  packHistory,
  classifyCadence,
  parishIncomeFromRemittance,
  noteFingerprint,
  groupExpensesByNote,
  suggestSubsForCategory,
  matchActuals,
  safeToSpend,
  coercePlan,
  robustMonthlySeries,
  suggestCategoryAmount,
  applyAffordability,
  budgetStatus,
  computeAffordVerdict,
  estimateTypicalBudget,
  rollingAfford,
  isRemittanceExpenseLike,
  isCountableExpense,
  clampAiLines,
  suggestCuts,
  irregularReserve,
  futureShortfall,
  safetyCushion,
  freeForNewThings,
  growthPerMonth,
  affordAnswer,
  monthProgress,
  RCCG_DEMANDS_KEY,
  PROTECTED_FROM_CUTS,
  isOneOffItem,
  categoryAverages,
  expectedIncome,
  knownBillSchedule,
  suggestKnownBills,
  carryForwardPot,
  robustSpread,
  runwayMonths,
  planStatus,
  planDueDate,
  planReady,
  ONE_OFF_MIN,
} from '../src/js/budget-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const liveFixture = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/budget-live-2026.json'), 'utf8'));
const livePeriods = liveFixture.periods;
const liveRentItem = livePeriods.flatMap(p => p.items).find(item => /annual land or building rent/i.test(item.subcategory || ''));

test('monthKey formats calendar months', () => {
  assert.equal(monthKey('2026-10-03'), '2026-10');
  assert.equal(monthKey('2026-09-23'), '2026-09');
  assert.equal(BudgetEngine.nextMonthKey('2026-12'), '2027-01');
});

test('a single active month with no property context is an annual set-aside, not a one-off', () => {
  // Contract 0.5/0.13: keyword-based "once" guessing from notes is gone. A single active
  // month is only ever 'once' when categoryKey is 'property' and the note/subCategory is a
  // clear single project (0.13). Otherwise it becomes 'annual' so the cost still gets budgeted.
  assert.equal(classifyCadence([{ amount: 0 }, { amount: 0 }, { amount: 180000, notes: 'Emergency roof repair' }, { amount: 0 }, { amount: 0 }, { amount: 0 }]), 'annual');
  assert.equal(classifyCadence([12000, 11000, 13000, 12500, 14000, 12000]), 'usual');
});

test('classifyCadence only marks "once" for property with a clear single-project subCategory', () => {
  const propertySeries = Array.from({ length: 12 }, () => ({ amount: 0 }));
  propertySeries[6] = { amount: 900000, notes: 'Building construction and renovations' };
  assert.equal(classifyCadence(propertySeries, { categoryKey: 'property' }), 'once');
  // The same shape without categoryKey: 'property' must NOT be treated as once.
  assert.equal(classifyCadence(propertySeries), 'annual');
  // A welfare "funeral" note must never trigger once (0.5) — even under categoryKey 'welfare'.
  const welfareSeries = Array.from({ length: 12 }, () => ({ amount: 0 }));
  welfareSeries[2] = { amount: 80000, notes: 'Burial support - funeral' };
  welfareSeries[6] = { amount: 100000, notes: 'Hospital bill' };
  assert.equal(classifyCadence(welfareSeries, { categoryKey: 'welfare' }), 'annual');
});

test('remittance is peeled off parish income like COGS', () => {
  const rem = {
    totalNatl: 50000, totalArea: 2000, totalPastor: 4000,
    totalMinisters: 3000, totalSeed: 500, provinceRebate: 1500,
    crmAddon: 0, coastline: 0, insuranceGen: 0, insuranceMin: 0,
  };
  const r = parishIncomeFromRemittance(rem, 200000, 6500);
  assert.equal(r.remittance, 61000);
  assert.equal(r.parishIncome, 200000 - 61000 - 6500);
});

test('children dept cash is not parish income', () => {
  const r = parishIncomeFromRemittance({ totalNatl: 0 }, 10000, 10000);
  assert.equal(r.parishIncome, 0);
});

test('packHistory only excludes expenses actually linked to a remittance payment (contract 0.12)', () => {
  // Keyword-guessing on notes ("headquarters", "HQ share" etc.) is gone: only remittanceId/
  // remittanceRef or the legacy zonal_area_joint category are excluded.
  const packed = packHistory({
    incomeRecords: [
      { date: '2026-08-03', totalCollection: 180000, childrenOffering: 0 },
    ],
    expenses: [
      { date: '2026-08-05', category: 'power', amount: 20000, description: 'Generator fuel' },
      { date: '2026-08-10', category: 'rccg_proj', amount: 60000, description: 'RCCG remittance HQ share', remittanceRef: 'rem_1' },
    ],
    remittanceCalcsByMonth: {
      '2026-08': { totalNatl: 50000 },
    },
    months: 1,
  });
  assert.deepEqual(packed.byMonth['2026-08'].expensesByCategory, { power: 20000 });
  assert.equal(packed.byMonth['2026-08'].parishIncomeAfterRemittance, 130000);
});

test('groupExpensesByNote groups diesel vs nepa under power', () => {
  const grouped = groupExpensesByNote([
    { category: 'power', amount: 15000, description: 'Generator diesel purchase' },
    { category: 'power', amount: 7000, description: 'NEPA prepaid token' },
    { category: 'power', amount: 5000, description: 'Diesel top up' },
  ]);
  assert.equal(grouped.length, 2);
  assert.equal(grouped.find(item => item.fingerprint === noteFingerprint('generator diesel purchase')).amount, 20000);
  assert.equal(grouped.find(item => item.fingerprint === noteFingerprint('NEPA prepaid token')).amount, 7000);
});

test('suggestSubsForCategory sub amounts sum to category budget', () => {
  const subs = suggestSubsForCategory('power', [
    { category: 'power', amount: 15000, description: 'Generator diesel purchase' },
    { category: 'power', amount: 7000, description: 'NEPA prepaid token' },
    { category: 'power', amount: 5000, description: 'Diesel top up' },
  ], 60000);
  assert.equal(subs.length, 2);
  assert.equal(subs.reduce((sum, item) => sum + item.amount, 0), 60000);
});

test('suggestSubsForCategory caps at four with other-notes rollup', () => {
  const subs = suggestSubsForCategory('power', [
    { category: 'power', amount: 1000, description: 'Diesel refill' },
    { category: 'power', amount: 900, description: 'NEPA token' },
    { category: 'power', amount: 800, description: 'Inverter service' },
    { category: 'power', amount: 700, description: 'Solar cleaner' },
    { category: 'power', amount: 600, description: 'Cable replacement' },
  ], 10000);
  assert.equal(subs.length, 4);
  assert.equal(subs[3].fingerprint, 'other_notes');
  assert.equal(subs.reduce((sum, item) => sum + item.amount, 0), 10000);
});

test('packHistory excludes children offering from parish gross and parish income', () => {
  const packed = packHistory({
    incomeRecords: [
      { date: '2026-08-03', totalCollection: 125000, childrenOffering: 15000 },
    ],
    expenses: [],
    remittanceCalcsByMonth: {
      '2026-08': { totalNatl: 40000 },
    },
    months: 1,
  });
  assert.equal(packed.byMonth['2026-08'].grossIncome, 110000);
  assert.equal(packed.byMonth['2026-08'].parishIncomeAfterRemittance, 70000);
});

test('matchActuals flags overspend and leftover', () => {
  const plan = {
    monthKey: '2026-09',
    recommendedBudget: 100000,
    lines: [
      { key: 'power', label: 'Power', amount: 40000, expenseCategory: 'power' },
      { key: 'welfare', label: 'Welfare', amount: 60000, expenseCategory: 'welfare' },
    ],
  };
  const actuals = matchActuals(plan, [
    { category: 'power', amount: 45000 },
    { category: 'welfare', amount: 10000 },
  ], new Date('2026-09-20T12:00:00'));
  assert.equal(actuals.spentTotal, 55000);
  assert.equal(actuals.leftTotal, 45000);
  const power = actuals.lines.find(l => l.key === 'power');
  assert.equal(power.pace, 'over');
  assert.equal(power.leftover, -5000);
});

test('safeToSpend uses leftover after operating budget only', () => {
  const plan = { recommendedBudget: 100000, statusLabel: 'enough' };
  assert.equal(safeToSpend(plan, 40000, 0).safeExtra, 60000);
  assert.equal(safeToSpend(plan, 40000, 20000).verdict, 'yes');
  assert.equal(safeToSpend(plan, 40000, 80000).verdict, 'no');
  assert.equal(safeToSpend({ recommendedBudget: 100000, statusLabel: 'short' }, 20000, 10000).safeExtra, 0);
});

test('safeToSpend returns yes for enough budget and no for short budget', () => {
  assert.deepEqual(
    safeToSpend({ recommendedBudget: 200000, statusLabel: 'enough' }, 60000, 20000),
    {
      leftoverAfterBudget: 140000,
      leftoverAfterExtra: 120000,
      safeExtra: 140000,
      verdict: 'yes',
    }
  );
  assert.deepEqual(
    safeToSpend({ recommendedBudget: 200000, statusLabel: 'short' }, 60000, 5000),
    {
      leftoverAfterBudget: 140000,
      leftoverAfterExtra: 135000,
      safeExtra: 0,
      verdict: 'no',
    }
  );
});

test('coercePlan forces recommendedBudget to equal lines + cushion', () => {
  const plan = coercePlan({
    monthKey: '2026-10',
    recommendedBudget: 999999,
    cushion: 5000,
    lines: [
      { key: 'power', amount: 20000, cadence: 'usual' },
      { key: 'welfare', amount: 30000, cadence: 'usual' },
    ],
    summary: 'Keep diesel and welfare funded.',
  }, { expectedParishIncome: 80000, expectedRemittance: 120000, expectedGrossIncome: 200000 });
  assert.equal(plan.recommendedBudget, 55000);
  assert.equal(plan.expectedRemittance, 120000);
  assert.equal(plan.remittanceStrip.amount, 120000);
  assert.equal(plan.statusLabel, 'enough');
});

test('matchActuals returns line and total comparison math for accepted plans', () => {
  const comparison = matchActuals({
    monthKey: '2026-09',
    recommendedBudget: 125000,
    cushion: 5000,
    lines: [
      { key: 'power', label: 'Power & Energy', amount: 40000, expenseCategory: 'power' },
      { key: 'facility', label: 'Facility & Cleaning', amount: 80000, expenseCategory: 'facility' },
    ],
  }, [
    { category: 'power', amount: 10000 },
    { category: 'facility', amount: 25000 },
  ], new Date('2026-09-10T12:00:00Z'));

  assert.equal(comparison.lines[0].spent, 10000);
  assert.equal(comparison.lines[0].leftover, 30000);
  assert.equal(comparison.lines[1].spent, 25000);
  assert.equal(comparison.totals.budgeted, 125000);
  assert.equal(comparison.totals.spent, 35000);
  assert.equal(comparison.totals.leftover, 90000);
});

test('matchActuals derives display subs from expense subCategory when plan has none (contract: Tracking)', () => {
  const comparison = matchActuals({
    monthKey: '2026-09',
    recommendedBudget: 50000,
    lines: [
      { key: 'power', label: 'Power', amount: 40000, expenseCategory: 'power' },
    ],
  }, [
    { category: 'power', amount: 10000, subCategory: 'Diesel', description: 'Generator diesel purchase' },
    { category: 'power', amount: 5000, subCategory: 'NEPA Token', description: 'NEPA prepaid token' },
    { category: 'power', amount: 2000, description: 'Miscellaneous power cost' },
  ], new Date('2026-09-10T12:00:00Z'));
  const subs = comparison.lines[0].subs;
  assert.equal(subs.length, 3);
  assert.ok(subs.some(item => item.label === 'Diesel'));
  assert.ok(subs.some(item => item.label === 'NEPA Token'));
  assert.ok(subs.some(item => item.label === 'Other'), 'expense with no subCategory falls back to Other');
  assert.equal(subs.reduce((sum, item) => sum + item.budgeted, 0), 40000);
  assert.equal(subs.reduce((sum, item) => sum + item.spent, 0), 17000);
});

test('robustMonthlySeries excludes one-off spike months from the typical value', () => {
  const months = [
    { monthKey: '2026-04', amount: 30000 },
    { monthKey: '2026-05', amount: 32000 },
    { monthKey: '2026-06', amount: 28000 },
    { monthKey: '2026-07', amount: 150000 },
    { monthKey: '2026-08', amount: 31000 },
    { monthKey: '2026-09', amount: 29000 },
  ];
  const stats = robustMonthlySeries(months, item => item.amount);
  assert.deepEqual(stats.outliers, ['2026-07']);
  assert.equal(stats.typical, 30000);
  assert.equal(stats.activeMonths, 6);
});

test('robustMonthlySeries handles empty and short histories', () => {
  assert.equal(robustMonthlySeries([], item => item?.amount).typical, 0);
  const single = robustMonthlySeries([{ monthKey: '2026-09', amount: 40000 }], item => item.amount);
  assert.equal(single.typical, 40000);
  assert.deepEqual(single.outliers, []);
  assert.equal(single.confidence, 'low');
});

test('suggestCategoryAmount keeps usual lines at the typical month, and zeroes only clear one-off property projects', () => {
  const months = [
    { monthKey: '2026-04', expensesByCategory: { power: 30000 }, notesByCategory: {} },
    { monthKey: '2026-05', expensesByCategory: { power: 32000 }, notesByCategory: {} },
    { monthKey: '2026-06', expensesByCategory: { power: 28000 }, notesByCategory: {} },
    { monthKey: '2026-07', expensesByCategory: { power: 31000, property: 150000 }, notesByCategory: { property: ['Building construction and renovations'] } },
    { monthKey: '2026-08', expensesByCategory: { power: 29000 }, notesByCategory: {} },
    { monthKey: '2026-09', expensesByCategory: { power: 30000 }, notesByCategory: {} },
  ];
  const power = suggestCategoryAmount(months, 'power');
  assert.equal(power.cadence, 'usual');
  assert.equal(power.amount, 30000);
  const property = suggestCategoryAmount(months, 'property');
  assert.equal(property.cadence, 'once');
  assert.equal(property.amount, 0);
});

test('suggestCategoryAmount scales occasional lines by frequency', () => {
  const months = [
    { monthKey: '2026-04', expensesByCategory: { repairs: 40000 }, notes: [] },
    { monthKey: '2026-05', expensesByCategory: {}, notes: [] },
    { monthKey: '2026-06', expensesByCategory: { repairs: 42000 }, notes: [] },
    { monthKey: '2026-07', expensesByCategory: {}, notes: [] },
    { monthKey: '2026-08', expensesByCategory: { repairs: 38000 }, notes: [] },
    { monthKey: '2026-09', expensesByCategory: {}, notes: [] },
  ];
  const repairs = suggestCategoryAmount(months, 'repairs');
  assert.equal(repairs.cadence, 'occasional');
  assert.equal(repairs.typical, 40000);
  assert.equal(repairs.amount, 20000);
});

test('applyAffordability keeps lean plans untouched', () => {
  const fit = applyAffordability([
    { key: 'power', amount: 30000, cadence: 'usual' },
    { key: 'welfare', amount: 20000, cadence: 'usual' },
  ], 5000, 200000);
  assert.equal(fit.capped, false);
  assert.equal(fit.lines.reduce((sum, line) => sum + line.amount, 0) + fit.cushion, 55000);
});

test('applyAffordability caps bloated plans at 90% of expected income', () => {
  const fit = applyAffordability([
    { key: 'power', amount: 120000, cadence: 'usual' },
    { key: 'property', amount: 80000, cadence: 'occasional' },
  ], 60000, 200000);
  assert.equal(fit.capped, true);
  assert.ok(fit.lines.reduce((sum, line) => sum + line.amount, 0) + fit.cushion <= 180000);
  assert.ok(fit.cushion <= Math.round(180000 * 0.25));
  assert.ok(fit.lines.every(line => line.amount > 0));
});

test('budgetStatus classifies enough, tight and short bands', () => {
  assert.equal(budgetStatus(200000, 100000), 'enough');
  assert.equal(budgetStatus(200000, 190000), 'tight');
  assert.equal(budgetStatus(200000, 210000), 'short');
  assert.equal(budgetStatus(0, 0), 'short');
});

test('computeAffordVerdict says yes when headroom covers the extra request', () => {
  const result = computeAffordVerdict(300000, 150000, 50000);
  assert.equal(result.headroom, 150000);
  assert.equal(result.headroomAfterExtra, 100000);
  assert.equal(result.statusLabel, 'enough');
  assert.equal(result.verdict, 'yes');
});

test('computeAffordVerdict says stretch when tight but the extra still fits', () => {
  const result = computeAffordVerdict(200000, 190000, 5000);
  assert.equal(result.statusLabel, 'tight');
  assert.equal(result.verdict, 'stretch');
});

test('computeAffordVerdict says no when already short, even with zero extra', () => {
  const result = computeAffordVerdict(100000, 120000, 0);
  assert.equal(result.statusLabel, 'short');
  assert.equal(result.verdict, 'no');
});

test('computeAffordVerdict says no when the extra amount would push headroom negative', () => {
  const result = computeAffordVerdict(200000, 100000, 150000);
  assert.equal(result.statusLabel, 'enough');
  assert.equal(result.headroomAfterExtra, -50000);
  assert.equal(result.verdict, 'no');
});

test('estimateTypicalBudget sums typical category amounts under the affordability cap', () => {
  const hints = [
    { key: 'power', avgAmount: 30000, cadence: 'usual' },
    { key: 'welfare', avgAmount: 20000, cadence: 'usual' },
  ];
  const estimate = estimateTypicalBudget(hints, 200000);
  assert.ok(estimate >= 50000, 'includes both category lines plus a cushion');
  assert.ok(estimate <= Math.round(200000 * 0.9), 'stays within the affordability cap');
});

test('estimateTypicalBudget returns 0 when there are no category hints', () => {
  assert.equal(estimateTypicalBudget([], 200000), 0);
});

test('rollingAfford sums income and committed spend across 3 months, showing surplus', () => {
  const outlook = rollingAfford({
    monthKeys: ['2026-09', '2026-10', '2026-11'],
    plans: {
      '2026-09': { recommendedBudget: 80000 },
      '2026-10': { recommendedBudget: 85000 },
    },
    categoryHints: [{ key: 'power', avgAmount: 20000, cadence: 'usual' }],
    expectedParishIncome: 120000,
  });
  assert.equal(outlook.expectedIncome3mo, 360000);
  assert.equal(outlook.perMonth[0].committed, 80000);
  assert.equal(outlook.perMonth[1].committed, 85000);
  assert.equal(outlook.perMonth[2].hasPlan, false, 'month without a saved plan falls back to a typical estimate');
  assert.ok(outlook.headroom > 0);
  assert.equal(outlook.verdict, 'yes');
});

test('rollingAfford reports a shortfall when committed spend outpaces income', () => {
  const outlook = rollingAfford({
    monthKeys: ['2026-09', '2026-10', '2026-11'],
    plans: {
      '2026-09': { recommendedBudget: 150000 },
      '2026-10': { recommendedBudget: 160000 },
      '2026-11': { recommendedBudget: 170000 },
    },
    categoryHints: [],
    expectedParishIncome: 100000,
  });
  assert.equal(outlook.committedSpend3mo, 480000);
  assert.equal(outlook.statusLabel, 'short');
  assert.equal(outlook.verdict, 'no');
  assert.ok(outlook.headroom < 0);
});

test('rollingAfford factors in a requested extra amount for the idea-affordability check', () => {
  const outlook = rollingAfford({
    monthKeys: ['2026-09', '2026-10', '2026-11'],
    plans: {
      '2026-09': { recommendedBudget: 90000 },
      '2026-10': { recommendedBudget: 90000 },
      '2026-11': { recommendedBudget: 90000 },
    },
    categoryHints: [],
    expectedParishIncome: 100000,
    extraAmount: 40000,
  });
  assert.equal(outlook.headroom, 30000);
  assert.equal(outlook.headroomAfterExtra, -10000);
  assert.equal(outlook.verdict, 'no');
});

// ---------------------------------------------------------------------------
// Contract: expense filters
// ---------------------------------------------------------------------------

test('isRemittanceExpenseLike only matches remittance-linked or legacy zonal_area_joint expenses (0.12)', () => {
  assert.equal(isRemittanceExpenseLike({ remittanceRef: 'r1' }), true);
  assert.equal(isRemittanceExpenseLike({ remittanceId: 'r2' }), true);
  assert.equal(isRemittanceExpenseLike({ category: 'zonal_area_joint' }), true);
  assert.equal(isRemittanceExpenseLike({ category: 'rccg_proj', notes: 'headquarters quota seed offering' }), false);
});

test('isCountableExpense: history mode wants approved (or legacy blank status) only, tracking mode excludes only rejected (A1)', () => {
  assert.equal(isCountableExpense({ status: 'approved', amount: 100 }, { mode: 'history' }), true);
  assert.equal(isCountableExpense({ amount: 100 }, { mode: 'history' }), true, 'legacy rows with no status are treated as approved');
  assert.equal(isCountableExpense({ status: 'pending', amount: 100 }, { mode: 'history' }), false);
  assert.equal(isCountableExpense({ status: 'rejected', amount: 100 }, { mode: 'history' }), false);
  assert.equal(isCountableExpense({ status: 'pending', amount: 100 }, { mode: 'tracking' }), true);
  assert.equal(isCountableExpense({ status: 'rejected', amount: 100 }, { mode: 'tracking' }), false);
  assert.equal(isCountableExpense({ status: 'approved', amount: 100, remittanceRef: 'r1' }, { mode: 'tracking' }), false);
});

// ---------------------------------------------------------------------------
// Contract: cadence & amounts (12-month history)
// ---------------------------------------------------------------------------

test('a ₦240,000 bill paid once in 12 months becomes a ₦20,000/month annual set-aside (0.4)', () => {
  const months = Array.from({ length: 12 }, () => ({ expensesByCategory: {}, notesByCategory: {} }));
  months[3].expensesByCategory = { insurance: 240000 };
  const result = suggestCategoryAmount(months, 'insurance');
  assert.equal(result.cadence, 'annual');
  assert.equal(result.amount, 20000);
});

test('RCCG demands (rccg_proj) are always a 12-month set-aside, even with an "Emergency" subCategory (0.12)', () => {
  const months = Array.from({ length: 12 }, () => ({ expensesByCategory: {}, notesByCategory: {} }));
  months[1].expensesByCategory = { rccg_proj: 150000 };
  months[1].notesByCategory = { rccg_proj: ['Province programme'] };
  months[4].expensesByCategory = { rccg_proj: 200000 };
  months[4].notesByCategory = { rccg_proj: ['Project levy'] };
  months[7].expensesByCategory = { rccg_proj: 100000 };
  months[7].notesByCategory = { rccg_proj: ['Special / Emergency Request from RCCG Authorities'] };
  const result = suggestCategoryAmount(months, RCCG_DEMANDS_KEY);
  assert.equal(result.amount, 37500);
  assert.notEqual(result.cadence, 'once');
});

// ---------------------------------------------------------------------------
// Contract: packHistory (0.1, 0.2, 0.3, 0.5, 0.12)
// ---------------------------------------------------------------------------

test('packHistory excludes the current unfinished month using the target-relative cutoff (0.2)', () => {
  const packed = packHistory({
    incomeRecords: [],
    expenses: [],
    months: 12,
    targetMonthKey: '2026-10',
    today: '2026-09-24',
  });
  assert.equal(packed.months.length, 12);
  assert.equal(packed.months[0].monthKey, '2025-09');
  assert.equal(packed.months[packed.months.length - 1].monthKey, '2026-08');
  assert.ok(!packed.byMonth['2026-09'], 'the unfinished current month must not appear in history');
});

test('packHistory passes through the caller-supplied net-local-minus-quotas parish income (0.1)', () => {
  const packed = packHistory({
    incomeRecords: [{ date: '2026-08-03', totalCollection: 900000, childrenOffering: 0 }],
    expenses: [],
    parishIncomeByMonth: { '2026-08': 460000 },
    months: 1,
    today: '2026-09-01',
  });
  assert.equal(packed.byMonth['2026-08'].parishIncome, 460000);
  assert.equal(packed.byMonth['2026-08'].parishIncomeAfterRemittance, 460000);
});

test('packHistory: a "funeral" note on Welfare never affects Security\'s cadence (0.5)', () => {
  const monthKeys = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
  const expenses = [];
  for (const key of monthKeys) {
    expenses.push({ date: `${key}-05`, category: 'security', amount: 40000, status: 'approved', subCategory: 'Guard salary' });
  }
  expenses.push({ date: '2026-03-10', category: 'welfare', amount: 80000, status: 'approved', notes: 'Burial support - funeral' });

  const packed = packHistory({ incomeRecords: [], expenses, months: 12, today: '2026-09-24' });
  const security = suggestCategoryAmount(packed.months, 'security');
  const welfare = suggestCategoryAmount(packed.months, 'welfare');
  assert.equal(security.cadence, 'usual');
  assert.equal(security.amount, 40000);
  assert.notEqual(welfare.cadence, 'once');
  assert.equal(welfare.amount, Math.round(80000 / 12));
});

// ---------------------------------------------------------------------------
// Contract: AI guardrails
// ---------------------------------------------------------------------------

test('clampAiLines clamps AI amounts to ±20% of the baseline, restores missing usual lines, and drops unknown keys (0.6)', () => {
  const baseline = [
    { key: 'power', label: 'Power', amount: 120000, cadence: 'usual', why: 'Typical month' },
    { key: 'security', label: 'Security', amount: 80000, cadence: 'usual', why: 'Typical month' },
  ];
  const aiLines = [
    { key: 'power', amount: 300000, why: 'Diesel price rose' },
    { key: 'made_up_category', amount: 50000, why: 'Guessed' },
  ];
  const { lines, notes } = clampAiLines(aiLines, baseline, { validKeys: ['power', 'security'] });
  const power = lines.find(l => l.key === 'power');
  assert.equal(power.amount, 144000);
  assert.equal(power.aiSuggested, 300000);
  const security = lines.find(l => l.key === 'security');
  assert.ok(security, 'a category paid every month that the AI leaves out is put back automatically');
  assert.equal(security.amount, 80000);
  assert.equal(security.why, 'Restored — paid regularly');
  assert.ok(!lines.some(l => l.key === 'made_up_category'), 'a category name that does not match a real expense category is dropped');
  assert.ok(notes.some(n => /made_up_category/.test(n)));
});

test('suggestCuts marks the plan Short honestly and suggests cuts without touching protected lines or amounts (0.7)', () => {
  const lines = [
    { key: 'rccg_proj', label: 'RCCG Demands', amount: 100000, cadence: 'annual' },
    { key: 'power', label: 'Power', amount: 150000, cadence: 'usual' },
    { key: 'security', label: 'Security', amount: 100000, cadence: 'usual' },
    { key: 'hospitality', label: 'Hospitality', amount: 80000, cadence: 'usual' },
    { key: 'events', label: 'Events', amount: 70000, cadence: 'usual' },
  ];
  const linesSnapshot = JSON.parse(JSON.stringify(lines));
  const result = suggestCuts(lines, 0, 400000);
  assert.equal(result.status, 'short');
  assert.equal(result.shortBy, 100000);
  assert.ok(result.cuts.every(cut => !PROTECTED_FROM_CUTS.includes(cut.key)), 'RCCG demands, Power and Security are never suggested as cuts');
  assert.deepEqual(lines, linesSnapshot, 'suggestCuts never changes the line amounts it was given');
});

// ---------------------------------------------------------------------------
// Contract: tracking (matchActuals, monthProgress)
// ---------------------------------------------------------------------------

test('matchActuals merges "hot" into "watch" — pace is only on_track/watch/over (Part U)', () => {
  const plan = { monthKey: '2026-09', lines: [{ key: 'power', amount: 100000, expenseCategory: 'power' }] };
  const actuals = matchActuals(plan, [{ category: 'power', amount: 90000, status: 'approved' }], new Date('2026-09-05T12:00:00Z'));
  const power = actuals.lines[0];
  assert.ok(['on_track', 'watch', 'over'].includes(power.pace));
  assert.equal(power.pace, 'watch');
});

test('matchActuals lists unplanned category spending and ignores rejected expenses (A1, A2)', () => {
  const plan = {
    monthKey: '2026-09',
    cushion: 5000,
    lines: [
      { key: 'power', label: 'Power', amount: 40000, expenseCategory: 'power' },
    ],
  };
  const actuals = matchActuals(plan, [
    { category: 'power', amount: 20000, status: 'approved' },
    { category: 'welfare', amount: 30000, status: 'approved' },
    { category: 'repairs', amount: 50000, status: 'rejected' },
  ], new Date('2026-09-10T12:00:00Z'));
  assert.equal(actuals.spentTotal, 50000);
  assert.deepEqual(actuals.unplanned, [{ key: 'welfare', spent: 30000 }]);
  assert.equal(actuals.cushionLine.budgeted, 5000);
  assert.equal(actuals.cushionLine.spent, 0);
});

test('monthProgress reports day-of-month, days in month, and Sundays remaining', () => {
  const progress = monthProgress(new Date('2026-09-24T12:00:00Z'), '2026-09');
  assert.equal(progress.day, 24);
  assert.equal(progress.daysInMonth, 30);
  assert.ok(progress.sundaysInMonth >= 4);
  assert.ok(progress.sundaysLeft >= 0);
});

// ---------------------------------------------------------------------------
// Contract: Main goal — Free for new things (Part G)
// ---------------------------------------------------------------------------

test('irregularReserve holds monthly set-aside × months since last paid, resets when paid this month, caps at 12 months', () => {
  const lines = [{ key: 'insurance', label: 'Insurance', amount: 20000, cadence: 'annual' }];

  const eightMonthsAgo = irregularReserve(lines, [
    { category: 'insurance', amount: 240000, date: '2026-01-15', status: 'approved' },
  ], '2026-09-24');
  assert.equal(eightMonthsAgo.total, 160000);
  assert.equal(eightMonthsAgo.items[0].monthsSinceLastPaid, 8);

  const paidThisMonth = irregularReserve(lines, [
    { category: 'insurance', amount: 20000, date: '2026-09-10', status: 'approved' },
  ], '2026-09-24');
  assert.equal(paidThisMonth.total, 0);

  const cappedAtAYear = irregularReserve(lines, [
    { category: 'insurance', amount: 240000, date: '2020-01-15', status: 'approved' },
  ], '2026-09-24');
  assert.equal(cappedAtAYear.total, 240000);
  assert.equal(cappedAtAYear.items[0].monthsSinceLastPaid, 12);
});

test('futureShortfall (deprecated) and growthPerMonth\'s backward-compatible 2-arg form still compute', () => {
  // futureShortfall itself is unchanged (contract v2 just stops using it for the free figure).
  assert.equal(futureShortfall(430000, 400000, 3), 90000);
  assert.equal(futureShortfall(400000, 430000, 3), 0);
  // growthPerMonth gained a 3rd arg (knownBillsMonthly) in contract v2; omitting it defaults to 0,
  // so the old 2-arg call shape still gives the old answer.
  assert.equal(growthPerMonth(460000, 390000), 70000);
  assert.equal(growthPerMonth(390000, 460000), -70000);
});

test('freeForNewThings never lets spending-still-to-come go negative (contract v2 float rule)', () => {
  const free = freeForNewThings({
    availableNow: 500000,
    expectedRestOfPeriod: 150000,
    spendingStillToCome: -50000,
    nextPeriodFloat: 0,
    knownBillsSaved: 0,
    cushion: 0,
  });
  assert.equal(free.parts.spendingStillToCome, 0);
  assert.equal(free.free, 650000);
});

test('Free for new things — contract v2 float-rule worked example', () => {
  const free = freeForNewThings({
    availableNow: 1200000,
    expectedRestOfPeriod: 200000,
    spendingStillToCome: 230000,
    nextPeriodFloat: 150000,
    knownBillsSaved: 210000,
    heldBack: 0,
    cushion: 200000,
  });
  assert.equal(free.expectedEndBalance, 1170000);
  assert.equal(free.free, 610000);

  const yes = affordAnswer(300000, free.free, 70000, '2026-09-24');
  assert.equal(yes.verdict, 'yes');
  assert.equal(yes.freeAfter, 310000);

  const notYet = affordAnswer(900000, free.free, 70000, '2026-09-24');
  assert.equal(notYet.verdict, 'not_yet');
  assert.equal(notYet.monthsNeeded, Math.ceil((900000 - free.free) / 70000));

  const no = affordAnswer(900000, free.free, -30000, '2026-09-24');
  assert.equal(no.verdict, 'no');
});

test('matchActuals: a merged "Other small costs" line tracks every category it includes', () => {
  const plan = {
    monthKey: '2026-09',
    lines: [
      { key: 'power', label: 'Power', amount: 100000 },
      { key: 'other_small', label: 'Other small costs', amount: 20000, includes: ['bank', 'comms'] },
    ],
    cushion: 0,
  };
  const expenses = [
    { category: 'bank', amount: 3000, date: '2026-09-02', status: 'approved' },
    { category: 'comms', amount: 5000, date: '2026-09-03', status: 'approved' },
    { category: 'welfare', amount: 7000, date: '2026-09-04', status: 'approved' },
  ];
  const result = matchActuals(plan, expenses, new Date('2026-09-10T12:00:00'));
  const other = result.lines.find(line => line.key === 'other_small');
  assert.equal(other.spent, 8000);
  assert.deepEqual(result.unplanned.map(item => item.key), ['welfare']);
});

test('packHistory: months before the first record are not counted as ₦0 months', () => {
  // Records only exist from April 2026; planning October on 24 Sept.
  const expenses = [];
  for (const m of ['04', '05', '06', '07', '08']) {
    expenses.push({ category: 'power', amount: 25000, date: `2026-${m}-10`, status: 'approved' });
  }
  const history = packHistory({ expenses, incomeRecords: [], months: 12, targetMonthKey: '2026-10', today: '2026-09-24' });
  assert.deepEqual(history.months.map(m => m.monthKey), ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
  const power = suggestCategoryAmount(history.months, 'power');
  assert.equal(power.cadence, 'usual');
  assert.equal(power.amount, 25000);
});

test('periodProgress follows a remittance period that crosses a month end', () => {
  // Period 25 Aug – 24 Sep 2026 (31 days); Sundays: 30 Aug, 6/13/20 Sep — 13 and 20 are still ahead on the 12th.
  const p = BudgetEngine.periodProgress(new Date('2026-09-12T12:00:00'), '2026-08-25', '2026-09-24');
  assert.equal(p.daysInMonth, 31);
  assert.equal(p.day, 19);
  assert.equal(p.sundaysInMonth, 4);
  assert.equal(p.sundaysLeft, 2);
});

// ---------------------------------------------------------------------------
// Contract v2 — real-data budget engine (tests/fixtures/budget-live-2026.json)
// ---------------------------------------------------------------------------

test('isOneOffItem: a ₦45,000 item flags one-off against a low-median category, a ₦17,500 item does not', () => {
  const soundItems = livePeriods.flatMap(p => p.items).filter(i => i.category === 'sound');
  const cables = soundItems.find(i => i.amount === 45000);
  assert.ok(cables, 'fixture must contain the ₦45,000 cables item');
  assert.equal(isOneOffItem(cables, soundItems), true);

  const powerItems = livePeriods.flatMap(p => p.items).filter(i => i.category === 'power');
  const gasRefill = powerItems.find(i => i.amount === 17500);
  assert.ok(gasRefill, 'fixture must contain the ₦17,500 gas refill item');
  assert.equal(isOneOffItem(gasRefill, powerItems), false, 'gas refill is not 5x the power category median so it is not a one-off');

  const hospItems = livePeriods.flatMap(p => p.items).filter(i => i.category === 'hospitality');
  const evangelistVisit = hospItems.find(i => i.amount === 18000);
  assert.ok(evangelistVisit, 'fixture must contain the ₦18,000 evangelist visit item');
  assert.equal(isOneOffItem(evangelistVisit, hospItems), true);

  assert.equal(isOneOffItem({ amount: 9999 }, [{ amount: 100 }]), false, 'below ONE_OFF_MIN never counts as one-off');
  assert.equal(ONE_OFF_MIN, 10000);
});

test('categoryAverages: real-data per-category averages match the reviewed May–Sep 2026 table (±1)', () => {
  const result = categoryAverages(livePeriods, { knownBillItemIds: [liveRentItem.id] });
  const expectedAverages = {
    power: 23900,
    hospitality: 17390,
    transport: 12320,
    sound: 6240,
    property: 4970,
    office: 2820,
    security: 2800,
    comms: 1603,
    bank: 936,
  };
  for (const [cat, avg] of Object.entries(expectedAverages)) {
    assert.ok(
      Math.abs(result.byCategory[cat].average - avg) <= 1,
      `${cat}: expected ~${avg}, got ${result.byCategory[cat].average}`
    );
  }
  assert.ok(Math.abs(result.runningTotal - 72980) <= 5, `runningTotal expected ~72980, got ${result.runningTotal}`);
  assert.equal(result.rccgAverage, 33220);
  assert.equal(result.periodsUsed, 5);
});

test('categoryAverages: the ₦45k cables and ₦18k evangelist visit are excluded as one-offs from their category totals', () => {
  const result = categoryAverages(livePeriods, { knownBillItemIds: [liveRentItem.id] });
  const soundOneOffs = result.byCategory.sound.oneOffs.map(o => o.amount);
  const hospOneOffs = result.byCategory.hospitality.oneOffs.map(o => o.amount);
  assert.ok(soundOneOffs.includes(45000), 'the ₦45,000 sound cables must be flagged as a one-off');
  assert.ok(hospOneOffs.includes(18000), 'the ₦18,000 evangelist visit must be flagged as a one-off');
  // The ₦17,500 gas refill (power) must never appear as a one-off anywhere.
  for (const cat of Object.values(result.byCategory)) {
    assert.ok(!cat.oneOffs.some(o => o.amount === 17500), 'the ₦17,500 gas refill must not be treated as a one-off');
  }
});

test('categoryAverages: rccg_proj is a plain average (no one-off exclusion) and drops items worded "remittance"', () => {
  const result = categoryAverages(livePeriods, { knownBillItemIds: [liveRentItem.id] });
  assert.equal(result.rccgAverage, 33220);
  assert.deepEqual(result.rccgPerPeriod, [2000, 36000, 80000, 3100, 45000]);
  // The ₦21,000 "Rccg remittance debt repayment" (June period) is excluded because it is remittance,
  // not an RCCG demand — without the exclusion June would be ₦57,000, not ₦36,000.
});

test('categoryAverages: known-bill item ids (rent), reconciliation and zonal_area_joint are excluded from every category', () => {
  assert.ok(liveRentItem, 'fixture must contain the church rent item');
  const withoutRentAsBill = categoryAverages(livePeriods, { knownBillItemIds: [] });
  const withRentAsBill = categoryAverages(livePeriods, { knownBillItemIds: [liveRentItem.id] });
  // Excluded via knownBillItemIds, the rent never appears as a property one-off at all.
  assert.ok(!withRentAsBill.byCategory.property.oneOffs.some(o => o.amount === 203000));
  // Left in (not passed as a bill id), the ₦203,000 rent is so far above the property median that
  // isOneOffItem still catches it as a one-off — belt-and-braces, but knownBillItemIds is the
  // explicit, intentional way to keep it out of the "property" line entirely.
  assert.ok(withoutRentAsBill.byCategory.property.oneOffs.some(o => o.amount === 203000));
  assert.equal(withRentAsBill.byCategory.property.average, 4970);

  const withReconciliation = categoryAverages([
    ...livePeriods,
  ].map((p, i) => i === 0 ? { ...p, items: [...p.items, { category: 'reconciliation', amount: 999999, date: p.from, status: 'approved' }] } : p),
  { knownBillItemIds: [liveRentItem.id] });
  assert.ok(!withReconciliation.byCategory.reconciliation, 'reconciliation category must never appear in byCategory');

  const withZonal = categoryAverages([
    ...livePeriods,
  ].map((p, i) => i === 0 ? { ...p, items: [...p.items, { category: 'zonal_area_joint', amount: 999999, date: p.from, status: 'approved' }] } : p),
  { knownBillItemIds: [liveRentItem.id] });
  assert.ok(!withZonal.byCategory.zonal_area_joint, 'zonal_area_joint category must never appear in byCategory');
});

test('categoryAverages: leading periods with no items and no income are dropped as not-yet-started', () => {
  const withBlankLead = categoryAverages([
    { key: '2026-01', items: [], sundayIncome: 0, otherIncome: 0 },
    { key: '2026-02', items: [], sundayIncome: 0, otherIncome: 0 },
    ...livePeriods,
  ], { knownBillItemIds: [liveRentItem.id] });
  assert.equal(withBlankLead.periodsUsed, 5);
  assert.equal(withBlankLead.rccgAverage, 33220);
});

test('categoryAverages: only approved (or blank-status) items are counted, and other categories are unaffected', () => {
  const withPending = categoryAverages([
    { key: '2026-05', items: [{ category: 'power', amount: 999999, date: '2026-05-01', status: 'pending' }], sundayIncome: 100, otherIncome: 0 },
  ], {});
  assert.ok(!withPending.byCategory.power, 'a pending-only category never appears in byCategory');

  const withApprovedAndPending = categoryAverages([
    { key: '2026-05', items: [
      { category: 'power', amount: 5000, date: '2026-05-01', status: 'approved' },
      { category: 'power', amount: 999999, date: '2026-05-02', status: 'pending' },
    ], sundayIncome: 100, otherIncome: 0 },
  ], {});
  assert.equal(withApprovedAndPending.byCategory.power.average, 5000, 'the pending item must not be counted');
});

test('expectedIncome: real-data median-with-outlier-drop matches the contract (sunday 118,989 / other 20,274 / total 139,263)', () => {
  const income = expectedIncome(livePeriods);
  assert.equal(income.sunday, 118989);
  assert.equal(income.other, 20274);
  assert.equal(income.total, 139263);
});

test('expectedIncome: with fewer than 4 periods, no outlier is dropped (median of all values)', () => {
  const income = expectedIncome([
    { sundayIncome: 100000, otherIncome: 5000 },
    { sundayIncome: 900000, otherIncome: 6000 },
    { sundayIncome: 110000, otherIncome: 7000 },
  ]);
  assert.equal(income.sunday, 110000);
});

test('robustSpread: real-data period totals give a spread of about ₦1,597', () => {
  const spread = robustSpread([87088, 86011, 169413, 86831, 101655]);
  assert.ok(Math.abs(spread - 1597) <= 2, `expected ~1597, got ${spread}`);
});

test('safetyCushion: real-data auto mode falls back to the 10% floor (₦10,620) because there are fewer than 6 periods', () => {
  const cushion = safetyCushion({
    mode: 'auto',
    periodTotals: [87088, 86011, 169413, 86831, 101655],
    normal: 106200,
  });
  assert.equal(cushion, 10620);
});

test('safetyCushion: auto mode uses the robust spread once there are 6+ periods (no floor)', () => {
  const totals = [87088, 86011, 169413, 86831, 101655, 90000];
  const cushion = safetyCushion({ mode: 'auto', periodTotals: totals, normal: 106200 });
  assert.equal(cushion, robustSpread(totals));
  assert.notEqual(cushion, Math.round(0.10 * 106200));
});

test('safetyCushion: percent mode is a clamped 0–100% of normal monthly spending', () => {
  assert.equal(safetyCushion({ mode: 'percent', percent: 10, normal: 106200 }), 10620);
  assert.equal(safetyCushion({ mode: 'percent', percent: 150, normal: 106200 }), 106200, 'percent is clamped at 100');
  assert.equal(safetyCushion({ mode: 'percent', percent: -20, normal: 106200 }), 0, 'percent is clamped at 0');
});

test('knownBillSchedule: real-data rent (₦203,000, paid Jul 2026, due Feb 2028) gives ₦10,684/month and ₦32,052 saved by Oct 2026', () => {
  const schedule = knownBillSchedule([
    { name: 'Church Rent', amount: 203000, lastPaid: '2026-07-01', dueDate: '2028-02-01' },
  ], '2026-10-10');
  const rent = schedule.items[0];
  assert.equal(rent.monthsCycle, 19);
  assert.equal(rent.monthly, 10684);
  assert.equal(rent.saved, 32052);
  assert.equal(rent.remaining, 203000 - 32052);
  assert.equal(schedule.totals.monthly, 10684);
  assert.equal(schedule.totals.saved, 32052);
});

test('suggestKnownBills: matches the real rent item by its "Annual land or building rent" subcategory', () => {
  const suggestions = suggestKnownBills(livePeriods.flatMap(p => p.items));
  const rentSuggestion = suggestions.find(s => s.itemId === liveRentItem.id);
  assert.ok(rentSuggestion, 'the rent item should be suggested as a known bill');
  assert.equal(rentSuggestion.amount, 203000);
  assert.equal(rentSuggestion.lastPaid, '2026-07-01');
  assert.equal(rentSuggestion.dueDate, '2027-07-01');
});

test('carryForwardPot: held-back RCCG money — ₦30k budgeted/₦0 paid, then ₦30k budgeted/₦50k paid, leaves ₦10k held', () => {
  const result = carryForwardPot([
    { budget: 30000, paid: 0 },
    { budget: 30000, paid: 50000 },
  ], { cap: 99660 });
  assert.deepEqual(result.history, [30000, 10000]);
  assert.equal(result.pot, 10000);
});

test('carryForwardPot: never goes below 0 and is capped at the given ceiling (3 periods\' worth)', () => {
  const result = carryForwardPot([
    { budget: 0, paid: 50000 },
    { budget: 100000, paid: 0 },
    { budget: 100000, paid: 0 },
    { budget: 100000, paid: 0 },
  ], { cap: 99660 });
  assert.equal(result.history[0], 0, 'pot never goes negative');
  assert.equal(result.pot, 99660, 'pot is capped');
});

test('freeForNewThings: real-data October free figure ≈ ₦74,851 (float rule)', () => {
  const ca = categoryAverages(livePeriods, { knownBillItemIds: [liveRentItem.id] });
  const income = expectedIncome(livePeriods);
  const normal = ca.normalMonthly;
  const free = freeForNewThings({
    availableNow: 185560,
    expectedRestOfPeriod: income.total,
    spendingStillToCome: normal - 5100,
    nextPeriodFloat: normal,
    knownBillsSaved: 32052,
    heldBack: 0,
    cushion: 10620,
  });
  assert.ok(Math.abs(free.free - 74851) <= 5, `expected ~74851, got ${free.free}`);
});

test('growthPerMonth: real-data growth ≈ ₦22,379/period (income − normal − known-bill monthly saving)', () => {
  const ca = categoryAverages(livePeriods, { knownBillItemIds: [liveRentItem.id] });
  const income = expectedIncome(livePeriods);
  const growth = growthPerMonth(income.total, ca.normalMonthly, 10684);
  assert.ok(Math.abs(growth - 22379) <= 5, `expected ~22379, got ${growth}`);
});

test('runwayMonths: null when free money is growing, a floored count when it is shrinking', () => {
  assert.equal(runwayMonths(50000, 22379), null);
  assert.equal(runwayMonths(50000, -20000), 2);
  assert.equal(runwayMonths(9000, -20000), 0);
});

test('affordAnswer: real-data ₦300,000 canopy is "not yet" — about 11 periods away, around Aug 2027', () => {
  const answer = affordAnswer(300000, 74851, 22379, '2026-09-25');
  assert.equal(answer.verdict, 'not_yet');
  assert.equal(answer.monthsNeeded, 11);
  assert.equal(answer.affordableMonthKey, '2027-08');
});

test('planStatus: real-data ratio ≈0.84 (₦116,884 need ÷ ₦139,263 income) is "enough"', () => {
  const status = planStatus({ normalMonthly: 106200, knownBillsMonthly: 10684, expectedIncome: 139263 });
  assert.equal(status.status, 'enough');
  assert.ok(Math.abs(status.ratio - 0.84) <= 0.01, `expected ratio ~0.84, got ${status.ratio}`);
  assert.equal(status.shortBy, 0);
});

test('planStatus: tight at up to 100% of income, short (with shortBy) above it', () => {
  const tight = planStatus({ normalMonthly: 90000, knownBillsMonthly: 9000, expectedIncome: 100000 });
  assert.equal(tight.status, 'tight');
  const short = planStatus({ normalMonthly: 90000, knownBillsMonthly: 20000, expectedIncome: 100000 });
  assert.equal(short.status, 'short');
  assert.equal(short.shortBy, 10000);
});

test('planDueDate: a cutoff of 18 Oct becomes due 21 Oct (3-day delay)', () => {
  assert.equal(planDueDate('2026-10-18'), '2026-10-21');
  assert.equal(planDueDate('2026-10-18', 5), '2026-10-23');
});

test('planReady: false before the due date, true on and after it', () => {
  assert.equal(planReady('2026-10-19', '2026-10-18'), false);
  assert.equal(planReady('2026-10-20', '2026-10-18'), false);
  assert.equal(planReady('2026-10-21', '2026-10-18'), true);
  assert.equal(planReady('2026-10-25', '2026-10-18'), true);
});

test('BudgetEngine default export carries every contract v2 function', () => {
  for (const name of [
    'isOneOffItem', 'categoryAverages', 'expectedIncome', 'knownBillSchedule', 'suggestKnownBills',
    'carryForwardPot', 'robustSpread', 'safetyCushion', 'freeForNewThings', 'growthPerMonth',
    'runwayMonths', 'affordAnswer', 'planStatus', 'planDueDate', 'planReady',
  ]) {
    assert.equal(typeof BudgetEngine[name], 'function', `BudgetEngine.${name} must be exported`);
  }
});
