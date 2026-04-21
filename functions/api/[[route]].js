// ================================================================
// RCCG Kingdom Parish — Cloudflare Pages Functions API
// Single catch-all handler for /api/* routes
// D1 binding name: DB  (set in Cloudflare Pages → Settings → Functions → D1 bindings)
// ================================================================

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ok  = (data)       => new Response(JSON.stringify(data),        { status: 200, headers: CORS_HEADERS });
const err = (msg, s=500) => new Response(JSON.stringify({ error: msg }), { status: s,   headers: CORS_HEADERS });
const newId = (prefix='') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function isValidPin(pin) {
  return /^\d{4,6}$/.test(String(pin || ''));
}

function isHashedPin(storedPin) {
  return String(storedPin || '').startsWith('sha256$');
}

async function hashPin(pin) {
  const data = new TextEncoder().encode(String(pin));
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `sha256$${hex}`;
}

async function verifyPin(storedPin, inputPin) {
  const stored = String(storedPin || '');
  const input = String(inputPin || '');
  if (!stored) return false;
  if (!isHashedPin(stored)) return stored === input;
  const inputHash = await hashPin(input);
  return stored === inputHash;
}

function publicUser(userRow) {
  return {
    id: userRow.id,
    name: userRow.name,
    role: userRow.role,
    email: userRow.email || '',
  };
}

/** Safely parse a JSON string and return the result, or `fallback` on error. */
function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

const SCHEMA_CACHE = new Map();
const ALLOWED_TABLES = new Set(['income', 'expenses']);
async function tableHasColumns(DB, table, cols) {
  if (!ALLOWED_TABLES.has(table)) throw new Error(`Unsupported schema check table: ${table}`);
  let existing = SCHEMA_CACHE.get(table);
  if (!existing) {
    const { results } = await DB.prepare(`PRAGMA table_info(${table})`).all();
    existing = new Set((results || []).map(r => r.name));
    SCHEMA_CACHE.set(table, existing);
  }
  return cols.every(c => existing.has(c));
}

// ── ROUTER ──────────────────────────────────────────────────────
export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const DB     = env.DB;
  const url    = new URL(request.url);
  const method = request.method;

  // Extract route from path: /api/users/u1 → 'users/u1'
  const path  = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const parts = path.split('/');
  const route = parts[0];
  const param = parts[1] || null;

  if (!DB) {
    return err('Database binding "DB" not found. Check Cloudflare Pages → Settings → Functions → D1 bindings.', 503);
  }

  try {
    let body = null;
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try { body = await request.json(); } catch { body = {}; }
    }

    // ── /api/init ──────────────────────────────────────────────
    if (route === 'init' && method === 'GET') return await handleInit(DB);

    // ── /api/users ─────────────────────────────────────────────
    if (route === 'users') {
      if (method === 'GET'    && !param) return await getUsers(DB);
      if (method === 'POST'   && !param) return await createUser(DB, body);
      if (method === 'PUT'    &&  param) return await updateUser(DB, param, body);
      if (method === 'DELETE' &&  param) return await deleteUser(DB, param);
    }
    if (route === 'auth') {
      if (method === 'POST' && param === 'login') return await loginUser(DB, body);
    }
    if (route === 'change-pin' && method === 'POST') {
      return await changeUserPin(DB, body);
    }

    // ── /api/income ────────────────────────────────────────────
    if (route === 'income') {
      if (method === 'GET'  && !param) return await getIncome(DB);
      if (method === 'POST' && !param) return await createIncome(DB, body);
      if (method === 'PUT'  &&  param) return await updateIncome(DB, param, body);
    }

    // ── /api/expenses ──────────────────────────────────────────
    if (route === 'expenses') {
      if (method === 'GET'  && !param) return await getExpenses(DB);
      if (method === 'POST' && !param) return await createExpense(DB, body);
      if (method === 'PUT'  &&  param) return await updateExpense(DB, param, body);
      if (method === 'DELETE' && param) return await deleteExpense(DB, param);
    }

    // ── /api/petty ─────────────────────────────────────────────
    if (route === 'petty') {
      if (method === 'GET'  && !param) return await getPetty(DB);
      if (method === 'POST' && !param) return await createPettyEntry(DB, body);
      if (method === 'PUT'  &&  param) return await updatePettyEntry(DB, param, body);
    }

    // ── /api/petty-config ──────────────────────────────────────
    if (route === 'petty-config') {
      if (method === 'GET'  && !param) return await getPettyConfig(DB);
      if (method === 'POST' && !param) return await updatePettyConfig(DB, body);
    }

    // ── /api/remittances ───────────────────────────────────────
    if (route === 'remittances') {
      if (method === 'GET'  && !param) return await getRemittances(DB);
      if (method === 'POST' && !param) return await createRemittance(DB, body);
      if (method === 'PUT'  &&  param) return await updateRemittance(DB, param, body);
    }

    // ── /api/cash-transactions ─────────────────────────────────
    if (route === 'cash-transactions') {
      if (method === 'GET'  && !param) return await getCashTransactions(DB);
      if (method === 'POST' && !param) return await createCashTransaction(DB, body);
    }

    // ── /api/audit ─────────────────────────────────────────────
    if (route === 'audit') {
      if (method === 'GET'  && !param) return await getAudit(DB);
      if (method === 'POST' && !param) return await createAuditEntry(DB, body);
    }

    // ── /api/settings ──────────────────────────────────────────
    if (route === 'settings') {
      if (method === 'GET'  && !param) return await getSettings(DB);
      if (method === 'POST' && !param) return await saveSettings(DB, body);
    }

    // ── /api/notifications ─────────────────────────────────────
    if (route === 'notifications') {
      if (method === 'GET'  && !param)           return await getNotifications(DB);
      if (method === 'POST' && !param)           return await createNotification(DB, body);
      if (method === 'POST' && param === 'read') return await markAllRead(DB);
    }

    // ── /api/admin ─────────────────────────────────────────────
    if (route === 'admin') {
      if (method === 'POST' && param === 'clear')      return await adminClear(DB);
      if (method === 'POST' && param === 'clear-data') return await adminClearDataOnly(DB);
      if (method === 'POST' && param === 'import') return await adminImport(DB, body);
    }

    return err(`Route not found: ${method} /api/${path}`, 404);

  } catch (e) {
    console.error(`[API Error] ${method} /api/${path}:`, e.message, e.stack);
    return err(`Server error: ${e.message}`);
  }
}

