/**
 * Pure aggregations behind the Partner Progress infographics:
 *   • Pledge Distribution — how many partners sit at each pledge amount.
 *   • Payment Health      — how many are up to date vs 1 / 2 / 3+ months behind.
 *
 * No DOM access, no globals — safe to import in Node.js for unit tests. This
 * file is the canonical source; `src/js/kpsc.js` inlines the same logic because
 * it ships as a single minified bundle (same arrangement as
 * partner-payment-utils.js and committee-sms-utils.js).
 */

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Whole-number percentages that always add up to 100 (largest-remainder
 * method). Naive rounding gives rows like 50 + 25 + 13 + 13 = 101, which looks
 * like a bug to anyone checking the arithmetic on a report.
 *
 * @param {number[]} counts  parts of the whole
 * @param {number}   total   the whole; 0 yields all-zero percentages
 */
export function wholePercentages(counts, total) {
  const list = (counts || []).map(num);
  const whole = num(total);
  if (whole <= 0) return list.map(() => 0);

  const exact = list.map(c => (c * 100) / whole);
  const out = exact.map(Math.floor);
  const floorSum = out.reduce((a, b) => a + b, 0);
  // Only top up to 100 when the parts really do make up the whole; a caller
  // passing a subset should not have its percentages inflated to fill the bar.
  const target = Math.round(exact.reduce((a, b) => a + b, 0));
  let spare = Math.min(target, 100) - floorSum;

  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let i = 0; i < spare && i < byFraction.length; i++) out[byFraction[i].index] += 1;
  return out;
}

/**
 * Group partners by what they pledge each month.
 *
 * @param {number[]} pledges   one monthly pledge per partner in scope
 * @param {object}   [options]
 * @param {number}   [options.maxRows=10]  cap on rows before the smallest tiers
 *                                         are folded into a single "other" row
 * @returns {{
 *   total: number, income: number, commonest: object|null,
 *   tiers: Array<{ amount:number, count:number, pct:number, income:number,
 *                  incomePct:number, isUnset:boolean, isOther:boolean,
 *                  amounts:number[] }>
 * }}
 */
export function buildPledgeTiers(pledges, { maxRows = 10 } = {}) {
  const list = (pledges || []).map(num).map(v => (v > 0 ? v : 0));
  const total = list.length;

  const counts = new Map();
  for (const amount of list) counts.set(amount, (counts.get(amount) || 0) + 1);

  // A pledge of 0 is missing data, not a tier — it always sits last and is
  // flagged so the UI can prompt someone to fill it in.
  const unsetCount = counts.get(0) || 0;
  counts.delete(0);

  let priced = [...counts.entries()]
    .map(([amount, count]) => ({ amount, count, income: amount * count }))
    .sort((a, b) => a.amount - b.amount);

  // Fold the long tail so an odd pledge on every partner can't produce 45 rows.
  // The "other" row keeps the smallest groups; ties break toward the lower
  // amount so the kept rows stay the headline ones.
  const room = Math.max(1, maxRows - (unsetCount > 0 ? 1 : 0));
  let other = null;
  if (priced.length > room) {
    const ranked = [...priced].sort((a, b) => b.count - a.count || b.amount - a.amount);
    const keep = new Set(ranked.slice(0, room - 1).map(t => t.amount));
    const folded = priced.filter(t => !keep.has(t.amount));
    priced = priced.filter(t => keep.has(t.amount));
    other = {
      amount: 0,
      count: folded.reduce((sum, t) => sum + t.count, 0),
      income: folded.reduce((sum, t) => sum + t.income, 0),
      isOther: true,
      amounts: folded.map(t => t.amount).sort((a, b) => a - b),
    };
  }

  const rows = [...priced];
  if (other) rows.push(other);
  if (unsetCount > 0) rows.push({ amount: 0, count: unsetCount, income: 0, isUnset: true });

  const income = rows.reduce((sum, t) => sum + t.income, 0);
  const pcts = wholePercentages(rows.map(t => t.count), total);
  const incomePcts = wholePercentages(rows.map(t => t.income), income);

  const tiers = rows.map((t, i) => ({
    amount: t.amount,
    count: t.count,
    pct: pcts[i],
    income: t.income,
    incomePct: incomePcts[i],
    isUnset: !!t.isUnset,
    isOther: !!t.isOther,
    amounts: t.amounts || [],
  }));

  // The single amount the most partners give — the headline "typical pledge".
  const commonest = tiers
    .filter(t => !t.isUnset && !t.isOther)
    .reduce((best, t) => (!best || t.count > best.count || (t.count === best.count && t.amount < best.amount) ? t : best), null);

  return { total, income, tiers, commonest };
}

