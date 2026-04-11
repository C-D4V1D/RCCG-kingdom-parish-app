// ================================================================
// RCCG Kingdom Parish — Cloudflare Pages Functions API
// Handles all database operations via D1
// Binding name: DB (set in Cloudflare dashboard)
// ================================================================

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function ok(data)  { return new Response(JSON.stringify(data), { headers: CORS }) }
function err(msg, status=500) { return new Response(JSON.stringify({ error: msg }), { status, headers: CORS }) }
function id(prefix='') { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6) }

// ──────────────────────────────────────────
// ROUTER
// ──────────────────────────────────────────
export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const route = (params.route || []).join('/');
  const method = request.method;
  const url = new URL(request.url);

  try {
    const DB = env.DB;
    if (!DB) return err('Database not connected. Check Cloudflare D1 binding named "DB".', 503);

    // ── Init ──
    if (route === 'init') return await initDB(DB);

    // ── Users ──
    if (route === 'users') {
      if (method === 'GET')  return await getUsers(DB);
      if (method === 'POST') return await addUser(DB, await request.json());
    }
    if (route.startsWith('users/')) {
      const uid = route.split('/')[1];
      if (method === 'PUT')    return await updateUser(DB, uid, await request.json());
      if (method === 'DELETE') return await deleteUser(DB, uid);
    }

    // ── Income ──
    if (route === 'income') {
      if (method === 'GET')  return await getIncome(DB, url.searchParams);
      if (method === 'POST') return await addIncome(DB, await request.json());
    }
    if (route.startsWith('income/')) {
      const iid = route.split('/')[1];
      if (method === 'PUT') return await updateIncome(DB, iid, await request.json());
    }

    // ── Expenses ──
    if (route === 'expenses') {
      if (method === 'GET')  return await getExpenses(DB, url.searchParams);
      if (method === 'POST') return await addExpense(DB, await request.json());
    }

    // ── Petty Cash ──
    if (route === 'petty') {
      if (method === 'GET')  return await getPetty(DB);
      if (method === 'POST') return await addPettyEntry(DB, await request.json());
    }
    if (route.startsWith('petty/')) {
      const pid = route.split('/')[1];
      if (method === 'PUT') return await updatePettyEntry(DB, pid, await request.json());
    }
    if (route === 'petty-config') {
      if (method === 'GET')  return await getPettyConfig(DB);
      if (method === 'POST') return await savePettyConfig(DB, await request.json());
    }

    // ── Remittances ──
    if (route === 'remittances') {
      if (method === 'GET')  return await getRemittances(DB, url.searchParams);
      if (method === 'POST') return await addRemittance(DB, await request.json());
    }

    // ── Audit ──
    if (route === 'audit') {
      if (method === 'GET')  return await getAudit(DB);
      if (method === 'POST') return await addAudit(DB, await request.json());
    }

    // ── Settings ──
    if (route === 'settings') {
      if (method === 'GET')  return await getSettings(DB);
      if (method === 'POST') return await saveSettings(DB, await request.json());
    }

    // ── Notifications ──
    if (route === 'notifications') {
      if (method === 'GET')  return await getNotifications(DB);
      if (method === 'POST') return await addNotification(DB, await request.json());
    }
    if (route === 'notifications/read') {
      if (method === 'POST') return await markNotificationsRead(DB);
    }

    return err(`Route not found: ${method} /api/${route}`, 404);
  } catch (e) {
    console.error('API error:', e);
    return err(e.message || 'Unexpected server error');
  }
}

