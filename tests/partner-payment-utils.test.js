import test from 'node:test';
import assert from 'node:assert/strict';
import {
  monthPaymentStatus,
  monthInstallments,
  summariseMonth,
  summariseYear,
  firstActiveMonth,
  allocateAcrossMonths,
} from '../src/js/partner-payment-utils.js';

// Minimal shape of an API payment row (see getKpscPartnerPayments).
function pay(overrides = {}) {
  return {
    id: 'kpp_1',
    partnerId: 'p1',
    year: 2026,
    month: 7,
    amount: 2000,
    expectedAmount: 2000,
    paymentType: 'monthly_pledge',
    paid: true,
    createdAt: '2026-07-03T09:00:00.000Z',
    ...overrides,
  };
}

// ── monthPaymentStatus ────────────────────────────────────────────
test('monthPaymentStatus: nothing collected is unpaid and owes the full pledge', () => {
  assert.deepEqual(monthPaymentStatus({ collected: 0, expected: 2000 }), { status: 'unpaid', balance: 2000 });
});

test('monthPaymentStatus: under the pledge is partial with the shortfall', () => {
  assert.deepEqual(monthPaymentStatus({ collected: 500, expected: 2000 }), { status: 'partial', balance: 1500 });
});

test('monthPaymentStatus: exactly the pledge is paid', () => {
  assert.deepEqual(monthPaymentStatus({ collected: 2000, expected: 2000 }), { status: 'paid', balance: 0 });
});

test('monthPaymentStatus: overpayment is paid, never a negative balance', () => {
  assert.deepEqual(monthPaymentStatus({ collected: 3000, expected: 2000 }), { status: 'paid', balance: 0 });
});

test('monthPaymentStatus: floating-point dust does not leave a month short', () => {
  const { status } = monthPaymentStatus({ collected: 1999.999, expected: 2000 });
  assert.equal(status, 'paid');
});

test('monthPaymentStatus: a partner with no pledge is settled by any amount', () => {
  assert.deepEqual(monthPaymentStatus({ collected: 100, expected: 0 }), { status: 'paid', balance: 0 });
  assert.deepEqual(monthPaymentStatus({ collected: 0, expected: 0 }), { status: 'unpaid', balance: 0 });
});

test('monthPaymentStatus: negative and non-numeric inputs are clamped, not propagated', () => {
  assert.deepEqual(monthPaymentStatus({ collected: -500, expected: 2000 }), { status: 'unpaid', balance: 2000 });
  assert.deepEqual(monthPaymentStatus({ collected: 'abc', expected: 2000 }), { status: 'unpaid', balance: 2000 });
  assert.deepEqual(monthPaymentStatus(), { status: 'unpaid', balance: 0 });
});

// ── monthInstallments / summariseMonth ────────────────────────────
test('monthInstallments returns only this partner/month/year, oldest first', () => {
  const rows = [
    pay({ id: 'b', createdAt: '2026-07-20T09:00:00.000Z' }),
    pay({ id: 'a', createdAt: '2026-07-03T09:00:00.000Z' }),
    pay({ id: 'other-month', month: 6 }),
    pay({ id: 'other-year', year: 2025 }),
    pay({ id: 'other-partner', partnerId: 'p2' }),
    pay({ id: 'other-type', paymentType: 'special_seed' }),
    pay({ id: 'unpaid-row', paid: false }),
  ];
  const found = monthInstallments(rows, { partnerId: 'p1', month: 7, year: 2026 });
  assert.deepEqual(found.map(r => r.id), ['a', 'b']);
});

test('summariseMonth: two installments summing to the pledge settle the month', () => {
  const rows = [
    pay({ id: 'a', amount: 500, expectedAmount: 2000, createdAt: '2026-07-03T09:00:00.000Z' }),
    pay({ id: 'b', amount: 1500, expectedAmount: 2000, createdAt: '2026-07-20T09:00:00.000Z' }),
  ];
  const s = summariseMonth(rows, { partnerId: 'p1', month: 7, year: 2026, pledge: 2000 });
  assert.equal(s.collected, 2000);
  assert.equal(s.expected, 2000);
  assert.equal(s.status, 'paid');
  assert.equal(s.balance, 0);
  assert.equal(s.installments.length, 2);
});

test('summariseMonth: a single short installment is partial', () => {
  const rows = [pay({ amount: 500, expectedAmount: 2000 })];
  const s = summariseMonth(rows, { partnerId: 'p1', month: 7, year: 2026, pledge: 2000 });
  assert.equal(s.status, 'partial');
  assert.equal(s.balance, 1500);
});

test('summariseMonth: a month with no rows is unpaid and owes the live pledge', () => {
  const s = summariseMonth([], { partnerId: 'p1', month: 7, year: 2026, pledge: 2000 });
  assert.equal(s.collected, 0);
  assert.equal(s.expected, 2000);
  assert.equal(s.status, 'unpaid');
  assert.equal(s.balance, 2000);
});

test('summariseMonth: the snapshot wins over a pledge raised since — settled months stay settled', () => {
  const rows = [pay({ amount: 2000, expectedAmount: 2000 })];
  const s = summariseMonth(rows, { partnerId: 'p1', month: 7, year: 2026, pledge: 5000 });
  assert.equal(s.expected, 2000);
  assert.equal(s.status, 'paid');
});