/**
 * How far behind one partner is, over the months that have actually come due.
 *
 * A month counts only when money is genuinely outstanding — a partner with no
 * pledge on record reads as "unpaid" every month but owes nothing, and must not
 * be reported as being in arrears.
 *
 * @param {Array<{balance:number}>} months  12 month summaries, January first
 * @param {object} [range]
 * @param {number} [range.startMonth=1]     first month the partner owes for
 * @param {number} [range.scopeEndMonth=12] last month that has come due
 */
export function arrearsFor(months, { startMonth = 1, scopeEndMonth = 12 } = {}) {
  const list = months || [];
  const from = Math.max(1, num(startMonth));
  const to = Math.min(12, num(scopeEndMonth));
  let monthsBehind = 0;
  let outstanding = 0;
  let monthsInScope = 0;
  for (let m = from; m <= to; m++) {
    const summary = list[m - 1];
    if (!summary) continue;
    monthsInScope++;
    const balance = num(summary.balance);
    if (balance > 0) { monthsBehind++; outstanding += balance; }
  }
  return { monthsBehind, outstanding, monthsInScope };
}

/** Bands the Payment Health bar is split into, best first. */
export const ARREARS_BUCKETS = [
  { key: 'up-to-date', label: 'Up to date',      min: 0, max: 0 },
  { key: 'behind-1',   label: '1 month behind',  min: 1, max: 1 },
  { key: 'behind-2',   label: '2 months behind', min: 2, max: 2 },
  { key: 'behind-3plus', label: '3+ months behind', min: 3, max: Infinity },
];

/** The band a given number of outstanding months falls into. */
export function arrearsBucketKey(monthsBehind) {
  const n = Math.max(0, num(monthsBehind));
  const bucket = ARREARS_BUCKETS.find(b => n >= b.min && n <= b.max);
  return bucket ? bucket.key : 'up-to-date';
}

/**
 * Roll individual arrears up into the four bands.
 *
 * @param {Array<{monthsBehind:number, outstanding:number}>} entries
 * @returns {{ total:number, totalOutstanding:number, upToDate:number,
 *            upToDatePct:number,
 *            buckets: Array<{key:string,label:string,count:number,pct:number,outstanding:number}> }}
 */
export function buildArrearsBuckets(entries) {
  const list = entries || [];
  const total = list.length;

  const tally = new Map(ARREARS_BUCKETS.map(b => [b.key, { count: 0, outstanding: 0 }]));
  for (const entry of list) {
    const slot = tally.get(arrearsBucketKey(entry?.monthsBehind));
    slot.count++;
    slot.outstanding += Math.max(0, num(entry?.outstanding));
  }

  const pcts = wholePercentages(ARREARS_BUCKETS.map(b => tally.get(b.key).count), total);
  const buckets = ARREARS_BUCKETS.map((b, i) => ({
    key: b.key,
    label: b.label,
    count: tally.get(b.key).count,
    pct: pcts[i],
    outstanding: tally.get(b.key).outstanding,
  }));

  return {
    total,
    totalOutstanding: buckets.reduce((sum, b) => sum + b.outstanding, 0),
    upToDate: buckets[0].count,
    upToDatePct: buckets[0].pct,
    buckets,
  };
}

/**
 * Last month that has actually come due for the selected period. You cannot be
 * behind on a month that has not happened, so a month later than today (or a
 * future year) contributes nothing.
 */
export function progressScopeEndMonth(month, year, nowMonth, nowYear) {
  const m = num(month);
  const y = num(year);
  if (y > num(nowYear)) return 0;
  if (y < num(nowYear)) return Math.min(12, Math.max(0, m));
  return Math.min(Math.max(0, m), num(nowMonth));
}