// ──────────────────────────────────────────
// DB INIT — creates all tables
// ──────────────────────────────────────────
async function initDB(DB) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      pin TEXT NOT NULL,
      email TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS income (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      members_tithe REAL DEFAULT 0,
      ministers_tithe REAL DEFAULT 0,
      thanksgiving REAL DEFAULT 0,
      sunday_school REAL DEFAULT 0,
      slo REAL DEFAULT 0,
      crm REAL DEFAULT 0,
      workers_offering REAL DEFAULT 0,
      children_offering REAL DEFAULT 0,
      total_collection REAL DEFAULT 0,
      usher TEXT DEFAULT '',
      recorded_by TEXT DEFAULT '',
      deposit_confirmed INTEGER DEFAULT 0,
      teller_no TEXT DEFAULT '',
      deposited_by TEXT DEFAULT '',
      deposit_date TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL DEFAULT 0,
      receipt_no TEXT DEFAULT '',
      payment_method TEXT DEFAULT 'petty_cash',
      notes TEXT DEFAULT '',
      recorded_by TEXT DEFAULT '',
      petty_ref TEXT DEFAULT '',
      status TEXT DEFAULT 'approved',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS petty_cash (
      id TEXT PRIMARY KEY,
      type TEXT DEFAULT 'request',
      purpose TEXT NOT NULL,
      amount REAL DEFAULT 0,
      actual_amount REAL,
      category TEXT DEFAULT '',
      date_needed TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      requested_by TEXT DEFAULT '',
      approved_by TEXT DEFAULT '',
      approved_at TEXT DEFAULT '',
      rejected_by TEXT DEFAULT '',
      rejection_reason TEXT DEFAULT '',
      rejected_at TEXT DEFAULT '',
      receipt_no TEXT DEFAULT '',
      settled_at TEXT DEFAULT '',
      settled_by TEXT DEFAULT '',
      change_returned REAL DEFAULT 0,
      vendor TEXT DEFAULT '',
      reference TEXT DEFAULT '',
      authorized_by TEXT DEFAULT '',
      status TEXT DEFAULT 'pending_approval',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS petty_config (
      id TEXT PRIMARY KEY DEFAULT 'main',
      float_amount REAL DEFAULT 50000,
      max_float REAL DEFAULT 50000
    )`,
    `CREATE TABLE IF NOT EXISTS remittances (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      amount REAL DEFAULT 0,
      paid_date TEXT DEFAULT '',
      reference TEXT DEFAULT '',
      authorized_by TEXT DEFAULT '',
      status TEXT DEFAULT 'paid',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      detail TEXT NOT NULL,
      by_user TEXT DEFAULT '',
      ts TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      ts TEXT DEFAULT (datetime('now'))
    )`,
    // Seed default petty config if not exists
    `INSERT OR IGNORE INTO petty_config (id, float_amount, max_float) VALUES ('main', 50000, 50000)`,
    // Seed default settings
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('churchName', 'RCCG Kingdom Parish, Aguleri')`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('bankName', '')`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('accountNo', '')`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('quotas', '{"rmf":5000,"csr":3000,"edu":2000,"camp":5000,"mummy":8000,"volunteer":2000,"goFishing":10000}')`,
  ];

  // Step 1: Run all CREATE TABLE statements first — tables must exist before we query them
  for (const sql of statements) {
    try { await DB.prepare(sql).run(); } catch(e) { console.error('Init SQL error:', sql, e.message); }
  }

  // Step 2: NOW safe to query users — seed default users only if table is empty
  try {
    const row = await DB.prepare('SELECT COUNT(*) as c FROM users').first();
    if ((row?.c || 0) === 0) {
      const seeds = [
        "INSERT OR REPLACE INTO users (id,name,role,pin,email) VALUES ('u1','IT Administrator','it_admin','0000','it@kpaguleri.org')",
        "INSERT OR REPLACE INTO users (id,name,role,pin,email) VALUES ('u2','Rev. Emmanuel Obi','pastor','1111','pastor@kpaguleri.org')",
        "INSERT OR REPLACE INTO users (id,name,role,pin,email) VALUES ('u3','Bro. Chukwuemeka Nze','accountant','2222','accounts@kpaguleri.org')",
        "INSERT OR REPLACE INTO users (id,name,role,pin,email) VALUES ('u4','Sis. Adaeze Okonkwo','admin_officer','3333','admin@kpaguleri.org')",
        "INSERT OR REPLACE INTO users (id,name,role,pin,email) VALUES ('u5','Elder Paul Okafor','signatory','4444','elder1@kpaguleri.org')",
        "INSERT OR REPLACE INTO users (id,name,role,pin,email) VALUES ('u6','Elder James Eze','signatory','4444','elder2@kpaguleri.org')",
        "INSERT OR REPLACE INTO users (id,name,role,pin,email) VALUES ('u7','Visitor Access','viewer','9999','')",
      ];
      for (const sql of seeds) {
        try { await DB.prepare(sql).run(); } catch(e) { console.error('Seed error:', e.message); }
      }
    }
  } catch(e) { console.error('Seed check failed:', e.message); }

  return ok({ success: true, message: 'Database initialised. All tables created and default users seeded.' });
}

// ──────────────────────────────────────────
// USERS
// ──────────────────────────────────────────
async function getUsers(DB) {
  const { results } = await DB.prepare('SELECT * FROM users ORDER BY role, name').all();
  return ok(results || []);
}

async function addUser(DB, data) {
  const { name, role, pin, email='' } = data;
  if (!name || !role || !pin) return err('name, role, and pin are required', 400);
  const uid = id('u');
  await DB.prepare('INSERT INTO users (id,name,role,pin,email) VALUES (?,?,?,?,?)')
    .bind(uid, name, role, pin, email).run();
  return ok({ id: uid, name, role, pin, email });
}

async function updateUser(DB, uid, data) {
  const user = await DB.prepare('SELECT * FROM users WHERE id=?').bind(uid).first();
  if (!user) return err('User not found', 404);
  const name  = data.name  || user.name;
  const role  = data.role  || user.role;
  const email = data.email ?? user.email;
  const pin   = (data.pin && data.pin.length >= 4) ? data.pin : user.pin;
  await DB.prepare('UPDATE users SET name=?,role=?,email=?,pin=? WHERE id=?')
    .bind(name, role, email, pin, uid).run();
  return ok({ id: uid, name, role, email });
}

async function deleteUser(DB, uid) {
  await DB.prepare('DELETE FROM users WHERE id=?').bind(uid).run();
  return ok({ deleted: uid });
}

// ──────────────────────────────────────────
// INCOME
// ──────────────────────────────────────────
async function getIncome(DB, params) {
  let sql = 'SELECT * FROM income ORDER BY date DESC, created_at DESC';
  const { results } = await DB.prepare(sql).all();
  return ok((results || []).map(row => ({
    id: row.id, date: row.date,
    membersTithe: row.members_tithe, ministersTithe: row.ministers_tithe,
    thanksgiving: row.thanksgiving, sundaySchool: row.sunday_school,
    slo: row.slo, crm: row.crm, workersOffering: row.workers_offering,
    childrenOffering: row.children_offering, totalCollection: row.total_collection,
    usher: row.usher, recordedBy: row.recorded_by,
    depositConfirmed: !!row.deposit_confirmed, tellerNo: row.teller_no,
    depositedBy: row.deposited_by, depositDate: row.deposit_date,
    notes: row.notes, createdAt: row.created_at
  })));
}

async function addIncome(DB, data) {
  const rid = id('INC-');
  await DB.prepare(`INSERT INTO income
    (id,date,members_tithe,ministers_tithe,thanksgiving,sunday_school,slo,crm,
     workers_offering,children_offering,total_collection,usher,recorded_by,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(rid, data.date,
      data.membersTithe||0, data.ministersTithe||0, data.thanksgiving||0,
      data.sundaySchool||0, data.slo||0, data.crm||0,
      data.workersOffering||0, data.childrenOffering||0, data.totalCollection||0,
      data.usher||'', data.recordedBy||'', data.notes||''
    ).run();
  return ok({ ...data, id: rid });
}

async function updateIncome(DB, iid, data) {
  if (data.depositConfirmed !== undefined) {
    await DB.prepare(
      'UPDATE income SET deposit_confirmed=?,teller_no=?,deposited_by=?,deposit_date=? WHERE id=?'
    ).bind(data.depositConfirmed?1:0, data.tellerNo||'', data.depositedBy||'', data.depositDate||'', iid).run();
  }
  return ok({ id: iid, updated: true });
}

// ──────────────────────────────────────────
// EXPENSES
// ──────────────────────────────────────────
async function getExpenses(DB) {
  const { results } = await DB.prepare('SELECT * FROM expenses ORDER BY date DESC, created_at DESC').all();
  return ok((results || []).map(row => ({
    id: row.id, date: row.date, category: row.category,
    description: row.description, amount: row.amount,
    receiptNo: row.receipt_no, paymentMethod: row.payment_method,
    notes: row.notes, recordedBy: row.recorded_by,
    pettyRef: row.petty_ref, status: row.status, createdAt: row.created_at
  })));
}

async function addExpense(DB, data) {
  const eid = data.id || id('EXP-');
  await DB.prepare(`INSERT INTO expenses
    (id,date,category,description,amount,receipt_no,payment_method,notes,recorded_by,petty_ref,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(eid, data.date||new Date().toISOString().split('T')[0],
      data.category||'', data.description||'', data.amount||0,
      data.receiptNo||'', data.paymentMethod||'petty_cash',
      data.notes||'', data.recordedBy||'', data.pettyRef||'', data.status||'approved'
    ).run();
  return ok({ ...data, id: eid });
}

// ──────────────────────────────────────────
// PETTY CASH
// ──────────────────────────────────────────
async function getPettyConfig(DB) {
  const row = await DB.prepare('SELECT * FROM petty_config WHERE id=?').bind('main').first();
  return ok({ float: row?.float_amount||50000, max: row?.max_float||50000 });
}

async function savePettyConfig(DB, data) {
  await DB.prepare('UPDATE petty_config SET float_amount=?,max_float=? WHERE id=?')
    .bind(data.float, data.max, 'main').run();
  return ok({ float: data.float, max: data.max });
}

async function getPetty(DB) {
  const { results } = await DB.prepare('SELECT * FROM petty_cash ORDER BY created_at DESC').all();
  return ok((results || []).map(row => ({
    id: row.id, type: row.type, purpose: row.purpose,
    amount: row.amount, actualAmount: row.actual_amount,
    category: row.category, dateNeeded: row.date_needed,
    notes: row.notes, requestedBy: row.requested_by,
    approvedBy: row.approved_by, approvedAt: row.approved_at,
    rejectedBy: row.rejected_by, rejectionReason: row.rejection_reason,
    rejectedAt: row.rejected_at, receiptNo: row.receipt_no,
    settledAt: row.settled_at, settledBy: row.settled_by,
    changeReturned: row.change_returned, vendor: row.vendor,
    reference: row.reference, authorizedBy: row.authorized_by,
    status: row.status, createdAt: row.created_at
  })));
}

async function addPettyEntry(DB, data) {
  const pid = data.id || id('PC-');
  await DB.prepare(`INSERT INTO petty_cash
    (id,type,purpose,amount,category,date_needed,notes,requested_by,
     reference,authorized_by,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(pid, data.type||'request', data.purpose||'',
      data.amount||0, data.category||'', data.dateNeeded||'',
      data.notes||'', data.requestedBy||'',
      data.reference||'', data.authorizedBy||'',
      data.status||'pending_approval'
    ).run();
  return ok({ ...data, id: pid });
}

async function updatePettyEntry(DB, pid, data) {
  const current = await DB.prepare('SELECT * FROM petty_cash WHERE id=?').bind(pid).first();
  if (!current) return err('Petty cash entry not found', 404);

  await DB.prepare(`UPDATE petty_cash SET
    status=?,approved_by=?,approved_at=?,rejected_by=?,rejection_reason=?,
    rejected_at=?,receipt_no=?,settled_at=?,settled_by=?,actual_amount=?,
    change_returned=?,vendor=?
    WHERE id=?`)
    .bind(
      data.status || current.status,
      data.approvedBy || current.approved_by || '',
      data.approvedAt || current.approved_at || '',
      data.rejectedBy || current.rejected_by || '',
      data.rejectionReason || current.rejection_reason || '',
      data.rejectedAt || current.rejected_at || '',
      data.receiptNo || current.receipt_no || '',
      data.settledAt || current.settled_at || '',
      data.settledBy || current.settled_by || '',
      data.actualAmount ?? current.actual_amount,
      data.changeReturned || current.change_returned || 0,
      data.vendor || current.vendor || '',
      pid
    ).run();

  return ok({ id: pid, updated: true });
}

// ──────────────────────────────────────────
// REMITTANCES
// ──────────────────────────────────────────
async function getRemittances(DB) {
  const { results } = await DB.prepare('SELECT * FROM remittances ORDER BY paid_date DESC, created_at DESC').all();
  return ok((results || []).map(row => ({
    id: row.id, label: row.label, amount: row.amount,
    paidDate: row.paid_date, reference: row.reference,
    authorizedBy: row.authorized_by, status: row.status,
    createdAt: row.created_at
  })));
}

async function addRemittance(DB, data) {
  const rid = id('REM-');
  await DB.prepare(`INSERT INTO remittances (id,label,amount,paid_date,reference,authorized_by,status)
    VALUES (?,?,?,?,?,?,?)`)
    .bind(rid, data.label||'', data.amount||0, data.paidDate||'',
      data.reference||'', data.authorizedBy||'', data.status||'paid'
    ).run();
  return ok({ ...data, id: rid });
}

// ──────────────────────────────────────────
// AUDIT
// ──────────────────────────────────────────
async function getAudit(DB) {
  const { results } = await DB.prepare('SELECT * FROM audit_log ORDER BY ts DESC LIMIT 500').all();
  return ok((results || []).map(row => ({
    id: row.id, type: row.type, detail: row.detail,
    by: row.by_user, ts: row.ts
  })));
}

async function addAudit(DB, data) {
  const aid = id('A');
  await DB.prepare('INSERT INTO audit_log (id,type,detail,by_user,ts) VALUES (?,?,?,?,?)')
    .bind(aid, data.type||'', data.detail||'', data.by||'', new Date().toISOString()).run();
  return ok({ id: aid });
}

// ──────────────────────────────────────────
// SETTINGS
// ──────────────────────────────────────────
async function getSettings(DB) {
  const { results } = await DB.prepare('SELECT key,value FROM settings').all();
  const s = {};
  (results||[]).forEach(r => {
    try { s[r.key] = JSON.parse(r.value); } catch { s[r.key] = r.value; }
  });
  if (!s.quotas) s.quotas = {rmf:5000,csr:3000,edu:2000,camp:5000,mummy:8000,volunteer:2000,goFishing:10000};
  return ok(s);
}

async function saveSettings(DB, data) {
  for (const [key, value] of Object.entries(data)) {
    const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
    await DB.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').bind(key, val).run();
  }
  return ok({ saved: true });
}

// ──────────────────────────────────────────
// NOTIFICATIONS
// ──────────────────────────────────────────
async function getNotifications(DB) {
  const { results } = await DB.prepare('SELECT * FROM notifications ORDER BY ts DESC LIMIT 50').all();
  return ok((results||[]).map(r => ({
    id: r.id, title: r.title, body: r.body,
    type: r.type, read: !!r.is_read, ts: r.ts
  })));
}

async function addNotification(DB, data) {
  const nid = id('N');
  await DB.prepare('INSERT INTO notifications (id,title,body,type,ts) VALUES (?,?,?,?,?)')
    .bind(nid, data.title||'', data.body||'', data.type||'info', new Date().toISOString()).run();
  return ok({ id: nid });
}

async function markNotificationsRead(DB) {
  await DB.prepare('UPDATE notifications SET is_read=1 WHERE is_read=0').run();
  return ok({ marked: true });
}