test('summariseMonth: legacy rows without a snapshot fall back to the live pledge', () => {
  const rows = [pay({ amount: 2000, expectedAmount: 0 })];
  const s = summariseMonth(rows, { partnerId: 'p1', month: 7, year: 2026, pledge: 2000 });
  assert.equal(s.expected, 2000);
  assert.equal(s.status, 'paid');
});

// ── firstActiveMonth / summariseYear ──────────────────────────────
test('firstActiveMonth: no start date means the whole year is in scope', () => {
  assert.equal(firstActiveMonth(2026, ''), 1);
});

test('firstActiveMonth: start month within the year, earlier year, later year', () => {
  assert.equal(firstActiveMonth(2026, '2026-06-15'), 6);
  assert.equal(firstActiveMonth(2026, '2024-03-01'), 1);
  assert.equal(firstActiveMonth(2026, '2027-01-01'), 13);
});

test('summariseYear: months before the start date are not owed', () => {
  const rows = [pay({ month: 6, amount: 2000, expectedAmount: 2000 })];
  const s = summariseYear(rows, { partnerId: 'p1', year: 2026, pledge: 2000, startDate: '2026-06-01' });
  // June–December = 7 months in scope.
  assert.equal(s.expected, 14000);
  assert.equal(s.collected, 2000);
  assert.equal(s.outstanding, 12000);
  assert.equal(s.paidMonths, 1);
  assert.equal(s.partialMonths, 0);
  assert.equal(s.startMonth, 6);
});

test('summariseYear: counts full and partial months separately and reports a money percentage', () => {
  const rows = [
    pay({ id: 'a', month: 1, amount: 2000, expectedAmount: 2000 }),
    pay({ id: 'b', month: 2, amount: 2000, expectedAmount: 2000 }),
    pay({ id: 'c', month: 3, amount: 500, expectedAmount: 2000 }),
  ];
  const s = summariseYear(rows, { partnerId: 'p1', year: 2026, pledge: 2000 });
  assert.equal(s.paidMonths, 2);
  assert.equal(s.partialMonths, 1);
  assert.equal(s.collected, 4500);
  assert.equal(s.expected, 24000);
  assert.equal(s.outstanding, 19500);
  assert.equal(s.pct, 19);
});

test('summariseYear: a partner with no pledge and no payments reads 0%, not NaN', () => {
  const s = summariseYear([], { partnerId: 'p1', year: 2026, pledge: 0 });
  assert.equal(s.expected, 0);
  assert.equal(s.pct, 0);
});

// ── allocateAcrossMonths ──────────────────────────────────────────
const emptyMonth = m => ({ month: m, expected: 2000, collected: 0, balance: 2000 });

test('allocateAcrossMonths: an exact fit settles every selected month', () => {
  const { allocations, allocated, overpayment } = allocateAcrossMonths(4000, [emptyMonth(1), emptyMonth(2)]);
  assert.deepEqual(allocations.map(a => a.amount), [2000, 2000]);
  assert.deepEqual(allocations.map(a => a.resultingStatus), ['paid', 'paid']);
  assert.equal(allocated, 4000);
  assert.equal(overpayment, 0);
});

test('allocateAcrossMonths: a lump sum fills oldest-first and leaves a partial tail', () => {
  const { allocations } = allocateAcrossMonths(3500, [emptyMonth(1), emptyMonth(2), emptyMonth(3)]);
  assert.deepEqual(allocations.map(a => a.amount), [2000, 1500, 0]);
  assert.deepEqual(allocations.map(a => a.resultingStatus), ['paid', 'partial', 'unpaid']);
  assert.deepEqual(allocations.map(a => a.balanceAfter), [0, 500, 2000]);
});

test('allocateAcrossMonths: months already part-paid only absorb their remaining balance', () => {
  const months = [
    { month: 1, expected: 2000, collected: 1500, balance: 500 },
    { month: 2, expected: 2000, collected: 0, balance: 2000 },
  ];
  const { allocations } = allocateAcrossMonths(1000, months);
  assert.deepEqual(allocations.map(a => a.amount), [500, 500]);
  assert.deepEqual(allocations.map(a => a.resultingStatus), ['paid', 'partial']);
});

test('allocateAcrossMonths: money left after every month is settled lands on the last as an overpayment', () => {
  const { allocations, overpayment } = allocateAcrossMonths(5000, [emptyMonth(1), emptyMonth(2)]);
  assert.deepEqual(allocations.map(a => a.amount), [2000, 3000]);
  assert.equal(overpayment, 1000);
  assert.deepEqual(allocations.map(a => a.resultingStatus), ['paid', 'paid']);
});

test('allocateAcrossMonths: months are always filled in calendar order regardless of input order', () => {
  const { allocations } = allocateAcrossMonths(2000, [emptyMonth(5), emptyMonth(2)]);
  assert.deepEqual(allocations.map(a => a.month), [2, 5]);
  assert.deepEqual(allocations.map(a => a.amount), [2000, 0]);
});

test('allocateAcrossMonths: no months or no money allocates nothing', () => {
  assert.deepEqual(allocateAcrossMonths(5000, []).allocations, []);
  assert.equal(allocateAcrossMonths(5000, []).overpayment, 0);
  assert.deepEqual(allocateAcrossMonths(0, [emptyMonth(1)]).allocations.map(a => a.amount), [0]);
});