// ── INIT ─────────────────────────────────────────────────────────
async function handleInit(DB) {
  // All CREATE TABLE statements — safe to run multiple times (IF NOT EXISTS)
  const createTables = [
    `CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      role        TEXT NOT NULL,
      pin         TEXT NOT NULL,
      email       TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS income (
      id                    TEXT PRIMARY KEY,
      date                  TEXT NOT NULL,
      members_tithe         REAL DEFAULT 0,
      ministers_tithe       REAL DEFAULT 0,
      thanksgiving          REAL DEFAULT 0,
      sunday_school         REAL DEFAULT 0,
      slo                   REAL DEFAULT 0,
      crm                   REAL DEFAULT 0,
      workers_offering      REAL DEFAULT 0,
      children_offering     REAL DEFAULT 0,
      total_collection      REAL DEFAULT 0,
      bank_transfer_amount  REAL DEFAULT 0,
      direct_petty_cash     REAL DEFAULT 0,
      source                TEXT DEFAULT 'sunday_collection',
      payment_method        TEXT DEFAULT '',
      donor_name            TEXT DEFAULT '',
      usher                 TEXT DEFAULT '',
      recorded_by           TEXT DEFAULT '',
      deposit_confirmed     INTEGER DEFAULT 0,
      teller_no             TEXT DEFAULT '',
      deposited_by          TEXT DEFAULT '',
      deposit_date          TEXT DEFAULT '',
      notes                 TEXT DEFAULT '',
      created_at            TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS expenses (
      id               TEXT PRIMARY KEY,
      date             TEXT NOT NULL,
      category         TEXT NOT NULL DEFAULT '',
      subcategory      TEXT DEFAULT '',
      description      TEXT NOT NULL DEFAULT '',
      amount           REAL DEFAULT 0,
      receipt_no       TEXT DEFAULT '',
      receipt_image    TEXT DEFAULT '',
      receipt_file_name TEXT DEFAULT '',
      payment_method   TEXT DEFAULT 'petty_cash',
      notes            TEXT DEFAULT '',
      recorded_by      TEXT DEFAULT '',
      petty_ref        TEXT DEFAULT '',
      status           TEXT DEFAULT 'approved',
      bank_amount      REAL DEFAULT 0,
      cash_amount      REAL DEFAULT 0,
      petty_amount     REAL DEFAULT 0,
      no_receipt       INTEGER DEFAULT 0,
      created_at       TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS petty_cash (
      id                TEXT PRIMARY KEY,
      type              TEXT DEFAULT 'request',
      purpose           TEXT NOT NULL DEFAULT '',
      amount            REAL DEFAULT 0,
      actual_amount     REAL DEFAULT 0,
      original_amount   REAL DEFAULT 0,
      category          TEXT DEFAULT '',
      date_needed       TEXT DEFAULT '',
      notes             TEXT DEFAULT '',
      requested_by      TEXT DEFAULT '',
      approved_by       TEXT DEFAULT '',
      approved_at       TEXT DEFAULT '',
      rejected_by       TEXT DEFAULT '',
      rejection_reason  TEXT DEFAULT '',
      rejected_at       TEXT DEFAULT '',
      receipt_no        TEXT DEFAULT '',
      settled_at        TEXT DEFAULT '',
      settled_by        TEXT DEFAULT '',
      change_returned   REAL DEFAULT 0,
      vendor            TEXT DEFAULT '',
      reference         TEXT DEFAULT '',
      authorized_by     TEXT DEFAULT '',
      status            TEXT DEFAULT 'pending_approval',
      payment_method    TEXT DEFAULT '',
      bank_amount       REAL DEFAULT 0,
      cash_amount       REAL DEFAULT 0,
      expense_refs      TEXT DEFAULT '',
      no_receipt        INTEGER DEFAULT 0,
      created_at        TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS petty_config (
      id            TEXT PRIMARY KEY DEFAULT 'main',
      float_amount  REAL DEFAULT 50000,
      max_float     REAL DEFAULT 50000
    )`,
    `CREATE TABLE IF NOT EXISTS remittances (
      id            TEXT PRIMARY KEY,
      label         TEXT NOT NULL DEFAULT '',
      amount        REAL DEFAULT 0,
      paid_date     TEXT DEFAULT '',
      reference     TEXT DEFAULT '',
      authorized_by TEXT DEFAULT '',
      status        TEXT DEFAULT 'paid',
      bank_amount   REAL DEFAULT 0,
      cash_amount   REAL DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS cash_transactions (
      id                TEXT PRIMARY KEY,
      type              TEXT NOT NULL DEFAULT '',
      date              TEXT NOT NULL DEFAULT '',
      amount            REAL DEFAULT 0,
      description       TEXT DEFAULT '',
      reference         TEXT DEFAULT '',
      authorized_by     TEXT DEFAULT '',
      recorded_by       TEXT DEFAULT '',
      deposit_method    TEXT DEFAULT '',
      income_ref        TEXT DEFAULT '',
      destination       TEXT DEFAULT '',
      created_at        TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS audit_log (
      id        TEXT PRIMARY KEY,
      type      TEXT NOT NULL DEFAULT '',
      detail    TEXT NOT NULL DEFAULT '',
      by_user   TEXT DEFAULT '',
      ts        TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id      TEXT PRIMARY KEY,
      title   TEXT NOT NULL DEFAULT '',
      body    TEXT NOT NULL DEFAULT '',
      type    TEXT DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      ts      TEXT DEFAULT (datetime('now'))
    )`,
  ];

  // Run all CREATE TABLE statements first
  for (const sql of createTables) {
    await DB.prepare(sql).run();
  }

  // Run migrations: add new columns to existing tables.
  // ALTER TABLE throws if a column already exists — catch and ignore.
  const migrations = [
    // Income columns (added in earlier schema version)
    `ALTER TABLE income ADD COLUMN bank_transfer_amount REAL DEFAULT 0`,
    `ALTER TABLE income ADD COLUMN direct_petty_cash REAL DEFAULT 0`,
    `ALTER TABLE income ADD COLUMN source TEXT DEFAULT 'sunday_collection'`,
    `ALTER TABLE income ADD COLUMN payment_method TEXT DEFAULT ''`,
    `ALTER TABLE income ADD COLUMN donor_name TEXT DEFAULT ''`,
    // Expense columns
    `ALTER TABLE expenses ADD COLUMN receipt_image TEXT DEFAULT ''`,
    `ALTER TABLE expenses ADD COLUMN receipt_file_name TEXT DEFAULT ''`,
    `ALTER TABLE expenses ADD COLUMN bank_amount REAL DEFAULT 0`,
    `ALTER TABLE expenses ADD COLUMN cash_amount REAL DEFAULT 0`,
    `ALTER TABLE expenses ADD COLUMN petty_amount REAL DEFAULT 0`,
    `ALTER TABLE expenses ADD COLUMN no_receipt INTEGER DEFAULT 0`,
    // Petty cash columns
    `ALTER TABLE petty_cash ADD COLUMN payment_method TEXT DEFAULT ''`,
    `ALTER TABLE petty_cash ADD COLUMN bank_amount REAL DEFAULT 0`,
    `ALTER TABLE petty_cash ADD COLUMN cash_amount REAL DEFAULT 0`,
    `ALTER TABLE petty_cash ADD COLUMN expense_refs TEXT DEFAULT ''`,
    `ALTER TABLE petty_cash ADD COLUMN no_receipt INTEGER DEFAULT 0`,
    `ALTER TABLE petty_cash ADD COLUMN original_amount REAL DEFAULT 0`,
    // Remittance columns
    `ALTER TABLE remittances ADD COLUMN period_from TEXT DEFAULT ''`,
    `ALTER TABLE remittances ADD COLUMN period_to TEXT DEFAULT ''`,
    `ALTER TABLE remittances ADD COLUMN payment_method TEXT DEFAULT 'bank_transfer'`,
    `ALTER TABLE remittances ADD COLUMN notes TEXT DEFAULT ''`,
    `ALTER TABLE remittances ADD COLUMN submitted_by TEXT DEFAULT ''`,
    `ALTER TABLE remittances ADD COLUMN approved_by TEXT DEFAULT ''`,
    `ALTER TABLE remittances ADD COLUMN approved_at TEXT DEFAULT ''`,
    `ALTER TABLE remittances ADD COLUMN bank_amount REAL DEFAULT 0`,
    `ALTER TABLE remittances ADD COLUMN cash_amount REAL DEFAULT 0`,
  ];
  for (const m of migrations) {
    try { await DB.prepare(m).run(); } catch { /* column already exists — safe to ignore */ }
  }

  // Migrate legacy: remove goFishing from saved quotas setting
  try {
    const row = await DB.prepare(`SELECT value FROM settings WHERE key='quotas'`).first();
    if (row) {
      const q = JSON.parse(row.value || '{}');
      if ('goFishing' in q) {
        delete q.goFishing;
        await DB.prepare(`UPDATE settings SET value=? WHERE key='quotas'`).bind(JSON.stringify(q)).run();
      }
    }
  } catch { /* safe to skip */ }

  // Seed petty config (once)
  await DB.prepare(
    `INSERT OR IGNORE INTO petty_config (id, float_amount, max_float) VALUES ('main', 50000, 50000)`
  ).run();

  // Seed default settings (once each)
  const defaultSettings = {
    churchName:       'RCCG Kingdom Parish, Aguleri',
    bankName:         '',
    accountNo:        '',
    pettyMax:         '50000',
    quotas:           JSON.stringify({ rmf:5000, csr:3000, edu:2000, camp:5000, mummy:8000, volunteer:2000 }),
    remittanceRates:  JSON.stringify({
      membersTithe:    { natl:0.58, local:0.42 },
      ministersTithe:  { natl:0.62, local:0.38 },
      sundaySchool:    { natl:1.00, local:0.00 },
      slo:             { natl:0.30, local:0.70 },
      crm:             { natl:0.60, local:0.40 },
      workersOffering: { natl:0.25, local:0.75 },
      childrenOffering:{ natl:0.35, local:0.65 },
      tgNational:0.75, tgArea:0.05, tgPastor:0.10, tgMinisters:0.09, tgSeed:0.01,
      provinceRebate:0.20
    }),
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await DB.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`).bind(key, value).run();
  }

  // Seed default users — INSERT OR IGNORE preserves any PINs already set by the admin
  const defaultUsers = [
    { id:'u1', name:'IT Administrator',     role:'it_admin',      pin:'0000', email:'it@kpaguleri.org' },
    { id:'u2', name:'Rev. Emmanuel Obi',    role:'pastor',        pin:'1111', email:'pastor@kpaguleri.org' },
    { id:'u3', name:'Bro. Chukwuemeka Nze', role:'accountant',    pin:'2222', email:'accounts@kpaguleri.org' },
    { id:'u4', name:'Sis. Adaeze Okonkwo',  role:'admin_officer', pin:'3333', email:'admin@kpaguleri.org' },
    { id:'u5', name:'Elder Paul Okafor',    role:'signatory',     pin:'4444', email:'elder1@kpaguleri.org' },
    { id:'u6', name:'Elder James Eze',      role:'signatory',     pin:'4444', email:'elder2@kpaguleri.org' },
    { id:'u7', name:'Visitor Access',       role:'viewer',        pin:'9999', email:'' },
  ];
  for (const u of defaultUsers) {
    const hashedPin = await hashPin(u.pin);
    await DB.prepare(
      `INSERT OR IGNORE INTO users (id, name, role, pin, email) VALUES (?, ?, ?, ?, ?)`
    ).bind(u.id, u.name, u.role, hashedPin, u.email).run();
  }

  return ok({
    success: true,
    message: 'Database initialised. All tables created and default users seeded.',
    tables: ['users','income','expenses','petty_cash','petty_config','remittances','cash_transactions','audit_log','settings','notifications'],
  });
}

// ── USERS ─────────────────────────────────────────────────────────
async function getUsers(DB) {
  const { results } = await DB.prepare(`SELECT id,name,role,email FROM users ORDER BY role, name`).all();
  return ok((results || []).map(publicUser));
}

async function createUser(DB, data) {
  const { name, role, pin, email = '' } = data;
  if (!name || !role || !pin) return err('name, role, and pin are required', 400);
  if (!isValidPin(pin)) return err('pin must be 4-6 digits', 400);
  const id = newId('u');
  const hashedPin = await hashPin(pin);
  await DB.prepare(`INSERT INTO users (id,name,role,pin,email) VALUES (?,?,?,?,?)`)
    .bind(id, name, role, hashedPin, email).run();
  return ok(publicUser({ id, name, role, email }));
}

async function updateUser(DB, id, data) {
  const row = await DB.prepare(`SELECT * FROM users WHERE id=?`).bind(id).first();
  if (!row) return err('User not found', 404);
  const name  = data.name  || row.name;
  const role  = data.role  || row.role;
  const email = data.email ?? row.email;
  const pin   = (data.pin && isValidPin(data.pin)) ? await hashPin(data.pin) : row.pin;
  await DB.prepare(`UPDATE users SET name=?,role=?,email=?,pin=? WHERE id=?`)
    .bind(name, role, email, pin, id).run();
  return ok(publicUser({ id, name, role, email }));
}

async function loginUser(DB, data) {
  const role = String(data?.role || '').trim();
  const pin = String(data?.pin || '').trim();
  const userId = String(data?.userId || '').trim();
  if (!role || !pin) return err('role and pin are required', 400);

  let row = null;
  if (userId) {
    row = await DB.prepare(`SELECT id,name,role,email,pin FROM users WHERE id=? AND role=?`).bind(userId, role).first();
  } else {
    const { results } = await DB.prepare(`SELECT id,name,role,email,pin FROM users WHERE role=? ORDER BY name`).bind(role).all();
    const users = results || [];
    if (users.length > 1) return err('Please select your name', 400);
    row = users[0] || null;
  }

  if (!row) return err('Invalid credentials', 401);
  const validPin = await verifyPin(row.pin, pin);
  if (!validPin) return err('Invalid credentials', 401);
  if (!isHashedPin(row.pin)) {
    await DB.prepare(`UPDATE users SET pin=? WHERE id=?`).bind(await hashPin(pin), row.id).run();
  }
  return ok(publicUser(row));
}

async function deleteUser(DB, id) {
  await DB.prepare(`DELETE FROM users WHERE id=?`).bind(id).run();
  return ok({ deleted: id });
}

async function changeUserPin(DB, data) {
  const userId = String(data?.userId || '').trim();
  const currentPin = String(data?.currentPin || '').trim();
  const newPin = String(data?.newPin || '').trim();
  if (!userId || !currentPin || !newPin) {
    return err('userId, currentPin, and newPin are required', 400);
  }
  if (!isValidPin(newPin)) {
    return err('New PIN must be 4-6 digits', 400);
  }
  const row = await DB.prepare(`SELECT id, pin FROM users WHERE id=?`).bind(userId).first();
  if (!row) return err('User not found', 404);
  const validCurrentPin = await verifyPin(row.pin, currentPin);
  if (!validCurrentPin) return err('Current PIN is incorrect', 401);
  await DB.prepare(`UPDATE users SET pin=? WHERE id=?`).bind(await hashPin(newPin), userId).run();
  return ok({ success: true, id: userId });
}

function inferIncomePaymentMethod(row) {
  if (row.payment_method) return row.payment_method;
  // Backward compatibility for old rows that predate income.payment_method.
  // Missing source values are also treated as legacy Sunday collections.
  // Sunday uses split cash/bank fields, so there is no single payment method
  // and we return an empty string.
  if (!row.source || row.source === 'sunday_collection') return '';
  const total = Number(row.total_collection || 0);
  const bank  = Number(row.bank_transfer_amount || 0);
  if (total <= 0) return '';
  return bank >= total ? 'bank_transfer' : 'cash';
}

// ── INCOME ────────────────────────────────────────────────────────
async function getIncome(DB) {
  const { results } = await DB.prepare(`SELECT * FROM income ORDER BY date DESC, created_at DESC`).all();
  return ok((results || []).map(row => ({
    id:                  row.id,
    date:                row.date,
    membersTithe:        row.members_tithe,
    ministersTithe:      row.ministers_tithe,
    thanksgiving:        row.thanksgiving,
    sundaySchool:        row.sunday_school,
    slo:                 row.slo,
    crm:                 row.crm,
    workersOffering:     row.workers_offering,
    childrenOffering:    row.children_offering,
    totalCollection:     row.total_collection,
    bankTransferAmount:  row.bank_transfer_amount,
    directPettyCash:     row.direct_petty_cash,
    source:              row.source,
    usher:               row.usher,
    recordedBy:          row.recorded_by,
    depositConfirmed:    row.deposit_confirmed === 1,
    tellerNo:            row.teller_no,
    depositedBy:         row.deposited_by,
    depositDate:         row.deposit_date,
    notes:               row.notes,
    createdAt:           row.created_at,
    paymentMethod:       inferIncomePaymentMethod(row),
    donorName:           row.donor_name || '',
  })));
}

async function createIncome(DB, data) {
  const id = data.id || newId('INC-');
  const hasSplitCols = await tableHasColumns(DB, 'income', ['bank_transfer_amount', 'direct_petty_cash', 'source']);
  const hasMetaCols  = await tableHasColumns(DB, 'income', ['payment_method', 'donor_name']);
  if (hasSplitCols && hasMetaCols) {
    await DB.prepare(`
      INSERT INTO income
        (id,date,members_tithe,ministers_tithe,thanksgiving,sunday_school,
         slo,crm,workers_offering,children_offering,total_collection,
         bank_transfer_amount,direct_petty_cash,source,payment_method,donor_name,
         usher,recorded_by,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id,
      data.date                 || new Date().toISOString().split('T')[0],
      data.membersTithe         || 0,
      data.ministersTithe       || 0,
      data.thanksgiving         || 0,
      data.sundaySchool         || 0,
      data.slo                  || 0,
      data.crm                  || 0,
      data.workersOffering      || 0,
      data.childrenOffering     || 0,
      data.totalCollection      || 0,
      data.bankTransferAmount   || 0,
      data.directPettyCash      || 0,
      data.source               || 'sunday_collection',
      data.paymentMethod        || '',
      data.donorName            || '',
      data.usher                || '',
      data.recordedBy           || '',
      data.notes                || '',
    ).run();
  } else if (hasSplitCols) {
    await DB.prepare(`
      INSERT INTO income
        (id,date,members_tithe,ministers_tithe,thanksgiving,sunday_school,
         slo,crm,workers_offering,children_offering,total_collection,
         bank_transfer_amount,direct_petty_cash,source,
         usher,recorded_by,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id,
      data.date                 || new Date().toISOString().split('T')[0],
      data.membersTithe         || 0,
      data.ministersTithe       || 0,
      data.thanksgiving         || 0,
      data.sundaySchool         || 0,
      data.slo                  || 0,
      data.crm                  || 0,
      data.workersOffering      || 0,
      data.childrenOffering     || 0,
      data.totalCollection      || 0,
      data.bankTransferAmount   || 0,
      data.directPettyCash      || 0,
      data.source               || 'sunday_collection',
      data.usher                || '',
      data.recordedBy           || '',
      data.notes                || '',
    ).run();
  } else {
    // Backward-compatible insert for databases that haven't run /api/init migration yet.
    await DB.prepare(`
      INSERT INTO income
        (id,date,members_tithe,ministers_tithe,thanksgiving,sunday_school,
         slo,crm,workers_offering,children_offering,total_collection,
         usher,recorded_by,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id,
      data.date || new Date().toISOString().split('T')[0],
      data.membersTithe    || 0,
      data.ministersTithe  || 0,
      data.thanksgiving    || 0,
      data.sundaySchool    || 0,
      data.slo             || 0,
      data.crm             || 0,
      data.workersOffering || 0,
      data.childrenOffering|| 0,
      data.totalCollection || 0,
      data.usher           || '',
      data.recordedBy      || '',
      data.notes           || '',
    ).run();
  }
  return ok({ ...data, id });
}

async function updateIncome(DB, id, data) {
  // Used for confirming bank deposit
  if (data.depositConfirmed !== undefined) {
    await DB.prepare(`
      UPDATE income SET deposit_confirmed=?,teller_no=?,deposited_by=?,deposit_date=? WHERE id=?
    `).bind(
      data.depositConfirmed ? 1 : 0,
      data.tellerNo   || '',
      data.depositedBy|| '',
      data.depositDate|| '',
      id
    ).run();
  }
  return ok({ id, updated: true });
}

// ── EXPENSES ──────────────────────────────────────────────────────
async function getExpenses(DB) {
  const { results } = await DB.prepare(`SELECT * FROM expenses ORDER BY date DESC, created_at DESC`).all();
  return ok((results || []).map(row => ({
    id:              row.id,
    date:            row.date,
    category:        row.category,
    subCategory:     row.subcategory,
    description:     row.description,
    amount:          row.amount,
    receiptNo:       row.receipt_no,
    receiptImage:    row.receipt_image,
    receiptFileName: row.receipt_file_name,
    paymentMethod:   row.payment_method,
    notes:           row.notes,
    recordedBy:      row.recorded_by,
    pettyRef:        row.petty_ref,
    status:          row.status,
    bankAmount:      row.bank_amount  || 0,
    cashAmount:      row.cash_amount  || 0,
    pettyAmount:     row.petty_amount || 0,
    noReceipt:       row.no_receipt === 1,
    createdAt:       row.created_at,
  })));
}

async function createExpense(DB, data) {
  const id = data.id || newId('EXP-');
  await DB.prepare(`
    INSERT INTO expenses
      (id,date,category,subcategory,description,amount,receipt_no,receipt_image,receipt_file_name,
       payment_method,notes,recorded_by,petty_ref,status,bank_amount,cash_amount,petty_amount,no_receipt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id,
    data.date            || new Date().toISOString().split('T')[0],
    data.category        || '',
    data.subCategory     || '',
    data.description     || '',
    data.amount          || 0,
    data.receiptNo       || '',
    data.receiptImage    || '',
    data.receiptFileName || '',
    data.paymentMethod   || 'petty_cash',
    data.notes           || '',
    data.recordedBy      || '',
    data.pettyRef        || '',
    data.status          || 'approved',
    data.bankAmount      || 0,
    data.cashAmount      || 0,
    data.pettyAmount     || 0,
    data.noReceipt       ? 1 : 0,
  ).run();
  return ok({ ...data, id });
}

async function updateExpense(DB, id, data) {
  const fieldMap = {
    date:            'date',
    category:        'category',
    subCategory:     'subcategory',
    description:     'description',
    amount:          'amount',
    receiptNo:       'receipt_no',
    receiptImage:    'receipt_image',
    receiptFileName: 'receipt_file_name',
    paymentMethod:   'payment_method',
    notes:           'notes',
    recordedBy:      'recorded_by',
    pettyRef:        'petty_ref',
    status:          'status',
    bankAmount:      'bank_amount',
    cashAmount:      'cash_amount',
    pettyAmount:     'petty_amount',
    noReceipt:       'no_receipt'
  };
  const sets = [];
  const vals = [];
  for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
    if (data[jsKey] !== undefined && data[jsKey] !== null) {
      sets.push(`${dbCol}=?`);
      vals.push(jsKey === 'noReceipt' ? (data[jsKey] ? 1 : 0) : data[jsKey]);
    }
  }
  if (sets.length === 0) return ok({ id, updated: false, reason: 'No fields to update' });
  vals.push(id);
  await DB.prepare(`UPDATE expenses SET ${sets.join(',')} WHERE id=?`).bind(...vals).run();
  return ok({ id, updated: true });
}

async function deleteExpense(DB, id) {
  await DB.prepare(`DELETE FROM expenses WHERE id=?`).bind(id).run();
  return ok({ id, deleted: true });
}

// ── PETTY CASH ────────────────────────────────────────────────────
async function getPettyConfig(DB) {
  const row = await DB.prepare(`SELECT * FROM petty_config WHERE id='main'`).first();
  return ok({ float: row?.float_amount ?? 50000, max: row?.max_float ?? 50000 });
}

async function updatePettyConfig(DB, data) {
  await DB.prepare(`UPDATE petty_config SET float_amount=?,max_float=? WHERE id='main'`)
    .bind(data.float, data.max).run();
  return ok({ float: data.float, max: data.max });
}

async function getPetty(DB) {
  const { results } = await DB.prepare(`SELECT * FROM petty_cash ORDER BY created_at DESC`).all();
  return ok((results || []).map(row => ({
    id:               row.id,
    type:             row.type,
    purpose:          row.purpose,
    amount:           row.amount,
    actualAmount:     row.actual_amount  || 0,
    originalAmount:   row.original_amount || 0,
    category:         row.category,
    dateNeeded:       row.date_needed,
    notes:            row.notes,
    requestedBy:      row.requested_by,
    approvedBy:       row.approved_by,
    approvedAt:       row.approved_at,
    rejectedBy:       row.rejected_by,
    rejectionReason:  row.rejection_reason,
    rejectedAt:       row.rejected_at,
    receiptNo:        row.receipt_no,
    settledAt:        row.settled_at,
    settledBy:        row.settled_by,
    changeReturned:   row.change_returned,
    vendor:           row.vendor,
    reference:        row.reference,
    authorizedBy:     row.authorized_by,
    status:           row.status,
    paymentMethod:    row.payment_method || '',
    bankAmount:       row.bank_amount    || 0,
    cashAmount:       row.cash_amount    || 0,
    expenseRefs:      safeJsonParse(row.expense_refs, []),
    noReceipt:        row.no_receipt === 1,
    createdAt:        row.created_at,
  })));
}

async function createPettyEntry(DB, data) {
  const id = data.id || newId('PC-');
  await DB.prepare(`
    INSERT INTO petty_cash
      (id,type,purpose,amount,category,date_needed,notes,requested_by,reference,authorized_by,
       status,payment_method,bank_amount,cash_amount,expense_refs,no_receipt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id,
    data.type         || 'request',
    data.purpose      || '',
    data.amount       || 0,
    data.category     || '',
    data.dateNeeded   || '',
    data.notes        || '',
    data.requestedBy  || '',
    data.reference    || '',
    data.authorizedBy || '',
    data.status       || 'pending_approval',
    data.paymentMethod|| '',
    data.bankAmount   || 0,
    data.cashAmount   || 0,
    data.expenseRefs  ? JSON.stringify(data.expenseRefs) : '',
    data.noReceipt    ? 1 : 0,
  ).run();
  return ok({ ...data, id });
}

async function updatePettyEntry(DB, id, data) {
  // Build SET clause dynamically — only update fields that are provided
  const fieldMap = {
    status:           'status',
    amount:           'amount',
    notes:            'notes',
    paymentMethod:    'payment_method',
    bankAmount:       'bank_amount',
    cashAmount:       'cash_amount',
    approvedBy:       'approved_by',
    approvedAt:       'approved_at',
    rejectedBy:       'rejected_by',
    rejectionReason:  'rejection_reason',
    rejectedAt:       'rejected_at',
    receiptNo:        'receipt_no',
    settledAt:        'settled_at',
    settledBy:        'settled_by',
    actualAmount:     'actual_amount',
    reference:        'reference',
    changeReturned:   'change_returned',
    vendor:           'vendor',
  };
  const sets = [];
  const vals = [];
  for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
    if (data[jsKey] !== undefined && data[jsKey] !== null) {
      sets.push(`${dbCol}=?`);
      vals.push(data[jsKey]);
    }
  }
  if (sets.length === 0) return ok({ id, updated: false, reason: 'No fields to update' });
  vals.push(id);
  await DB.prepare(`UPDATE petty_cash SET ${sets.join(',')} WHERE id=?`).bind(...vals).run();
  return ok({ id, updated: true });
}

// ── REMITTANCES ───────────────────────────────────────────────────
async function getRemittances(DB) {
  const { results } = await DB.prepare(`SELECT * FROM remittances ORDER BY paid_date DESC, created_at DESC`).all();
  return ok((results || []).map(row => ({
    id:            row.id,
    label:         row.label,
    amount:        row.amount,
    paidDate:      row.paid_date,
    reference:     row.reference,
    authorizedBy:  row.authorized_by,
    status:        row.status,
    periodFrom:    row.period_from  || '',
    periodTo:      row.period_to    || '',
    paymentMethod: row.payment_method || 'bank_transfer',
    notes:         row.notes        || '',
    submittedBy:   row.submitted_by || '',
    approvedBy:    row.approved_by  || '',
    approvedAt:    row.approved_at  || '',
    bankAmount:    row.bank_amount   || 0,
    cashAmount:    row.cash_amount   || 0,
    createdAt:     row.created_at,
  })));
}

async function createRemittance(DB, data) {
  const id = data.id || newId('REM-');
  await DB.prepare(`
    INSERT INTO remittances
      (id, label, amount, paid_date, reference, authorized_by, status,
       period_from, period_to, payment_method, notes, submitted_by, bank_amount, cash_amount)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id,
    data.label         || '',
    data.amount        || 0,
    data.paidDate      || '',
    data.reference     || '',
    data.authorizedBy  || '',
    data.status        || 'pending_approval',
    data.periodFrom    || '',
    data.periodTo      || '',
    data.paymentMethod || 'bank_transfer',
    data.notes         || '',
    data.submittedBy   || '',
    data.bankAmount    || 0,
    data.cashAmount    || 0,
  ).run();
  return ok({ ...data, id });
}

async function updateRemittance(DB, id, data) {
  const row = await DB.prepare(`SELECT * FROM remittances WHERE id=?`).bind(id).first();
  if (!row) return err('Remittance not found', 404);
  const status      = data.status      || row.status;
  const approvedBy  = data.approvedBy  || row.approved_by  || '';
  const approvedAt  = data.approvedAt  || row.approved_at  || '';
  const notes       = data.notes       !== undefined ? data.notes : (row.notes || '');
  await DB.prepare(
    `UPDATE remittances SET status=?, approved_by=?, approved_at=?, notes=? WHERE id=?`
  ).bind(status, approvedBy, approvedAt, notes, id).run();
  return ok({ id, status, approvedBy, approvedAt });
}

// ── CASH TRANSACTIONS ─────────────────────────────────────────────
async function getCashTransactions(DB) {
  const { results } = await DB.prepare(`SELECT * FROM cash_transactions ORDER BY date DESC, created_at DESC`).all();
  return ok((results || []).map(row => ({
    id:            row.id,
    type:          row.type,
    date:          row.date,
    amount:        row.amount,
    description:   row.description,
    reference:     row.reference,
    authorizedBy:  row.authorized_by,
    recordedBy:    row.recorded_by,
    depositMethod: row.deposit_method,
    incomeRef:     row.income_ref,
    destination:   row.destination,
    createdAt:     row.created_at,
  })));
}

async function createCashTransaction(DB, data) {
  const id = data.id || newId('CTX-');
  await DB.prepare(`
    INSERT INTO cash_transactions
      (id,type,date,amount,description,reference,authorized_by,recorded_by,deposit_method,income_ref,destination)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id,
    data.type          || '',
    data.date          || new Date().toISOString().split('T')[0],
    data.amount        || 0,
    data.description   || '',
    data.reference     || '',
    data.authorizedBy  || '',
    data.recordedBy    || '',
    data.depositMethod || '',
    data.incomeRef     || '',
    data.destination   || '',
  ).run();
  return ok({ ...data, id });
}

// ── AUDIT LOG ─────────────────────────────────────────────────────
async function getAudit(DB) {
  const { results } = await DB.prepare(`SELECT * FROM audit_log ORDER BY ts DESC LIMIT 500`).all();
  return ok((results || []).map(row => ({
    id:     row.id,
    type:   row.type,
    detail: row.detail,
    by:     row.by_user,
    ts:     row.ts,
  })));
}

async function createAuditEntry(DB, data) {
  const id = newId('A');
  await DB.prepare(`INSERT INTO audit_log (id,type,detail,by_user,ts) VALUES (?,?,?,?,?)`)
    .bind(id, data.type || '', data.detail || '', data.by || 'System', new Date().toISOString()).run();
  return ok({ id });
}

// ── SETTINGS ──────────────────────────────────────────────────────
async function getSettings(DB) {
  const { results } = await DB.prepare(`SELECT key,value FROM settings`).all();
  const out = {};
  for (const row of (results || [])) {
    try   { out[row.key] = JSON.parse(row.value); }
    catch { out[row.key] = row.value; }
  }
  // Ensure defaults are always present
  if (!out.quotas)          out.quotas          = { rmf:5000, csr:3000, edu:2000, camp:5000, mummy:8000, volunteer:2000 };
  // Migrate: remove legacy goFishing from saved quotas
  if (out.quotas && 'goFishing' in out.quotas) { delete out.quotas.goFishing; }
  if (!out.remittanceRates) out.remittanceRates = null; // frontend uses DEFAULT_REMITTANCE_RATES as fallback
  return ok(out);
}

async function saveSettings(DB, data) {
  for (const [key, value] of Object.entries(data)) {
    const stored = typeof value === 'object' ? JSON.stringify(value) : String(value);
    await DB.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)`).bind(key, stored).run();
  }
  return ok({ saved: true });
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────
async function getNotifications(DB) {
  const { results } = await DB.prepare(`SELECT * FROM notifications ORDER BY ts DESC LIMIT 50`).all();
  return ok((results || []).map(row => ({
    id:    row.id,
    title: row.title,
    body:  row.body,
    type:  row.type,
    read:  row.is_read === 1,
    ts:    row.ts,
  })));
}

async function createNotification(DB, data) {
  const id = newId('N');
  await DB.prepare(`INSERT INTO notifications (id,title,body,type,ts) VALUES (?,?,?,?,?)`)
    .bind(id, data.title || '', data.body || '', data.type || 'info', new Date().toISOString()).run();
  return ok({ id });
}

async function adminClearDataOnly(DB) {
  // Clears ALL transaction/financial data but preserves:
  // users, settings (church info, rates, quotas, permissions), petty_config
  const tables = ['income','expenses','petty_cash','remittances','cash_transactions','audit_log','notifications'];
  for (const t of tables) {
    await DB.prepare(`DELETE FROM ${t}`).run();
  }
  // Reset petty cash balance to zero (no cash on hand yet) but keep the approved max
  await DB.prepare(`UPDATE petty_config SET float_amount=0 WHERE id='main'`).run();
  return ok({ cleared: true, preserved: ['users','settings','petty_config max'] });
}

async function adminClear(DB) {
  const tables = ['income','expenses','petty_cash','remittances','cash_transactions','audit_log','notifications'];
  for (const t of tables) {
    await DB.prepare(`DELETE FROM ${t}`).run();
  }
  // Reset petty config to defaults
  await DB.prepare(`UPDATE petty_config SET float_amount=50000, max_float=50000 WHERE id='main'`).run();
  // Clear all settings except keep structure
  await DB.prepare(`DELETE FROM settings`).run();
  return ok({ cleared: true });
}

async function adminImport(DB, data) {
  if (!data || typeof data !== 'object') return err('Invalid backup data', 400);
  // Clear first
  await adminClear(DB);
  // Re-seed default settings so app still works
  await handleInit(DB);
  // Import each record type
  const errs = [];
  if (Array.isArray(data.income)) {
    for (const r of data.income) { try { await createIncome(DB, r); } catch(e) { errs.push(`income:${r.id}`); } }
  }
  if (Array.isArray(data.expenses)) {
    for (const r of data.expenses) { try { await createExpense(DB, r); } catch(e) { errs.push(`expense:${r.id}`); } }
  }
  if (Array.isArray(data.remittances)) {
    for (const r of data.remittances) { try { await createRemittance(DB, r); } catch(e) { errs.push(`rem:${r.id}`); } }
  }
  if (Array.isArray(data.petty)) {
    for (const r of data.petty) { try { await createPettyEntry(DB, r); } catch(e) { errs.push(`petty:${r.id}`); } }
  }
  if (Array.isArray(data.cashTransactions)) {
    for (const r of data.cashTransactions) { try { await createCashTransaction(DB, r); } catch(e) { errs.push(`ctx:${r.id}`); } }
  }
  if (data.users && Array.isArray(data.users)) {
    // INSERT OR IGNORE: restore users that are missing from the DB (e.g. after a wipe),
    // but never overwrite users that already exist — this preserves any name/PIN/role
    // changes an admin made after the backup was taken.
    for (const u of data.users) {
      try {
        const pinStr = String(u.pin || '');
        if (!u.id || !u.name || !u.role || !pinStr) { errs.push(`user:${u.id||'?'}`); continue; }
        const pinValue = isHashedPin(pinStr) ? pinStr : (isValidPin(pinStr) ? await hashPin(pinStr) : '');
        if (!pinValue) { errs.push(`user:${u.id||'?'}`); continue; }
        await DB.prepare(
          `INSERT OR IGNORE INTO users (id,name,role,pin,email) VALUES (?,?,?,?,?)`
        ).bind(u.id, u.name, u.role, pinValue, u.email || '').run();
      } catch(e) { errs.push(`user:${u.id}`); }
    }
  }
  if (data.settings && typeof data.settings === 'object') {
    await saveSettings(DB, data.settings);
  }
  if (data.pettyConfig) {
    await updatePettyConfig(DB, data.pettyConfig);
  }
  return ok({ imported: true, errors: errs.length > 0 ? errs : undefined });
}

async function markAllRead(DB) {
  await DB.prepare(`UPDATE notifications SET is_read=1 WHERE is_read=0`).run();
  return ok({ marked: true });
}
