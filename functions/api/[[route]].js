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
const OPENAI_REALTIME_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe';

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
    const contentType = request.headers.get('Content-Type') || '';
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && contentType.includes('application/json')) {
      try { body = await request.json(); } catch { body = {}; }
    } else if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      body = {};
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
    if (route === 'kpsc-login-options' && method === 'GET') return await getKpscLoginOptions(DB);
    if (route === 'kpsc-login' && method === 'POST') return await kpscLoginUser(DB, body);
    if (route === 'kpsc-change-pin' && method === 'POST') return await changeKpscPin(DB, body);
    if (route === 'kpsc-accounts') {
      if (method === 'GET'  && !param) return await getKpscAccounts(DB);
      if (method === 'POST' && !param) return await createKpscAccount(DB, body);
      if (method === 'PUT'  &&  param) return await updateKpscAccount(DB, param, body);
    }
    if (route === 'kpsc-partners') {
      if (method === 'GET'  && !param) return await getKpscPartners(DB);
      if (method === 'POST' && !param) return await createKpscPartner(DB, body);
      if (method === 'PUT'  &&  param) return await updateKpscPartner(DB, param, body);
    }
    if (route === 'kpsc-partner-payments') {
      if (method === 'GET'  && !param) return await getKpscPartnerPayments(DB, url);
      if (method === 'POST' && !param) return await upsertKpscPartnerPayment(DB, body);
      if (method === 'DELETE' && param) return await deleteKpscPartnerPayment(DB, param);
    }
    if (route === 'kpsc-finance') {
      if (method === 'GET'  && !param) return await getKpscFinanceEntries(DB, url);
      if (method === 'POST' && !param) return await createKpscFinanceEntry(DB, body);
      if (method === 'PUT'  &&  param) return await updateKpscFinanceEntry(DB, param, body);
    }
    if (route === 'kpsc-reminders') {
      if (method === 'GET'  && !param) return await getKpscReminders(DB, url);
      if (method === 'POST' && !param) return await createKpscReminder(DB, body);
    }
    if (route === 'kpsc-dashboard' && method === 'GET') return await getKpscDashboard(DB, url);
    if (route === 'kpsc-reconciliation' && method === 'POST') return await runKpscReconciliation(DB, body);
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
      if (method === 'GET'  && param === 'api-status') return getApiStatus(env);
      if (method === 'GET'  && !param) return await getSettings(DB);
      if (method === 'POST' && !param) return await saveSettings(DB, body);
    }

    // ── /api/notifications ─────────────────────────────────────
    if (route === 'notifications') {
      if (method === 'GET'  && !param)           return await getNotifications(DB);
      if (method === 'POST' && !param)           return await createNotification(DB, body);
      if (method === 'POST' && param === 'read') return await markAllRead(DB);
    }

    // ── /api/realtime-transcription-token ───────────────────────
    if (route === 'realtime-transcription-token') {
      if (method === 'POST' && !param) return await createRealtimeTranscriptionToken(env);
    }

    // ── /api/deepgram-transcription-token ───────────────────────
    if (route === 'deepgram-transcription-token') {
      if (method === 'POST' && !param) return await createDeepgramTranscriptionToken(env);
    }

    // ── /api/azure-speaker-profiles ────────────────────────────
    // Proxy to Azure Cognitive Services Speaker Recognition v2.0.
    // Create, enrol, and delete speaker profiles that power persistent
    // voice fingerprinting across meetings.
    if (route === 'azure-speaker-profiles') {
      if (method === 'POST'   && !param)                    return await azureCreateSpeakerProfile(env);
      if (method === 'POST'   &&  param && parts[2] === 'enroll') return await azureEnrollSpeaker(env, param, body);
      if (method === 'DELETE' &&  param && !parts[2])       return await azureDeleteSpeakerProfile(env, param);
    }

    // ── /api/azure-speaker-identify ────────────────────────────
    if (route === 'azure-speaker-identify') {
      if (method === 'POST' && !param) return await azureIdentifySpeaker(env, body);
    }

    // ── /api/ai-secretary-meetings ─────────────────────────────
    if (route === 'ai-secretary-meetings') {
      if (method === 'POST' && param === 'audio-chunk') return await uploadAiSecretaryAudioChunk(env, request);
      if (method === 'GET'  && !param) return await getAiSecretaryMeetings(DB);
      if (method === 'POST' && !param) return await createAiSecretaryMeeting(DB, body);
      if (method === 'GET'  &&  param) return await getAiSecretaryMeeting(DB, param);
      if (method === 'PUT'  &&  param) return await updateAiSecretaryMeeting(DB, param, body);
      if (method === 'DELETE' && param) return await deleteAiSecretaryMeeting(DB, param, body);
      if (method === 'POST' && parts[2] === 'process') return await processAiSecretaryMeeting(DB, param);
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
    `CREATE TABLE IF NOT EXISTS ai_secretary_meetings (
      id                TEXT PRIMARY KEY,
      title             TEXT NOT NULL DEFAULT '',
      meeting_type      TEXT DEFAULT 'routine',
      meeting_date      TEXT DEFAULT '',
      status            TEXT DEFAULT 'draft',
      participants_json TEXT DEFAULT '[]',
      transcript_text   TEXT DEFAULT '',
      summary_short     TEXT DEFAULT '',
      summary_long      TEXT DEFAULT '',
      minutes_markdown  TEXT DEFAULT '',
      resolutions_json  TEXT DEFAULT '[]',
      action_items_json TEXT DEFAULT '[]',
      policy_flags_json TEXT DEFAULT '[]',
      created_by        TEXT DEFAULT '',
      started_at        TEXT DEFAULT '',
      ended_at          TEXT DEFAULT '',
      processed_at      TEXT DEFAULT '',
      created_at        TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS kpsc_accounts (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      role              TEXT NOT NULL DEFAULT 'committee_viewer',
      pin               TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'active',
      must_change_pin   INTEGER DEFAULT 1,
      last_login_at     TEXT DEFAULT '',
      created_at        TEXT DEFAULT (datetime('now')),
      updated_at        TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS kpsc_partners (
      id                  TEXT PRIMARY KEY,
      full_name           TEXT NOT NULL DEFAULT '',
      phone               TEXT DEFAULT '',
      partnership_type    TEXT NOT NULL DEFAULT 'gods_kingdom_partner',
      start_date          TEXT DEFAULT '',
      monthly_pledge      REAL DEFAULT 0,
      status              TEXT NOT NULL DEFAULT 'active',
      reminder_preference TEXT DEFAULT 'sms',
      notes               TEXT DEFAULT '',
      created_by          TEXT DEFAULT '',
      created_at          TEXT DEFAULT (datetime('now')),
      updated_at          TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS kpsc_partner_payments (
      id            TEXT PRIMARY KEY,
      partner_id    TEXT NOT NULL,
      year          INTEGER NOT NULL,
      month         INTEGER NOT NULL,
      amount        REAL DEFAULT 0,
      payment_type  TEXT NOT NULL DEFAULT 'monthly_pledge',
      source        TEXT DEFAULT 'partnership',
      paid          INTEGER DEFAULT 1,
      paid_at       TEXT DEFAULT '',
      reference     TEXT DEFAULT '',
      recorded_by   TEXT DEFAULT '',
      notes         TEXT DEFAULT '',
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS kpsc_finance_entries (
      id               TEXT PRIMARY KEY,
      date             TEXT NOT NULL DEFAULT '',
      entry_type       TEXT NOT NULL DEFAULT 'income',
      category         TEXT NOT NULL DEFAULT '',
      sub_category     TEXT DEFAULT '',
      amount           REAL DEFAULT 0,
      payment_method   TEXT DEFAULT '',
      reference        TEXT DEFAULT '',
      narration        TEXT DEFAULT '',
      partner_id       TEXT DEFAULT '',
      recorded_by      TEXT DEFAULT '',
      approved_by      TEXT DEFAULT '',
      approval_status  TEXT DEFAULT 'recorded',
      attachment_name  TEXT DEFAULT '',
      created_at       TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS kpsc_reminders (
      id            TEXT PRIMARY KEY,
      partner_id    TEXT NOT NULL DEFAULT '',
      channel       TEXT NOT NULL DEFAULT 'sms',
      message       TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'queued',
      year          INTEGER NOT NULL,
      month         INTEGER NOT NULL,
      sent_by       TEXT DEFAULT '',
      sent_at       TEXT DEFAULT '',
      created_at    TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS kpsc_reconciliation_runs (
      id                TEXT PRIMARY KEY,
      statement_year    INTEGER NOT NULL,
      statement_month   INTEGER NOT NULL,
      statement_items_json TEXT DEFAULT '[]',
      result_json       TEXT DEFAULT '{}',
      created_by        TEXT DEFAULT '',
      created_at        TEXT DEFAULT (datetime('now'))
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
    `ALTER TABLE cash_transactions ADD COLUMN photo_data TEXT DEFAULT ''`,
    // Soft-delete for AI secretary meeting drafts.
    `ALTER TABLE ai_secretary_meetings ADD COLUMN deleted_at TEXT DEFAULT ''`,
    `ALTER TABLE ai_secretary_meetings ADD COLUMN deleted_by TEXT DEFAULT ''`,
  ];
  for (const m of migrations) {
    try { await DB.prepare(m).run(); } catch { /* column already exists — safe to ignore */ }
  }

  await DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_kpsc_partner_payment_period ON kpsc_partner_payments(partner_id, year, month, payment_type)`).run();

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
    kpsc_default_pin: '1234',
    kpsc_partnership_types: JSON.stringify([
      { key: 'gods_kingdom_partner', label: "God's Kingdom Partner" },
      { key: 'covenant_partner', label: 'Covenant Partner' },
    ]),
    kpsc_income_categories: JSON.stringify([
      'partnership_payment',
      'one_time_donation',
      'wealth_development_offering',
      'other_income',
    ]),
    kpsc_expense_categories: JSON.stringify([
      'projects',
      'welfare',
      'rent',
      'church_support',
      'committee_operations',
    ]),
    kpsc_reminder_template: 'Dear {{name}}, this is a reminder to pay your {{month}} partnership pledge. God bless you.',
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

  const defaultKpscAccounts = [
    { id: 'ka1', name: 'Acting Chairman', role: 'acting_chairman', pin: '1234' },
    { id: 'ka2', name: 'General Secretary', role: 'general_secretary', pin: '1234' },
    { id: 'ka3', name: 'Financial Secretary', role: 'financial_secretary', pin: '1234' },
    { id: 'ka4', name: 'Treasurer', role: 'treasurer', pin: '1234' },
    { id: 'ka5', name: 'Committee Viewer', role: 'committee_viewer', pin: '1234' },
  ];
  for (const acct of defaultKpscAccounts) {
    const hashedPin = await hashPin(acct.pin);
    await DB.prepare(
      `INSERT OR IGNORE INTO kpsc_accounts (id,name,role,pin,status,must_change_pin) VALUES (?,?,?,?,?,?)`
    ).bind(acct.id, acct.name, acct.role, hashedPin, 'active', 1).run();
  }

  return ok({
    success: true,
    message: 'Database initialised. All tables created and default users seeded.',
    tables: ['users','income','expenses','petty_cash','petty_config','remittances','cash_transactions','audit_log','settings','notifications','ai_secretary_meetings','kpsc_accounts','kpsc_partners','kpsc_partner_payments','kpsc_finance_entries','kpsc_reminders','kpsc_reconciliation_runs'],
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

const KPSC_ROLES = new Set(['acting_chairman', 'general_secretary', 'financial_secretary', 'treasurer', 'committee_viewer']);

function publicKpscAccount(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    status: row.status,
    mustChangePin: Number(row.must_change_pin || 0) === 1,
    lastLoginAt: row.last_login_at || '',
  };
}

function normalizeKpscRole(role) {
  const normalized = String(role || '').trim().toLowerCase().replace(/\s+/g, '_');
  return KPSC_ROLES.has(normalized) ? normalized : 'committee_viewer';
}

function normalizeKpscAccountStatus(status) {
  return String(status || '').toLowerCase() === 'inactive' ? 'inactive' : 'active';
}

function normalizeMonth(value) {
  const month = Number.parseInt(value, 10);
  if (!Number.isFinite(month)) return 0;
  return Math.min(12, Math.max(1, month));
}

function normalizeYear(value) {
  const year = Number.parseInt(value, 10);
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isFinite(year)) return currentYear;
  return Math.min(2099, Math.max(2000, year));
}

