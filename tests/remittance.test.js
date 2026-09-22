import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRemittances,
  formatNaira,
  PROVINCE_REBATE_RATE
} from '../src/js/remittance.js';

function assertClose(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) < epsilon, `Expected ${actual} to be close to ${expected}`);
}

test('calculateRemittances returns zeroed totals for empty income', () => {
  const result = calculateRemittances({});

  assert.deepEqual(result.breakdown, {});
  assert.equal(result.totals.totalIncome, 0);
  assert.equal(result.totals.totalToNational, 0);
  assert.equal(result.totals.totalToArea, 0);
  assert.equal(result.totals.totalToPastor, 0);
  assert.equal(result.totals.totalToMinisters, 0);
  assert.equal(result.totals.localRetainedBeforeRebate, 0);
  assert.equal(result.totals.provinceRebate, 0);
  assert.equal(result.totals.netLocalRetained, 0);
});

test('calculateRemittances computes all categories with correct totals', () => {
  const income = {
    membersTithe: 100000,
    ministersTithe: 50000,
    thanksgiving: 20000,
    sundaySchool: 10000,
    slo: 7000,
    crm: 8000,
    workersOffering: 6000,
    childrenOffering: 4000
  };
  const result = calculateRemittances(income);

  assert.equal(result.totals.totalIncome, 205000);
  assertClose(result.breakdown.membersTithe.national, 58000);
  assertClose(result.breakdown.membersTithe.local, 42000);
  assertClose(result.breakdown.ministersTithe.national, 31000);
  assertClose(result.breakdown.ministersTithe.local, 19000);
  assertClose(result.breakdown.thanksgiving.national, 15000);
  assertClose(result.breakdown.thanksgiving.area, 1000);
  assertClose(result.breakdown.thanksgiving.pastor, 2000);
  assertClose(result.breakdown.thanksgiving.ministers, 1800);
  assertClose(result.breakdown.thanksgiving.pastorsSeed, 200);
  assert.equal(result.breakdown.thanksgiving.local, 0);
  assert.equal(result.breakdown.sundaySchool.national, 10000);
  assertClose(result.breakdown.childrenOffering.childrensDept, 2600);

  assertClose(result.totals.totalToNational, 123800);
  assertClose(result.totals.totalToArea, 1000);
  assertClose(result.totals.totalToPastor, 2000);
  assertClose(result.totals.totalToMinisters, 1800);
  assertClose(result.totals.localRetainedBeforeRebate, 73600);

  const expectedLocalTithe =
    result.breakdown.membersTithe.local + result.breakdown.ministersTithe.local;
  const expectedRebate = expectedLocalTithe * PROVINCE_REBATE_RATE;
  assertClose(result.totals.provinceRebate, expectedRebate);
  assertClose(result.totals.netLocalRetained, 73600 - expectedRebate);
});

test('province rebate only applies to local tithe and excludes non-tithe local funds', () => {
  const income = {
    membersTithe: 1000,
    ministersTithe: 0,
    slo: 1000,
    crm: 1000,
    workersOffering: 1000
  };
  const result = calculateRemittances(income);

  assert.equal(result.totals.localTithe, 420);
  assert.equal(result.totals.localRetainedBeforeRebate, 420 + 700 + 400 + 750);
  assertClose(result.totals.provinceRebate, 420 * PROVINCE_REBATE_RATE);
});

test('formatNaira rounds and formats amount in en-NG style', () => {
  assert.equal(formatNaira(1234.6), '₦1,235');
  assert.equal(formatNaira(0), '₦0');
});
