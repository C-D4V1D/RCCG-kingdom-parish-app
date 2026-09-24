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
} from '../src/js/budget-engine.js';

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

test('futureShortfall, safetyCushion and growthPerMonth match the plan\'s worked formulas', () => {
  assert.equal(futureShortfall(430000, 400000, 3), 90000);
  assert.equal(futureShortfall(400000, 430000, 3), 0);
  assert.equal(safetyCushion(400000), 200000);
  assert.equal(safetyCushion(400000, 0.25), 100000);
  assert.equal(growthPerMonth(460000, 390000), 70000);
  assert.equal(growthPerMonth(390000, 460000), -70000);
});

test('freeForNewThings never lets the month gap go negative when Sundays cover the rest of the month', () => {
  const free = freeForNewThings({
    availableNow: 500000,
    remainingThisMonth: 100000,
    expectedRestOfMonth: 150000,
    pendingUnpaid: 0,
    irregularReserve: 0,
    futureShortfall: 0,
    safetyCushion: 0,
  });
  assert.equal(free.monthGap, 0);
  assert.equal(free.free, 500000);
});

test('Free for new things — worked example from the contract', () => {
  const free = freeForNewThings({
    availableNow: 1200000,
    remainingThisMonth: 230000,
    expectedRestOfMonth: 200000,
    pendingUnpaid: 40000,
    irregularReserve: 210000,
    futureShortfall: 0,
    safetyCushion: 200000,
  });
  assert.equal(free.monthGap, 30000);
  assert.equal(free.free, 720000);

  const yes = affordAnswer(300000, free.free, 70000, '2026-09-24');
  assert.equal(yes.verdict, 'yes');
  assert.equal(yes.freeAfter, 420000);

  const notYet = affordAnswer(900000, free.free, 70000, '2026-09-24');
  assert.equal(notYet.verdict, 'not_yet');
  assert.equal(notYet.monthsNeeded, 3);
  assert.equal(notYet.affordableMonthKey, '2026-12');

  const no = affordAnswer(900000, free.free, -30000, '2026-09-24');
  assert.equal(no.verdict, 'no');
});
