// POST /api/internal/remittance-receipt on fake data: October's real shape (bill 79,189.41, receipt debit 79,289.41), fake receipt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';
import { planReceipt, checkRead } from '../functions/_lib/receipt-record.js';

function fakeDb() {
  const rows = { remittances: [], expenses: [], audit: [] };
  return { rows, prepare(sql) {
    let a = [];
    const st = { bind(...x) { a = x; return st; },
      async first() { if (/FROM remittances WHERE reference/.test(sql)) return rows.remittances.find(r => r.reference === a[0] && r.part === a[1] && r.period_from === a[2]) || null; return null; },
      async all() { return { results: [] }; },
      async run() {
        if (/INSERT INTO remittances/.test(sql)) rows.remittances.push({ id: a[0], label: a[1], amount: a[2], paid_date: a[3], reference: a[4], status: a[6], period_from: a[7], payment_method: a[9], notes: a[10], bank_amount: a[12], due: a[14], part: a[15] });
        else if (/INSERT INTO expenses/.test(sql)) rows.expenses.push({ id: a[0], date: a[1], category: a[2], subcategory: a[3], amount: a[5], receipt_no: a[6], receipt_image: a[7] });
        else rows.audit.push(a);
        return { meta: { changes: 1 } };
      } };
    return st;
  } };
}
const RRR = '161528198373';
const READ = { amount: 79289.41, date: '2026-10-21', reference: 'FAKE|REF|1', rrr: RRR };
const body = (o = {}) => ({ action: 'record', rrr: RRR, billAmount: 79189.41, part: 'a', label: 'Part A', periodFrom: '2026-09-21', periodTo: '2026-10-21', by: 'script', read: READ, ...o });
const call = async (DB, b, token = 'wt') => {
  const res = await onRequest({ request: new Request('https://example.com/api/internal/remittance-receipt', { method: 'POST', headers: { 'x-watchdog-token': token, 'content-type': 'application/json' }, body: JSON.stringify(b) }), env: { DB, CLERK_WATCHDOG_TOKEN: 'wt' }, params: { route: ['internal', 'remittance-receipt'] } });
  return { status: res.status, json: await res.json().catch(() => null) };
};

test('rules: bill vs receipt, and the receipt checks', () => {
  assert.deepEqual(planReceipt({ billAmount: 79189.41, receiptAmount: 79289.41 }), { status: 'ok', bill: 79189.41, charge: 100 });
  assert.equal(planReceipt({ billAmount: 79189.41, receiptAmount: 79189.41 }).charge, 0);
  assert.equal(planReceipt({ billAmount: 100, receiptAmount: 99 }).status, 'needsPerson');
  assert.equal(planReceipt({ billAmount: 100, receiptAmount: 0 }).status, 'needsPerson');
  assert.equal(checkRead(READ, { rrr: RRR, today: '2026-10-22' }), '');
  assert.match(checkRead({ ...READ, rrr: '999999999999' }, { rrr: RRR, today: '2026-10-22' }), /not 161528198373/);
  assert.match(checkRead({ ...READ, rrr: '' }, { rrr: RRR, today: '2026-10-22' }), /no RRR/);
  assert.match(checkRead({ ...READ, date: '2026-12-01' }, { rrr: RRR, today: '2026-10-22' }), /future/);
});

test('endpoint: wrong token refused, nothing saved', async () => {
  const DB = fakeDb(); const r = await call(DB, body(), 'nope');
  assert.equal(r.status, 401); assert.equal(DB.rows.remittances.length, 0);
});

test('endpoint: preview saves nothing; record saves the payment at the bill and the 100.00 charge; a repeat changes nothing', async () => {
  const DB = fakeDb();
  const p = await call(DB, body({ action: 'preview' }));
  assert.equal(p.json.wouldRecord.charge, 100); assert.equal(DB.rows.remittances.length, 0);
  const r = await call(DB, body({ receipt: { imageBase64: 'AAAA', mimeType: 'image/png', name: 'fake.png' } }));
  assert.equal(r.json.ok, true);
  assert.equal(DB.rows.remittances.length, 1);
  const rem = DB.rows.remittances[0];
  assert.equal(rem.amount, 79189.41); assert.equal(rem.due, 79189.41); assert.equal(rem.status, 'paid'); assert.equal(rem.part, 'a'); assert.equal(rem.paid_date, '2026-10-21'); assert.equal(rem.payment_method, 'bank_transfer');
  assert.equal(DB.rows.expenses.length, 1);
  const ex = DB.rows.expenses[0]; assert.equal(ex.amount, 100); assert.equal(ex.category, 'bank'); assert.match(ex.receipt_image, /^data:image\/png;base64,AAAA/);
  const again = await call(DB, body()); assert.equal(again.json.already, true);
  assert.equal(DB.rows.remittances.length, 1); assert.equal(DB.rows.expenses.length, 1);
});

test('endpoint: receipt equal to the bill records the payment and no expense', async () => {
  const DB = fakeDb(); const r = await call(DB, body({ read: { ...READ, amount: 79189.41 } }));
  assert.equal(r.json.ok, true); assert.equal(DB.rows.remittances.length, 1); assert.equal(DB.rows.expenses.length, 0);
});

test('endpoint: anything wrong goes back as needsPerson and nothing is saved', async () => {
  for (const o of [{ read: { ...READ, rrr: '111111111111' } }, { read: { ...READ, amount: 70000 } }, { read: { ...READ, reference: '' } }, { read: { ...READ, date: '2099-01-01' } }, { read: null }]) {
    const DB = fakeDb(); const r = await call(DB, body(o));
    assert.equal(r.json.ok, false, JSON.stringify(o)); assert.ok(r.json.needsPerson);
    assert.equal(DB.rows.remittances.length + DB.rows.expenses.length, 0);
  }
});
