import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wholePercentages,
  buildPledgeTiers,
  arrearsFor,
  arrearsBucketKey,
  buildArrearsBuckets,
  progressScopeEndMonth,
  ARREARS_BUCKETS,
} from '../src/js/partner-progress-stats.js';

// ── wholePercentages ──────────────────────────────────────────────────────
test('wholePercentages: exact splits are exact', () => {
  assert.deepEqual(wholePercentages([20, 20], 40), [50, 50]);
  assert.deepEqual(wholePercentages([1, 1, 1, 1], 4), [25, 25, 25, 25]);
});

test('wholePercentages: awkward splits still total 100', () => {
  // Naive rounding gives 33+33+33=99 and 17+17+17+17+17+17=102.
  assert.equal(wholePercentages([1, 1, 1], 3).reduce((a, b) => a + b, 0), 100);
  assert.equal(wholePercentages([1, 1, 1, 1, 1, 1], 6).reduce((a, b) => a + b, 0), 100);
  assert.equal(wholePercentages([20, 5, 1, 1], 27).reduce((a, b) => a + b, 0), 100);
});

test('wholePercentages: the spare point goes to the largest remainder', () => {
  // 3/7 = 42.857 (.857), 2/7 = 28.571 (.571) twice → the 3 gets rounded up.
  assert.deepEqual(wholePercentages([3, 2, 2], 7), [43, 29, 28]);
});

test('wholePercentages: a subset is not inflated to fill the bar', () => {
  assert.deepEqual(wholePercentages([1, 1], 4), [25, 25]);
});

test('wholePercentages: zero and empty totals are safe', () => {
  assert.deepEqual(wholePercentages([1, 2], 0), [0, 0]);
  assert.deepEqual(wholePercentages([], 10), []);
  assert.deepEqual(wholePercentages([0, 0], 0), [0, 0]);
});

test('wholePercentages: a lone group takes the whole bar', () => {
  assert.deepEqual(wholePercentages([7], 7), [100]);
});

// ── buildPledgeTiers ──────────────────────────────────────────────────────
test('buildPledgeTiers: the example from the brief', () => {
  // 40 partners: 20 at ₦1,000, 14 at ₦2,000, 5 at ₦3,000, 1 at ₦10,000.
  const pledges = [
    ...Array(20).fill(1000),
    ...Array(14).fill(2000),
    ...Array(5).fill(3000),
    10000,
  ];
  const { total, income, tiers, commonest } = buildPledgeTiers(pledges);

  assert.equal(total, 40);
  assert.equal(income, 20000 + 28000 + 15000 + 10000);
  assert.deepEqual(tiers.map(t => [t.amount, t.count, t.pct]), [
    [1000, 20, 50],
    [2000, 14, 35],
    [3000, 5, 13],
    [10000, 1, 2],
  ]);
  assert.equal(tiers.reduce((sum, t) => sum + t.pct, 0), 100);
  assert.equal(commonest.amount, 1000);
});

test('buildPledgeTiers: income share exposes the tier that actually funds the church', () => {
  // 9 small partners raise less than 1 large one.
  const { tiers } = buildPledgeTiers([...Array(9).fill(1000), 20000]);
  const small = tiers.find(t => t.amount === 1000);
  const large = tiers.find(t => t.amount === 20000);
  assert.equal(small.pct, 90);
  assert.equal(large.pct, 10);
  assert.equal(small.incomePct, 31);            // ₦9,000 of ₦29,000
  assert.equal(large.incomePct, 69);            // ₦20,000 of ₦29,000
  assert.equal(small.incomePct + large.incomePct, 100);
});

test('buildPledgeTiers: tiers are ordered by amount, not by size', () => {
  const { tiers } = buildPledgeTiers([5000, 1000, 1000, 1000, 2000]);
  assert.deepEqual(tiers.map(t => t.amount), [1000, 2000, 5000]);
});

test('buildPledgeTiers: partners with no pledge set are flagged, never priced', () => {
  const { tiers, income, total } = buildPledgeTiers([1000, 1000, 0, 0, 0]);
  assert.equal(total, 5);
  assert.equal(income, 2000);
  const unset = tiers.find(t => t.isUnset);
  assert.equal(unset.count, 3);
  assert.equal(unset.pct, 60);
  assert.equal(unset.income, 0);
  assert.equal(tiers[tiers.length - 1], unset, 'the unset row sorts last');
});

