import test from 'node:test';
import assert from 'node:assert/strict';
import { mapReceiptOcrToFormFields } from '../src/js/receipt-ocr-utils.js';

// ── Full response ─────────────────────────────────────────────────────────────
test('mapReceiptOcrToFormFields — full response maps all fields', () => {
  const result = mapReceiptOcrToFormFields({
    vendor: 'Shoprite',
    date: '2025-11-20',
    amount: 12500.0,
    currency: 'NGN',
    reference: 'RCP-00123',
    itemsSummary: 'Groceries and cleaning supplies',
  });
  assert.equal(result.date, '2025-11-20');
  assert.equal(result.amount, 12500.0);
  assert.equal(result.ref, 'RCP-00123');
  assert.equal(result.note, 'Shoprite — Groceries and cleaning supplies');
});

// ── All-null response ─────────────────────────────────────────────────────────
test('mapReceiptOcrToFormFields — all-null response returns all nulls', () => {
  const result = mapReceiptOcrToFormFields({
    vendor: null, date: null, amount: null,
    currency: null, reference: null, itemsSummary: null,
  });
  assert.equal(result.date, null);
  assert.equal(result.amount, null);
  assert.equal(result.ref, null);
  assert.equal(result.note, null);
});

// ── Partial response (only amount) ───────────────────────────────────────────
test('mapReceiptOcrToFormFields — partial response (only amount) fills amount only', () => {
  const result = mapReceiptOcrToFormFields({ amount: 500 });
  assert.equal(result.amount, 500);
  assert.equal(result.date, null);
  assert.equal(result.ref, null);
  assert.equal(result.note, null);
});

// ── Invalid date strings are rejected ────────────────────────────────────────
test('mapReceiptOcrToFormFields — invalid date string "yesterday" returns null date', () => {
  const result = mapReceiptOcrToFormFields({ date: 'yesterday', amount: 1000 });
  assert.equal(result.date, null);
  assert.equal(result.amount, 1000);
});

test('mapReceiptOcrToFormFields — partial date "2025-11" returns null date', () => {
  const result = mapReceiptOcrToFormFields({ date: '2025-11' });
  assert.equal(result.date, null);
});

test('mapReceiptOcrToFormFields — ambiguous date "20/11/2025" returns null date', () => {
  const result = mapReceiptOcrToFormFields({ date: '20/11/2025' });
  assert.equal(result.date, null);
});

// ── Negative amount is rejected ───────────────────────────────────────────────
test('mapReceiptOcrToFormFields — negative amount returns null', () => {
  const result = mapReceiptOcrToFormFields({ amount: -500 });
  assert.equal(result.amount, null);
});

// ── Comma-separated amount string is parsed ───────────────────────────────────
test('mapReceiptOcrToFormFields — comma-separated amount string "12,500.50" is parsed', () => {
  const result = mapReceiptOcrToFormFields({ amount: '12,500.50' });
  assert.equal(result.amount, 12500.50);
});

// ── Reference fallback to vendor ──────────────────────────────────────────────
test('mapReceiptOcrToFormFields — reference falls back to vendor when reference is null', () => {
  const result = mapReceiptOcrToFormFields({ vendor: 'Tantalizers', reference: null });
  assert.equal(result.ref, 'Tantalizers');
});

// ── Note: only vendor when itemsSummary missing ───────────────────────────────
test('mapReceiptOcrToFormFields — note is just vendor when itemsSummary is null', () => {
  const result = mapReceiptOcrToFormFields({ vendor: 'NNPC', itemsSummary: null });
  assert.equal(result.note, 'NNPC');
});

// ── Note: only itemsSummary when vendor missing ───────────────────────────────
test('mapReceiptOcrToFormFields — note is just itemsSummary when vendor is null', () => {
  const result = mapReceiptOcrToFormFields({ vendor: null, itemsSummary: 'Fuel purchase' });
  assert.equal(result.note, 'Fuel purchase');
});
