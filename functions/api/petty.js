// functions/api/petty.js
// GET   /api/petty      -> { float, max, history }
// POST  /api/petty      -> create request or refill
// PATCH /api/petty/:id  -> approve / reject / settle

import { json, err, ok, handleOptions, uid, now } from './_helpers.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();
  const DB = env.DB;

  if (request.method === 'GET') {
    const floatRow = await DB.prepare('SELECT * FROM petty_float WHERE id = 1').first();
    const { results: history } = await DB.prepare(
      'SELECT * FROM petty_cash ORDER BY created_at DESC'
    ).all();
    return json({
      float: floatRow?.float_amount ?? 50000,
      max:   floatRow?.max_amount   ?? 50000,
      history: history.map(toCamel)
    });
  }

  if (request.method === 'POST') {
    const b = await request.json();
    const id = (b.type === 'refill' ? 'RF-' : 'PC-') + uid();
    const createdAt = now();

    if (b.type === 'refill') {
      // Add to float
      const floatRow = await DB.prepare('SELECT * FROM petty_float WHERE id = 1').first();
      const current = floatRow?.float_amount ?? 50000;
      const max = floatRow?.max_amount ?? 50000;
      const space = max - current;
      const actualAdded = Math.min(b.amount, space);
      await DB.prepare(
        'UPDATE petty_float SET float_amount = ? WHERE id = 1'
      ).bind(current + actualAdded).run();
      await DB.prepare(`
        INSERT INTO petty_cash (id, type, purpose, amount, reference, authorized_by, requested_by, status, created_at)
        VALUES (?, 'refill', 'Float Refill', ?, ?, ?, ?, 'settled', ?)
      `).bind(id, actualAdded, b.reference || '', b.authorizedBy || '', b.requestedBy || '', createdAt).run();
      await audit(DB, 'petty_refilled', `Float refilled: ₦${actualAdded} (auth: ${b.authorizedBy})`, b.requestedBy);
      return ok({ id, actualAdded, newFloat: current + actualAdded });
    }

    // New request
    if (!b.purpose || !b.amount) return err('purpose and amount are required.');
    await DB.prepare(`
      INSERT INTO petty_cash (id, type, purpose, amount, category, date_needed, notes, requested_by, status, created_at)
      VALUES (?, 'request', ?, ?, ?, ?, ?, ?, 'pending_approval', ?)
    `).bind(id, b.purpose, b.amount, b.category || '', b.dateNeeded || '', b.notes || '', b.requestedBy || '', createdAt).run();
    await audit(DB, 'petty_requested', `Petty cash requested: ${b.purpose} — ₦${b.amount}`, b.requestedBy);
    await notify(DB, 'Petty Cash Request', `${b.requestedBy} requested ₦${b.amount} for "${b.purpose}"`, 'warn');
    return ok({ id, createdAt });
  }

  if (request.method === 'PATCH') {
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();
    const b = await request.json();
    const req = await DB.prepare('SELECT * FROM petty_cash WHERE id = ?').bind(id).first();
    if (!req) return err('Record not found.', 404);

    if (b.action === 'approve') {
      const floatRow = await DB.prepare('SELECT * FROM petty_float WHERE id = 1').first();
      const current = floatRow?.float_amount ?? 0;
      if (req.amount > current)
        return err(`Insufficient float. Available: ₦${current}, Required: ₦${req.amount}`);
      await DB.prepare(
        'UPDATE petty_cash SET status = ?, approved_by = ?, approved_at = ? WHERE id = ?'
      ).bind('approved', b.approvedBy, now(), id).run();
      await DB.prepare(
        'UPDATE petty_float SET float_amount = ? WHERE id = 1'
      ).bind(current - req.amount).run();
      await audit(DB, 'petty_approved', `Approved: "${req.purpose}" — ₦${req.amount}`, b.approvedBy);
      await notify(DB, 'Petty Cash Approved', `"${req.purpose}" approved by ${b.approvedBy}. Return receipt within 48hrs.`, 'success');
      return ok({ newFloat: current - req.amount });
    }

    if (b.action === 'reject') {
      await DB.prepare(
        'UPDATE petty_cash SET status = ?, rejected_by = ?, rejection_reason = ?, rejected_at = ? WHERE id = ?'
      ).bind('rejected', b.rejectedBy, b.reason || 'No reason given', now(), id).run();
      await audit(DB, 'petty_rejected', `Rejected: "${req.purpose}" — ${b.reason}`, b.rejectedBy);
      await notify(DB, 'Petty Cash Rejected', `"${req.purpose}" rejected. Reason: ${b.reason}`, 'warn');
      return ok();
    }

    if (b.action === 'settle') {
      if (!b.receiptNo) return err('Receipt number is required.');
      const actualAmt = b.actualAmount ?? req.amount;
      let changeReturned = 0;
      if (actualAmt < req.amount) {
        changeReturned = req.amount - actualAmt;
        const floatRow = await DB.prepare('SELECT * FROM petty_float WHERE id = 1').first();
        await DB.prepare(
          'UPDATE petty_float SET float_amount = ? WHERE id = 1'
        ).bind((floatRow?.float_amount ?? 0) + changeReturned).run();
      }
      await DB.prepare(`
        UPDATE petty_cash SET
          status = 'settled', receipt_no = ?, actual_amount = ?, vendor = ?,
          settled_by = ?, settled_at = ?, change_returned = ?
        WHERE id = ?
      `).bind(b.receiptNo, actualAmt, b.vendor || '', b.settledBy || '', now(), changeReturned, id).run();
      await audit(DB, 'petty_settled', `Settled: "${req.purpose}" — ₦${actualAmt}, Receipt: ${b.receiptNo}`, b.settledBy);
      return ok({ changeReturned });
    }

    if (b.action === 'update_max') {
      await DB.prepare('UPDATE petty_float SET max_amount = ? WHERE id = 1').bind(b.max).run();
      return ok();
    }

    return err('Unknown action.');
  }

  return err('Method not allowed', 405);
}

function toCamel(r) {
  return {
    id: r.id,
    type: r.type,
    purpose: r.purpose,
    amount: r.amount,
    actualAmount: r.actual_amount,
    category: r.category,
    dateNeeded: r.date_needed,
    notes: r.notes,
    requestedBy: r.requested_by,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    rejectedBy: r.rejected_by,
    rejectionReason: r.rejection_reason,
    rejectedAt: r.rejected_at,
    settledBy: r.settled_by,
    settledAt: r.settled_at,
    receiptNo: r.receipt_no,
    vendor: r.vendor,
    changeReturned: r.change_returned,
    reference: r.reference,
    authorizedBy: r.authorized_by,
    status: r.status,
    createdAt: r.created_at
  };
}

async function audit(DB, type, detail, by) {
  await DB.prepare(
    'INSERT INTO audit_log (id, type, detail, by_user, ts) VALUES (?, ?, ?, ?, ?)'
  ).bind(uid(), type, detail, by || 'System', now()).run();
}

async function notify(DB, title, body, type = 'info') {
  await DB.prepare(
    'INSERT INTO notifications (id, title, body, type, ts) VALUES (?, ?, ?, ?, ?)'
  ).bind(uid(), title, body, type, now()).run();
}