async function getKpscLoginOptions(DB) {
  const { results } = await DB.prepare(`
    SELECT id,name,role,status,must_change_pin,last_login_at
    FROM kpsc_accounts
    WHERE status='active'
    ORDER BY name
  `).all();
  return ok((results || []).map(publicKpscAccount));
}

async function getKpscAccounts(DB) {
  const { results } = await DB.prepare(`
    SELECT id,name,role,status,must_change_pin,last_login_at,created_at
    FROM kpsc_accounts
    ORDER BY name
  `).all();
  return ok((results || []).map(row => ({
    ...publicKpscAccount(row),
    createdAt: row.created_at || '',
  })));
}

async function createKpscAccount(DB, data) {
  const name = String(data?.name || '').trim();
  const role = normalizeKpscRole(data?.role);
  const status = normalizeKpscAccountStatus(data?.status);
  const pin = String(data?.pin || '').trim();
  if (!name || !pin) return err('name and pin are required', 400);
  if (!isValidPin(pin)) return err('pin must be 4-6 digits', 400);
  const id = newId('ka');
  await DB.prepare(`
    INSERT INTO kpsc_accounts (id,name,role,pin,status,must_change_pin,updated_at)
    VALUES (?,?,?,?,?,?,?)
  `).bind(
    id,
    name,
    role,
    await hashPin(pin),
    status,
    Number(data?.mustChangePin !== false),
    new Date().toISOString(),
  ).run();
  return ok({ id, name, role, status, mustChangePin: Number(data?.mustChangePin !== false) === 1 });
}

async function updateKpscAccount(DB, id, data) {
  const existing = await DB.prepare(`SELECT * FROM kpsc_accounts WHERE id=?`).bind(id).first();
  if (!existing) return err('KPSC account not found', 404);
  const name = data?.name !== undefined ? String(data.name || '').trim() : existing.name;
  const role = data?.role !== undefined ? normalizeKpscRole(data.role) : existing.role;
  const status = data?.status !== undefined ? normalizeKpscAccountStatus(data.status) : existing.status;
  const mustChangePin = data?.mustChangePin !== undefined ? Number(!!data.mustChangePin) : Number(existing.must_change_pin || 0);
  const rawPin = String(data?.pin || '').trim();
  let pin = existing.pin;
  if (rawPin) {
    if (!isValidPin(rawPin)) return err('pin must be 4-6 digits', 400);
    pin = await hashPin(rawPin);
  }
  if (!name) return err('name is required', 400);
  await DB.prepare(`
    UPDATE kpsc_accounts
    SET name=?, role=?, status=?, pin=?, must_change_pin=?, updated_at=?
    WHERE id=?
  `).bind(name, role, status, pin, mustChangePin, new Date().toISOString(), id).run();
  const updated = await DB.prepare(`SELECT id,name,role,status,must_change_pin,last_login_at FROM kpsc_accounts WHERE id=?`).bind(id).first();
  return ok(publicKpscAccount(updated));
}

async function kpscLoginUser(DB, data) {
  const accountId = String(data?.accountId || '').trim();
  const pin = String(data?.pin || '').trim();
  if (!accountId || !pin) return err('accountId and pin are required', 400);
  const row = await DB.prepare(`SELECT * FROM kpsc_accounts WHERE id=? AND status='active'`).bind(accountId).first();
  if (!row) return err('Invalid credentials', 401);
  const valid = await verifyPin(row.pin, pin);
  if (!valid) return err('Invalid credentials', 401);
  if (!isHashedPin(row.pin)) {
    await DB.prepare(`UPDATE kpsc_accounts SET pin=?, updated_at=? WHERE id=?`).bind(await hashPin(pin), new Date().toISOString(), row.id).run();
  }
  const now = new Date().toISOString();
  await DB.prepare(`UPDATE kpsc_accounts SET last_login_at=?, updated_at=? WHERE id=?`).bind(now, now, row.id).run();
  return ok({ ...publicKpscAccount({ ...row, last_login_at: now }), sessionType: 'kpsc' });
}

async function changeKpscPin(DB, data) {
  const accountId = String(data?.accountId || '').trim();
  const currentPin = String(data?.currentPin || '').trim();
  const newPin = String(data?.newPin || '').trim();
  if (!accountId || !currentPin || !newPin) return err('accountId, currentPin, and newPin are required', 400);
  if (!isValidPin(newPin)) return err('New PIN must be 4-6 digits', 400);
  const row = await DB.prepare(`SELECT id,pin FROM kpsc_accounts WHERE id=?`).bind(accountId).first();
  if (!row) return err('KPSC account not found', 404);
  if (!(await verifyPin(row.pin, currentPin))) return err('Current PIN is incorrect', 401);
  await DB.prepare(`UPDATE kpsc_accounts SET pin=?, must_change_pin=0, updated_at=? WHERE id=?`)
    .bind(await hashPin(newPin), new Date().toISOString(), accountId).run();
  return ok({ success: true, id: accountId, mustChangePin: false });
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
    photoData:     row.photo_data,
    createdAt:     row.created_at,
  })));
}

