// functions/api/remittances.js
// GET  /api/remittances -> all remittance payment records
// POST /api/remittances -> record a payment

import { json, err, ok, handleOptions, uid, now } from './_helpers.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();
  const DB = env.DB;

  if (request.method === 'GET') {
    const { results } = await DB.prepare(
      'SELECT * FROM remittances ORDER BY paid_date DESC, created_at DESC'
    ).all();
    return json(results.map(r => ({
      id: r.id,
      label: r.label,
      amount: r.amount,
      paidDate: r.paid_date,
      reference: r.reference,
      authorizedBy: r.authorized_by,
      status: r.status,
      createdAt: r.created_at
    })));
  }

  if (request.method === 'POST') {
    const b = await request.json();
    if (!b.label || !b.amount || !b.paidDate)
      return err('label, amount and paidDate are required.');
    const id = 'REM-' + uid();
    const createdAt = now();
    await DB.prepare(`
      INSERT INTO remittances (id, label, amount, paid_date, reference, authorized_by, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, b.label, b.amount, b.paidDate, b.reference || '', b.authorizedBy || '', 'paid', createdAt).run();
    await DB.prepare(
      'INSERT INTO audit_log (id, type, detail, by_user, ts) VALUES (?, ?, ?, ?, ?)'
    ).bind(uid(), 'remittance_paid', `Remittance: ${b.label} — ₦${b.amount}`, b.authorizedBy || 'System', now()).run();
    return ok({ id, createdAt });
  }

  return err('Method not allowed', 405);
}
