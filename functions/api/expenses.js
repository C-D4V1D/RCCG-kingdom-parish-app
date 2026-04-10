// functions/api/expenses.js
// GET  /api/expenses -> all expense records
// POST /api/expenses -> create expense

import { json, err, ok, handleOptions, uid, now } from './_helpers.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();
  const DB = env.DB;

  if (request.method === 'GET') {
    const { results } = await DB.prepare(
      'SELECT * FROM expenses ORDER BY date DESC, created_at DESC'
    ).all();
    return json(results.map(r => ({
      id: r.id,
      date: r.date,
      category: r.category,
      description: r.description,
      amount: r.amount,
      receiptNo: r.receipt_no,
      paymentMethod: r.payment_method,
      notes: r.notes,
      recordedBy: r.recorded_by,
      pettyRef: r.petty_ref,
      status: r.status,
      createdAt: r.created_at
    })));
  }

  if (request.method === 'POST') {
    const b = await request.json();
    if (!b.date || !b.category || !b.description || !b.amount)
      return err('date, category, description and amount are required.');
    const id = 'EXP-' + uid();
    const createdAt = now();
    await DB.prepare(`
      INSERT INTO expenses (
        id, date, category, description, amount,
        receipt_no, payment_method, notes, recorded_by, petty_ref, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, b.date, b.category, b.description, b.amount,
      b.receiptNo || '', b.paymentMethod || 'petty_cash',
      b.notes || '', b.recordedBy || '', b.pettyRef || '',
      b.status || 'approved', createdAt
    ).run();
    await DB.prepare(
      'INSERT INTO audit_log (id, type, detail, by_user, ts) VALUES (?, ?, ?, ?, ?)'
    ).bind(uid(), 'expense_logged', `Expense: ${b.description} — ₦${b.amount}`, b.recordedBy || 'System', now()).run();
    return ok({ id, createdAt });
  }

  return err('Method not allowed', 405);
}