async function createCashTransaction(DB, data) {
  const id = data.id || newId('CTX-');
  await DB.prepare(`
    INSERT INTO cash_transactions
      (id,type,date,amount,description,reference,authorized_by,recorded_by,deposit_method,income_ref,destination,photo_data)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
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
    data.photoData     || '',
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

function maskedKeyStatus(value) {
  const key = String(value || '').trim();
  if (!key) return { configured: false, masked: '', message: 'Missing' };
  const start = key.slice(0, 5);
  const end = key.length > 9 ? key.slice(-4) : '';
  return { configured: true, masked: `${start}…${end}`, message: 'Configured' };
}

function getApiStatus(env) {
  const openai = maskedKeyStatus(env.OPENAI_API_KEY);
  return ok({
    liveTranscription: {
      configured: openai.configured,
      active: openai.configured,
      provider: 'OpenAI',
      model: OPENAI_REALTIME_TRANSCRIPTION_MODEL,
      keyName: 'OPENAI_API_KEY',
      masked: openai.masked,
      message: openai.configured
        ? `OPENAI_API_KEY is configured. Live transcription will use ${OPENAI_REALTIME_TRANSCRIPTION_MODEL}.`
        : 'OPENAI_API_KEY is missing. Add it in Cloudflare Pages → Settings → Environment Variables.',
    },
    diarization: {
      ...maskedKeyStatus(env.DEEPGRAM_API_KEY),
      keyName: 'DEEPGRAM_API_KEY',
    },
    speakerRecognition: {
      ...maskedKeyStatus(env.AZURE_SPEAKER_KEY),
      keyName: 'AZURE_SPEAKER_KEY',
      region: String(env.AZURE_SPEAKER_REGION || 'eastus').trim(),
    },
  });
}

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

async function getKpscPartners(DB) {
  const { results } = await DB.prepare(`
    SELECT *
    FROM kpsc_partners
    ORDER BY full_name
  `).all();
  return ok((results || []).map(row => ({
    id: row.id,
    fullName: row.full_name,
    phone: row.phone || '',
    partnershipType: row.partnership_type || 'gods_kingdom_partner',
    startDate: row.start_date || '',
    monthlyPledge: Number(row.monthly_pledge || 0),
    status: row.status || 'active',
    reminderPreference: row.reminder_preference || 'sms',
    notes: row.notes || '',
    createdBy: row.created_by || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  })));
}

async function createKpscPartner(DB, data) {
  const fullName = String(data?.fullName || '').trim();
  if (!fullName) return err('fullName is required', 400);
  const id = newId('kp');
  await DB.prepare(`
    INSERT INTO kpsc_partners (
      id,full_name,phone,partnership_type,start_date,monthly_pledge,status,reminder_preference,notes,created_by,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id,
    fullName,
    String(data?.phone || '').trim(),
    String(data?.partnershipType || 'gods_kingdom_partner').trim(),
    String(data?.startDate || '').trim(),
    Number(data?.monthlyPledge || 0),
    normalizeKpscAccountStatus(data?.status),
    String(data?.reminderPreference || 'sms').trim() || 'sms',
    String(data?.notes || '').trim(),
    String(data?.createdBy || '').trim(),
    new Date().toISOString(),
  ).run();
  const row = await DB.prepare(`SELECT * FROM kpsc_partners WHERE id=?`).bind(id).first();
  return ok({
    id: row.id,
    fullName: row.full_name,
    phone: row.phone || '',
    partnershipType: row.partnership_type,
    startDate: row.start_date || '',
    monthlyPledge: Number(row.monthly_pledge || 0),
    status: row.status || 'active',
    reminderPreference: row.reminder_preference || 'sms',
    notes: row.notes || '',
    createdBy: row.created_by || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  });
}

async function updateKpscPartner(DB, id, data) {
  const row = await DB.prepare(`SELECT * FROM kpsc_partners WHERE id=?`).bind(id).first();
  if (!row) return err('KPSC partner not found', 404);
  const fullName = data?.fullName !== undefined ? String(data.fullName || '').trim() : row.full_name;
  if (!fullName) return err('fullName is required', 400);
  await DB.prepare(`
    UPDATE kpsc_partners
    SET full_name=?, phone=?, partnership_type=?, start_date=?, monthly_pledge=?, status=?, reminder_preference=?, notes=?, updated_at=?
    WHERE id=?
  `).bind(
    fullName,
    data?.phone !== undefined ? String(data.phone || '').trim() : row.phone,
    data?.partnershipType !== undefined ? String(data.partnershipType || 'gods_kingdom_partner').trim() : row.partnership_type,
    data?.startDate !== undefined ? String(data.startDate || '').trim() : row.start_date,
    data?.monthlyPledge !== undefined ? Number(data.monthlyPledge || 0) : Number(row.monthly_pledge || 0),
    data?.status !== undefined ? normalizeKpscAccountStatus(data.status) : row.status,
    data?.reminderPreference !== undefined ? String(data.reminderPreference || 'sms').trim() : row.reminder_preference,
    data?.notes !== undefined ? String(data.notes || '').trim() : row.notes,
    new Date().toISOString(),
    id,
  ).run();
  return await createKpscPartnerResponse(DB, id);
}

async function createKpscPartnerResponse(DB, id) {
  const row = await DB.prepare(`SELECT * FROM kpsc_partners WHERE id=?`).bind(id).first();
  if (!row) return err('KPSC partner not found', 404);
  return ok({
    id: row.id,
    fullName: row.full_name,
    phone: row.phone || '',
    partnershipType: row.partnership_type,
    startDate: row.start_date || '',
    monthlyPledge: Number(row.monthly_pledge || 0),
    status: row.status || 'active',
    reminderPreference: row.reminder_preference || 'sms',
    notes: row.notes || '',
    createdBy: row.created_by || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  });
}

async function getKpscPartnerPayments(DB, url) {
  const year = normalizeYear(url.searchParams.get('year'));
  const month = normalizeMonth(url.searchParams.get('month'));
  const filters = ['p.year=?'];
  const binds = [year];
  if (month) {
    filters.push('p.month=?');
    binds.push(month);
  }
  const { results } = await DB.prepare(`
    SELECT p.*, kp.full_name AS partner_name, kp.partnership_type, kp.status AS partner_status
    FROM kpsc_partner_payments p
    LEFT JOIN kpsc_partners kp ON kp.id = p.partner_id
    WHERE ${filters.join(' AND ')}
    ORDER BY p.year DESC, p.month DESC, partner_name
  `).bind(...binds).all();
  return ok((results || []).map(row => ({
    id: row.id,
    partnerId: row.partner_id,
    partnerName: row.partner_name || '',
    partnershipType: row.partnership_type || '',
    partnerStatus: row.partner_status || '',
    year: Number(row.year || 0),
    month: Number(row.month || 0),
    amount: Number(row.amount || 0),
    paymentType: row.payment_type || 'monthly_pledge',
    source: row.source || 'partnership',
    paid: Number(row.paid || 0) === 1,
    paidAt: row.paid_at || '',
    reference: row.reference || '',
    recordedBy: row.recorded_by || '',
    notes: row.notes || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  })));
}

async function upsertKpscPartnerPayment(DB, data) {
  const partnerId = String(data?.partnerId || '').trim();
  const year = normalizeYear(data?.year);
  const month = normalizeMonth(data?.month);
  if (!partnerId || !month) return err('partnerId, year, and month are required', 400);
  const paymentType = String(data?.paymentType || 'monthly_pledge').trim() || 'monthly_pledge';
  const existing = await DB.prepare(`
    SELECT id FROM kpsc_partner_payments
    WHERE partner_id=? AND year=? AND month=? AND payment_type=?
  `).bind(partnerId, year, month, paymentType).first();
  const id = existing?.id || newId('kpp');
  const paid = Number(data?.paid !== false);
  const paidAt = data?.paidAt !== undefined ? String(data.paidAt || '').trim() : (paid ? new Date().toISOString() : '');
  await DB.prepare(`
    INSERT OR REPLACE INTO kpsc_partner_payments
    (id,partner_id,year,month,amount,payment_type,source,paid,paid_at,reference,recorded_by,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM kpsc_partner_payments WHERE id=?), datetime('now')),?)
  `).bind(
    id,
    partnerId,
    year,
    month,
    Number(data?.amount || 0),
    paymentType,
    String(data?.source || 'partnership').trim() || 'partnership',
    paid,
    paidAt,
    String(data?.reference || '').trim(),
    String(data?.recordedBy || '').trim(),
    String(data?.notes || '').trim(),
    id,
    new Date().toISOString(),
  ).run();
  const row = await DB.prepare(`SELECT * FROM kpsc_partner_payments WHERE id=?`).bind(id).first();
  return ok({
    id: row.id,
    partnerId: row.partner_id,
    year: Number(row.year || 0),
    month: Number(row.month || 0),
    amount: Number(row.amount || 0),
    paymentType: row.payment_type || 'monthly_pledge',
    source: row.source || 'partnership',
    paid: Number(row.paid || 0) === 1,
    paidAt: row.paid_at || '',
    reference: row.reference || '',
    recordedBy: row.recorded_by || '',
    notes: row.notes || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  });
}

async function deleteKpscPartnerPayment(DB, id) {
  await DB.prepare(`DELETE FROM kpsc_partner_payments WHERE id=?`).bind(id).run();
  return ok({ deleted: id });
}

async function getKpscFinanceEntries(DB, url) {
  const month = normalizeMonth(url.searchParams.get('month'));
  const year = normalizeYear(url.searchParams.get('year'));
  const entryType = String(url.searchParams.get('entryType') || '').trim().toLowerCase();
  const where = ['strftime(\'%Y\', date)=?',];
  const binds = [String(year)];
  if (month) {
    where.push(`strftime('%m', date)=?`);
    binds.push(String(month).padStart(2, '0'));
  }
  if (entryType === 'income' || entryType === 'expense') {
    where.push('entry_type=?');
    binds.push(entryType);
  }
  const { results } = await DB.prepare(`
    SELECT f.*, p.full_name AS partner_name
    FROM kpsc_finance_entries f
    LEFT JOIN kpsc_partners p ON p.id = f.partner_id
    WHERE ${where.join(' AND ')}
    ORDER BY date DESC, created_at DESC
  `).bind(...binds).all();
  return ok((results || []).map(row => ({
    id: row.id,
    date: row.date,
    entryType: row.entry_type,
    category: row.category || '',
    subCategory: row.sub_category || '',
    amount: Number(row.amount || 0),
    paymentMethod: row.payment_method || '',
    reference: row.reference || '',
    narration: row.narration || '',
    partnerId: row.partner_id || '',
    partnerName: row.partner_name || '',
    recordedBy: row.recorded_by || '',
    approvedBy: row.approved_by || '',
    approvalStatus: row.approval_status || 'recorded',
    attachmentName: row.attachment_name || '',
    createdAt: row.created_at || '',
  })));
}

async function createKpscFinanceEntry(DB, data) {
  const date = String(data?.date || '').trim();
  const entryType = String(data?.entryType || '').trim().toLowerCase();
  const category = String(data?.category || '').trim();
  if (!date || !category || !['income', 'expense'].includes(entryType)) {
    return err('date, category and valid entryType are required', 400);
  }
  const id = newId('kfe');
  await DB.prepare(`
    INSERT INTO kpsc_finance_entries
    (id,date,entry_type,category,sub_category,amount,payment_method,reference,narration,partner_id,recorded_by,approved_by,approval_status,attachment_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id,
    date,
    entryType,
    category,
    String(data?.subCategory || '').trim(),
    Number(data?.amount || 0),
    String(data?.paymentMethod || '').trim(),
    String(data?.reference || '').trim(),
    String(data?.narration || '').trim(),
    String(data?.partnerId || '').trim(),
    String(data?.recordedBy || '').trim(),
    String(data?.approvedBy || '').trim(),
    String(data?.approvalStatus || 'recorded').trim() || 'recorded',
    String(data?.attachmentName || '').trim(),
  ).run();
  return await getKpscFinanceEntryById(DB, id);
}

async function updateKpscFinanceEntry(DB, id, data) {
  const row = await DB.prepare(`SELECT * FROM kpsc_finance_entries WHERE id=?`).bind(id).first();
  if (!row) return err('KPSC finance entry not found', 404);
  await DB.prepare(`
    UPDATE kpsc_finance_entries
    SET date=?, entry_type=?, category=?, sub_category=?, amount=?, payment_method=?, reference=?, narration=?, partner_id=?, recorded_by=?, approved_by=?, approval_status=?, attachment_name=?
    WHERE id=?
  `).bind(
    data?.date !== undefined ? String(data.date || '').trim() : row.date,
    data?.entryType !== undefined ? String(data.entryType || row.entry_type).trim().toLowerCase() : row.entry_type,
    data?.category !== undefined ? String(data.category || '').trim() : row.category,
    data?.subCategory !== undefined ? String(data.subCategory || '').trim() : row.sub_category,
    data?.amount !== undefined ? Number(data.amount || 0) : Number(row.amount || 0),
    data?.paymentMethod !== undefined ? String(data.paymentMethod || '').trim() : row.payment_method,
    data?.reference !== undefined ? String(data.reference || '').trim() : row.reference,
    data?.narration !== undefined ? String(data.narration || '').trim() : row.narration,
    data?.partnerId !== undefined ? String(data.partnerId || '').trim() : row.partner_id,
    data?.recordedBy !== undefined ? String(data.recordedBy || '').trim() : row.recorded_by,
    data?.approvedBy !== undefined ? String(data.approvedBy || '').trim() : row.approved_by,
    data?.approvalStatus !== undefined ? String(data.approvalStatus || 'recorded').trim() : row.approval_status,
    data?.attachmentName !== undefined ? String(data.attachmentName || '').trim() : row.attachment_name,
    id,
  ).run();
  return await getKpscFinanceEntryById(DB, id);
}

async function getKpscFinanceEntryById(DB, id) {
  const row = await DB.prepare(`SELECT * FROM kpsc_finance_entries WHERE id=?`).bind(id).first();
  if (!row) return err('KPSC finance entry not found', 404);
  return ok({
    id: row.id,
    date: row.date,
    entryType: row.entry_type,
    category: row.category || '',
    subCategory: row.sub_category || '',
    amount: Number(row.amount || 0),
    paymentMethod: row.payment_method || '',
    reference: row.reference || '',
    narration: row.narration || '',
    partnerId: row.partner_id || '',
    recordedBy: row.recorded_by || '',
    approvedBy: row.approved_by || '',
    approvalStatus: row.approval_status || 'recorded',
    attachmentName: row.attachment_name || '',
    createdAt: row.created_at || '',
  });
}

async function getKpscReminders(DB, url) {
  const year = normalizeYear(url.searchParams.get('year'));
  const month = normalizeMonth(url.searchParams.get('month'));
  const { results } = await DB.prepare(`
    SELECT r.*, p.full_name AS partner_name
    FROM kpsc_reminders r
    LEFT JOIN kpsc_partners p ON p.id = r.partner_id
    WHERE r.year=? AND r.month=?
    ORDER BY r.created_at DESC
  `).bind(year, month || (new Date().getUTCMonth() + 1)).all();
  return ok((results || []).map(row => ({
    id: row.id,
    partnerId: row.partner_id,
    partnerName: row.partner_name || '',
    channel: row.channel || 'sms',
    message: row.message || '',
    status: row.status || 'queued',
    year: Number(row.year || 0),
    month: Number(row.month || 0),
    sentBy: row.sent_by || '',
    sentAt: row.sent_at || '',
    createdAt: row.created_at || '',
  })));
}

async function createKpscReminder(DB, data) {
  const partnerIds = Array.isArray(data?.partnerIds) ? data.partnerIds : [data?.partnerId];
  const cleaned = partnerIds.map(id => String(id || '').trim()).filter(Boolean);
  if (!cleaned.length) return err('partnerId or partnerIds is required', 400);
  const month = normalizeMonth(data?.month) || (new Date().getUTCMonth() + 1);
  const year = normalizeYear(data?.year);
  const message = String(data?.message || '').trim();
  if (!message) return err('message is required', 400);
  const sentBy = String(data?.sentBy || '').trim();
  const channel = String(data?.channel || 'sms').trim() || 'sms';
  const out = [];
  for (const partnerId of cleaned) {
    const id = newId('krm');
    await DB.prepare(`
      INSERT INTO kpsc_reminders (id,partner_id,channel,message,status,year,month,sent_by,sent_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).bind(id, partnerId, channel, message, 'sent', year, month, sentBy, new Date().toISOString()).run();
    out.push({ id, partnerId, channel, status: 'sent', year, month });
  }
  return ok({ sent: out.length, reminders: out });
}

async function getKpscDashboard(DB, url) {
  const year = normalizeYear(url.searchParams.get('year'));
  const month = normalizeMonth(url.searchParams.get('month')) || (new Date().getUTCMonth() + 1);

  const incomeRow = await DB.prepare(`
    SELECT COALESCE(SUM(amount),0) AS total
    FROM kpsc_finance_entries
    WHERE entry_type='income' AND strftime('%Y', date)=? AND strftime('%m', date)=?
  `).bind(String(year), String(month).padStart(2, '0')).first();

  const expenseRow = await DB.prepare(`
    SELECT COALESCE(SUM(amount),0) AS total
    FROM kpsc_finance_entries
    WHERE entry_type='expense' AND strftime('%Y', date)=? AND strftime('%m', date)=?
  `).bind(String(year), String(month).padStart(2, '0')).first();

  const partnersRow = await DB.prepare(`
    SELECT
      COUNT(*) AS total_partners,
      SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active_partners
    FROM kpsc_partners
  `).first();

  const paidPartnersRow = await DB.prepare(`
    SELECT COUNT(DISTINCT partner_id) AS paid_count
    FROM kpsc_partner_payments
    WHERE year=? AND month=? AND paid=1
  `).bind(year, month).first();

  const unpaidPartnersRow = await DB.prepare(`
    SELECT COUNT(*) AS unpaid_count
    FROM kpsc_partners p
    WHERE p.status='active'
      AND NOT EXISTS (
        SELECT 1 FROM kpsc_partner_payments pay
        WHERE pay.partner_id=p.id AND pay.year=? AND pay.month=? AND pay.paid=1
      )
  `).bind(year, month).first();

  const remindersRow = await DB.prepare(`
    SELECT COUNT(*) AS sent_count
    FROM kpsc_reminders
    WHERE year=? AND month=?
  `).bind(year, month).first();

  return ok({
    month,
    year,
    totals: {
      income: Number(incomeRow?.total || 0),
      expense: Number(expenseRow?.total || 0),
      balance: Number(incomeRow?.total || 0) - Number(expenseRow?.total || 0),
      partners: Number(partnersRow?.total_partners || 0),
      activePartners: Number(partnersRow?.active_partners || 0),
      paidPartners: Number(paidPartnersRow?.paid_count || 0),
      unpaidPartners: Number(unpaidPartnersRow?.unpaid_count || 0),
      remindersSent: Number(remindersRow?.sent_count || 0),
    },
  });
}

function normalizeStatementItem(item, index) {
  return {
    id: `st-${index + 1}`,
    date: String(item?.date || '').slice(0, 10),
    amount: Math.abs(Number(item?.amount || 0)),
    type: String(item?.type || '').toLowerCase() === 'expense' ? 'expense' : 'income',
    reference: String(item?.reference || '').trim(),
    narration: String(item?.narration || '').trim(),
  };
}

async function runKpscReconciliation(DB, data) {
  const statementYear = normalizeYear(data?.statementYear);
  const statementMonth = normalizeMonth(data?.statementMonth) || (new Date().getUTCMonth() + 1);
  const statementItems = Array.isArray(data?.statementItems) ? data.statementItems.map(normalizeStatementItem) : [];
  const createdBy = String(data?.createdBy || '').trim();
  if (!statementItems.length) return err('statementItems is required', 400);

  const { results } = await DB.prepare(`
    SELECT id,date,entry_type,amount,reference,narration
    FROM kpsc_finance_entries
    WHERE strftime('%Y', date)=? AND strftime('%m', date)=?
    ORDER BY date ASC, created_at ASC
  `).bind(String(statementYear), String(statementMonth).padStart(2, '0')).all();
  const financeEntries = (results || []).map(row => ({
    id: row.id,
    date: row.date,
    type: row.entry_type === 'expense' ? 'expense' : 'income',
    amount: Math.abs(Number(row.amount || 0)),
    reference: row.reference || '',
    narration: row.narration || '',
  }));

  const usedFinanceIds = new Set();
  const matches = [];
  const unmatchedStatement = [];
  for (const item of statementItems) {
    const candidate = financeEntries.find(entry =>
      !usedFinanceIds.has(entry.id)
      && entry.type === item.type
      && Math.abs(entry.amount - item.amount) < 0.5
    );
    if (candidate) {
      usedFinanceIds.add(candidate.id);
      matches.push({
        statementItem: item,
        financeEntry: candidate,
        confidence: 0.9,
      });
    } else {
      unmatchedStatement.push(item);
    }
  }

  const unmatchedFinance = financeEntries.filter(entry => !usedFinanceIds.has(entry.id));
  const result = {
    summary: {
      totalStatementItems: statementItems.length,
      matchedCount: matches.length,
      unmatchedStatementCount: unmatchedStatement.length,
      unmatchedFinanceCount: unmatchedFinance.length,
    },
    matches,
    unmatchedStatement,
    unmatchedFinance,
    notes: [
      'This reconciliation result is AI-assisted/deterministic and requires officer review before final approval.',
    ],
  };

  const runId = newId('krec');
  await DB.prepare(`
    INSERT INTO kpsc_reconciliation_runs (id,statement_year,statement_month,statement_items_json,result_json,created_by)
    VALUES (?,?,?,?,?,?)
  `).bind(
    runId,
    statementYear,
    statementMonth,
    JSON.stringify(statementItems),
    JSON.stringify(result),
    createdBy,
  ).run();

  return ok({ runId, ...result });
}


// ── AI SECRETARY ───────────────────────────────────────────────────
function normalizeAiParticipants(participants) {
  const incoming = Array.isArray(participants) ? participants : [];
  if (incoming.length === 0) {
    return [
      { group: 'men',       label: 'Men',       present: false, name: '' },
      { group: 'women',     label: 'Women',     present: false, name: '' },
      { group: 'youth',     label: 'Youth',     present: false, name: '' },
      { group: 'ministers', label: 'Ministers', present: false, name: '' },
    ];
  }
  // Preserve all entries as-is (supports multiple members per group from the KPSC portal)
  return incoming.map(p => ({
    group:   String(p.group   || 'men').toLowerCase(),
    label:   String(p.label   || p.group || ''),
    present: !!p.present,
    name:    String(p.name    || '').trim(),
  }));
}

function aiSecretaryMeetingFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    meetingType: row.meeting_type,
    meetingDate: row.meeting_date,
    status: row.status,
    participants: safeJsonParse(row.participants_json, []),
    transcriptText: row.transcript_text || '',
    summaryShort: row.summary_short || '',
    summaryLong: row.summary_long || '',
    minutesMarkdown: row.minutes_markdown || '',
    resolutions: safeJsonParse(row.resolutions_json, []),
    actionItems: safeJsonParse(row.action_items_json, []),
    policyFlags: safeJsonParse(row.policy_flags_json, []),
    createdBy: row.created_by || '',
    startedAt: row.started_at || '',
    endedAt: row.ended_at || '',
    processedAt: row.processed_at || '',
    createdAt: row.created_at || '',
    deletedAt: row.deleted_at || '',
    deletedBy: row.deleted_by || '',
  };
}

