// functions/api/income.js
// GET   /api/income     -> all income records
// POST  /api/income     -> create record
// PATCH /api/income/:id -> update (e.g. confirm deposit)

import { json, err, ok, handleOptions, uid, now } from './_helpers.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();
  const DB = env.DB;

  if (request.method === 'GET') {
    const { results } = await DB.prepare(
      'SELECT * FROM income ORDER BY date DESC, created_at DESC'
    ).all();
    // Convert snake_case to camelCase for frontend compatibility
    return json(results.map(toCamel));
  }

  if (request.method === 'POST') {
    const b = await request.json();
    const id = 'INC-' + uid();
    const createdAt = now();
    await DB.prepare(`
      INSERT INTO income (
        id, date, members_tithe, ministers_tithe, thanksgiving,
        sunday_school, slo, crm, workers_offering, children_offering,
        total_collection, usher, recorded_by, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, b.date,
      b.membersTithe || 0, b.ministersTithe || 0, b.thanksgiving || 0,
      b.sundaySchool || 0, b.slo || 0, b.crm || 0,
      b.workersOffering || 0, b.childrenOffering || 0,
      b.totalCollection || 0,
      b.usher || '', b.recordedBy || '', b.notes || '', createdAt
    ).run();
    await audit(DB, 'income_recorded', `Income recorded: ₦${b.totalCollection} for ${b.date}`, b.recordedBy);
    return ok({ id, createdAt });
  }

  if (request.method === 'PATCH') {
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();
    const b = await request.json();
    // Used for confirming bank deposit
    await DB.prepare(`
      UPDATE income SET
        deposit_confirmed = ?, teller_no = ?, deposited_by = ?, deposit_date = ?
      WHERE id = ?
    `).bind(
      b.depositConfirmed ? 1 : 0,
      b.tellerNo || '', b.depositedBy || '',
      b.depositDate || now(), id
    ).run();
    await audit(DB, 'deposit_confirmed', `Deposit confirmed for ${id} — Teller: ${b.tellerNo}`, b.depositedBy);
    return ok();
  }

  return err('Method not allowed', 405);
}

function toCamel(r) {
  return {
    id: r.id,
    date: r.date,
    membersTithe: r.members_tithe,
    ministersTithe: r.ministers_tithe,
    thanksgiving: r.thanksgiving,
    sundaySchool: r.sunday_school,
    slo: r.slo,
    crm: r.crm,
    workersOffering: r.workers_offering,
    childrenOffering: r.children_offering,
    totalCollection: r.total_collection,
    usher: r.usher,
    recordedBy: r.recorded_by,
    depositConfirmed: r.deposit_confirmed === 1,
    tellerNo: r.teller_no,
    depositedBy: r.deposited_by,
    depositDate: r.deposit_date,
    notes: r.notes,
    createdAt: r.created_at
  };
}

async function audit(DB, type, detail, by) {
  await DB.prepare(
    'INSERT INTO audit_log (id, type, detail, by_user, ts) VALUES (?, ?, ?, ?, ?)'
  ).bind(uid(), type, detail, by || 'System', now()).run();
}
