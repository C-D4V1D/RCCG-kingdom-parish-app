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
