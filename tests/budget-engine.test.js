import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCadence,
  parishIncomeFromRemittance,
  matchActuals,
  safeToSpend,
  coercePlan,
  monthKey,
} from '../src/js/budget-engine.js';

test('monthKey formats calendar months', () => {
  assert.equal(monthKey('2026-10-03'), '2026-10');
});

test('one-off spike is not usual', () => {
  assert.equal(classifyCadence([0, 0, 0, 180000, 0, 0], ['Emergency roof repair']), 'once');
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
  assert.equal(power.left, -5000);
});

test('safeToSpend uses leftover after operating budget only', () => {
  const plan = { recommendedBudget: 100000, statusLabel: 'enough' };
  assert.equal(safeToSpend(plan, 40000, 0).safeExtra, 60000);
  assert.equal(safeToSpend(plan, 40000, 20000).verdict, 'yes');
  assert.equal(safeToSpend(plan, 40000, 80000).verdict, 'no');
  assert.equal(safeToSpend({ recommendedBudget: 100000, statusLabel: 'short' }, 20000, 10000).safeExtra, 0);
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