function transcriptSentences(transcript) {
  return String(transcript || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function extractSentenceMatches(transcript, patterns, limit = 8) {
  return transcriptSentences(transcript)
    .filter(sentence => patterns.some(pattern => pattern.test(sentence)))
    .slice(0, limit);
}

function uniqueAiSecretaryItems(items, keyFn, limit = 12) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = String(keyFn(item) || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function titleCaseAiSecretary(text) {
  return String(text || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

function extractNairaAmount(text) {
  const m = String(text || '').match(/(?:₦|N\s?)([0-9][0-9,]*(?:\.\d{1,2})?)|([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:naira|ngn)/i);
  return m ? (m[1] || m[2] || '').replace(/,/g, '') : '';
}

function inferResolutionType(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(reject(?:ed|ion)?|declin(?:ed|e)|not approved|voted down|disapproved)\b/.test(t)) return 'rejection';
  if (/\b(amend(?:ed|ment)?|modify|revis(?:ed|ion)|adjust(?:ed|ment)?)\b/.test(t)) return 'amendment';
  if (/\b(motion|moved|proposed)\b/.test(t)) return 'motion';
  if (/\b(vote|voted|ballot|show of hands|unanimous|majority)\b/.test(t)) return 'vote';
  if (/(₦|\bnaira\b|\bngn\b|budget|fund|payment|expense|cost|purchase|welfare|repair|invoice|quote)/i.test(text)) return 'financial_approval';
  if (/\b(approv(?:e|es|ed|al)|agreed|resolved|carried|adopted|passed)\b/.test(t)) return 'approval';
  return 'decision';
}

function inferResolutionCategory(text, fallback = 'other') {
  const t = String(text || '').toLowerCase();
  if (/welfare|support|assistance|benevolence|beneficiar/.test(t)) return 'welfare';
  if (/budget|fund|payment|expense|cost|purchase|repair|invoice|quote|₦|naira|ngn/.test(t)) return 'financial';
  if (/building|land|capital|renovation|project|equipment|generator/.test(t)) return 'development';
  if (/policy|bylaw|constitution|procedure|governance/.test(t)) return 'governance';
  return fallback;
}

function inferApprovalState(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(reject(?:ed|ion)?|declin(?:ed|e)|not approved|voted down|disapproved)\b/.test(t)) return false;
  if (/\b(defer(?:red)?|pending|table(?:d)?|postpone(?:d)?|await(?:ing)?|review later)\b/.test(t)) return null;
  if (/\b(approv(?:e|es|ed|al)|agreed|resolved|carried|adopted|passed|unanimous)\b/.test(t)) return true;
  return null;
}

function inferVoteSummary(text, type, threshold) {
  const t = String(text || '').toLowerCase();
  const voteMatch = text.match(/(?:vote(?:d)?|votes?)\s*(?:was|were|:)?\s*([^.;\n]+)/i);
  if (voteMatch) return voteMatch[1].trim();
  if (/unanimous(?:ly)?/.test(t)) return 'Unanimous approval detected; secretary should confirm before final filing.';
  if (/second(?:ed)?/.test(t) && /motion|moved|proposed/.test(t)) return 'Motion and seconding detected; final vote count should be confirmed.';
  if (type === 'rejection') return 'Rejected/declined language detected; confirm vote record.';
  if (type === 'amendment') return 'Amendment language detected; confirm amended wording and vote outcome.';
  return threshold === 'two_thirds' ? 'Two-thirds threshold suggested for review.' : 'Simple majority threshold suggested for review.';
}

function inferPersonAfter(text, patterns) {
  for (const pattern of patterns) {
    const m = String(text || '').match(pattern);
    if (m?.[1]) return m[1].replace(/[,.;:].*$/, '').trim();
  }
  return '';
}

function inferActionAssignee(text) {
  const cleaned = String(text || '').replace(/^action\s*[:.-]?\s*/i, '').trim();
  return inferPersonAfter(cleaned, [
    /^([^:–—-]{2,60}?)\s+(?:to|will|shall|should|is to|was asked to)\b/i,
    /(?:assigned to|responsible person:?|owner:?|by)\s+([^,.;]{2,60})/i,
    /(?:treasurer|secretary|pastor|chair(?:person)?|women(?: president)?|youth(?: vp| president)?|admin(?: officer)?|accountant)/i,
  ]) || (cleaned.match(/\b(treasurer|secretary|pastor|chair(?:person)?|women(?: president)?|youth(?: vp| president)?|admin(?: officer)?|accountant)\b/i)?.[0] || 'Unassigned');
}

function inferActionDueDate(text) {
  const m = String(text || '').match(/\b(?:by|before|on|deadline:?|due:?|not later than)\s+([A-Za-z]+\s+\d{1,2}(?:,?\s*\d{4})?|\d{4}-\d{2}-\d{2}|(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow|today)\b/i);
  return m ? m[1].trim() : '';
}

function extractAgendaItems(transcript) {
  const sentences = transcriptSentences(transcript);
  const explicit = [];
  for (const sentence of sentences) {
    const m = sentence.match(/(?:agenda|item|matter|discussion)\s*(?:item)?\s*(?:[:.-]|was|is)?\s*(.+)$/i);
    if (m?.[1]) explicit.push(m[1].trim());
  }
  const topical = sentences
    .filter(s => /welfare|budget|finance|financial|generator|rent|building|repair|policy|bylaw|project|offering|remittance|department|proposal/i.test(s))
    .map(s => s.replace(/^.*?\b(?:discuss(?:ed|ion)?|review(?:ed)?|consider(?:ed)?|approve(?:s|d)?|agenda)\b\s*(?:of|on|for|:)?\s*/i, '').trim());
  return uniqueAiSecretaryItems([...explicit, ...topical], item => item, 8);
}

function extractResolutions(transcript, governanceFlags) {
  const majorProject = governanceFlags.some(flag => flag.type === 'threshold_review');
  const decisionSentences = extractSentenceMatches(transcript, [
    /\b(resolve[ds]?|resolution|approves|approved|approval|agreed|motion|moved|second(?:ed)?|decision|voted|vote|rejected|declined|not approved|amend(?:ed|ment)?|deferred|financial approval|budget|₦|naira|ngn)\b/i,
  ], 20);
  return uniqueAiSecretaryItems(decisionSentences.map((text, index) => {
    const type = inferResolutionType(text);
    const category = inferResolutionCategory(text, majorProject ? 'development' : 'other');
    const threshold = majorProject || category === 'development' ? 'two_thirds' : 'simple_majority';
    return {
      id: `res-${index + 1}`,
      text,
      category,
      resolutionType: type,
      requiredThreshold: threshold,
      approved: inferApprovalState(text),
      amount: extractNairaAmount(text),
      motionBy: inferPersonAfter(text, [/\b(?:moved|proposed by|motion by)\s+([^,.;]+)/i]),
      secondedBy: inferPersonAfter(text, [/\b(?:seconded by|supported by)\s+([^,.;]+)/i]),
      voteSummary: inferVoteSummary(text, type, threshold),
    };
  }), item => item.text, 20);
}

function extractActionItems(transcript) {
  const actionSentences = extractSentenceMatches(transcript, [
    /\b(action|follow up|to do|assign(?:ed)?|responsible|deadline|before|not later than|to submit|to prepare|to review|to send|to provide|to obtain|to present|to contact|will submit|shall submit|should submit|will prepare|shall prepare|should prepare)\b/i,
  ], 30);
  return uniqueAiSecretaryItems(actionSentences.map((text, index) => ({
    id: `act-${index + 1}`,
    task: text.replace(/^action\s*[:.-]?\s*/i, '').trim(),
    assignee: inferActionAssignee(text),
    dueDate: inferActionDueDate(text),
    status: 'pending',
  })), item => item.task, 30);
}

const AI_SECRETARY_REQUIRED_GROUPS = [
  { group: 'men', label: 'Men' },
  { group: 'women', label: 'Women' },
  { group: 'youth', label: 'Youth' },
  { group: 'ministers', label: 'Ministers' },
];

function aiSecretaryText(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function aiSecretaryArray(value) {
  return Array.isArray(value) ? value : [];
}

function aiSecretarySeverity(value, fallback = 'medium') {
  const severity = String(value || '').toLowerCase();
  return ['low', 'medium', 'high'].includes(severity) ? severity : fallback;
}

function aiSecretaryThreshold(value, fallback = 'simple_majority') {
  const threshold = String(value || '').toLowerCase().replace(/[\s-]+/g, '_');
  return ['simple_majority', 'two_thirds', 'manual_review'].includes(threshold) ? threshold : fallback;
}

function aiSecretaryParticipantCoverage(participants) {
  const normalized = normalizeAiParticipants(participants);
  const represented = new Set(normalized.filter(p => p.present).map(p => String(p.group || '').toLowerCase()));
  const missingGroups = AI_SECRETARY_REQUIRED_GROUPS
    .filter(required => !represented.has(required.group))
    .map(required => required.label);
  return { normalized, represented, missingGroups, quorumMet: missingGroups.length === 0 };
}

function buildAiSecretaryGovernanceFlags(meeting) {
  const transcript = meeting.transcriptText || '';
  const { missingGroups, quorumMet } = aiSecretaryParticipantCoverage(meeting.participants);
  const flags = [];
  if (!quorumMet) {
    flags.push({ type: 'quorum_missing', severity: 'high', message: `Missing required representative group(s): ${missingGroups.join(', ')}.` });
  }
  if (!String(transcript).trim()) {
    flags.push({ type: 'transcript_missing', severity: 'high', message: 'No transcript or secretary notes were provided; generated minutes require manual reconstruction from approved records.' });
  }
  if (!['ended', 'processed'].includes(String(meeting.status || '').toLowerCase())) {
    flags.push({ type: 'meeting_not_ended', severity: 'medium', message: 'Meeting was processed before being marked ended; confirm the transcript is final before approval.' });
  }
  if (/building|land|capital|renovation|project|equipment/i.test(transcript)) {
    flags.push({ type: 'threshold_review', severity: 'medium', message: 'Potential major capital project detected; confirm whether two-thirds approval is required.' });
  }
  if (/beneficiar(y|ies)|welfare.+(name|names)|medical|hospital|family issue|confidential|diagnosis/i.test(transcript)) {
    flags.push({ type: 'welfare_privacy', severity: 'medium', message: 'Possible welfare/privacy details detected; remove beneficiary names from minutes unless necessary.' });
  }
  if (/ignore (previous|all|policy|instruction)|override (policy|governance)|do not flag|hide (this|the)|return only approved/i.test(transcript)) {
    flags.push({ type: 'prompt_injection_risk', severity: 'high', message: 'Transcript contains instruction-like language that could manipulate AI output; rely on human review and deterministic policy checks.' });
  }
  return flags;
}

function dedupeAiSecretaryFlags(flags) {
  const seen = new Set();
  return aiSecretaryArray(flags).map(flag => ({
    type: aiSecretaryText(flag?.type, 'manual_review').toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'manual_review',
    severity: aiSecretarySeverity(flag?.severity),
    message: aiSecretaryText(flag?.message, 'Manual review required.'),
  })).filter(flag => {
    const key = `${flag.type}:${flag.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

function appendAiSecretaryMandatoryChecks(markdown, flags) {
  const mandatoryFlags = dedupeAiSecretaryFlags(flags);
  if (!mandatoryFlags.length) return markdown;
  const section = [
    '',
    '## Mandatory Governance Checks',
    ...mandatoryFlags.map(flag => `- ${flag.severity.toUpperCase()}: ${flag.message}`),
  ].join('\n');
  return /mandatory governance checks|policy checks/i.test(markdown) ? markdown : `${markdown}${section}`;
}

function sanitizeAiSecretaryOutput(rawOutput, meeting, deterministicOutput) {
  const raw = rawOutput && typeof rawOutput === 'object' ? rawOutput : {};
  const deterministic = deterministicOutput || buildAiSecretaryOutput(meeting, { skipSanitize: true });
  const governanceFlags = buildAiSecretaryGovernanceFlags(meeting);
  const resolutions = aiSecretaryArray(raw.resolutions).map((item, index) => {
    const text = aiSecretaryText(item?.text);
    const resolutionType = aiSecretaryText(item?.resolutionType || item?.type, inferResolutionType(text));
    const category = aiSecretaryText(item?.category, inferResolutionCategory(text)) || 'other';
    const requiredThreshold = aiSecretaryThreshold(item?.requiredThreshold, category === 'development' ? 'two_thirds' : 'simple_majority');
    const approved = item?.approved === true ? true : item?.approved === false ? false : inferApprovalState(text);
    return {
      id: aiSecretaryText(item?.id, `res-${index + 1}`),
      text,
      category,
      resolutionType,
      requiredThreshold,
      approved,
      amount: aiSecretaryText(item?.amount, extractNairaAmount(text)),
      motionBy: aiSecretaryText(item?.motionBy),
      secondedBy: aiSecretaryText(item?.secondedBy),
      voteSummary: aiSecretaryText(item?.voteSummary, inferVoteSummary(text, resolutionType, requiredThreshold)),
    };
  }).filter(item => item.text).slice(0, 20);
  const actionItems = aiSecretaryArray(raw.actionItems).map((item, index) => {
    const task = aiSecretaryText(item?.task);
    return {
      id: aiSecretaryText(item?.id, `act-${index + 1}`),
      task,
      assignee: aiSecretaryText(item?.assignee, inferActionAssignee(task)) || 'Unassigned',
      dueDate: aiSecretaryText(item?.dueDate, inferActionDueDate(task)),
      status: aiSecretaryText(item?.status, 'pending') || 'pending',
    };
  }).filter(item => item.task).slice(0, 30);
  const output = {
    summaryShort: aiSecretaryText(raw.summaryShort, deterministic.summaryShort),
    executiveSummary: aiSecretaryText(raw.executiveSummary, deterministic.executiveSummary),
    summaryLong: aiSecretaryText(raw.summaryLong, deterministic.summaryLong),
    agendaItems: aiSecretaryArray(raw.agendaItems).map(item => aiSecretaryText(item)).filter(Boolean).slice(0, 12),
    minutesMarkdown: aiSecretaryText(raw.minutesMarkdown, deterministic.minutesMarkdown),
    resolutions: resolutions.length ? resolutions : deterministic.resolutions,
    actionItems: actionItems.length ? actionItems : deterministic.actionItems,
    policyFlags: dedupeAiSecretaryFlags([...aiSecretaryArray(raw.policyFlags), ...governanceFlags]),
  };
  if (!output.agendaItems.length) output.agendaItems = deterministic.agendaItems || extractAgendaItems(meeting.transcriptText || '');
  if (!output.minutesMarkdown) output.minutesMarkdown = deterministic.minutesMarkdown;
  output.minutesMarkdown = appendAiSecretaryMandatoryChecks(output.minutesMarkdown, governanceFlags);
  return output;
}

function parseAiSecretaryJson(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch (_) {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return JSON.parse(fenced[1]);
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error('AI response did not contain valid JSON');
}

function buildAiSecretaryOutput(meeting, options = {}) {
  const transcript = meeting.transcriptText || '';
  const { normalized: participants, missingGroups, quorumMet } = aiSecretaryParticipantCoverage(meeting.participants);
  const present = participants.filter(p => p.present);
  const governanceFlags = buildAiSecretaryGovernanceFlags(meeting);
  const majorProject = governanceFlags.some(flag => flag.type === 'threshold_review');
  const welfare = /welfare|support|assistance|benevolence/i.test(transcript);
  const policyContext = aiSecretaryText(meeting.policyContext);
  const agendaItems = extractAgendaItems(transcript);
  const resolutions = extractResolutions(transcript, governanceFlags);
  const actionItems = extractActionItems(transcript);
  const approvedCount = resolutions.filter(r => r.approved === true).length;
  const rejectedCount = resolutions.filter(r => r.approved === false).length;
  const deferredCount = resolutions.filter(r => r.approved === null).length;
  const financialCount = resolutions.filter(r => r.category === 'financial' || r.resolutionType === 'financial_approval').length;
  const attendanceText = present.map(p => `${p.label}${p.name ? ` (${p.name})` : ''}`).join(', ') || 'No representatives marked present';
  const summaryShort = `${meeting.title || 'KPSC meeting'} captured ${present.length} attendee(s) across ${new Set(present.map(p => p.group)).size} of 4 required representative groups. ${resolutions.length} decision item(s), ${financialCount} financial/welfare approval item(s), and ${actionItems.length} action item(s) were identified.`;
  const executiveSummary = [
    quorumMet ? 'Quorum appears met across Men, Women, Youth, and Ministers.' : `Quorum needs attention: missing ${missingGroups.join(', ')} representative group(s).`,
    resolutions.length
      ? `Decision register: ${approvedCount} approved, ${rejectedCount} rejected, ${deferredCount} deferred/needs confirmation.`
      : 'No explicit decision register items were detected; secretary review is required.',
    actionItems.length
      ? `${actionItems.length} follow-up task(s) were extracted for tracking.`
      : 'No explicit follow-up task was detected; secretary should confirm manually.',
  ].join(' ');
  const summaryLong = [
    `Meeting type: ${meeting.meetingType || 'routine'}.`,
    `Attendance: ${attendanceText}.`,
    quorumMet ? 'Quorum check: Men, Women, Youth, and Ministers are all represented.' : `Quorum check: missing ${missingGroups.join(', ')} representative group(s); approvals should be deferred or ratified later.`,
    majorProject ? 'Governance note: capital/project language was detected, so two-thirds approval may apply.' : 'Governance note: no major capital-project language was detected by the draft processor.',
    welfare ? 'Welfare note: welfare-related language was detected; keep KPSC records focused on funds and avoid unnecessary beneficiary names.' : 'Welfare note: no welfare-specific issue was detected.',
    financialCount ? `Financial note: ${financialCount} financial or welfare approval-related item(s) should be cross-checked with the finance records.` : 'Financial note: no explicit financial approval amount was detected by the draft processor.',
    policyContext ? 'Policy reference note: saved KPSC policy notes are available for review and provider-backed processing.' : 'Policy reference note: no extra KPSC policy notes were saved in settings.',
  ].join('\n');
  const minutesMarkdown = [
    `# ${meeting.title || 'KPSC Meeting'} Minutes`,
    `**Date:** ${meeting.meetingDate || 'Not specified'}`,
    `**Type:** ${meeting.meetingType || 'routine'}`,
    `**Quorum:** ${quorumMet ? 'Met' : `Not met (${missingGroups.join(', ')} missing)`}`,
    '',
    '## Attendance',
    ...participants.map(p => `- ${p.label}: ${p.present ? `Present${p.name ? ` — ${p.name}` : ''}` : 'Absent'}`),
    '',
    '## Agenda / Matters Discussed',
    ...(agendaItems.length ? agendaItems.map(item => `- ${item}`) : ['- No explicit agenda was detected. Use transcript review to confirm the agenda before final filing.']),
    '',
    '## Executive Summary',
    executiveSummary,
    '',
    '## Detailed Summary',
    summaryLong,
    '',
    '## Decision & Resolution Register',
    ...(resolutions.length ? resolutions.map(r => {
      const status = r.approved === true ? 'Approved' : r.approved === false ? 'Rejected' : 'Deferred / confirm outcome';
      const amount = r.amount ? `; Amount: ₦${Number(r.amount).toLocaleString('en-NG')}` : '';
      return `- **${titleCaseAiSecretary(r.resolutionType)}** (${status}; ${titleCaseAiSecretary(r.category)}; ${r.requiredThreshold.replace('_', ' ')}${amount}) — ${r.text}`;
    }) : ['- No explicit resolutions detected. Review transcript and add approved decisions manually.']),
    '',
    '## Motions, Voting & Amendments',
    ...(resolutions.length ? resolutions.map(r => `- ${r.voteSummary || 'Manual vote review required.'}${r.motionBy ? ` Motion by: ${r.motionBy}.` : ''}${r.secondedBy ? ` Seconded by: ${r.secondedBy}.` : ''}`) : ['- No explicit motion, seconding, amendment, or voting outcome was detected.']),
    '',
    '## Action Items',
    ...(actionItems.length ? actionItems.map(a => `- ${a.task} — Owner: ${a.assignee || 'Unassigned'}${a.dueDate ? `; Due: ${a.dueDate}` : '; Due: Not stated'}`) : ['- No explicit action items detected. Review transcript and add follow-up tasks manually.']),
    '',
    '## Policy Checks',
    ...(governanceFlags.length ? governanceFlags.map(f => `- ${f.severity.toUpperCase()}: ${f.message}`) : ['- No policy flags detected by the draft processor.']),
  ].join('\n');
  const output = { summaryShort, executiveSummary, summaryLong, agendaItems, minutesMarkdown, resolutions, actionItems, policyFlags: governanceFlags };
  return options.skipSanitize ? output : sanitizeAiSecretaryOutput(output, meeting, output);
}

async function getAiSecretaryMeetings(DB) {
  const { results } = await DB.prepare(
    `SELECT * FROM ai_secretary_meetings
     WHERE COALESCE(deleted_at,'') = ''
     ORDER BY meeting_date DESC, created_at DESC LIMIT 200`
  ).all();
  return ok((results || []).map(aiSecretaryMeetingFromRow));
}

async function deleteAiSecretaryMeeting(DB, id, data) {
  const existing = await DB.prepare(`SELECT id, created_by, deleted_at FROM ai_secretary_meetings WHERE id=?`).bind(id).first();
  if (!existing) return err('AI secretary meeting not found', 404);
  if (existing.deleted_at) return ok({ id, deletedAt: existing.deleted_at });

  // Author-or-admin authorization. The frontend is trusted to forward the
  // logged-in user's name and role (same trust model as createdBy on POST).
  const userName = String(data?.userName || '').trim();
  const userRole = String(data?.userRole || '').trim().toLowerCase();
  const isAdmin = userRole === 'admin' || userRole === 'it_administrator';
  const isAuthor = !!userName && userName === (existing.created_by || '');
  if (!isAdmin && !isAuthor) {
    return err('Only the meeting author or an administrator can delete this draft.', 403);
  }

  const now = new Date().toISOString();
  await DB.prepare(
    `UPDATE ai_secretary_meetings SET deleted_at=?, deleted_by=? WHERE id=?`
  ).bind(now, userName || (isAdmin ? 'admin' : ''), id).run();
  return ok({ id, deletedAt: now });
}

async function getAiSecretaryMeeting(DB, id) {
  const row = await DB.prepare(`SELECT * FROM ai_secretary_meetings WHERE id=?`).bind(id).first();
  if (!row) return err('AI secretary meeting not found', 404);
  return ok(aiSecretaryMeetingFromRow(row));
}

async function createAiSecretaryMeeting(DB, data) {
  const id = data.id || newId('AIM-');
  const participants = normalizeAiParticipants(data.participants);
  const now = new Date().toISOString();
  await DB.prepare(`
    INSERT INTO ai_secretary_meetings
      (id,title,meeting_type,meeting_date,status,participants_json,transcript_text,created_by,started_at,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id,
    String(data.title || 'KPSC Meeting').trim(),
    data.meetingType || 'routine',
    data.meetingDate || now.slice(0, 10),
    data.status || 'draft',
    JSON.stringify(participants),
    data.transcriptText || '',
    data.createdBy || '',
    data.startedAt || '',
    now,
  ).run();
  return await getAiSecretaryMeeting(DB, id);
}

async function updateAiSecretaryMeeting(DB, id, data) {
  const existing = await DB.prepare(`SELECT * FROM ai_secretary_meetings WHERE id=?`).bind(id).first();
  if (!existing) return err('AI secretary meeting not found', 404);
  const participants = data.participants !== undefined ? normalizeAiParticipants(data.participants) : safeJsonParse(existing.participants_json, []);
  const resolutions = data.resolutions !== undefined
    ? aiSecretaryArray(data.resolutions).map((item, index) => {
        const text = aiSecretaryText(item?.text);
        const resolutionType = aiSecretaryText(item?.resolutionType || item?.type, inferResolutionType(text));
        const category = aiSecretaryText(item?.category, inferResolutionCategory(text)) || 'other';
        const requiredThreshold = aiSecretaryThreshold(item?.requiredThreshold, category === 'development' ? 'two_thirds' : 'simple_majority');
        const approved = item?.approved === true ? true : item?.approved === false ? false : null;
        return {
          id: aiSecretaryText(item?.id, `res-${index + 1}`),
          text,
          category,
          resolutionType,
          requiredThreshold,
          approved,
          amount: aiSecretaryText(item?.amount),
          motionBy: aiSecretaryText(item?.motionBy),
          secondedBy: aiSecretaryText(item?.secondedBy),
          voteSummary: aiSecretaryText(item?.voteSummary),
        };
      }).filter(item => item.text).slice(0, 20)
    : safeJsonParse(existing.resolutions_json, []);
  const actionItems = data.actionItems !== undefined
    ? aiSecretaryArray(data.actionItems).map((item, index) => ({
        id: aiSecretaryText(item?.id, `act-${index + 1}`),
        task: aiSecretaryText(item?.task),
        assignee: aiSecretaryText(item?.assignee, 'Unassigned') || 'Unassigned',
        dueDate: aiSecretaryText(item?.dueDate),
        status: aiSecretaryText(item?.status, 'pending') || 'pending',
      })).filter(item => item.task).slice(0, 30)
    : safeJsonParse(existing.action_items_json, []);
  const policyFlags = data.policyFlags !== undefined
    ? dedupeAiSecretaryFlags(data.policyFlags)
    : safeJsonParse(existing.policy_flags_json, []);

  await DB.prepare(`
    UPDATE ai_secretary_meetings SET
      title=?, meeting_type=?, meeting_date=?, status=?, participants_json=?, transcript_text=?, ended_at=?,
      summary_short=?, summary_long=?, minutes_markdown=?, resolutions_json=?, action_items_json=?, policy_flags_json=?
    WHERE id=?
  `).bind(
    data.title !== undefined ? String(data.title).trim() : existing.title,
    data.meetingType !== undefined ? data.meetingType : existing.meeting_type,
    data.meetingDate !== undefined ? data.meetingDate : existing.meeting_date,
    data.status !== undefined ? data.status : existing.status,
    JSON.stringify(participants),
    data.transcriptText !== undefined ? data.transcriptText : existing.transcript_text,
    data.endedAt !== undefined ? data.endedAt : existing.ended_at,
    data.summaryShort !== undefined ? aiSecretaryText(data.summaryShort) : existing.summary_short,
    data.summaryLong !== undefined ? aiSecretaryText(data.summaryLong) : existing.summary_long,
    data.minutesMarkdown !== undefined ? aiSecretaryText(data.minutesMarkdown) : existing.minutes_markdown,
    JSON.stringify(resolutions),
    JSON.stringify(actionItems),
    JSON.stringify(policyFlags),
    id,
  ).run();
  return await getAiSecretaryMeeting(DB, id);
}

async function callDeepSeekForMeeting(apiKey, meeting) {
  const participantList = (meeting.participants || [])
    .map(p => `${p.label}: ${p.present ? (p.name || 'Present') : 'Absent'}`).join(', ');
  const policyContext = aiSecretaryText(meeting.policyContext);
  const prompt = `You are a professional church committee secretary. Process the following KPSC meeting and return a JSON object with these exact keys: summaryShort (1-2 sentence string), executiveSummary (plain-language executive summary string), summaryLong (detailed multi-line string), agendaItems (array of agenda or discussion topics), minutesMarkdown (full minutes in Markdown), resolutions (array of {id,text,category,resolutionType,requiredThreshold,approved,amount,motionBy,secondedBy,voteSummary}), actionItems (array of {id,task,assignee,dueDate,status}), policyFlags (array of {type,severity,message}).

Resolution classification requirements:
- resolutionType must be one of approval, rejection, amendment, motion, vote, financial_approval, decision.
- category should identify welfare, financial, development, governance, or other.
- Extract naira/NGN amounts for financial approvals when present.
- Capture motion mover, seconder, and vote outcome where mentioned.
- If outcome is unclear, set approved to null and explain in voteSummary.

Action item requirements:
- Extract task, owner/assignee, and deadline if spoken.
- Use "Unassigned" and empty dueDate only when not stated.

Saved KPSC policy/bylaw notes:
${policyContext || '(none saved)'}

Meeting title: ${meeting.title}
Date: ${meeting.meetingDate}
Type: ${meeting.meetingType}
Attendance: ${participantList}
Transcript:
${meeting.transcriptText || '(no transcript provided)'}

Return only valid JSON, no markdown fences.`;

  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], max_tokens: 3000, temperature: 0.3 }),
  });
  if (!resp.ok) throw new Error(`DeepSeek API error ${resp.status}`);
  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content || '';
  return parseAiSecretaryJson(text);
}

async function processAiSecretaryMeeting(DB, id) {
  const row = await DB.prepare(`SELECT * FROM ai_secretary_meetings WHERE id=?`).bind(id).first();
  if (!row) return err('AI secretary meeting not found', 404);
  const meeting = aiSecretaryMeetingFromRow(row);
  let deepseekKey = '';
  try {
    const { results: settingsRows } = await DB.prepare(`SELECT key,value FROM settings WHERE key IN ('ai_deepseek_key','kpsc_policy_url','kpsc_policy_notes')`).all();
    const settings = Object.fromEntries((settingsRows || []).map(item => [item.key, String(item.value || '')]));
    deepseekKey = settings.ai_deepseek_key ? String(settings.ai_deepseek_key).trim() : '';
    meeting.policyContext = [
      settings.kpsc_policy_url ? `Policy URL: ${settings.kpsc_policy_url}` : '',
      settings.kpsc_policy_notes || '',
    ].filter(Boolean).join('\n');
  } catch (_) {
    meeting.policyContext = '';
  }

  const deterministicOutput = buildAiSecretaryOutput(meeting);
  let output;
  try {
    output = deepseekKey
      ? sanitizeAiSecretaryOutput(await callDeepSeekForMeeting(deepseekKey, meeting), meeting, deterministicOutput)
      : deterministicOutput;
  } catch (_) {
    output = deterministicOutput;
  }

  const processedAt = new Date().toISOString();
  await DB.prepare(`
    UPDATE ai_secretary_meetings SET
      status='processed', summary_short=?, summary_long=?, minutes_markdown=?, resolutions_json=?, action_items_json=?, policy_flags_json=?, processed_at=?
    WHERE id=?
  `).bind(
    output.summaryShort || '',
    output.summaryLong || '',
    output.minutesMarkdown || '',
    JSON.stringify(output.resolutions || []),
    JSON.stringify(output.actionItems || []),
    JSON.stringify(output.policyFlags || []),
    processedAt,
    id,
  ).run();
  return getAiSecretaryMeeting(DB, id);
}


async function createRealtimeTranscriptionToken(env) {
  const apiKey = String(env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return err('OPENAI_API_KEY is not configured for realtime transcription.', 503);

  const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            noise_reduction: { type: 'near_field' },
            transcription: {
              model: OPENAI_REALTIME_TRANSCRIPTION_MODEL,
              language: 'en',
              prompt: 'Kingdom Parish Stewardship Committee meeting transcription. Preserve names, votes, resolutions, action items, and church finance terms accurately.',
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
          },
        },
      },
      expires_after: { anchor: 'created_at', seconds: 600 },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return err(data.error?.message || `OpenAI realtime token request failed (${response.status}).`, response.status);
  }
  return ok(data);
}

async function createDeepgramTranscriptionToken(env) {
  const apiKey = String(env.DEEPGRAM_API_KEY || '').trim();
  if (!apiKey) return err('DEEPGRAM_API_KEY is not configured for speaker diarization.', 503);

  // Deepgram rejects raw API keys passed from browsers via
  // Sec-WebSocket-Protocol. Mint a short-lived (30s) token via the
  // /v1/auth/grant endpoint; the client uses it during the WS handshake.
  const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ttl_seconds: 120 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = data.err_msg || data.error || data.message || `Deepgram grant failed (${res.status}).`;
    return err(reason, res.status);
  }
  const token = data.access_token || data.token;
  if (!token) return err('Deepgram grant response did not include an access token.', 502);
  return ok({ key: token, expires_in: data.expires_in ?? 30 });
}

// ── AZURE SPEAKER RECOGNITION ──────────────────────────────────────
// These four functions proxy requests to Azure Cognitive Services
// Speaker Recognition v2.0 (text-independent).
// Required env vars:
//   AZURE_SPEAKER_KEY    – Azure Cognitive Services key
//   AZURE_SPEAKER_REGION – Azure region slug, default: eastus

// Azure returns this UUID when the identification API finds no matching profile.
const AZURE_NIL_UUID = '00000000-0000-0000-0000-000000000000';
// Standard UUID format: 8-4-4-4-12 hex digits.
const AZURE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Max length of a UUID string after sanitization (36 chars + small safety margin).
const AZURE_UUID_MAX_LEN = 50;

function azureBase(env) {
  const key    = String(env.AZURE_SPEAKER_KEY    || '').trim();
  const region = String(env.AZURE_SPEAKER_REGION || 'eastus').trim();
  return { key, region, base: `https://${region}.api.cognitive.microsoft.com/speaker/identification/v2.0/text-independent` };
}

async function azureCreateSpeakerProfile(env) {
  const { key, base } = azureBase(env);
  if (!key) return err('AZURE_SPEAKER_KEY is not configured. Add it in Cloudflare Pages → Settings → Environment Variables.', 503);

  const res  = await fetch(`${base}/profiles`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale: 'en-us' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return err(data.error?.message || `Azure error (${res.status}).`, res.status);
  return ok({ profileId: data.profileId });
}

async function azureEnrollSpeaker(env, profileId, body) {
  const { key, base } = azureBase(env);
  if (!key) return err('AZURE_SPEAKER_KEY is not configured.', 503);
  if (!profileId) return err('Missing profile ID.', 400);

  const audioBase64 = String(body?.audioBase64 || '');
  if (!audioBase64) return err('Missing audio data.', 400);

  let audioBytes;
  try {
    audioBytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
  } catch {
    return err('Invalid audio data encoding.', 400);
  }

  const res  = await fetch(`${base}/profiles/${encodeURIComponent(profileId)}/enrollments`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'audio/wav' },
    body: audioBytes,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return err(data.error?.message || `Azure enrollment error (${res.status}).`, res.status);
  return ok({
    enrolled: true,
    enrollmentStatus: data.enrollmentStatus || 'Enrolling',
    remainingEnrollmentSpeechLength: data.remainingEnrollmentSpeechLength ?? 0,
  });
}

async function azureDeleteSpeakerProfile(env, profileId) {
  const { key, base } = azureBase(env);
  if (!key) return err('AZURE_SPEAKER_KEY is not configured.', 503);

  const res = await fetch(`${base}/profiles/${encodeURIComponent(profileId)}`, {
    method: 'DELETE',
    headers: { 'Ocp-Apim-Subscription-Key': key },
  });
  if (res.status === 204 || res.ok) return ok({ deleted: true });
  const data = await res.json().catch(() => ({}));
  return err(data.error?.message || `Azure delete error (${res.status}).`, res.status);
}

async function azureIdentifySpeaker(env, body) {
  const { key, base } = azureBase(env);
  if (!key) return err('AZURE_SPEAKER_KEY is not configured.', 503);

  const profileIds = Array.isArray(body?.profileIds) ? body.profileIds : [];
  if (!profileIds.length) return err('No profile IDs provided.', 400);
  if (profileIds.length > 50) return err('Maximum 50 profile IDs per request.', 400);

  const audioBase64 = String(body?.audioBase64 || '');
  if (!audioBase64) return err('Missing audio data.', 400);

  // Sanitise and validate UUIDs (8-4-4-4-12 hex format).
  const safeIds = profileIds
    .map(id => String(id).replace(/[^a-fA-F0-9-]/g, ''))
    .filter(id => id.length <= AZURE_UUID_MAX_LEN && AZURE_UUID_RE.test(id));
  if (!safeIds.length) return err('No valid profile IDs provided.', 400);

  let audioBytes;
  try {
    audioBytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
  } catch {
    return err('Invalid audio data encoding.', 400);
  }

  const res  = await fetch(`${base}/profiles/identify/multipart?profileIds=${safeIds.join(',')}`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'audio/wav' },
    body: audioBytes,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return err(data.error?.message || `Azure identify error (${res.status}).`, res.status);

  const identified = data.identifiedProfile;
  const profileId  = identified?.profileId || null;
  const score      = identified?.score ?? 0;
  // Azure returns the nil UUID when no profile matches.
  const isNilUuid = !profileId || profileId === AZURE_NIL_UUID;
  return ok({ profileId: isNilUuid ? null : profileId, score });
}

async function uploadAiSecretaryAudioChunk(env, request) {
  const form = await request.formData();
  const audio = form.get('audio');
  const uploadSessionId = String(form.get('uploadSessionId') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const meetingId = String(form.get('meetingId') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'unsaved';
  const sequence = String(form.get('sequence') || '0').padStart(5, '0').slice(-5);
  const createdAt = String(form.get('createdAt') || new Date().toISOString());
  const mimeType = String(form.get('mimeType') || audio?.type || 'audio/webm');

  if (!audio || typeof audio.arrayBuffer !== 'function') return err('Missing audio chunk.', 400);
  if (!uploadSessionId) return err('Missing upload session id.', 400);

  const key = `kpsc-audio/${meetingId}/${uploadSessionId}/${sequence}.webm`;
  const bucket = env.KPSC_AUDIO_BUCKET || env.AUDIO_BUCKET;
  if (bucket?.put) {
    await bucket.put(key, audio.stream(), {
      httpMetadata: { contentType: mimeType },
      customMetadata: { meetingId, uploadSessionId, sequence, createdAt },
    });
    return ok({ uploaded: true, stored: true, key, sequence: Number(sequence) });
  }

  // Accept chunks even before an R2 bucket is bound so the browser can keep streaming
  // without retaining a full recording in memory. Configure KPSC_AUDIO_BUCKET to persist audio.
  return ok({ uploaded: true, stored: false, key, sequence: Number(sequence), note: 'No audio bucket configured.' });
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
  const tables = ['income','expenses','petty_cash','remittances','cash_transactions','audit_log','notifications','kpsc_partner_payments','kpsc_finance_entries','kpsc_reminders','kpsc_reconciliation_runs'];
  for (const t of tables) {
    await DB.prepare(`DELETE FROM ${t}`).run();
  }
  // Reset petty cash balance to zero (no cash on hand yet) but keep the approved max
  await DB.prepare(`UPDATE petty_config SET float_amount=0 WHERE id='main'`).run();
  return ok({ cleared: true, preserved: ['users','settings','petty_config max'] });
}

async function adminClear(DB) {
  const tables = ['income','expenses','petty_cash','remittances','cash_transactions','audit_log','notifications','kpsc_accounts','kpsc_partners','kpsc_partner_payments','kpsc_finance_entries','kpsc_reminders','kpsc_reconciliation_runs'];
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