test('buildPledgeTiers: negative or unparseable pledges count as unset', () => {
  const { tiers } = buildPledgeTiers([-500, null, undefined, 'abc', NaN, 1000]);
  assert.equal(tiers.find(t => t.isUnset).count, 5);
  assert.equal(tiers.find(t => t.amount === 1000 && !t.isUnset).count, 1);
});

test('buildPledgeTiers: a long tail is folded into one "other" row', () => {
  // 12 distinct amounts, one partner each, plus a dominant tier.
  const odd = Array.from({ length: 12 }, (_, i) => 1100 + i * 7);
  const { tiers, total } = buildPledgeTiers([...Array(20).fill(1000), ...odd], { maxRows: 5 });
  assert.equal(total, 32);
  assert.ok(tiers.length <= 5, `expected at most 5 rows, got ${tiers.length}`);
  const other = tiers.find(t => t.isOther);
  assert.ok(other, 'the tail is folded');
  assert.equal(tiers.reduce((sum, t) => sum + t.count, 0), 32, 'no partner is lost');
  assert.equal(tiers.reduce((sum, t) => sum + t.pct, 0), 100);
  assert.equal(tiers[tiers.length - 1], other, 'the other row sorts last');
  assert.ok(other.amounts.length > 1 && other.amounts[0] < other.amounts[1], 'lists the folded amounts in order');
});

test('buildPledgeTiers: nothing to show is not an error', () => {
  const empty = buildPledgeTiers([]);
  assert.equal(empty.total, 0);
  assert.equal(empty.income, 0);
  assert.deepEqual(empty.tiers, []);
  assert.equal(empty.commonest, null);
  assert.deepEqual(buildPledgeTiers(null).tiers, []);
});

test('buildPledgeTiers: every partner lands in exactly one tier', () => {
  const pledges = [1000, 1000, 2000, 0, 3000, 3000, 3000, 0, 500];
  const { tiers, total } = buildPledgeTiers(pledges);
  assert.equal(tiers.reduce((sum, t) => sum + t.count, 0), total);
  assert.equal(tiers.reduce((sum, t) => sum + t.income, 0), 1000 + 1000 + 2000 + 3000 * 3 + 500);
});

// ── arrearsFor ────────────────────────────────────────────────────────────
const months = (balances) => balances.map(balance => ({ balance }));

