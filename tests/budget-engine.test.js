import test from 'node:test';
import assert from 'node:assert/strict';

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
} from '../src/js/budget-engine.js';

test('monthKey formats calendar months', () => {
  assert.equal(monthKey('2026-10-03'), '2026-10');
  assert.equal(monthKey('2026-09-23'), '2026-09');
  assert.equal(BudgetEngine.nextMonthKey('2026-12'), '2027-01');
});

test('one-off spike is not usual', () => {
  assert.equal(classifyCadence([{ amount: 0 }, { amount: 0 }, { amount: 180000, notes: 'Emergency roof repair' }, { amount: 0 }, { amount: 0 }, { amount: 0 }]), 'once');
  assert.equal(classifyCadence([12000, 11000, 13000, 12500, 14000, 12000]), 'usual');
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

test('packHistory excludes remittance-style expenses from operating totals', () => {
  const packed = packHistory({
    incomeRecords: [
      { date: '2026-08-03', totalCollection: 180000, childrenOffering: 0 },
    ],
    expenses: [
      { date: '2026-08-05', category: 'power', amount: 20000, description: 'Generator fuel' },
      { date: '2026-08-10', category: 'rccg_proj', amount: 60000, description: 'RCCG remittance HQ share' },
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

test('matchActuals derives display note subs when plan has none', () => {
  const comparison = matchActuals({
    monthKey: '2026-09',
    recommendedBudget: 50000,
    lines: [
      { key: 'power', label: 'Power', amount: 40000, expenseCategory: 'power' },
    ],
  }, [
    { category: 'power', amount: 10000, description: 'Generator diesel purchase' },
    { category: 'power', amount: 5000, description: 'NEPA prepaid token' },
  ], new Date('2026-09-10T12:00:00Z'));
  const subs = comparison.lines[0].subs;
  assert.equal(subs.length, 2);
  assert.equal(subs.reduce((sum, item) => sum + item.budgeted, 0), 40000);
  assert.equal(subs.reduce((sum, item) => sum + item.spent, 0), 15000);
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

test('suggestCategoryAmount zeroes one-off spends and budgets usual lines at the typical month', () => {
  const months = [
    { monthKey: '2026-04', expensesByCategory: { power: 30000 }, notes: [] },
    { monthKey: '2026-05', expensesByCategory: { power: 32000 }, notes: [] },
    { monthKey: '2026-06', expensesByCategory: { power: 28000 }, notes: [] },
    { monthKey: '2026-07', expensesByCategory: { power: 31000, property: 150000 }, notes: ['Emergency roof repair'] },
    { monthKey: '2026-08', expensesByCategory: { power: 29000 }, notes: [] },
    { monthKey: '2026-09', expensesByCategory: { power: 30000 }, notes: [] },
  ];
  const power = suggestCategoryAmount(months, 'power');
  assert.equal(power.cadence, 'usual');
  assert.equal(power.amount, 30000);
  const property = suggestCategoryAmount(months, 'property');
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
