/**
 * Pure helpers for partial partnership pledge payments.
 *
 * A partner's month can now hold several installments — ₦500 collected on the
 * 3rd and ₦1,500 on the 20th both belong to July. The month's status is derived
 * from money collected vs money expected rather than from the mere existence of
 * a payment row, which is what the app did before partial payments existed.
 *
 * No DOM access; safe to import in Node.js for unit tests. This file is the
 * canonical source — `src/js/kpsc.js` inlines the same logic because it ships as
 * a single minified bundle (same arrangement as receipt-ocr-utils.js).
 */

export const MONTHLY_PLEDGE_TYPE = 'monthly_pledge';

// Amounts are stored as SQLite REAL, so comparisons need a tolerance or a month
// settled to the kobo can read as ₦0.0000001 short and stay amber forever.
const EPSILON = 0.005;

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Classify one month from its totals.
 * @param {{collected:number, expected:number}} totals
 * @returns {{status:'paid'|'partial'|'unpaid', balance:number}}
 */
export function monthPaymentStatus({ collected, expected } = {}) {
  const got = Math.max(0, num(collected));
  const due = Math.max(0, num(expected));
  // No pledge on record — any money at all settles the month, otherwise there is
  // nothing to owe and nothing to chase.
  if (due <= 0) return { status: got > 0 ? 'paid' : 'unpaid', balance: 0 };
  if (got <= 0) return { status: 'unpaid', balance: due };
  if (got >= due - EPSILON) return { status: 'paid', balance: 0 };
  return { status: 'partial', balance: due - got };
}

/**
 * Every installment recorded against one month, oldest first.
 * Soft-deleted rows never reach the client, so no filtering for them here.
 */
export function monthInstallments(payments, { partnerId, month, year, paymentType = MONTHLY_PLEDGE_TYPE } = {}) {
  return (payments || [])
    .filter(p => (
      (!partnerId || p.partnerId === partnerId) &&
      Number(p.year) === Number(year) &&
      Number(p.month) === Number(month) &&
      p.paid &&
      (p.paymentType || MONTHLY_PLEDGE_TYPE) === paymentType
    ))
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id || '').localeCompare(String(b.id || '')));
}

/**
 * Collected/expected/status for a single month.
 *
 * `expected` comes from the snapshot taken when the first installment was
 * recorded, so raising a partner's pledge does not retroactively turn settled
 * months amber. Legacy rows carry no snapshot and fall back to the live pledge.
 */
export function summariseMonth(payments, { partnerId, month, year, pledge = 0, paymentType = MONTHLY_PLEDGE_TYPE } = {}) {
  const installments = monthInstallments(payments, { partnerId, month, year, paymentType });
  const collected = installments.reduce((sum, p) => sum + num(p.amount), 0);
  // Highest non-zero snapshot wins — deterministic without depending on row
  // order, and it errs toward "still owing" rather than falsely settled. The
  // reminder query (FULLY_PAID_MONTHS_SQL) uses the same rule so the badge on
  // screen and the SMS that goes out never disagree.
  const snapshot = installments.reduce((max, p) => Math.max(max, num(p.expectedAmount)), 0);
  const expected = snapshot > 0 ? snapshot : Math.max(0, num(pledge));
  const { status, balance } = monthPaymentStatus({ collected, expected });
  return {
    month: Number(month),
    year: Number(year),
    installments,
    collected,
    expected,
    status,
    balance,
  };
}

/**
 * First month of `year` the partner is actually expected to give in.
 * Returns 13 when the partnership starts after this year entirely, so callers
 * can treat "no month in scope" uniformly.
 */
export function firstActiveMonth(year, startDate) {
  if (!startDate) return 1;
  const d = new Date(startDate);
  if (Number.isNaN(d.getTime())) return 1;
  const sy = d.getUTCFullYear();
  const sm = d.getUTCMonth() + 1;
  if (Number(year) < sy) return 13;
  if (Number(year) > sy) return 1;
  return sm;
}

/**
 * Year roll-up used by the money-based progress bars.
 *
 * `expected` only counts months from the partner's start month onward — someone
 * who joined in June is not in arrears for January. Money collected before the
 * start month still counts toward `collected` (it was genuinely given).
 */
export function summariseYear(payments, { partnerId, year, pledge = 0, startDate = '', paymentType = MONTHLY_PLEDGE_TYPE } = {}) {
  const startMonth = firstActiveMonth(year, startDate);
  const months = [];
  let collected = 0;
  let expected = 0;
  let outstanding = 0;
  let paidMonths = 0;
  let partialMonths = 0;
  for (let m = 1; m <= 12; m++) {
    const s = summariseMonth(payments, { partnerId, month: m, year, pledge, paymentType });
    months.push(s);
    collected += s.collected;
    if (m >= startMonth) {
      expected += s.expected;
      outstanding += s.balance;
    }
    if (s.status === 'paid') paidMonths++;
    else if (s.status === 'partial') partialMonths++;
  }
  const pct = expected > 0
    ? Math.min(100, Math.round((collected / expected) * 100))
    : (collected > 0 ? 100 : 0);
  return { months, collected, expected, outstanding, pct, paidMonths, partialMonths, startMonth };
}

/**
 * Spread a lump sum across the selected months, oldest first.
 *
 * Each month absorbs up to its outstanding balance before the next one gets
 * anything, so ₦3,500 against three empty ₦2,000 months settles the first,
 * part-pays the second and leaves the third untouched. Anything still left once
 * every selected month is settled lands on the last month as an overpayment —
 * money in hand always gets recorded somewhere rather than silently dropped.
 *
 * @param {number} total  lump sum received
 * @param {Array<{month:number, expected:number, collected:number, balance:number}>} months
 */
export function allocateAcrossMonths(total, months) {
  const rows = (months || [])
    .map(m => ({
      month: Number(m.month),
      expected: Math.max(0, num(m.expected)),
      collected: Math.max(0, num(m.collected)),
      balance: Math.max(0, num(m.balance)),
    }))
    .sort((a, b) => a.month - b.month);

  let left = Math.max(0, num(total));
  const amounts = rows.map(() => 0);

  rows.forEach((row, i) => {
    if (left <= 0) return;
    const take = Math.min(left, row.balance);
    amounts[i] = take;
    left -= take;
  });

  let overpayment = 0;
  if (left > EPSILON && rows.length) {
    amounts[amounts.length - 1] += left;
    overpayment = left;
    left = 0;
  }

  const allocations = rows.map((row, i) => {
    const amount = amounts[i];
    const collectedAfter = row.collected + amount;
    const { status, balance } = monthPaymentStatus({ collected: collectedAfter, expected: row.expected });
    return {
      month: row.month,
      amount,
      expected: row.expected,
      collectedAfter,
      resultingStatus: status,
      balanceAfter: balance,
    };
  });

  return {
    allocations,
    allocated: allocations.reduce((s, a) => s + a.amount, 0),
    overpayment,
  };
}