test('arrearsFor: counts only months with money still outstanding', () => {
  const m = months([0, 500, 0, 1000, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(arrearsFor(m, { startMonth: 1, scopeEndMonth: 6 }), {
    monthsBehind: 2, outstanding: 1500, monthsInScope: 6,
  });
});

test('arrearsFor: months before the partner started are out of scope', () => {
  const m = months([1000, 1000, 1000, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const behind = arrearsFor(m, { startMonth: 4, scopeEndMonth: 6 });
  assert.equal(behind.monthsBehind, 0, 'not in arrears for months before joining');
  assert.equal(behind.monthsInScope, 3);
});

test('arrearsFor: months that have not come due yet are out of scope', () => {
  const m = months(Array(12).fill(1000));
  assert.equal(arrearsFor(m, { startMonth: 1, scopeEndMonth: 3 }).monthsBehind, 3);
  assert.equal(arrearsFor(m, { startMonth: 1, scopeEndMonth: 0 }).monthsBehind, 0);
});

test('arrearsFor: a partner with no pledge owes nothing and is never behind', () => {
  // monthPaymentStatus reports "unpaid" with a zero balance when no pledge is set.
  const m = months(Array(12).fill(0));
  assert.equal(arrearsFor(m, { startMonth: 1, scopeEndMonth: 12 }).monthsBehind, 0);
});

test('arrearsFor: a part-paid month still counts as behind', () => {
  const m = months([250, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(arrearsFor(m, { startMonth: 1, scopeEndMonth: 1 }), {
    monthsBehind: 1, outstanding: 250, monthsInScope: 1,
  });
});

test('arrearsFor: bounds are clamped, missing months skipped', () => {
  const m = months([1000, 1000]);
  assert.equal(arrearsFor(m, { startMonth: 0, scopeEndMonth: 99 }).monthsBehind, 2);
  assert.equal(arrearsFor([], { startMonth: 1, scopeEndMonth: 12 }).monthsInScope, 0);
  assert.equal(arrearsFor(null).monthsBehind, 0);
});

// ── arrearsBucketKey / buildArrearsBuckets ────────────────────────────────
test('arrearsBucketKey: bands are contiguous with no gaps', () => {
  assert.equal(arrearsBucketKey(0), 'up-to-date');
  assert.equal(arrearsBucketKey(1), 'behind-1');
  assert.equal(arrearsBucketKey(2), 'behind-2');
  assert.equal(arrearsBucketKey(3), 'behind-3plus');
  assert.equal(arrearsBucketKey(11), 'behind-3plus');
  assert.equal(arrearsBucketKey(-1), 'up-to-date');
});

test('buildArrearsBuckets: counts, percentages and money per band', () => {
  const summary = buildArrearsBuckets([
    { monthsBehind: 0, outstanding: 0 },
    { monthsBehind: 0, outstanding: 0 },
    { monthsBehind: 0, outstanding: 0 },
    { monthsBehind: 1, outstanding: 1000 },
    { monthsBehind: 2, outstanding: 4000 },
    { monthsBehind: 5, outstanding: 9000 },
  ]);
  assert.equal(summary.total, 6);
  assert.equal(summary.upToDate, 3);
  assert.equal(summary.upToDatePct, 50);
  assert.equal(summary.totalOutstanding, 14000);
  assert.deepEqual(summary.buckets.map(b => [b.key, b.count, b.pct, b.outstanding]), [
    ['up-to-date', 3, 50, 0],
    ['behind-1', 1, 17, 1000],
    ['behind-2', 1, 17, 4000],
    ['behind-3plus', 1, 16, 9000],
  ]);
  assert.equal(summary.buckets.reduce((sum, b) => sum + b.pct, 0), 100);
});

test('buildArrearsBuckets: always returns all four bands, even at zero', () => {
  const summary = buildArrearsBuckets([]);
  assert.equal(summary.total, 0);
  assert.equal(summary.upToDatePct, 0);
  assert.deepEqual(summary.buckets.map(b => b.key), ARREARS_BUCKETS.map(b => b.key));
  assert.ok(summary.buckets.every(b => b.count === 0 && b.pct === 0));
});

test('buildArrearsBuckets: everyone up to date reads 100%', () => {
  const summary = buildArrearsBuckets(Array(9).fill({ monthsBehind: 0, outstanding: 0 }));
  assert.equal(summary.upToDatePct, 100);
  assert.equal(summary.totalOutstanding, 0);
});

test('buildArrearsBuckets: malformed entries default to up to date, not to arrears', () => {
  const summary = buildArrearsBuckets([{}, { monthsBehind: null }, { outstanding: 'x' }]);
  assert.equal(summary.upToDate, 3);
  assert.equal(summary.totalOutstanding, 0);
});

// ── progressScopeEndMonth ─────────────────────────────────────────────────
test('progressScopeEndMonth: never runs past today', () => {
  assert.equal(progressScopeEndMonth(12, 2026, 8, 2026), 8, 'current year, future month');
  assert.equal(progressScopeEndMonth(6, 2026, 8, 2026), 6, 'current year, past month');
  assert.equal(progressScopeEndMonth(8, 2026, 8, 2026), 8, 'this month');
});

test('progressScopeEndMonth: past years run to the selected month', () => {
  assert.equal(progressScopeEndMonth(6, 2025, 8, 2026), 6);
  assert.equal(progressScopeEndMonth(12, 2025, 8, 2026), 12);
});

test('progressScopeEndMonth: a future year has nothing due yet', () => {
  assert.equal(progressScopeEndMonth(6, 2027, 8, 2026), 0);
  assert.equal(progressScopeEndMonth(12, 2027, 8, 2026), 0);
});
