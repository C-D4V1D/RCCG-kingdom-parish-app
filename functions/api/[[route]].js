// ================================================================
// RCCG Kingdom Parish — Cloudflare Pages Functions API
// Single catch-all handler for /api/* routes
// D1 binding name: DB  (set in Cloudflare Pages → Settings → Functions → D1 bindings)
// ================================================================

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-KPSC-Session',
};

// ── KPSC ROLE GROUPS ────────────────────────────────────────────────
const KPSC_WRITE_ROLES    = ['acting_chairman', 'general_secretary', 'financial_secretary', 'treasurer', 'it_admin'];
const KPSC_FINANCE_ROLES  = ['acting_chairman', 'financial_secretary', 'treasurer', 'it_admin'];
const KPSC_FINANCE_DELETE_ROLES = ['acting_chairman', 'it_admin'];
// Account management: it_admin can create/update/delete accounts without operational permissions.
const KPSC_ADMIN_ROLES    = ['acting_chairman', 'general_secretary', 'it_admin'];
// All roles that can log in to the portal (including read-only viewer and IT admin).
const KPSC_READ_ROLES     = ['acting_chairman', 'general_secretary', 'financial_secretary', 'treasurer', 'committee_viewer', 'it_admin'];

// KPSC_SESSION_TTL_MS: 8 hours
const KPSC_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Verify a KPSC session token and check that the account has one of the
 * allowed roles.  Returns the account row on success, or a Response on
 * failure (401 / 403).
 */
async function requireKpscRole(DB, request, allowedRoles) {
  const header = request.headers.get('X-KPSC-Session') || '';
  if (!header) return err('KPSC session required', 401);
  let accountId, token;
  try {
    const parsed = JSON.parse(header);
    accountId = String(parsed.accountId || '').trim();
    token     = String(parsed.token     || '').trim();
  } catch {
    return err('Invalid X-KPSC-Session header', 401);
  }
  if (!accountId || !token) return err('KPSC session required', 401);

  const now = Date.now();
  const session = await DB.prepare(
    `SELECT account_id, expires_at FROM kpsc_sessions WHERE id=? AND account_id=?`
  ).bind(token, accountId).first();
  if (!session) return err('KPSC session not found or expired', 401);
  if (session.expires_at < now) {
    await DB.prepare(`DELETE FROM kpsc_sessions WHERE id=?`).bind(token).run();
    return err('KPSC session expired', 401);
  }

  const account = await DB.prepare(
    `SELECT id, name, role, status FROM kpsc_accounts WHERE id=? AND status='active'`
  ).bind(accountId).first();
  if (!account) return err('KPSC account not found or inactive', 401);

  if (!allowedRoles.includes(account.role)) {
    return err(`Role '${account.role}' is not permitted for this action`, 403);
  }
  return account;
}

const ok  = (data)       => new Response(JSON.stringify(data),        { status: 200, headers: CORS_HEADERS });
const err = (msg, s=500) => new Response(JSON.stringify({ error: msg }), { status: s,   headers: CORS_HEADERS });
const newId = (prefix='') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const OPENAI_REALTIME_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe';

// ── TERMII SMS HELPERS ────────────────────────────────────────────────
/**
 * Send a single SMS via the Termii API.
 * Returns { ok: true, data } on success or { ok: false, error } on failure.
 * No-ops silently when apiKey is absent — callers need not guard separately.
 */
async function sendTermiiSms(apiKey, senderId, to, sms) {
  if (!apiKey) return { ok: false, error: 'Termii API key not configured' };
  const phone = String(to || '').replace(/\D/g, '');
  if (!phone) return { ok: false, error: 'invalid phone number' };
  try {
    const resp = await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        to: phone,
        from: senderId || 'N-Alert',
        sms,
        type: 'plain',
        channel: 'generic',
      }),
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Load all Termii-related settings from the DB in one query. */
async function getTermiiSettings(DB) {
  const keys = [
    'kpsc_termii_api_key', 'kpsc_termii_sender_id',
    'kpsc_termii_welcome_sms', 'kpsc_termii_payment_sms',
    'kpsc_termii_newmonth_sms', 'kpsc_termii_reminder_day',
    'kpsc_termii_reminder_freq',
  ];
  const placeholders = keys.map(() => '?').join(',');
  const { results } = await DB.prepare(
    `SELECT key, value FROM settings WHERE key IN (${placeholders})`
  ).bind(...keys).all();
  const map = {};
  for (const row of (results || [])) map[row.key] = row.value;
  return {
    apiKey:      String(map.kpsc_termii_api_key  || '').trim(),
    senderId:    String(map.kpsc_termii_sender_id || 'RCCG-KP').trim(),
    welcomeSms:  map.kpsc_termii_welcome_sms  !== '0',
    paymentSms:  map.kpsc_termii_payment_sms  !== '0',
    newMonthSms: map.kpsc_termii_newmonth_sms !== '0',
    reminderDay: parseInt(map.kpsc_termii_reminder_day || '10', 10) || 10,
    reminderFreq: String(map.kpsc_termii_reminder_freq || 'monthly').trim(),
  };
}

// Emoji number labels for WhatsApp agenda lists (items beyond 10 fall back to plain numerals).
const EMOJI_NUMS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
// Absolute naira tolerance when matching statement lines to recorded entries.
const RECONCILIATION_AMOUNT_TOLERANCE_ABSOLUTE = 0.5;

// ── VOICE FINGERPRINTING HELPERS ─────────────────────────────────────
// Cosine similarity between two numeric arrays. Returns -1 on any error.
function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? -1 : dot / denom;
}

// Convert a JS number array to an ArrayBuffer (Float32 little-endian) for D1 BLOB storage.
function embeddingToBlob(arr)  { return new Float32Array(arr).buffer; }

// Convert a D1 BLOB column back to a JS number array.
// D1 (in Cloudflare Pages Functions) returns BLOB columns as a plain JS Array
// of byte values (0-255) — not ArrayBuffer or Uint8Array. Handle every form
// defensively so this keeps working if the runtime ever changes:
//   - ArrayBuffer            → use directly
//   - Uint8Array (any view)  → slice the underlying buffer
//   - Array<number>          → wrap into a Uint8Array and use its buffer
//   - base64 string          → decode to bytes
function blobToEmbedding(blob) {
  if (!blob) return [];
  let buffer;
  if (blob instanceof ArrayBuffer) {
    buffer = blob;
  } else if (ArrayBuffer.isView(blob)) {
    buffer = blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength);
  } else if (Array.isArray(blob)) {
    buffer = new Uint8Array(blob).buffer;
  } else if (typeof blob === 'string') {
    const binary = atob(blob);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    buffer = bytes.buffer;
  } else {
    return [];
  }
  return Array.from(new Float32Array(buffer));
}

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
    if (route === 'kpsc-logout' && method === 'POST') return await kpscLogout(DB, body);
    if (route === 'kpsc-change-pin' && method === 'POST') return await changeKpscPin(DB, body);
    if (route === 'kpsc-accounts') {
      if (method === 'GET'  && !param) return await getKpscAccounts(DB);
      if (method === 'POST' && !param) {
        const auth = await requireKpscRole(DB, request, KPSC_ADMIN_ROLES);
        if (auth instanceof Response) return auth;
        return await createKpscAccount(DB, body);
      }
      if (method === 'PUT'  &&  param) {
        const auth = await requireKpscRole(DB, request, KPSC_ADMIN_ROLES);
        if (auth instanceof Response) return auth;
        return await updateKpscAccount(DB, param, body);
      }
      if (method === 'DELETE' && param) {
        const auth = await requireKpscRole(DB, request, ['acting_chairman', 'it_admin']);
        if (auth instanceof Response) return auth;
        return await deleteKpscAccount(DB, param, auth);
      }
    }
    if (route === 'kpsc-partners') {
      if (method === 'GET'  && !param) return await getKpscPartners(DB);
      if (method === 'POST' && !param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await createKpscPartner(DB, body);
      }
      if (method === 'PUT'  &&  param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await updateKpscPartner(DB, param, body);
      }
      if (method === 'DELETE' && param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await deleteKpscPartner(DB, param, auth);
      }
    }
    if (route === 'kpsc-partner-payments') {
      if (method === 'GET'  && !param) return await getKpscPartnerPayments(DB, url);
      if (method === 'POST' && !param) {
        const auth = await requireKpscRole(DB, request, KPSC_FINANCE_ROLES);
        if (auth instanceof Response) return auth;
        return await upsertKpscPartnerPayment(DB, body);
      }
      if (method === 'DELETE' && param) {
        const auth = await requireKpscRole(DB, request, KPSC_FINANCE_ROLES);
        if (auth instanceof Response) return auth;
        return await deleteKpscPartnerPayment(DB, param, auth);
      }
    }
    if (route === 'kpsc-finance') {
      if (method === 'GET'  && !param) return await getKpscFinanceEntries(DB, url);
      if (method === 'POST' && !param) {
        const auth = await requireKpscRole(DB, request, KPSC_FINANCE_ROLES);
        if (auth instanceof Response) return auth;
        return await createKpscFinanceEntry(DB, body, auth);
      }
      if (method === 'PUT'  &&  param) {
        const auth = await requireKpscRole(DB, request, KPSC_FINANCE_ROLES);
        if (auth instanceof Response) return auth;
        return await updateKpscFinanceEntry(DB, param, body, auth);
      }
      if (method === 'DELETE' && param) {
        const auth = await requireKpscRole(DB, request, KPSC_FINANCE_DELETE_ROLES);
        if (auth instanceof Response) return auth;
        return await deleteKpscFinanceEntry(DB, param, auth);
      }
    }
    if (route === 'kpsc-reminders') {
      if (method === 'GET'  && !param) return await getKpscReminders(DB, url);
      if (method === 'POST' && !param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await createKpscReminder(DB, body);
      }
    }
    if (route === 'kpsc-dashboard' && method === 'GET') return await getKpscDashboard(DB, url);
    if (route === 'kpsc-reconciliation' && method === 'POST') {
      const auth = await requireKpscRole(DB, request, KPSC_FINANCE_ROLES);
      if (auth instanceof Response) return auth;
      return await runKpscReconciliation(DB, body);
    }
    if (route === 'kpsc-projects') {
      if (method === 'GET'  && !param) return await getKpscProjects(DB, url);
      if (method === 'POST' && !param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await createKpscProject(DB, body);
      }
      if (method === 'PUT'  &&  param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await updateKpscProject(DB, param, body);
      }
      if (method === 'DELETE' && param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await deleteKpscProject(DB, param, auth);
      }
    }
    if (route === 'kpsc-extract-projects' && method === 'POST') {
      const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
      if (auth instanceof Response) return auth;
      return await extractProjectsFromMeeting(DB, env, body);
    }
    if (route === 'kpsc-approve-meeting-projects' && method === 'POST') {
      const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
      if (auth instanceof Response) return auth;
      return await approveMeetingProjects(DB, body);
    }
    if (route === 'kpsc-ocr-notes' && method === 'POST') {
      const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
      if (auth instanceof Response) return auth;
      return await ocrHandwrittenNotes(env, body, DB);
    }
    if (route === 'kpsc-transcribe-audio' && method === 'POST') {
      const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
      if (auth instanceof Response) return auth;
      return await transcribeAudioWithWhisper(env, request, DB);
    }
    if (route === 'kpsc-transcribe-audio-diarize' && method === 'POST') {
      const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
      if (auth instanceof Response) return auth;
      return await transcribeAudioWithDiarization(env, request);
    }
    if (route === 'kpsc-ocr-receipt' && method === 'POST') {
      const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
      if (auth instanceof Response) return auth;
      return await ocrReceipt(env, body, DB);
    }
    if (route === 'kpsc-parse-statement' && method === 'POST') {
      const auth = await requireKpscRole(DB, request, KPSC_FINANCE_ROLES);
      if (auth instanceof Response) return auth;
      return await parseStatementWithAI(env, DB, body);
    }
    if (route === 'kpsc-reminder-personalize' && method === 'POST') {
      const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
      if (auth instanceof Response) return auth;
      return await personalizeKpscReminder(DB, env, body);
    }
    if (route === 'change-pin' && method === 'POST') {
      return await changeUserPin(DB, body);
    }

    // ── /api/income ────────────────────────────────────────────
    if (route === 'income') {
      if (method === 'GET'  && !param) return await getIncome(DB);
      if (method === 'POST' && !param) return await createIncome(DB, body);
      if (method === 'PUT'  &&  param) return await updateIncome(DB, param, body);
      if (method === 'DELETE' && param) return await deleteIncome(DB, param);
    }

    // ── /api/expenses ──────────────────────────────────────────
    if (route === 'expenses') {
      if (method === 'GET'  && !param) return await getExpenses(DB);
      if (method === 'POST' && !param) return await createExpense(DB, body);
      if (method === 'PUT'  &&  param) return await updateExpense(DB, param, body);
      if (method === 'DELETE' && param) {
        const auth = await requireKpscRole(DB, request, KPSC_FINANCE_ROLES);
        if (auth instanceof Response) return auth;
        return await deleteExpense(DB, param);
      }
    }

    // ── /api/petty ─────────────────────────────────────────────
    if (route === 'petty') {
      if (method === 'GET'  && !param) return await getPetty(DB);
      if (method === 'POST' && !param) return await createPettyEntry(DB, body);
      if (method === 'PUT'  &&  param) return await updatePettyEntry(DB, param, body);
      if (method === 'DELETE' && param) return await deletePettyEntry(DB, param);
    }

    // ── /api/petty-config ──────────────────────────────────────
    if (route === 'petty-config') {
      if (method === 'GET'  && !param) return await getPettyConfig(DB);
      if (method === 'POST' && !param) return await updatePettyConfig(DB, body);
    }

    // ── /api/action-items ─────────────────────────────────────
    if (route === 'action-items') {
      if (method === 'GET'  && !param) return await getActionItems(DB);
      if (method === 'POST' && !param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await createActionItem(DB, body, auth);
      }
      if (method === 'PUT'  &&  param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await updateActionItem(DB, param, body);
      }
      if (method === 'DELETE' && param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await deleteActionItem(DB, param);
      }
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
      if (method === 'GET'  && param === 'api-status')       return getApiStatus(env);
      if (method === 'GET'  && !param)                       return await getSettings(DB);
      if (method === 'POST' && !param)                       return await saveSettings(DB, body);
      if (method === 'POST' && param === 'test-deepseek') {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await testDeepseekKey(DB, body);
      }
      if (method === 'POST' && param === 'test-openai') {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await testOpenaiKey(DB, env, body);
      }
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

    // ── /api/voice-enroll/:memberId ─────────────────────────────
    if (route === 'voice-enroll' && param && method === 'POST') {
      const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
      if (auth instanceof Response) return auth;
      return await voiceEnroll(DB, env, request, param);
    }

    // ── /api/voice-identify ─────────────────────────────────────
    if (route === 'voice-identify' && method === 'POST') {
      const auth = await requireKpscRole(DB, request, KPSC_READ_ROLES);
      if (auth instanceof Response) return auth;
      return await voiceIdentify(DB, env, request);
    }

    // ── /api/voice-enrollment/:memberId ────────────────────────
    if (route === 'voice-enrollment' && param) {
      if (method === 'GET') {
        const auth = await requireKpscRole(DB, request, KPSC_READ_ROLES);
        if (auth instanceof Response) return auth;
        return await voiceGetEnrollment(DB, param);
      }
      if (method === 'DELETE') {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await voiceDeleteEnrollment(DB, param);
      }
    }

    // ── /api/voice-member-sync/:memberId ───────────────────────
    if (route === 'voice-member-sync' && param && method === 'POST') {
      const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
      if (auth instanceof Response) return auth;
      return await voiceMemberSync(DB, param, body);
    }

    // ── /api/ai-secretary-meetings ─────────────────────────────
    if (route === 'ai-secretary-meetings') {
      if (method === 'POST' && param === 'audio-chunk') {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await uploadAiSecretaryAudioChunk(env, request);
      }
      if (method === 'GET'  && !param) {
        const auth = await requireKpscRole(DB, request, KPSC_READ_ROLES);
        if (auth instanceof Response) return auth;
        return await getAiSecretaryMeetings(DB);
      }
      if (method === 'POST' && !param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await createAiSecretaryMeeting(DB, body, auth);
      }
      if (method === 'GET'  &&  param) {
        const auth = await requireKpscRole(DB, request, KPSC_READ_ROLES);
        if (auth instanceof Response) return auth;
        return await getAiSecretaryMeeting(DB, param);
      }
      if (method === 'PUT'  &&  param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await updateAiSecretaryMeeting(DB, param, body, auth);
      }
      if (method === 'DELETE' && param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await deleteAiSecretaryMeeting(DB, param, auth);
      }
      if (method === 'POST' && parts[2] === 'process') {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await processAiSecretaryMeeting(DB, param);
      }
      if (method === 'POST' && parts[2] === 'translate-plain-english') {
        const auth = await requireKpscRole(DB, request, KPSC_READ_ROLES);
        if (auth instanceof Response) return auth;
        return await translateAiSecretaryMeetingPlainEnglish(DB, env, param);
      }
      if (method === 'POST' && parts[2] === 'ai-proofread') {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await proofreadAiSecretaryMinutes(DB, env, param, body);
      }
      if (method === 'POST' && parts[2] === 'reconcile-insights') {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await reconcileAiSecretaryInsights(DB, env, param, body);
      }
      if (method === 'POST' && parts[2] === 'public-link') {
        const auth = await requireKpscRole(DB, request, KPSC_READ_ROLES);
        if (auth instanceof Response) return auth;
        return await createAiSecretaryMeetingPublicLink(DB, request, param);
      }
      if (method === 'POST' && parts[2] === 'revoke-public-link') {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await revokeAiSecretaryMeetingPublicLink(DB, param, auth);
      }
    }
    if (route === 'kpsc-public-minutes' && method === 'GET' && param) {
      return await getAiSecretaryMeetingPublicView(DB, param);
    }

    // ── /api/admin ─────────────────────────────────────────────
    if (route === 'admin') {
      if (method === 'POST' && param === 'clear')      return await adminClear(DB);
      if (method === 'POST' && param === 'clear-data') return await adminClearDataOnly(DB);
      if (method === 'POST' && param === 'import') return await adminImport(DB, body);
    }

    // ── B5: /api/kpsc-followups ────────────────────────────────
    if (route === 'kpsc-followups') {
      if (method === 'GET' && !param) {
        const auth = await requireKpscRole(DB, request, KPSC_READ_ROLES);
        if (auth instanceof Response) return auth;
        return await getFollowups(DB, url);
      }
      if (method === 'PATCH' && param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await patchFollowup(DB, param, body, auth);
      }
    }

    // ── Agenda Builder: /api/kpsc-agenda-notes ─────────────────
    if (route === 'kpsc-agenda-notes') {
      if (method === 'GET' && !param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await getAgendaNotes(DB);
      }
      if (method === 'POST' && !param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await createAgendaNote(DB, body, auth);
      }
      if (method === 'PUT' && param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await updateAgendaNote(DB, param, body);
      }
      if (method === 'DELETE' && param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await deleteAgendaNote(DB, param);
      }
    }

    // ── Agenda Builder: /api/kpsc-agenda-suggest ───────────────
    if (route === 'kpsc-agenda-suggest' && method === 'POST') {
      const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
      if (auth instanceof Response) return auth;
      return await suggestAgendaItems(DB, env, body);
    }

    // ── Agenda Builder: /api/kpsc-whatsapp-draft ───────────────
    if (route === 'kpsc-whatsapp-draft') {
      if (method === 'GET' && !param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await getWhatsappDrafts(DB);
      }
      if (method === 'POST' && !param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await createWhatsappDraft(DB, body, auth);
      }
      if (method === 'PUT' && param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await updateWhatsappDraft(DB, param, body);
      }
      if (method === 'DELETE' && param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await deleteWhatsappDraft(DB, param);
      }
      if (method === 'POST' && parts[2] === 'build') {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await buildWhatsappMessage(DB, env, param, body);
      }
      if (method === 'POST' && parts[2] === 'refine') {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await refineWhatsappMessage(DB, env, param, body);
      }
      if (method === 'POST' && parts[2] === 'finalize') {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await finalizeWhatsappDraft(DB, param, body, auth);
      }
      if (method === 'POST' && parts[2] === 'outcomes') {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await saveAgendaOutcomes(DB, param, body);
      }
    }

    // ── Agenda Builder: /api/kpsc-agenda-templates ─────────────
    if (route === 'kpsc-agenda-templates') {
      if (method === 'GET' && !param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await getAgendaTemplates(DB);
      }
      if (method === 'POST' && !param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await createAgendaTemplate(DB, body, auth);
      }
      if (method === 'PUT' && param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await updateAgendaTemplate(DB, param, body);
      }
      if (method === 'DELETE' && param) {
        const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
        if (auth instanceof Response) return auth;
        return await deleteAgendaTemplate(DB, param);
      }
    }

    // ── B5+B6: internal cron endpoints (Bearer CRON_SECRET) ────
    if (route === 'internal') {
      if (method === 'POST' && param === 'run-followups')    return await runFollowups(DB, env, request);
      if (method === 'POST' && param === 'run-prebriefs')    return await runPrebriefs(DB, env, request);
      if (method === 'POST' && param === 'run-monthly-sms')  return await runMonthlySms(DB, env, request);
      if (method === 'POST' && param === 'run-reminder-sms') return await runReminderSms(DB, env, request);
    }

    // ── Bulk SMS to KPSC members (meeting notification) ────────────
    if (route === 'kpsc-sms-send' && method === 'POST') {
      const auth = await requireKpscRole(DB, request, KPSC_WRITE_ROLES);
      if (auth instanceof Response) return auth;
      return await sendBulkMemberSms(DB, env, body);
    }

    // ── B6: scheduled_for field on ai-secretary-meetings ───────
    // (handled inline in updateAiSecretaryMeeting via body.scheduledFor)

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
      suggested_projects_json TEXT DEFAULT '[]',
      plain_english_minutes_md TEXT DEFAULT '',
      created_by        TEXT DEFAULT '',
      created_by_account_id TEXT DEFAULT '',
      started_at        TEXT DEFAULT '',
      ended_at          TEXT DEFAULT '',
      scheduled_for     TEXT,
      pre_brief_markdown TEXT,
      pre_brief_generated_at TEXT,
      reviewed_at       TEXT DEFAULT '',
      reviewed_by       TEXT DEFAULT '',
      public_share_token TEXT DEFAULT '',
      processed_at      TEXT DEFAULT '',
      venue             TEXT DEFAULT '',
      created_at        TEXT DEFAULT (datetime('now')),
      deleted_at        TEXT DEFAULT '',
      deleted_by        TEXT DEFAULT ''
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
    `CREATE TABLE IF NOT EXISTS kpsc_projects (
      id               TEXT PRIMARY KEY,
      title            TEXT NOT NULL DEFAULT '',
      description      TEXT DEFAULT '',
      estimated_cost   REAL DEFAULT 0,
      actual_cost      REAL DEFAULT 0,
      status           TEXT DEFAULT 'proposed',
      priority         TEXT DEFAULT 'medium',
      target_date      TEXT DEFAULT '',
      source_meeting_id TEXT DEFAULT '',
      source           TEXT DEFAULT 'manual',
      notes            TEXT DEFAULT '',
      created_by       TEXT DEFAULT '',
      created_at       TEXT DEFAULT (datetime('now')),
      updated_at       TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS kpsc_sessions (
      id          TEXT PRIMARY KEY,
      account_id  TEXT NOT NULL,
      expires_at  INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS kpsc_members (
      id                    TEXT PRIMARY KEY,
      name                  TEXT NOT NULL DEFAULT '',
      grp                   TEXT NOT NULL DEFAULT 'men',
      position              TEXT DEFAULT '',
      azureSpeakerProfileId TEXT DEFAULT '',
      voice_embedding       BLOB,
      voice_enrolled_at     TEXT,
      voice_sample_count    INTEGER DEFAULT 0
    )`,
    // B5: follow-up nudge queue
    `CREATE TABLE IF NOT EXISTS kpsc_followups (
      id               TEXT PRIMARY KEY,
      meeting_id       TEXT NOT NULL,
      action_id        TEXT NOT NULL,
      assignee         TEXT,
      task             TEXT,
      due_date         TEXT,
      draft_message    TEXT NOT NULL DEFAULT '',
      status           TEXT NOT NULL DEFAULT 'pending',
      generated_at     TEXT DEFAULT (datetime('now')),
      approved_at      TEXT,
      approved_by      TEXT,
      UNIQUE(meeting_id, action_id)
    )`,
    `CREATE TABLE IF NOT EXISTS kpsc_action_items (
      id          TEXT PRIMARY KEY,
      task        TEXT NOT NULL,
      assignee    TEXT DEFAULT '',
      created_by  TEXT DEFAULT '',
      meeting_id  TEXT DEFAULT '',
      due_date    TEXT DEFAULT '',
      status      TEXT DEFAULT 'pending',
      priority    TEXT DEFAULT 'medium',
      notes       TEXT DEFAULT '',
      project_id  TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    )`,
    // ── Agenda Builder ──────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS kpsc_agenda_notes (
      id          TEXT PRIMARY KEY,
      text        TEXT NOT NULL DEFAULT '',
      source      TEXT DEFAULT 'typed',
      tag         TEXT DEFAULT 'general',
      is_used     INTEGER DEFAULT 0,
      created_by  TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS kpsc_whatsapp_drafts (
      id                  TEXT PRIMARY KEY,
      agenda_items_json   TEXT DEFAULT '[]',
      meeting_title       TEXT DEFAULT '',
      meeting_date        TEXT DEFAULT '',
      meeting_time        TEXT DEFAULT '',
      venue               TEXT DEFAULT '',
      urgency             TEXT DEFAULT 'normal',
      tag_all             INTEGER DEFAULT 0,
      message_text        TEXT DEFAULT '',
      status              TEXT DEFAULT 'draft',
      linked_meeting_id   TEXT DEFAULT '',
      created_by          TEXT DEFAULT '',
      created_at          TEXT DEFAULT (datetime('now')),
      updated_at          TEXT DEFAULT (datetime('now'))
    )`,
    // Agenda Templates: reusable agenda structures for recurring meetings
    `CREATE TABLE IF NOT EXISTS kpsc_agenda_templates (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL DEFAULT '',
      items_json  TEXT DEFAULT '[]',
      created_by  TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
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
    `ALTER TABLE ai_secretary_meetings ADD COLUMN created_by_account_id TEXT DEFAULT ''`,
    // Plain English minutes cache
    `ALTER TABLE ai_secretary_meetings ADD COLUMN plain_english_minutes_md TEXT DEFAULT ''`,
    // Wave 3 VF-2: voice fingerprinting columns on kpsc_members.
    `ALTER TABLE kpsc_members ADD COLUMN voice_embedding BLOB`,
    `ALTER TABLE kpsc_members ADD COLUMN voice_enrolled_at TEXT`,
    `ALTER TABLE kpsc_members ADD COLUMN voice_sample_count INTEGER DEFAULT 0`,
    // Suggested projects extracted during AI minutes generation (pending secretary approval).
    `ALTER TABLE ai_secretary_meetings ADD COLUMN suggested_projects_json TEXT DEFAULT '[]'`,
    // B6: scheduling + pre-meeting brief on ai_secretary_meetings.
    `ALTER TABLE ai_secretary_meetings ADD COLUMN scheduled_for TEXT`,
    `ALTER TABLE ai_secretary_meetings ADD COLUMN pre_brief_markdown TEXT`,
    `ALTER TABLE ai_secretary_meetings ADD COLUMN pre_brief_generated_at TEXT`,
    `ALTER TABLE ai_secretary_meetings ADD COLUMN reviewed_at TEXT DEFAULT ''`,
    `ALTER TABLE ai_secretary_meetings ADD COLUMN reviewed_by TEXT DEFAULT ''`,
    `ALTER TABLE ai_secretary_meetings ADD COLUMN public_share_token TEXT DEFAULT ''`,
    `ALTER TABLE ai_secretary_meetings ADD COLUMN venue TEXT DEFAULT ''`,
    // Soft-delete audit columns for KPSC finance, partners, partner payments, and projects.
    `ALTER TABLE kpsc_finance_entries ADD COLUMN deleted_at TEXT DEFAULT ''`,
    `ALTER TABLE kpsc_finance_entries ADD COLUMN deleted_by TEXT DEFAULT ''`,
    `ALTER TABLE kpsc_partners ADD COLUMN deleted_at TEXT DEFAULT ''`,
    `ALTER TABLE kpsc_partners ADD COLUMN deleted_by TEXT DEFAULT ''`,
    `ALTER TABLE kpsc_partner_payments ADD COLUMN deleted_at TEXT DEFAULT ''`,
    `ALTER TABLE kpsc_partner_payments ADD COLUMN deleted_by TEXT DEFAULT ''`,
    `ALTER TABLE kpsc_projects ADD COLUMN deleted_at TEXT DEFAULT ''`,
    `ALTER TABLE kpsc_projects ADD COLUMN deleted_by TEXT DEFAULT ''`,
    // Agenda Builder: structured agenda attached to a meeting
    `ALTER TABLE ai_secretary_meetings ADD COLUMN agenda_text TEXT DEFAULT ''`,
    // Agenda Templates (additional features): prep checklist state on drafts
    `ALTER TABLE kpsc_whatsapp_drafts ADD COLUMN prep_checklist_json TEXT DEFAULT '[]'`,
    // Recurring agenda items: track which notes are pinned recurring items + how often each is used
    `ALTER TABLE kpsc_agenda_notes ADD COLUMN is_recurring INTEGER DEFAULT 0`,
    `ALTER TABLE kpsc_agenda_notes ADD COLUMN usage_count INTEGER DEFAULT 0`,
    // Post-meeting closure: outcome statuses for each agenda item (discussed/carry_forward/not_discussed)
    `ALTER TABLE kpsc_whatsapp_drafts ADD COLUMN agenda_outcomes_json TEXT DEFAULT '[]'`,
  ];
  for (const m of migrations) {
    try { await DB.prepare(m).run(); } catch { /* column already exists — safe to ignore */ }
  }

  await DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_kpsc_partner_payment_period ON kpsc_partner_payments(partner_id, year, month, payment_type)`).run();
  try { await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_followups_status ON kpsc_followups(status)`).run(); } catch { /* safe */ }

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
    // Default to the mini variant — ~half the cost of gpt-4o-transcribe
    // with very similar accuracy on typical meeting-room speech. The
    // Settings UI exposes the full transcribe model for tougher audio.
    ai_transcription_model: 'gpt-4o-mini-transcribe',
    ai_ocr_model: 'gpt-5-mini',
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
    // ── Termii SMS settings ──────────────────────────────────────────
    kpsc_termii_api_key:      '',          // set in KPSC Settings → SMS
    kpsc_termii_sender_id:    'RCCG-KP',  // max 11 chars, alphanumeric
    kpsc_termii_welcome_sms:  '1',         // send welcome SMS on partner add
    kpsc_termii_payment_sms:  '1',         // send thank-you SMS on payment record
    kpsc_termii_newmonth_sms: '1',         // send Happy New Month SMS on 1st
    kpsc_termii_reminder_day: '10',        // day of month to send payment reminders
    kpsc_termii_reminder_freq: 'monthly',  // monthly | biweekly | weekly
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

  const seededKpscDefaultPin = String(defaultSettings.kpsc_default_pin || '1234');
  const defaultKpscAccounts = [
    { id: 'ka1', name: 'Acting Chairman', role: 'acting_chairman', pin: seededKpscDefaultPin },
    { id: 'ka2', name: 'General Secretary', role: 'general_secretary', pin: seededKpscDefaultPin },
    { id: 'ka3', name: 'Financial Secretary', role: 'financial_secretary', pin: seededKpscDefaultPin },
    { id: 'ka4', name: 'Treasurer', role: 'treasurer', pin: seededKpscDefaultPin },
    { id: 'ka5', name: 'Committee Viewer', role: 'committee_viewer', pin: seededKpscDefaultPin },
    { id: 'ka6', name: 'IT Administrator', role: 'it_admin', pin: seededKpscDefaultPin },
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

const KPSC_ROLES = new Set(['acting_chairman', 'general_secretary', 'financial_secretary', 'treasurer', 'committee_viewer', 'it_admin']);

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
  if (!Number.isFinite(month)) return null;
  return Math.min(12, Math.max(1, month));
}

function normalizeOptionalMonth(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const month = Number.parseInt(raw, 10);
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

async function deleteKpscAccount(DB, id, callerAccount) {
  const target = await DB.prepare(`SELECT id,name,role FROM kpsc_accounts WHERE id=?`).bind(id).first();
  if (!target) return err('KPSC account not found', 404);
  // Refuse self-delete
  if (callerAccount.id === id) return err('You cannot delete your own account', 409);
  // Refuse to delete the last acting_chairman
  if (target.role === 'acting_chairman') {
    const { results } = await DB.prepare(
      `SELECT id FROM kpsc_accounts WHERE role='acting_chairman' AND status='active'`
    ).all();
    if ((results || []).length <= 1) {
      return err('Cannot delete the last acting_chairman account', 409);
    }
  }
  await DB.prepare(`DELETE FROM kpsc_accounts WHERE id=?`).bind(id).run();
  await DB.prepare(`DELETE FROM kpsc_sessions WHERE account_id=?`).bind(id).run();
  return ok({ success: true, id });
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
  // Create a server-side session token so subsequent requests can be authenticated.
  const sessionToken = newId('ks');
  const expiresAt = Date.now() + KPSC_SESSION_TTL_MS;
  await DB.prepare(`INSERT INTO kpsc_sessions (id, account_id, expires_at) VALUES (?,?,?)`).bind(sessionToken, row.id, expiresAt).run();
  return ok({ ...publicKpscAccount({ ...row, last_login_at: now }), sessionType: 'kpsc', sessionToken });
}

async function kpscLogout(DB, data) {
  const token = String(data?.sessionToken || '').trim();
  if (token) {
    await DB.prepare(`DELETE FROM kpsc_sessions WHERE id=?`).bind(token).run();
  }
  return ok({ success: true });
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

async function deleteIncome(DB, id) {
  // Fetch the income row so we can reverse linked records.
  const row = await DB.prepare(`SELECT date, direct_petty_cash FROM income WHERE id=?`).bind(id).first();

  // 1. Remove cash deposit transactions linked to this income record.
  await DB.prepare(`DELETE FROM cash_transactions WHERE income_ref=?`).bind(id).run();

  // 2. Reverse any petty-cash refill that was auto-created from this income.
  //    The refill reference is "From Sunday collection <formatted-date>".
  //    Re-produce that same formatted date so we can match the row.
  if (row && Number(row.direct_petty_cash) > 0) {
    const fmtDate = new Intl.DateTimeFormat('en-NG', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos'
    }).format(new Date(row.date + 'T12:00:00Z'));
    const expectedRef = `From Sunday collection ${fmtDate}`;

    await DB.prepare(
      `DELETE FROM petty_cash WHERE type='refill' AND reference=?`
    ).bind(expectedRef).run();

    // Restore the petty float.
    const cfg = await DB.prepare(`SELECT float_amount FROM petty_config WHERE id='main'`).first();
    if (cfg) {
      const newFloat = Number(cfg.float_amount) - Number(row.direct_petty_cash);
      await DB.prepare(`UPDATE petty_config SET float_amount=? WHERE id='main'`).bind(newFloat).run();
    }
  }

  // 3. Delete the income record itself.
  await DB.prepare(`DELETE FROM income WHERE id=?`).bind(id).run();
  return ok({ id, deleted: true });
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

async function deletePettyEntry(DB, id) {
  const row = await DB.prepare(`SELECT type, amount, status FROM petty_cash WHERE id=?`).bind(id).first();
  if (!row) return err('Petty cash entry not found', 404);

  // Adjust the petty float to reverse the effect of this entry.
  const cfg = await DB.prepare(`SELECT float_amount FROM petty_config WHERE id='main'`).first();
  if (cfg) {
    let delta = 0;
    if (row.type === 'refill') {
      // Refill added to the float — reverse it.
      delta = -Number(row.amount);
    } else if (row.status === 'settled') {
      // A settled advance reduced the float — restore it.
      delta = Number(row.amount);
    }
    if (delta !== 0) {
      const newFloat = Number(cfg.float_amount) + delta;
      await DB.prepare(`UPDATE petty_config SET float_amount=? WHERE id='main'`).bind(newFloat).run();
    }
  }

  await DB.prepare(`DELETE FROM petty_cash WHERE id=?`).bind(id).run();
  return ok({ id, deleted: true });
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
    speakerRecognition: (() => {
      const tokenStatus = maskedKeyStatus(env.VOICE_FP_TOKEN);
      const url = String(env.VOICE_FP_URL || '').trim();
      const configured = tokenStatus.configured && url.length > 0;
      return {
        configured,
        active: configured,
        masked: tokenStatus.masked,
        keyName: 'VOICE_FP_TOKEN',
        url,
        message: configured
          ? 'VOICE_FP_TOKEN and VOICE_FP_URL are configured.'
          : !tokenStatus.configured
            ? 'VOICE_FP_TOKEN is missing. Speaker recognition will not work.'
            : 'VOICE_FP_URL is missing. Speaker recognition will not work.',
      };
    })(),
  });
}

async function testDeepseekKey(DB, body) {
  let key = String(body?.key || '').trim();
  if (!key) {
    try {
      const row = await DB.prepare(`SELECT value FROM settings WHERE key='ai_deepseek_key'`).first();
      key = row?.value ? String(row.value).trim() : '';
    } catch (_) {}
  }
  if (!key) return ok({ ok: false, message: 'No DeepSeek API key provided or saved.' });

  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'deepseek-v4-flash', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 1 }),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok) return ok({ ok: true, message: 'Connected — DeepSeek key is valid and working.' });
    const reason = data?.error?.message || data?.error?.code || `HTTP ${resp.status}`;
    return ok({ ok: false, message: `DeepSeek error: ${reason}` });
  } catch (e) {
    return ok({ ok: false, message: `Connection failed: ${e.message}` });
  }
}

async function testOpenaiKey(DB, env, body) {
  let key = String(body?.key || '').trim();
  if (!key) key = await resolveOpenAiKey(env, DB);
  if (!key) return ok({ ok: false, message: 'No OpenAI API key provided or saved.' });

  try {
    const resp = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` },
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok) return ok({ ok: true, message: 'Connected — OpenAI key is valid and working.' });
    const reason = data?.error?.message || data?.error?.code || `HTTP ${resp.status}`;
    return ok({ ok: false, message: `OpenAI error: ${reason}` });
  } catch (e) {
    return ok({ ok: false, message: `Connection failed: ${e.message}` });
  }
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
    WHERE COALESCE(deleted_at,'') = ''
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
  const phone = String(data?.phone || '').trim();
  await DB.prepare(`
    INSERT INTO kpsc_partners (
      id,full_name,phone,partnership_type,start_date,monthly_pledge,status,reminder_preference,notes,created_by,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id,
    fullName,
    phone,
    String(data?.partnershipType || 'gods_kingdom_partner').trim(),
    String(data?.startDate || '').trim(),
    Number(data?.monthlyPledge || 0),
    normalizeKpscAccountStatus(data?.status),
    String(data?.reminderPreference || 'sms').trim() || 'sms',
    String(data?.notes || '').trim(),
    String(data?.createdBy || '').trim(),
    new Date().toISOString(),
  ).run();

  // ── Welcome SMS (fire-and-forget) ────────────────────────────────
  if (phone) {
    try {
      const t = await getTermiiSettings(DB);
      if (t.apiKey && t.welcomeSms) {
        const typeLabel = String(data?.partnershipType || '').toLowerCase().includes('covenant')
          ? "Covenant Partner" : "God's Kingdom Partner";
        const welcomeMsg = `Welcome to RCCG Kingdom Parish, ${fullName}! We're delighted to have you as a ${typeLabel}. Your partnership is a blessing to the body of Christ. God bless you!`;
        await sendTermiiSms(t.apiKey, t.senderId, phone, welcomeMsg);
      }
    } catch { /* swallow — SMS failure must not break partner creation */ }
  }

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
  const month = normalizeOptionalMonth(url.searchParams.get('month'));
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
    WHERE ${filters.join(' AND ')} AND COALESCE(p.deleted_at,'') = ''
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

  // ── Thank-you SMS when payment is marked paid (fire-and-forget) ──
  if (paid) {
    try {
      const t = await getTermiiSettings(DB);
      if (t.apiKey && t.paymentSms) {
        const partner = await DB.prepare(`SELECT full_name, phone FROM kpsc_partners WHERE id=?`).bind(partnerId).first();
        if (partner?.phone) {
          const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
          const monthName = MONTH_NAMES[(month - 1)] || '';
          const amount = Number(data?.amount || 0);
          const amtText = amount > 0 ? ` of ₦${amount.toLocaleString('en-NG')}` : '';
          const msg = `Dear ${partner.full_name}, thank you for your ${monthName} partnership payment${amtText}. Your seed is a blessing to the Kingdom. God will reward you abundantly! 🙏 — RCCG Kingdom Parish`;
          await sendTermiiSms(t.apiKey, t.senderId, partner.phone, msg);
        }
      }
    } catch { /* swallow — SMS failure must not break payment recording */ }
  }

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

async function deleteKpscPartnerPayment(DB, id, auth) {
  const existing = await DB.prepare(`SELECT id FROM kpsc_partner_payments WHERE id=?`).bind(id).first();
  if (!existing) return err('Partner payment not found', 404);
  const now = new Date().toISOString();
  await DB.prepare(
    `UPDATE kpsc_partner_payments SET deleted_at=?, deleted_by=? WHERE id=?`
  ).bind(now, auth.name, id).run();
  return ok({ deleted: id });
}

async function deleteKpscPartner(DB, id, auth) {
  const existing = await DB.prepare(`SELECT id FROM kpsc_partners WHERE id=?`).bind(id).first();
  if (!existing) return err('Partner not found', 404);
  const now = new Date().toISOString();
  // Cascade soft-delete to the partner's payments. Reminders are transient queued items —
  // hard-delete them as they are no longer actionable for a deleted partner.
  await DB.prepare(
    `UPDATE kpsc_partner_payments SET deleted_at=?, deleted_by=? WHERE partner_id=? AND COALESCE(deleted_at,'')=''`
  ).bind(now, auth.name, id).run();
  await DB.prepare(`DELETE FROM kpsc_reminders WHERE partner_id=?`).bind(id).run();
  await DB.prepare(
    `UPDATE kpsc_partners SET deleted_at=?, deleted_by=? WHERE id=?`
  ).bind(now, auth.name, id).run();
  return ok({ deleted: id });
}

async function deleteKpscFinanceEntry(DB, id, auth) {
  const existing = await DB.prepare(
    `SELECT id,date,entry_type,category,amount FROM kpsc_finance_entries WHERE id=?`
  ).bind(id).first();
  if (!existing) return err('Finance entry not found', 404);
  const now = new Date().toISOString();
  await DB.prepare(
    `UPDATE kpsc_finance_entries SET deleted_at=?, deleted_by=? WHERE id=?`
  ).bind(now, auth.name, id).run();
  await DB.prepare(
    `INSERT INTO notifications (id,title,body,type,ts) VALUES (?,?,?,?,?)`
  ).bind(
    newId('N'),
    'KPSC finance entry deleted',
    `"${String(existing.category || existing.entry_type || 'finance entry').replace(/"/g, '\\"')}" on ${existing.date || 'unknown date'} for ₦${Number(existing.amount || 0).toLocaleString('en-NG')} was deleted by ${auth.name} (${auth.role}).`,
    'warn',
    now,
  ).run();
  return ok({ deleted: id });
}

async function getKpscFinanceEntries(DB, url) {
  const month = normalizeOptionalMonth(url.searchParams.get('month'));
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
    WHERE ${where.join(' AND ')} AND COALESCE(f.deleted_at,'') = ''
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

async function createKpscFinanceEntry(DB, data, auth) {
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
    String(auth?.name || data?.recordedBy || '').trim(),
    String(data?.approvedBy || '').trim(),
    String(data?.approvalStatus || 'recorded').trim() || 'recorded',
    String(data?.attachmentName || '').trim(),
  ).run();
  return await getKpscFinanceEntryById(DB, id);
}

async function updateKpscFinanceEntry(DB, id, data, auth) {
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
    data?.recordedBy !== undefined ? String(auth?.name || data.recordedBy || '').trim() : row.recorded_by,
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
  const month = normalizeOptionalMonth(url.searchParams.get('month'));
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

// ── SMART REMINDER PERSONALISATION (B4) ──────────────────────────
/**
 * Classify a partner's payment behaviour into a tone bucket.
 * Pure function — exported for unit tests.
 * @param {object} partner  - row from kpsc_partners (must have .id, .full_name)
 * @param {Array}  payments - rows from kpsc_partner_payments for this partner (last 12 months, paid=1)
 * @param {number} currentYear
 * @param {number} currentMonth  (1-12)
 * @returns {string} 'first_miss' | 'chronic' | 'dormant' | 'new' | 'default'
 */
function classifyPartnerTone(partner, payments, currentYear, currentMonth) {
  // Build a set of paid (year, month) tuples for quick lookup
  const paidSet = new Set(payments.map(p => `${p.year}-${p.month}`));

  // Helper: how many of the last N months (not including current) did they pay?
  function paidInLast(n) {
    let count = 0;
    let y = currentYear;
    let m = currentMonth - 1; // start from the month before current
    for (let i = 0; i < n; i++) {
      if (m < 1) { m = 12; y--; }
      if (paidSet.has(`${y}-${m}`)) count++;
      m--;
    }
    return count;
  }

  const totalPaid = payments.length;

  // 'new': fewer than 3 payment records total
  if (totalPaid < 3) return 'new';

  const paidLast6 = paidInLast(6);
  const missedLast6 = 6 - paidLast6;

  // 'chronic': 3+ missed months in the last 6
  if (missedLast6 >= 3) return 'chronic';

  // 'dormant': paid regularly for 6+ consecutive months then stopped for 3+ months
  // "stopped for 3+" means the last 3 months they have not paid
  const paidLast3 = paidInLast(3);
  if (paidLast3 === 0) {
    // Check they had 6+ consecutive paid months before that
    let consecutive = 0;
    let y = currentYear;
    let m = currentMonth - 4; // start 4 months back (skipping the 3 missed)
    for (let i = 0; i < 6; i++) {
      if (m < 1) { m += 12; y--; }
      if (paidSet.has(`${y}-${m}`)) { consecutive++; } else { consecutive = 0; }
      m--;
    }
    if (consecutive >= 6) return 'dormant';
    // Even without exactly 6 consecutive, if they're a long-payer who stopped: dormant
    if (totalPaid >= 6 && paidLast6 >= 4) return 'dormant';
  }

  // 'first_miss': paid at least 80% of expected months, first miss in 6+ months
  if (paidLast3 >= 2 && paidLast6 >= 5) {
    // They've been paying but missed this current month
    if (!paidSet.has(`${currentYear}-${currentMonth}`)) {
      return 'first_miss';
    }
  }

  return 'default';
}

async function personalizeKpscReminder(DB, env, data) {
  const partnerId = String(data?.partnerId || '').trim();
  const year = normalizeYear(data?.year);
  const month = normalizeMonth(data?.month) || (new Date().getUTCMonth() + 1);
  const fallbackTemplate = String(data?.fallbackTemplate || '').trim()
    || 'Dear {{name}}, this is a reminder to pay your {{month}} partnership pledge. God bless you.';

  if (!partnerId) return err('partnerId is required', 400);

  // Load partner
  const partner = await DB.prepare(`SELECT * FROM kpsc_partners WHERE id=?`).bind(partnerId).first();
  if (!partner) return err('Partner not found', 404);

  // Load last 12 months of payments
  let payments = [];
  try {
    // Compute the start year/month for a 12-month window
    let startYear = year;
    let startMonth = month - 11;
    if (startMonth < 1) { startMonth += 12; startYear--; }
    const { results: payRows } = await DB.prepare(`
      SELECT year, month, amount, paid_at
      FROM kpsc_partner_payments
      WHERE partner_id=? AND paid=1
        AND ((year > ?) OR (year = ? AND month >= ?))
      ORDER BY year, month
    `).bind(partnerId, startYear, startYear, startMonth).all();
    payments = payRows || [];
  } catch (_) { payments = []; }

  const toneBucket = classifyPartnerTone(partner, payments, year, month);

  // Build a human-readable payment summary
  const MONTH_ABBR = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const paidMonths = payments.map(p => `${MONTH_ABBR[p.month] || p.month} ${p.year}`).join(', ') || 'none';
  const partnerName = partner.full_name || 'Partner';
  const monthLabel = MONTH_ABBR[month] || String(month);
  const toneInstructions = {
    first_miss: 'Use a warm, encouraging tone — acknowledge their faithfulness and gently remind them about this one missed month.',
    chronic: 'Use a firm but respectful tone — acknowledge the ongoing gap and appeal to their commitment to the partnership.',
    dormant: 'Use a caring, re-engagement tone — acknowledge their past faithfulness and warmly invite them back.',
    new: 'Use a welcoming, friendly tone — they are relatively new to the partnership.',
    default: 'Use a standard, friendly reminder tone.',
  };

  // Load DeepSeek key + model from settings
  let deepseekKey = '';
  let deepseekModel = 'deepseek-v4-flash';
  try {
    const { results: sr } = await DB.prepare(
      `SELECT key,value FROM settings WHERE key IN ('ai_deepseek_key','ai_deepseek_model')`
    ).all();
    const settings = Object.fromEntries((sr || []).map(r => [r.key, String(r.value || '')]));
    deepseekKey = settings.ai_deepseek_key ? String(settings.ai_deepseek_key).trim() : '';
    deepseekModel = settings.ai_deepseek_model ? String(settings.ai_deepseek_model).trim() : 'deepseek-v4-flash';
    // Auto-migrate legacy DeepSeek model names discontinued 2026-07-24.
    if (deepseekModel === 'deepseek-chat')     deepseekModel = 'deepseek-v4-flash';
    if (deepseekModel === 'deepseek-reasoner') deepseekModel = 'deepseek-v4-pro';
  } catch (_) {}

  if (!deepseekKey) {
    return ok({ variants: [fallbackTemplate], toneBucket, error: 'DeepSeek API key not configured' });
  }

  const prompt = `You are helping a church committee secretary personalise a WhatsApp/SMS payment reminder.

Partner name: ${partnerName}
Month: ${monthLabel} ${year}
Payment history (last 12 months, paid months): ${paidMonths}
Tone bucket: ${toneBucket}
Tone instruction: ${toneInstructions[toneBucket] || toneInstructions.default}
Reference template: "${fallbackTemplate}"

Write exactly 3 short reminder variants (each 1-2 sentences, WhatsApp/SMS-friendly, max 160 characters each). Use {{name}} for the partner's name and {{month}} for the month name. Keep them natural, warm, and church-appropriate.

Respond ONLY with a JSON array of 3 strings, no markdown, no prose. Example: ["variant1","variant2","variant3"]`;

  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
      body: JSON.stringify({ model: deepseekModel, messages: [{ role: 'user', content: prompt }], max_tokens: 500, temperature: 0.4 }),
    });

    if (!resp.ok) {
      return ok({ variants: [fallbackTemplate], toneBucket, error: `DeepSeek API error: ${resp.status}` });
    }

    const aiData = await resp.json();
    const rawText = String(aiData.choices?.[0]?.message?.content || '').trim();
    const cleaned = rawText.replace(/```json?\s*/gi, '').replace(/```\s*/gi, '').trim();
    const parsed = safeJsonParse(cleaned, null);

    if (Array.isArray(parsed) && parsed.length > 0) {
      const variants = parsed.map(v => String(v || '').trim()).filter(Boolean);
      if (variants.length > 0) return ok({ variants, toneBucket });
    }

    // Parsing failure
    return ok({ variants: [fallbackTemplate], toneBucket, error: 'Could not parse AI response' });
  } catch (e) {
    return ok({ variants: [fallbackTemplate], toneBucket, error: `DeepSeek request failed: ${e.message}` });
  }
}

async function getKpscDashboard(DB, url) {
  const year = normalizeYear(url.searchParams.get('year'));
  const month = normalizeOptionalMonth(url.searchParams.get('month')) || (new Date().getUTCMonth() + 1);

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

  // Load the next upcoming meeting from whatsapp drafts (saved/finalized with a future date).
  // This powers the "Upcoming Meeting" card shown to all committee members on the dashboard.
  const today = new Date().toISOString().slice(0, 10);
  const upcomingDraft = await DB.prepare(`
    SELECT id, meeting_title, meeting_date, meeting_time, venue, agenda_items_json, linked_meeting_id
    FROM kpsc_whatsapp_drafts
    WHERE status IN ('saved','finalized') AND meeting_date >= ?
    ORDER BY meeting_date ASC
    LIMIT 1
  `).bind(today).first();

  const upcomingMeeting = upcomingDraft ? {
    id: upcomingDraft.id,
    meetingTitle: upcomingDraft.meeting_title || '',
    meetingDate: upcomingDraft.meeting_date || '',
    meetingTime: upcomingDraft.meeting_time || '',
    venue: upcomingDraft.venue || '',
    agendaItems: safeJsonParse(upcomingDraft.agenda_items_json, []),
    linkedMeetingId: upcomingDraft.linked_meeting_id || '',
  } : null;

  // Meeting frequency alert: find the last processed/active KPSC meeting date to compute days since.
  const lastMeetingRow = await DB.prepare(`
    SELECT meeting_date FROM ai_secretary_meetings
    WHERE COALESCE(deleted_at,'') = '' AND status IN ('processed','active','draft')
    ORDER BY meeting_date DESC LIMIT 1
  `).first();
  let daysSinceLastMeeting = null;
  if (lastMeetingRow?.meeting_date) {
    const lastMs = new Date(lastMeetingRow.meeting_date + 'T12:00:00').getTime();
    const nowMs = new Date(today + 'T12:00:00').getTime();
    if (!isNaN(lastMs) && !isNaN(nowMs)) {
      daysSinceLastMeeting = Math.floor((nowMs - lastMs) / (1000 * 60 * 60 * 24));
    }
  }

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
    upcomingMeeting,
    daysSinceLastMeeting,
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

function dateDistanceInDays(dateA, dateB) {
  const a = Date.parse(String(dateA || ''));
  const b = Date.parse(String(dateB || ''));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(a - b) / (24 * 60 * 60 * 1000);
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
    const candidate = financeEntries
      .filter(entry =>
        !usedFinanceIds.has(entry.id)
        && entry.type === item.type
        && Math.abs(entry.amount - item.amount) <= RECONCILIATION_AMOUNT_TOLERANCE_ABSOLUTE
      )
      .sort((a, b) => dateDistanceInDays(item.date, a.date) - dateDistanceInDays(item.date, b.date))[0];
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

function kpscProjectFromRow(row) {
  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    estimatedCost: Number(row.estimated_cost || 0),
    actualCost: Number(row.actual_cost || 0),
    status: row.status || 'proposed',
    priority: row.priority || 'medium',
    targetDate: row.target_date || '',
    sourceMeetingId: row.source_meeting_id || '',
    source: row.source || 'manual',
    notes: row.notes || '',
    createdBy: row.created_by || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

async function getKpscProjects(DB, url) {
  const status = String(url.searchParams.get('status') || '').trim().toLowerCase();
  const where = ["COALESCE(deleted_at,'') = ''"];
  const binds = [];
  if (status && status !== 'all') {
    where.push('status=?');
    binds.push(status);
  }
  const { results } = await DB.prepare(`SELECT * FROM kpsc_projects WHERE ${where.join(' AND ')} ORDER BY priority DESC, created_at DESC`).bind(...binds).all();
  return ok((results || []).map(kpscProjectFromRow));
}

async function createKpscProject(DB, data) {
  const title = String(data?.title || '').trim();
  if (!title) return err('title is required', 400);
  const id = newId('kprj');
  const now = new Date().toISOString();
  await DB.prepare(`
    INSERT INTO kpsc_projects (id,title,description,estimated_cost,actual_cost,status,priority,target_date,source_meeting_id,source,notes,created_by,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id,
    title,
    String(data?.description || '').trim(),
    Number(data?.estimatedCost || 0),
    Number(data?.actualCost || 0),
    String(data?.status || 'proposed').trim() || 'proposed',
    String(data?.priority || 'medium').trim() || 'medium',
    String(data?.targetDate || '').trim(),
    String(data?.sourceMeetingId || '').trim(),
    String(data?.source || 'manual').trim() || 'manual',
    String(data?.notes || '').trim(),
    String(data?.createdBy || '').trim(),
    now,
  ).run();
  const row = await DB.prepare(`SELECT * FROM kpsc_projects WHERE id=?`).bind(id).first();
  return ok(kpscProjectFromRow(row));
}

async function updateKpscProject(DB, id, data) {
  const row = await DB.prepare(`SELECT * FROM kpsc_projects WHERE id=?`).bind(id).first();
  if (!row) return err('Project not found', 404);
  const title = data?.title !== undefined ? String(data.title || '').trim() : row.title;
  if (!title) return err('title is required', 400);
  await DB.prepare(`
    UPDATE kpsc_projects SET title=?,description=?,estimated_cost=?,actual_cost=?,status=?,priority=?,target_date=?,source_meeting_id=?,source=?,notes=?,created_by=?,updated_at=? WHERE id=?
  `).bind(
    title,
    data?.description !== undefined ? String(data.description || '').trim() : row.description,
    data?.estimatedCost !== undefined ? Number(data.estimatedCost || 0) : Number(row.estimated_cost || 0),
    data?.actualCost !== undefined ? Number(data.actualCost || 0) : Number(row.actual_cost || 0),
    data?.status !== undefined ? String(data.status || 'proposed').trim() : row.status,
    data?.priority !== undefined ? String(data.priority || 'medium').trim() : row.priority,
    data?.targetDate !== undefined ? String(data.targetDate || '').trim() : row.target_date,
    data?.sourceMeetingId !== undefined ? String(data.sourceMeetingId || '').trim() : row.source_meeting_id,
    data?.source !== undefined ? String(data.source || 'manual').trim() : row.source,
    data?.notes !== undefined ? String(data.notes || '').trim() : row.notes,
    data?.createdBy !== undefined ? String(data.createdBy || '').trim() : row.created_by,
    new Date().toISOString(),
    id,
  ).run();
  const updated = await DB.prepare(`SELECT * FROM kpsc_projects WHERE id=?`).bind(id).first();
  return ok(kpscProjectFromRow(updated));
}

async function deleteKpscProject(DB, id, auth) {
  const existing = await DB.prepare(`SELECT id FROM kpsc_projects WHERE id=?`).bind(id).first();
  if (!existing) return err('Project not found', 404);
  const now = new Date().toISOString();
  await DB.prepare(
    `UPDATE kpsc_projects SET deleted_at=?, deleted_by=? WHERE id=?`
  ).bind(now, auth.name, id).run();
  return ok({ deleted: id });
}

async function extractProjectsFromMeeting(DB, env, data) {
  const meetingId = String(data?.meetingId || '').trim();
  const createdBy = String(data?.createdBy || '').trim();
  if (!meetingId) return err('meetingId is required', 400);
  const row = await DB.prepare(`SELECT * FROM ai_secretary_meetings WHERE id=?`).bind(meetingId).first();
  if (!row) return err('Meeting not found', 404);

  let deepseekKey = '';
  let deepseekModel = 'deepseek-v4-flash';
  try {
    const { results: sr } = await DB.prepare(`SELECT key,value FROM settings WHERE key IN ('ai_deepseek_key','ai_deepseek_model')`).all();
    const settings = Object.fromEntries((sr || []).map(r => [r.key, String(r.value || '')]));
    deepseekKey = settings.ai_deepseek_key ? String(settings.ai_deepseek_key).trim() : '';
    deepseekModel = settings.ai_deepseek_model ? String(settings.ai_deepseek_model).trim() : 'deepseek-v4-flash';
    // Auto-migrate legacy DeepSeek model names that are being discontinued 2026-07-24.
    if (deepseekModel === 'deepseek-chat')     deepseekModel = 'deepseek-v4-flash';
    if (deepseekModel === 'deepseek-reasoner') deepseekModel = 'deepseek-v4-pro';
  } catch (_) {}

  const transcript = row.transcript_text || '';
  const minutesMarkdown = row.minutes_markdown || '';
  const content = [transcript, minutesMarkdown].filter(Boolean).join('\n\n');

  function ruleExtract(text) {
    const projectPatterns = [
      /(?:project|construction|renovation|repair|purchase|build|install|acquire|procure|fund)\s+(?:of\s+)?([^.!?\n]{10,100})/gi,
      /(?:carry out|undertake|execute)\s+(?:the\s+)?([^.!?\n]{10,100})/gi,
    ];
    const found = [];
    for (const pattern of projectPatterns) {
      let m;
      while ((m = pattern.exec(text)) !== null) {
        const t = m[1].trim().replace(/[,;:].*/, '');
        if (t.length > 8) found.push({ title: t, description: m[0].trim(), estimatedCost: 0, source: 'ai_extracted', sourceMeetingId: meetingId });
      }
    }
    return found.slice(0, 5);
  }

  let extracted = [];
  if (deepseekKey && content.trim()) {
    try {
      const prompt = `Extract church project proposals from this KPSC meeting content. Return a JSON array of projects with keys: title (string), description (string), estimatedCost (number in naira, 0 if not stated), priority (low/medium/high), targetDate (YYYY-MM-DD or empty string). Only include actual project proposals (things to build, buy, repair, or fund). Limit to 10 items. Return ONLY valid JSON array.\n\nMeeting content:\n${content.slice(0, 4000)}`;
      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
        body: JSON.stringify({ model: deepseekModel, messages: [{ role: 'user', content: prompt }], max_tokens: 1500, temperature: 0.2 }),
      });
      if (resp.ok) {
        const aiData = await resp.json();
        const rawText = aiData.choices?.[0]?.message?.content || '[]';
        const parsed = safeJsonParse(rawText.replace(/```json?\s*/gi, '').replace(/```\s*/gi, '').trim(), null);
        if (Array.isArray(parsed)) {
          extracted = parsed.map(p => ({
            title: String(p.title || '').trim(),
            description: String(p.description || '').trim(),
            estimatedCost: Number(p.estimatedCost || 0),
            priority: ['low','medium','high'].includes(String(p.priority||'').toLowerCase()) ? p.priority.toLowerCase() : 'medium',
            targetDate: String(p.targetDate || '').trim(),
            source: 'ai_extracted',
            sourceMeetingId: meetingId,
          })).filter(p => p.title.length > 3);
        }
      }
    } catch (_) {
      extracted = ruleExtract(content);
    }
  } else {
    extracted = ruleExtract(content);
  }

  const inserted = [];
  for (const proj of extracted) {
    if (!proj.title) continue;
    const id = newId('kprj');
    await DB.prepare(`
      INSERT INTO kpsc_projects (id,title,description,estimated_cost,status,priority,target_date,source_meeting_id,source,created_by,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id, proj.title, proj.description || '', proj.estimatedCost || 0,
      'proposed', proj.priority || 'medium', proj.targetDate || '',
      proj.sourceMeetingId || meetingId, proj.source || 'ai_extracted',
      createdBy, new Date().toISOString(),
    ).run();
    const saved = await DB.prepare(`SELECT * FROM kpsc_projects WHERE id=?`).bind(id).first();
    if (saved) inserted.push(kpscProjectFromRow(saved));
  }
  return ok({ extracted: inserted.length, projects: inserted });
}

// ── APPROVE MEETING SUGGESTED PROJECTS ───────────────────────────────────────
// Called when the secretary approves suggested projects in the review panel.
// Writes each approved project to kpsc_projects and clears the suggested list.
async function approveMeetingProjects(DB, data) {
  const meetingId = String(data?.meetingId || '').trim();
  const createdBy = String(data?.createdBy || '').trim();
  const projects = Array.isArray(data?.projects) ? data.projects : [];
  if (!meetingId) return err('meetingId is required', 400);

  const row = await DB.prepare(`SELECT id FROM ai_secretary_meetings WHERE id=?`).bind(meetingId).first();
  if (!row) return err('Meeting not found', 404);

  const inserted = [];
  for (const proj of projects) {
    const title = String(proj?.title || '').trim();
    if (!title) continue;
    const id = newId('kprj');
    await DB.prepare(`
      INSERT INTO kpsc_projects (id,title,description,estimated_cost,status,priority,target_date,source_meeting_id,source,created_by,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id, title, String(proj.description || '').trim(), Number(proj.estimatedCost || 0),
      'proposed',
      ['low', 'medium', 'high'].includes(String(proj.priority || '').toLowerCase()) ? String(proj.priority).toLowerCase() : 'medium',
      String(proj.targetDate || '').trim(),
      meetingId, 'ai_extracted', createdBy, new Date().toISOString(),
    ).run();
    const saved = await DB.prepare(`SELECT * FROM kpsc_projects WHERE id=?`).bind(id).first();
    if (saved) inserted.push(kpscProjectFromRow(saved));
  }

  // Clear suggested projects from the meeting so they don't appear as pending again.
  await DB.prepare(`UPDATE ai_secretary_meetings SET suggested_projects_json='[]' WHERE id=?`).bind(meetingId).run();

  return ok({ saved: inserted.length, projects: inserted });
}

// ── ACTION ITEMS CRUD ────────────────────────────────────────────────────────

async function getActionItems(DB) {
  const result = await DB.prepare(
    `SELECT * FROM kpsc_action_items ORDER BY due_date ASC, created_at DESC`
  ).all();
  return ok({ items: result.results || [] });
}

async function createActionItem(DB, body, auth) {
  const task = String(body?.task || '').trim();
  if (!task) return err('task is required', 400);
  const id = newId('kai');
  const assignee   = String(body?.assignee   || '').trim();
  const dueDate    = String(body?.dueDate    || '').trim();
  const priority   = ['low','medium','high','urgent'].includes(body?.priority) ? body.priority : 'medium';
  const notes      = String(body?.notes      || '').trim();
  const meetingId  = String(body?.meetingId  || '').trim();
  const projectId  = String(body?.projectId  || '').trim();
  await DB.prepare(`
    INSERT INTO kpsc_action_items (id,task,assignee,created_by,meeting_id,due_date,priority,notes,project_id)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).bind(id, task, assignee, auth.name || '', meetingId, dueDate, priority, notes, projectId).run();
  const item = await DB.prepare(`SELECT * FROM kpsc_action_items WHERE id=?`).bind(id).first();
  return ok(item);
}

async function updateActionItem(DB, id, body) {
  const existing = await DB.prepare(`SELECT * FROM kpsc_action_items WHERE id=?`).bind(id).first();
  if (!existing) return err('Action item not found', 404);
  const task      = body?.task      !== undefined ? String(body.task).trim()      : existing.task;
  const assignee  = body?.assignee  !== undefined ? String(body.assignee).trim()  : existing.assignee;
  const dueDate   = body?.dueDate   !== undefined ? String(body.dueDate).trim()   : existing.due_date;
  const status    = ['pending','in_progress','done','cancelled'].includes(body?.status) ? body.status : existing.status;
  const priority  = ['low','medium','high','urgent'].includes(body?.priority) ? body.priority : existing.priority;
  const notes     = body?.notes     !== undefined ? String(body.notes).trim()     : existing.notes;
  const projectId = body?.projectId !== undefined ? String(body.projectId).trim() : existing.project_id;
  await DB.prepare(`
    UPDATE kpsc_action_items SET task=?,assignee=?,due_date=?,status=?,priority=?,notes=?,project_id=?,updated_at=datetime('now')
    WHERE id=?
  `).bind(task, assignee, dueDate, status, priority, notes, projectId, id).run();
  const updated = await DB.prepare(`SELECT * FROM kpsc_action_items WHERE id=?`).bind(id).first();
  return ok(updated);
}

async function deleteActionItem(DB, id) {
  const { meta } = await DB.prepare(`DELETE FROM kpsc_action_items WHERE id=?`).bind(id).run();
  if (!meta.changes) return err('Action item not found', 404);
  return ok({ deleted: id });
}

// ── DEEPGRAM BATCH DIARIZATION ───────────────────────────────────────────────
// Transcribes an uploaded audio file using Deepgram's pre-recorded REST API
// with speaker diarization enabled. Returns a labelled transcript.
async function transcribeAudioWithDiarization(env, request) {
  const apiKey = String(env.DEEPGRAM_API_KEY || '').trim();
  if (!apiKey) {
    return ok({ transcript: '', utterances: [], error: 'DEEPGRAM_API_KEY is not configured. Please set it in Cloudflare environment variables.' });
  }

  let form;
  try {
    form = await request.formData();
  } catch (_) {
    return err('Expected multipart form data with an "audio" field.', 400);
  }

  const audio = form.get('audio');
  if (!audio || typeof audio.arrayBuffer !== 'function') {
    return err('Missing or invalid audio field.', 400);
  }

  const mimeType = String(form.get('mimeType') || audio.type || 'audio/webm');
  const audioBuffer = await audio.arrayBuffer();

  const dgUrl = 'https://api.deepgram.com/v1/listen?diarize=true&utterances=true&model=nova-2&smart_format=true&punctuate=true';
  let dgResp;
  try {
    dgResp = await fetch(dgUrl, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': mimeType,
      },
      body: audioBuffer,
    });
  } catch (e) {
    return ok({ transcript: '', utterances: [], error: `Deepgram request failed: ${e.message}` });
  }

  if (!dgResp.ok) {
    const errText = await dgResp.text().catch(() => `HTTP ${dgResp.status}`);
    return ok({ transcript: '', utterances: [], error: `Deepgram error: ${errText}` });
  }

  const dgData = await dgResp.json().catch(() => ({}));
  const utterances = dgData?.results?.utterances || [];

  if (!utterances.length) {
    // Fall back to plain transcript if no utterances returned.
    const plain = dgData?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    if (!plain) return ok({ transcript: '', utterances: [], error: 'No speech detected in the audio file.' });
    return ok({ transcript: plain, utterances: [], speakerCount: 0 });
  }

  // Build a speaker-labelled transcript and find how many distinct speakers there are.
  const speakerNums = [...new Set(utterances.map(u => Number(u.speaker)))].sort((a, b) => a - b);
  const lines = utterances.map(u => `Speaker ${u.speaker}: ${String(u.transcript || '').trim()}`);
  const transcript = lines.join('\n');

  return ok({ transcript, utterances, speakerCount: speakerNums.length, speakers: speakerNums });
}

// Returns the OpenAI API key — prefers the Cloudflare env var (OPENAI_API_KEY),
// falls back to the value stored in DB settings (ai_openai_key) so that keys
// entered via the Settings → AI Provider Keys UI work without a redeploy.
async function resolveOpenAiKey(env, DB) {
  const envKey = String(env?.OPENAI_API_KEY || '').trim();
  if (envKey) return envKey;
  try {
    const row = await DB.prepare(`SELECT value FROM settings WHERE key='ai_openai_key'`).first();
    return row?.value ? String(row.value).trim() : '';
  } catch (_) {
    return '';
  }
}

async function ocrHandwrittenNotes(env, data, DB) {
  const imageBase64 = String(data?.imageBase64 || '').trim();
  const mimeType = String(data?.mimeType || 'image/jpeg').trim();
  if (!imageBase64) return err('imageBase64 is required', 400);

  // Read the configured vision/OCR model from settings (defaults to gpt-4o).
  let ocrModel = 'gpt-5-mini';
  try {
    const sr = await DB.prepare(`SELECT value FROM settings WHERE key='ai_ocr_model'`).first();
    if (sr?.value) ocrModel = String(sr.value).trim();
  } catch (_) {}

  const openaiKey = await resolveOpenAiKey(env, DB);
  if (!openaiKey) {
    return ok({ transcript: '', method: 'none', error: 'No OpenAI API key is configured. Add your key in Settings → AI Provider Keys.' });
  }

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: ocrModel,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'This is a photo of handwritten meeting notes from a church committee meeting. Please transcribe the text exactly as written, preserving structure and formatting. If the writing mentions names, amounts (naira), dates, resolutions, or action items, preserve them accurately. Return only the transcribed text, nothing else.' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' } },
          ],
        }],
        max_completion_tokens: 2000,
      }),
    });
    const aiData = await resp.json();
    if (!resp.ok) {
      const reason = aiData?.error?.message || `OpenAI error ${resp.status}`;
      return ok({ transcript: '', method: 'none', error: `OCR failed: ${reason}` });
    }
    const text = (aiData.choices?.[0]?.message?.content || '').trim();
    if (text) return ok({ transcript: text, method: 'openai_vision' });
    return ok({ transcript: '', method: 'none', error: 'OCR returned no text. Please use a clearer, well-lit photo.' });
  } catch (e) {
    return ok({ transcript: '', method: 'none', error: `OCR request failed: ${e.message}` });
  }
}

async function transcribeAudioWithWhisper(env, request, DB) {
  const openaiKey = await resolveOpenAiKey(env, DB);
  if (!openaiKey) {
    return ok({ transcript: '', method: 'none', error: 'No transcription key configured. Add your OpenAI API key in Settings → AI Provider Keys.' });
  }

  // Read the configured transcription model from settings. Default to
  // gpt-4o-mini-transcribe — best price/quality ratio for typical
  // meeting audio. Auto-migrate the older default so existing settings
  // rows that stored the verbatim default benefit from the cost saving
  // without admin action; explicit selections (whisper-1, full
  // gpt-4o-transcribe) are preserved.
  let transcriptionModel = 'gpt-4o-mini-transcribe';
  try {
    const sr = await DB.prepare(`SELECT value FROM settings WHERE key='ai_transcription_model'`).first();
    if (sr?.value) transcriptionModel = String(sr.value).trim();
  } catch (_) {}

  let form;
  try {
    form = await request.formData();
  } catch (_) {
    return err('Expected multipart form data with an "audio" field.', 400);
  }

  const audio = form.get('audio');
  if (!audio || typeof audio.arrayBuffer !== 'function') {
    return err('Missing or invalid audio field.', 400);
  }

  const mimeType = String(form.get('mimeType') || audio.type || 'audio/webm');
  const ext = mimeType.split('/')[1]?.split(';')[0] || 'webm';
  const filename = `recording.${ext}`;

  const whisperForm = new FormData();
  whisperForm.append('file', audio, filename);
  whisperForm.append('model', transcriptionModel);

  const methodLabel = transcriptionModel === 'whisper-1'
    ? 'openai_whisper'
    : (transcriptionModel === 'gpt-4o-mini-transcribe' ? 'openai_gpt4o_mini' : 'openai_gpt4o');
  try {
    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: whisperForm,
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => `HTTP ${resp.status}`);
      return ok({ transcript: '', method: methodLabel, error: `Transcription failed: ${errText}` });
    }
    const data = await resp.json();
    const text = String(data.text || '').trim();
    if (!text) return ok({ transcript: '', method: methodLabel, error: 'No speech detected in the audio file.' });
    return ok({ transcript: text, method: methodLabel });
  } catch (e) {
    return ok({ transcript: '', method: methodLabel, error: `Transcription error: ${e.message}` });
  }
}

async function ocrReceipt(env, data, DB) {
  const imageBase64 = String(data?.imageBase64 || '').trim();
  const mimeType = String(data?.mimeType || 'image/jpeg').trim();
  if (!imageBase64) return err('imageBase64 is required', 400);

  const openaiKey = await resolveOpenAiKey(env, DB);
  if (openaiKey) {
    try {
      const prompt = `You are a receipt OCR assistant. Analyse this receipt image and extract the following fields. Respond ONLY with a JSON object — no prose, no markdown fences.
{
  "vendor": "string or null — business/vendor name",
  "date": "YYYY-MM-DD or null — date on receipt",
  "amount": "number or null — total amount in major currency units (e.g. 12500.00 for ₦12,500)",
  "currency": "NGN|USD|GBP|EUR or null",
  "reference": "string or null — receipt or invoice number",
  "items_summary": "string or null — one-line description of goods/services purchased"
}`;
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o',
          response_format: { type: 'json_object' },
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' } },
            ],
          }],
          max_completion_tokens: 500,
        }),
      });
      if (resp.ok) {
        const aiData = await resp.json();
        const raw = aiData.choices?.[0]?.message?.content || '';
        try {
          const parsed = JSON.parse(raw);
          return ok({
            vendor: parsed.vendor ?? null,
            date: parsed.date ?? null,
            amount: parsed.amount ?? null,
            currency: parsed.currency ?? null,
            reference: parsed.reference ?? null,
            itemsSummary: parsed.items_summary ?? null,
            method: 'openai_vision',
          });
        } catch (_) {
          return ok({ error: 'Could not parse receipt', method: 'openai_vision' });
        }
      }
    } catch (_) {}
  }

  return ok({ vendor: null, date: null, amount: null, currency: null, reference: null, itemsSummary: null, method: 'none', error: 'No vision-capable AI key is configured. Add your OpenAI API key in Settings → AI Provider Keys.' });
}

async function parseStatementWithAI(env, DB, data) {
  const statementText = String(data?.statementText || '').trim();
  if (!statementText) return err('statementText is required', 400);

  let deepseekKey = '';
  let deepseekModel = 'deepseek-v4-flash';
  try {
    const { results: sr } = await DB.prepare(`SELECT key,value FROM settings WHERE key IN ('ai_deepseek_key','ai_deepseek_model')`).all();
    const settings = Object.fromEntries((sr || []).map(r => [r.key, String(r.value || '')]));
    deepseekKey = settings.ai_deepseek_key ? String(settings.ai_deepseek_key).trim() : '';
    deepseekModel = settings.ai_deepseek_model ? String(settings.ai_deepseek_model).trim() : 'deepseek-v4-flash';
    // Auto-migrate legacy DeepSeek model names that are being discontinued 2026-07-24.
    if (deepseekModel === 'deepseek-chat')     deepseekModel = 'deepseek-v4-flash';
    if (deepseekModel === 'deepseek-reasoner') deepseekModel = 'deepseek-v4-pro';
  } catch (_) {}

  if (!deepseekKey) {
    return err('DeepSeek API key is required. Configure it in Settings → AI Provider Keys.', 503);
  }

  const prompt = `Parse this bank statement text and extract all transaction line items. Return a JSON array where each item has:\n- date: "YYYY-MM-DD" (best guess from statement)\n- amount: positive number (always positive)\n- type: "income" if credit/deposit/inflow, "expense" if debit/withdrawal/outflow\n- reference: transaction reference or narration code\n- narration: brief description of the transaction\n\nReturn ONLY a valid JSON array, no other text. If a field is unclear, use empty string or 0.\n\nBank statement text:\n${statementText.slice(0, 5000)}`;

  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
      body: JSON.stringify({ model: deepseekModel, messages: [{ role: 'user', content: prompt }], max_tokens: 3000, temperature: 0.1 }),
    });
    if (!resp.ok) throw new Error(`DeepSeek API error ${resp.status}`);
    const aiData = await resp.json();
    const rawText = aiData.choices?.[0]?.message?.content || '[]';
    const cleanText = rawText.replace(/```json?\s*/gi, '').replace(/```\s*/gi, '').trim();
    const parsed = safeJsonParse(cleanText, null);
    if (!Array.isArray(parsed)) throw new Error('AI did not return a valid JSON array');
    const items = parsed.map((item, i) => ({
      id: `st-${i + 1}`,
      date: String(item?.date || '').slice(0, 10),
      amount: Math.abs(Number(item?.amount || 0)),
      type: String(item?.type || '').toLowerCase() === 'expense' ? 'expense' : 'income',
      reference: String(item?.reference || '').trim(),
      narration: String(item?.narration || '').trim(),
    }));
    return ok({ items, count: items.length });
  } catch (e) {
    return err(`Failed to parse statement: ${e.message}`, 500);
  }
}
function normalizeAiParticipants(participants) {
  const incoming = Array.isArray(participants) ? participants : [];
  if (incoming.length === 0) {
    return [
      { group: 'men',       label: 'Men',       present: false, name: '', position: '' },
      { group: 'women',     label: 'Women',     present: false, name: '', position: '' },
      { group: 'youth',     label: 'Youth',     present: false, name: '', position: '' },
      { group: 'ministers', label: 'Ministers', present: false, name: '', position: '' },
    ];
  }
  // Preserve all entries as-is (supports multiple members per group from the KPSC portal)
  return incoming.map(p => ({
    group:    String(p.group || '').toLowerCase(),
    label:    String(p.label || p.group || ''),
    present:  !!p.present,
    name:     String(p.name     || '').trim(),
    position: String(p.position || '').trim(),
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
    agendaText: row.agenda_text || '',
    summaryShort: row.summary_short || '',
    summaryLong: row.summary_long || '',
    minutesMarkdown: row.minutes_markdown || '',
    resolutions: safeJsonParse(row.resolutions_json, []),
    actionItems: safeJsonParse(row.action_items_json, []),
    policyFlags: safeJsonParse(row.policy_flags_json, []),
    suggestedProjects: safeJsonParse(row.suggested_projects_json, []),
    createdBy: row.created_by || '',
    createdByAccountId: row.created_by_account_id || '',
    startedAt: row.started_at || '',
    endedAt: row.ended_at || '',
    reviewedAt: row.reviewed_at || '',
    reviewedBy: row.reviewed_by || '',
    publicShareToken: row.public_share_token || '',
    processedAt: row.processed_at || '',
    createdAt: row.created_at || '',
    deletedAt: row.deleted_at || '',
    deletedBy: row.deleted_by || '',
    scheduledFor: row.scheduled_for || null,
    preBriefMarkdown: row.pre_brief_markdown || null,
    preBriefGeneratedAt: row.pre_brief_generated_at || null,
    venue: row.venue || '',
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
  const rawParticipants = meeting.participants || [];
  const { missingGroups, quorumMet } = aiSecretaryParticipantCoverage(rawParticipants);
  const flags = [];
  // Only raise quorum_missing as high-severity when attendance was actually recorded.
  // If no participant has a name or is marked present, the attendance form was never
  // filled in — flag it as medium to prompt the secretary rather than alarming them.
  if (!quorumMet) {
    const hasRealAttendanceData = rawParticipants.some(p => p.present || String(p.name || '').trim());
    if (hasRealAttendanceData) {
      flags.push({ type: 'quorum_missing', severity: 'high', message: `Missing required representative group(s): ${missingGroups.join(', ')}.` });
    } else {
      flags.push({ type: 'quorum_missing', severity: 'medium', message: 'Attendance has not been recorded; please mark attendance before approving these minutes.' });
    }
  }
  if (!String(transcript).trim()) {
    flags.push({ type: 'transcript_missing', severity: 'high', message: 'No transcript or secretary notes were provided; generated minutes require manual reconstruction from approved records.' });
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
  return /^##\s+(?:mandatory governance|policy) checks/im.test(markdown) ? markdown : `${markdown}${section}`;
}

const AI_MINUTES_TIMESTAMP_LINE_RE = /^\s*(?:\*\*)?\s*(generated(?:\s+(?:at|on))?|timestamp)\s*(?:\*\*)?\s*[:\-]\s*(?:\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}:\d{2})/i;

function stripAiMinutesTimestampLines(markdown) {
  return String(markdown || '')
    .split('\n')
    .filter(line => !AI_MINUTES_TIMESTAMP_LINE_RE.test(line.trim()))
    .join('\n')
    .trim();
}

function hasStandardMinutesStructure(markdown) {
  const text = String(markdown || '').toLowerCase();
  // Accept both legacy section names and the current numbered format (e.g. "## 4. Agenda…")
  return (
    /## (?:\d+\.\s+)?attendance/.test(text) &&
    /## (?:\d+\.\s+)?(?:agenda|matters discussed)/.test(text) &&
    /## (?:\d+\.\s+)?(?:decision|resolution)/.test(text) &&
    /## (?:\d+\.\s+)?action items?/.test(text)
  );
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
    suggestedProjects: aiSecretaryArray(raw.suggestedProjects).map(p => ({
      title: String(p?.title || '').trim(),
      description: String(p?.description || '').trim(),
      estimatedCost: Number(p?.estimatedCost || 0),
      priority: ['low', 'medium', 'high'].includes(String(p?.priority || '').toLowerCase()) ? String(p.priority).toLowerCase() : 'medium',
      targetDate: String(p?.targetDate || '').trim(),
    })).filter(p => p.title.length > 3).slice(0, 10),
  };
  if (!output.agendaItems.length) output.agendaItems = deterministic.agendaItems || extractAgendaItems(meeting.transcriptText || '');
  if (!output.minutesMarkdown) output.minutesMarkdown = deterministic.minutesMarkdown;
  output.minutesMarkdown = stripAiMinutesTimestampLines(output.minutesMarkdown);
  if (!hasStandardMinutesStructure(output.minutesMarkdown)) {
    output.minutesMarkdown = deterministic.minutesMarkdown;
    output.policyFlags = dedupeAiSecretaryFlags([
      ...output.policyFlags,
      { type: 'minutes_template_used', severity: 'low', message: 'AI-generated minutes did not meet the required 8-section structure; the standard template has been used instead. Please fill in all sections before approving.' },
    ]);
  }
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

/**
 * Normalise a DeepSeek model name, migrating legacy names that are being
 * discontinued (deepseek-chat → deepseek-v4-flash, etc.).
 */
function normalizeDeepseekModel(raw) {
  const m = String(raw || 'deepseek-v4-flash').trim() || 'deepseek-v4-flash';
  if (m === 'deepseek-chat')     return 'deepseek-v4-flash';
  if (m === 'deepseek-reasoner') return 'deepseek-v4-pro';
  return m;
}

/**
 * Load DeepSeek key + model from settings DB, returning { key, model }.
 * Returns an object with empty key on error (callers should fall back gracefully).
 */
async function loadDeepseekSettings(DB) {
  try {
    const { results } = await DB.prepare(
      `SELECT key,value FROM settings WHERE key IN ('ai_deepseek_key','ai_deepseek_model')`
    ).all();
    const s = Object.fromEntries((results || []).map(r => [r.key, String(r.value || '')]));
    return { key: s.ai_deepseek_key?.trim() || '', model: normalizeDeepseekModel(s.ai_deepseek_model) };
  } catch {
    return { key: '', model: 'deepseek-v4-flash' };
  }
}

function buildAiSecretaryOutput(meeting, options = {}) {
  const { normalized: participants, missingGroups, quorumMet } = aiSecretaryParticipantCoverage(meeting.participants);
  const present = participants.filter(p => p.present);
  const governanceFlags = buildAiSecretaryGovernanceFlags(meeting);
  const agendaItems = extractAgendaItems(meeting.transcriptText || '');
  const resolutions = extractResolutions(meeting.transcriptText || '', governanceFlags);
  const actionItems = extractActionItems(meeting.transcriptText || '');

  // Format a human-readable date heading
  let dateHeading = meeting.meetingDate || 'Date not recorded';
  try {
    const d = new Date((meeting.meetingDate || '') + 'T12:00:00');
    if (!isNaN(d.getTime())) {
      const day = d.getDate();
      const suffix = (day >= 11 && day <= 13) ? 'th' : ['th','st','nd','rd','th'][Math.min(day % 10, 4)];
      const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
      const month = d.toLocaleDateString('en-GB', { month: 'long' });
      dateHeading = `${weekday}, ${day}${suffix} ${month} ${d.getFullYear()}`;
    }
  } catch (_) {}

  const typeLabels = { routine: 'Routine', emergency: 'Emergency', special: 'Special', agm: 'Annual General Meeting' };
  const typeLabel = typeLabels[meeting.meetingType] || (meeting.meetingType ? meeting.meetingType.charAt(0).toUpperCase() + meeting.meetingType.slice(1) : 'Routine');

  // Group attendance by the 4 required groups (multiple members per group are supported)
  const groupedAttendance = AI_SECRETARY_REQUIRED_GROUPS.map(req => {
    const presentMembers = participants.filter(p => p.group === req.group && p.present);
    return { label: req.label, present: presentMembers.length > 0, names: presentMembers.map(p => p.name).filter(Boolean) };
  });

  const presentGroupLabels = groupedAttendance.filter(g => g.present).map(g => g.label);
  const allPresentNames = present.filter(p => p.name).map(p => p.name);

  // ── Summary fields ──────────────────────────────────────────────────────────
  const summaryShort = present.length === 0
    ? `The ${meeting.title || 'KPSC meeting'} was held on ${meeting.meetingDate || 'the scheduled date'}. No attendance records are available — please complete the minutes before filing.`
    : `The ${meeting.title || 'KPSC meeting'} was held on ${meeting.meetingDate || 'the scheduled date'} with ${present.length} member(s) present from the ${presentGroupLabels.join(', ')} group(s). ${resolutions.length ? `${resolutions.length} decision(s) were recorded.` : 'The matters discussed are summarised below.'}`;

  const quorumStatement = quorumMet
    ? 'Quorum was met, with all four representative groups present.'
    : `Quorum was not met — the ${missingGroups.join(', ')} group(s) had no representative present. Any approvals taken may require subsequent ratification by the full committee.`;

  const summaryLong = [
    `The ${typeLabel.toLowerCase()} meeting of the Kingdom Parish Stewardship Committee (KPSC) was held on ${dateHeading}.`,
    present.length
      ? (allPresentNames.length
          ? `In attendance: ${allPresentNames.join(', ')}.`
          : `${present.length} member(s) were present from the ${presentGroupLabels.join(', ')} group(s).`)
      : 'No attendance was recorded for this meeting.',
    quorumStatement,
    agendaItems.length ? `Matters discussed included: ${agendaItems.join('; ')}.` : '',
    resolutions.filter(r => r.approved === true).length
      ? `${resolutions.filter(r => r.approved === true).length} decision(s) were approved.`
      : '',
    resolutions.filter(r => r.approved === null).length
      ? `${resolutions.filter(r => r.approved === null).length} matter(s) were deferred pending confirmation.`
      : '',
    actionItems.length ? `${actionItems.length} follow-up action item(s) were identified.` : '',
  ].filter(Boolean).join(' ');

  // ── Attendance block — grouped, not one line per individual ────────────────
  const attendanceLines = groupedAttendance.map(g => {
    if (!g.present) return `- **${g.label}:** Absent`;
    return `- **${g.label}:** ${g.names.length ? g.names.join(', ') : 'Present'}`;
  });
  const quorumNote = quorumMet
    ? '*All four representative groups were present — quorum was met.*'
    : `*Quorum was not met — ${missingGroups.join(', ')} had no representative. Decisions may require subsequent ratification.*`;

  // ── Decisions — natural English, no metadata parentheses ──────────────────
  const decisionLines = resolutions.length
    ? resolutions.map((r, i) => {
        const motionParts = [];
        if (r.motionBy) motionParts.push(`Moved by ${r.motionBy}`);
        if (r.secondedBy) motionParts.push(`seconded by ${r.secondedBy}`);
        const vote = r.voteSummary && r.voteSummary !== 'Manual vote review required.' ? r.voteSummary : '';
        if (vote) motionParts.push(vote);
        const statusNote = r.approved === true ? '*(Approved)*' : r.approved === false ? '*(Rejected)*' : '*(Outcome to be confirmed)*';
        const motionStr = motionParts.length ? ` — ${motionParts.join('; ')}.` : '.';
        const amountStr = r.amount ? ` Amount: ₦${Number(r.amount).toLocaleString('en-NG')}.` : '';
        return `${i + 1}. ${r.text}${amountStr}${motionStr} ${statusNote}`;
      })
    : ['*(No resolutions were extracted from the transcript. Please review and add any decisions before filing.)*'];

  // ── Action items ──────────────────────────────────────────────────────────
  const actionLines = actionItems.length
    ? actionItems.map((a, i) => {
        let line = `${i + 1}. ${a.task}`;
        if (a.assignee && a.assignee !== 'Unassigned') line += ` — *Responsible: ${a.assignee}*`;
        if (a.dueDate) line += ` (by ${a.dueDate})`;
        return line;
      })
    : ['*(No action items were extracted. Please review the transcript and add any follow-up tasks.)*'];

  // ── Agenda ────────────────────────────────────────────────────────────────
  const agendaLines = agendaItems.length
    ? agendaItems.map(item => `- ${item}`)
    : ['*(Agenda items to be confirmed from transcript — please review and insert before filing.)*'];

  // ── Full minutes markdown ─────────────────────────────────────────────────
  const minutesMarkdown = [
    `# ${meeting.title || 'KPSC Meeting'}`,
    `## Minutes of ${typeLabel} Meeting — ${dateHeading}`,
    '',
    '---',
    '',
    '## 1. Attendance',
    '',
    ...attendanceLines,
    '',
    quorumNote,
    '',
    '---',
    '',
    '## 2. Opening',
    '',
    '*(To be confirmed from transcript or recording.)*',
    '',
    '---',
    '',
    '## 3. Matters Arising from Previous Minutes',
    '',
    '*(None recorded in this transcript, or to be confirmed by the Secretary.)*',
    '',
    '---',
    '',
    '## 4. Agenda and Matters Discussed',
    '',
    ...agendaLines,
    '',
    '---',
    '',
    '## 5. Decisions and Resolutions',
    '',
    ...decisionLines,
    '',
    '---',
    '',
    '## 6. Action Items',
    '',
    ...actionLines,
    '',
    '---',
    '',
    '## 7. Any Other Business',
    '',
    '*(To be confirmed from transcript.)*',
    '',
    '---',
    '',
    '## 8. Closing and Adjournment',
    '',
    '*(To be confirmed from transcript.)*',
  ].join('\n');

  const executiveSummary = summaryLong; // not stored separately in DB; kept for schema compatibility
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

async function deleteAiSecretaryMeeting(DB, id, auth) {
  const existing = await DB.prepare(
    `SELECT id, title, created_by, created_by_account_id, status, deleted_at FROM ai_secretary_meetings WHERE id=?`
  ).bind(id).first();
  if (!existing) return err('AI secretary meeting not found', 404);
  // Already soft-deleted — return idempotently.
  if (existing.deleted_at) return ok({ id, deletedAt: existing.deleted_at });

  // Authorisation is derived entirely from the verified session (auth param),
  // never from untrusted client-supplied body fields.
  const isAdmin = auth.role === 'acting_chairman' ||
                  auth.role === 'general_secretary' ||
                  auth.role === 'it_admin';
  const isAuthor = (!!auth.id && auth.id === (existing.created_by_account_id || ''))
    || (!existing.created_by_account_id && !!auth.name && auth.name === (existing.created_by || ''));

  if (!isAdmin && !isAuthor) {
    return err('Only the meeting author or an administrator can delete this meeting.', 403);
  }
  // Meeting authors may only delete meetings that are still in draft or recording phase.
  // Once a meeting has been ended or processed it becomes part of the official record;
  // removing it requires administrator privileges.
  if (!isAdmin && !['draft', 'recording'].includes(existing.status)) {
    return err('Only an administrator can delete a meeting that has already been ended or processed.', 403);
  }

  const now = new Date().toISOString();
  await DB.prepare(
    `UPDATE ai_secretary_meetings SET deleted_at=?, deleted_by=? WHERE id=?`
  ).bind(now, auth.name, id).run();

  // Write an audit notification so all administrators can see what was deleted and by whom.
  await DB.prepare(
    `INSERT INTO notifications (id,title,body,type,ts) VALUES (?,?,?,?,?)`
  ).bind(
    newId('N'),
    'Meeting record deleted',
    `"${String(existing.title || id).replace(/"/g, '\\"')}" (status: ${existing.status}) was deleted by ${auth.name} (${auth.role}).`,
    'warn',
    now,
  ).run();

  return ok({ id, deletedAt: now });
}

async function getAiSecretaryMeeting(DB, id) {
  const row = await DB.prepare(`SELECT * FROM ai_secretary_meetings WHERE id=?`).bind(id).first();
  if (!row || row.deleted_at) return err('AI secretary meeting not found', 404);
  return ok(aiSecretaryMeetingFromRow(row));
}

async function createAiSecretaryMeetingPublicLink(DB, request, id) {
  const row = await DB.prepare(
    `SELECT id,title,meeting_date,minutes_markdown,reviewed_at,public_share_token,deleted_at
     FROM ai_secretary_meetings WHERE id=?`
  ).bind(id).first();
  if (!row || row.deleted_at) return err('Meeting not found', 404);
  if (!String(row.minutes_markdown || '').trim()) return err('Minutes are not available for sharing yet.', 400);
  if (!String(row.reviewed_at || '').trim()) return err('Minutes review must be approved before sharing.', 412);
  const token = String(row.public_share_token || '').trim() || newId('kpub_');
  if (!row.public_share_token) {
    await DB.prepare(`UPDATE ai_secretary_meetings SET public_share_token=? WHERE id=?`).bind(token, id).run();
  }
  const origin = new URL(request.url).origin;
  return ok({
    meetingId: id,
    token,
    publicUrl: `${origin}/kpsc/minutes/?token=${encodeURIComponent(token)}`,
  });
}

async function revokeAiSecretaryMeetingPublicLink(DB, id, auth) {
  const row = await DB.prepare(
    `SELECT id,title,public_share_token,deleted_at FROM ai_secretary_meetings WHERE id=?`
  ).bind(id).first();
  if (!row || row.deleted_at) return err('Meeting not found', 404);
  if (!String(row.public_share_token || '').trim()) {
    return ok({ meetingId: id, revoked: false, alreadyRevoked: true });
  }
  await DB.prepare(`UPDATE ai_secretary_meetings SET public_share_token='' WHERE id=?`).bind(id).run();
  const now = new Date().toISOString();
  await DB.prepare(
    `INSERT INTO notifications (id,title,body,type,ts) VALUES (?,?,?,?,?)`
  ).bind(
    newId('N'),
    'KPSC minutes public link revoked',
    `Public minutes link for "${String(row.title || id).replace(/"/g, '\\"')}" was revoked by ${auth.name} (${auth.role}).`,
    'warn',
    now,
  ).run();
  return ok({ meetingId: id, revoked: true });
}

async function getAiSecretaryMeetingPublicView(DB, token) {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) return err('token is required', 400);
  const row = await DB.prepare(
    `SELECT id,title,meeting_date,meeting_type,summary_short,summary_long,minutes_markdown,reviewed_at
     FROM ai_secretary_meetings
     WHERE public_share_token=? AND COALESCE(deleted_at,'')=''`
  ).bind(cleanToken).first();
  if (!row) return err('Public minutes link not found', 404);
  if (!String(row.reviewed_at || '').trim()) return err('Minutes review is not approved for public sharing.', 412);
  return ok({
    id: row.id,
    title: row.title || 'KPSC Meeting',
    meetingDate: row.meeting_date || '',
    meetingType: row.meeting_type || 'routine',
    summaryShort: row.summary_short || '',
    summaryLong: row.summary_long || '',
    minutesMarkdown: row.minutes_markdown || '',
  });
}

async function createAiSecretaryMeeting(DB, data, auth) {
  const id = data.id || newId('AIM-');
  const participants = normalizeAiParticipants(data.participants);
  const now = new Date().toISOString();
  // Author identity is always derived from the verified session — never from
  // client-supplied body fields (data.createdBy is intentionally ignored).
  const createdBy = auth?.name || '';
  const createdByAccountId = auth?.id || '';
  // INSERT OR IGNORE makes the create idempotent: if the client retries a POST
  // with the same pre-generated ID (e.g. after a network error), the duplicate
  // INSERT is silently skipped and the existing row is returned unchanged.
  await DB.prepare(`
    INSERT OR IGNORE INTO ai_secretary_meetings
      (id,title,meeting_type,meeting_date,status,participants_json,transcript_text,venue,created_by,created_by_account_id,started_at,created_at,scheduled_for)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id,
    String(data.title || 'KPSC Meeting').trim(),
    data.meetingType || 'routine',
    data.meetingDate || now.slice(0, 10),
    data.status || 'draft',
    JSON.stringify(participants),
    data.transcriptText || '',
    String(data.venue || '').trim(),
    createdBy,
    createdByAccountId,
    data.startedAt || '',
    now,
    data.scheduledFor ? String(data.scheduledFor).trim() : null,
  ).run();
  return await getAiSecretaryMeeting(DB, id);
}

async function updateAiSecretaryMeeting(DB, id, data, auth) {
  const existing = await DB.prepare(`SELECT * FROM ai_secretary_meetings WHERE id=?`).bind(id).first();
  if (!existing || existing.deleted_at) return err('AI secretary meeting not found', 404);
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
  const suggestedProjects = data.suggestedProjects !== undefined
    ? aiSecretaryArray(data.suggestedProjects).map((item, i) => ({
        id: aiSecretaryText(item?.id, `proj-${i + 1}`),
        title: aiSecretaryText(item?.title || item?.projectTitle),
        description: aiSecretaryText(item?.description || item?.projectDescription),
        estimatedCost: aiSecretaryText(item?.estimatedCost || item?.estimated_cost),
        priority: aiSecretaryText(item?.priority, 'medium') || 'medium',
        targetDate: aiSecretaryText(item?.targetDate || item?.target_date),
      })).filter(p => p.title || p.description).slice(0, 10)
    : safeJsonParse(existing.suggested_projects_json, []);

  const scheduledFor = data.scheduledFor !== undefined
    ? (data.scheduledFor ? String(data.scheduledFor).trim() : null)
    : (existing.scheduled_for || null);
  const reviewedAt = data.reviewedAt !== undefined
    ? String(data.reviewedAt || '').trim()
    : (existing.reviewed_at || '');
  const reviewedBy = data.reviewedBy !== undefined
    ? String(data.reviewedBy || '').trim()
    : (existing.reviewed_by || '');
  const venue = data.venue !== undefined
    ? String(data.venue || '').trim()
    : (existing.venue || '');
  await DB.prepare(`
    UPDATE ai_secretary_meetings SET
      title=?, meeting_type=?, meeting_date=?, status=?, participants_json=?, transcript_text=?, ended_at=?,
      summary_short=?, summary_long=?, minutes_markdown=?, resolutions_json=?, action_items_json=?, policy_flags_json=?,
      suggested_projects_json=?, scheduled_for=?, reviewed_at=?, reviewed_by=?, venue=?, created_by_account_id=?, agenda_text=?
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
    JSON.stringify(suggestedProjects),
    scheduledFor,
    reviewedAt,
    reviewedBy,
    venue,
    existing.created_by_account_id || (auth?.name && auth.name === (existing.created_by || '') ? auth.id : ''),
    data.agendaText !== undefined ? String(data.agendaText || '').trim() : (existing.agenda_text || ''),
    id,
  ).run();
  return await getAiSecretaryMeeting(DB, id);
}

async function callDeepSeekForMeeting(apiKey, meeting) {
  // Build a structured, grouped attendance block so the AI knows exactly who
  // attended and what role each person holds — essential for correct attribution
  // of motions, seconds, and decisions in the minutes.
  const GROUP_ORDER = ['men', 'women', 'youth', 'ministers'];
  const GROUP_LABELS = { men: 'Men', women: 'Women', youth: 'Youth', ministers: 'Ministers' };
  const fmtMember = p => p.position ? `${p.name || 'Unnamed'} (${p.position})` : (p.name || 'Unnamed');
  const participantList = GROUP_ORDER.map(grp => {
    const members = (meeting.participants || []).filter(p => p.group === grp);
    if (members.length === 0) return `${GROUP_LABELS[grp]}: Absent`;
    const present = members.filter(p => p.present);
    const absent  = members.filter(p => !p.present);
    const parts   = [];
    if (present.length) parts.push(`Present — ${present.map(fmtMember).join(', ')}`);
    if (absent.length)  parts.push(`Absent — ${absent.map(p => p.name || 'Unnamed').join(', ')}`);
    return `${GROUP_LABELS[grp]}: ${parts.join(' | ')}`;
  }).join('\n');

  // Include meeting start/end times when available (from live recording timestamps).
  const timingParts = [];
  if (meeting.startedAt) {
    try {
      const d = new Date(meeting.startedAt);
      if (!isNaN(d)) timingParts.push(`Meeting opened: ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (_) {}
  }
  if (meeting.endedAt) {
    try {
      const d = new Date(meeting.endedAt);
      if (!isNaN(d)) timingParts.push(`Meeting closed: ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (_) {}
  }
  const timingInfo = timingParts.join(' | ');

  const policyContext = aiSecretaryText(meeting.policyContext);
  const prompt = `You are an expert meeting minutes writer for the Kingdom Parish Stewardship Committee (KPSC), a Nigerian church committee. Correct transcription errors intelligently based on context. Your job is to produce a clean, professional set of structured minutes from the meeting rough transcript below.

Return a single valid JSON object — no markdown fences, no commentary outside the JSON — with these exact keys:

summaryShort      — 1–2 sentence overview of what the meeting covered and decided.
executiveSummary  — A plain-language, 3–5 sentence executive summary suitable for absent members.
summaryLong       — A detailed multi-paragraph narrative of proceedings, grouped by topic. Write it as a competent human secretary would — flowing prose, not bullet points.
agendaItems       — Array of strings: each distinct agenda item or topic discussed, in order.
minutesMarkdown   — The full formal minutes in Markdown (see format requirements below).
resolutions       — Array of resolution objects (see schema below).
actionItems       — Array of action item objects (see schema below).
policyFlags       — Array of governance flag objects (see schema below).
suggestedProjects — Array of project proposal objects (see schema below), omit key if none.

── MINUTES FORMAT (minutesMarkdown) ──────────────────────────────────────
Use exactly this numbered-section structure with Markdown headings:

# [Meeting Title]
## Minutes of [Type] Meeting — [day, Nth Month Year]
### [Venue, if provided] | [Time opened] – [Time closed, if available]

---

## 1. Attendance

- **Men:** [name(s), or "Absent"]
- **Women:** [name(s), or "Absent"]
- **Youth:** [name(s), or "Absent"]
- **Ministers:** [name(s), or "Absent"]

*[One sentence on quorum outcome — e.g. "Quorum was met." or "Quorum was not met — the Men and Women groups had no representative; decisions may require ratification."]*

---

## 2. Opening

[Opening prayer / devotion / formal opening, as stated in transcript. If not mentioned, write "(Not recorded in transcript.)".]

---

## 3. Matters Arising from Previous Minutes

[Any follow-up on prior decisions. If none, write "(None recorded.)"]

---

## 4. Agenda and Matters Discussed

[For each topic: a **bold sub-heading** then 1–3 sentences in third-person past tense describing the discussion — who raised it, what was proposed, concerns voiced, and the outcome. Example: "**Parish Fund Management** — The Chairman reported that both funds remained in separate bank accounts. The committee agreed that a single oversight committee would manage both funds going forward."]

---

## 5. Decisions and Resolutions

[Numbered list. For each decision write one sentence: what was resolved, who moved it, who seconded, and the vote outcome. Include naira amounts exactly as stated. Example: "1. The committee approved the printing of 100 copies of the partnership card — moved by the Chairman, adopted unanimously. *(Approved)*"]

---

## 6. Action Items

[Numbered list: task, responsible person, deadline. Example: "1. Print 100 partnership cards — *Responsible: Secretary* (by next meeting)"]

---

## 7. Any Other Business

[Any miscellaneous matters. If none, write "(None raised.)"]

---

## 8. Closing and Adjournment

[Closing prayer, adjournment motion (mover + seconder), time if stated.]

──────────────────────────────────────────────────────────────────────────

Tone rules:
- Write as a skilled, professional human secretary. The output must be indistinguishable from minutes written by an experienced Nigerian church administrator.
- STRICTLY FORBIDDEN — never write any of these:
    • "was detected" / "were detected" / "has been detected"
    • "by the draft processor" / "the draft processor"
    • "No explicit X was detected" / "no explicit Y was found"
    • "Governance note:" / "Welfare note:" / "Financial note:" / "Policy reference note:"
    • "may apply" — state what the transcript says; if uncertain, write "[Secretary to confirm]"
    • Any reference to AI, automation, or processing (e.g. "AI-generated", "automated")
    • Mechanical checklist notes that are not actual meeting content
- If a section has no content from the transcript, omit the section or write "[Secretary to confirm]" — never write a sentence explaining what the system failed to find.
- Do not add "Generated by AI" or any metadata.
- Do not invent facts. Preserve all names, amounts (₦), dates, and vote outcomes exactly.
- Use British/Nigerian English spelling (e.g. "organise", "honour", "colour").

── RESOLUTION SCHEMA ─────────────────────────────────────────────────────
Each resolution object: { id, text, category, resolutionType, requiredThreshold, approved, amount, motionBy, secondedBy, voteSummary }
- resolutionType — choose the MOST specific value that applies:
    financial_approval — any decision involving a naira amount, payment, fund disbursement, or budget
    rejection          — item explicitly voted down, declined, or not approved
    amendment          — change or modification to an existing policy, decision, or document
    motion             — proposal formally put forward (whether passed, deferred, or pending a vote)
    approval           — non-financial item confirmed or approved
    vote               — a general ballot or show of hands not clearly fitting above
    decision           — any other agreed-upon outcome
- category: welfare | financial | development | governance | other
- requiredThreshold: simple_majority | two_thirds | manual_review
- approved: true | false | null (null = outcome unclear or deferred)
- amount: naira amount as numeric string (digits only, no ₦ symbol), or empty string
- motionBy / secondedBy: use the person's name as stated in the Attendance section above, or empty string
- voteSummary: concise vote outcome, e.g. "Unanimous", "7 in favour, 2 against"

── ACTION ITEM SCHEMA ────────────────────────────────────────────────────
{ id, task, assignee, dueDate, status }
- assignee: full name or role title; "Unassigned" only if genuinely not stated
- dueDate: YYYY-MM-DD if a date was mentioned, else empty string
- status: "pending"

── POLICY FLAG SCHEMA ────────────────────────────────────────────────────
{ type, severity, message }
- type: quorum_missing | transcript_missing | threshold_review | welfare_privacy | prompt_injection_risk
- severity: low | medium | high

── SUGGESTED PROJECT SCHEMA ─────────────────────────────────────────────
{ title, description, estimatedCost, priority, targetDate }
- Only include concrete church project proposals (build, purchase, repair, fund, undertake).
- estimatedCost: number in naira (0 if not stated)
- priority: low | medium | high
- targetDate: YYYY-MM-DD or empty string
- Max 10 items.

── SAVED KPSC POLICY / BYLAW NOTES ──────────────────────────────────────
${policyContext || '(none saved)'}

── MEETING DATA ──────────────────────────────────────────────────────────
Title: ${meeting.title}
Date: ${meeting.meetingDate}
Type: ${meeting.meetingType}
${meeting.venue ? `Venue: ${meeting.venue}` : ''}
${timingInfo ? timingInfo : ''}
Attendance:
${participantList}

${meeting.agendaText ? `\nMeeting Agenda (pre-set by the Chairman):\n${meeting.agendaText}\n\nIMPORTANT: Use the agenda above to structure "## 4. Agenda and Matters Discussed". Each agenda item should appear as a sub-heading even if discussion is brief. Items not in the agenda but raised during the meeting should appear at the end of that section.\n` : ''}

${meeting.transcriptText
  ? `Transcript note: The following is a rough, error-heavy phonetic transcript produced by an AI transcriber. Many words are misspelled or misheard (e.g. Nigerian names mangled, naira amounts garbled, church/committee terms misrecognised). Use the surrounding conversational context to deduce the true meaning of unclear passages. Correct all technical jargon, proper nouns, and grammar errors as you draft the minutes — do not reproduce the transcript errors verbatim.

Transcript:
${meeting.transcriptText}`
  : `Transcript:\n(no transcript provided — produce a skeleton minutes document with placeholders for the secretary to complete)`}

Return only valid JSON. No markdown fences. No text before or after the JSON object.`;

  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: meeting.deepseekModel || 'deepseek-v4-flash', messages: [{ role: 'user', content: prompt }], max_tokens: 6000, temperature: 0.25 }),
  });
  if (!resp.ok) throw new Error(`DeepSeek API error ${resp.status}`);
  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content || '';
  return parseAiSecretaryJson(text);
}

async function processAiSecretaryMeeting(DB, id) {
  const row = await DB.prepare(`SELECT * FROM ai_secretary_meetings WHERE id=?`).bind(id).first();
  if (!row || row.deleted_at) return err('AI secretary meeting not found', 404);
  const meeting = aiSecretaryMeetingFromRow(row);
  let deepseekKey = '';
  try {
    const { results: settingsRows } = await DB.prepare(`SELECT key,value FROM settings WHERE key IN ('ai_deepseek_key','ai_deepseek_model','kpsc_policy_url','kpsc_policy_notes')`).all();
    const settings = Object.fromEntries((settingsRows || []).map(item => [item.key, String(item.value || '')]));
    deepseekKey = settings.ai_deepseek_key ? String(settings.ai_deepseek_key).trim() : '';
    meeting.deepseekModel = settings.ai_deepseek_model ? String(settings.ai_deepseek_model).trim() : 'deepseek-v4-flash';
    // Auto-migrate legacy DeepSeek model names that are being discontinued 2026-07-24.
    if (meeting.deepseekModel === 'deepseek-chat')     meeting.deepseekModel = 'deepseek-v4-flash';
    if (meeting.deepseekModel === 'deepseek-reasoner') meeting.deepseekModel = 'deepseek-v4-pro';
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
      status='processed', summary_short=?, summary_long=?, minutes_markdown=?, resolutions_json=?, action_items_json=?, policy_flags_json=?, suggested_projects_json=?, reviewed_at='', reviewed_by='', processed_at=?
    WHERE id=?
  `).bind(
    output.summaryShort || '',
    output.summaryLong || '',
    output.minutesMarkdown || '',
    JSON.stringify(output.resolutions || []),
    JSON.stringify(output.actionItems || []),
    JSON.stringify(output.policyFlags || []),
    JSON.stringify(output.suggestedProjects || []),
    processedAt,
    id,
  ).run();
  return getAiSecretaryMeeting(DB, id);
}

async function translateAiSecretaryMeetingPlainEnglish(DB, env, id) {
  const row = await DB.prepare(
    `SELECT minutes_markdown, plain_english_minutes_md, deleted_at FROM ai_secretary_meetings WHERE id=?`
  ).bind(id).first();
  if (!row || row.deleted_at) return err('Meeting not found', 404);

  const minutesMarkdown = row.minutes_markdown || '';
  if (!minutesMarkdown.trim()) return err('No minutes to translate', 400);

  // If cached, return it
  if (row.plain_english_minutes_md && row.plain_english_minutes_md.trim()) {
    return ok({ plainEnglish: row.plain_english_minutes_md, fromCache: true });
  }

  // Get DeepSeek key and model
  let deepseekKey = '';
  let deepseekModel = 'deepseek-v4-flash';
  try {
    const { results: sr } = await DB.prepare(
      `SELECT key,value FROM settings WHERE key IN ('ai_deepseek_key','ai_deepseek_model')`
    ).all();
    const settings = Object.fromEntries((sr || []).map(r => [r.key, String(r.value || '')]));
    deepseekKey = settings.ai_deepseek_key ? String(settings.ai_deepseek_key).trim() : '';
    deepseekModel = settings.ai_deepseek_model ? String(settings.ai_deepseek_model).trim() : 'deepseek-v4-flash';
    // Auto-migrate legacy DeepSeek model names that are being discontinued 2026-07-24.
    if (deepseekModel === 'deepseek-chat')     deepseekModel = 'deepseek-v4-flash';
    if (deepseekModel === 'deepseek-reasoner') deepseekModel = 'deepseek-v4-pro';
  } catch (_) {}

  if (!deepseekKey) return err('AI key not configured', 503);

  // Call DeepSeek with plain English prompt
  const prompt = `Rewrite the following meeting minutes at an 8th-grade reading level. Keep every fact, decision, person name, amount, and date exactly. Drop formal language, jargon, and unnecessary verbiage. Use short sentences. Don't add anything that isn't in the original. Return only the rewritten minutes, no preamble.

${minutesMarkdown}`;

  let plainEnglish = '';
  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
      body: JSON.stringify({
        model: deepseekModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 2500,
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      return err(`DeepSeek API error: ${errBody.error?.message || resp.status}`, 502);
    }
    const data = await resp.json();
    plainEnglish = (data.choices?.[0]?.message?.content || '').trim();
    if (!plainEnglish) return err('DeepSeek returned empty response', 502);
  } catch (e) {
    return err(`DeepSeek call failed: ${e.message}`, 502);
  }

  // Cache the result
  try {
    await DB.prepare(
      `UPDATE ai_secretary_meetings SET plain_english_minutes_md=? WHERE id=?`
    ).bind(plainEnglish, id).run();
  } catch (_) {
    // Safe to ignore if update fails; we still return the translation
  }

  return ok({ plainEnglish, fromCache: false });
}

async function proofreadAiSecretaryMinutes(DB, env, id, body) {
  const minutesMarkdown = String(body?.minutesMarkdown || '').trim();
  const secretaryNotes  = String(body?.secretaryNotes  || '').trim();
  const summaryShort    = String(body?.summaryShort    || '').trim();
  const summaryLong     = String(body?.summaryLong     || '').trim();
  if (!minutesMarkdown) return err('No minutes provided', 400);

  let deepseekKey = '';
  let deepseekModel = 'deepseek-v4-flash';
  try {
    const { results: sr } = await DB.prepare(
      `SELECT key,value FROM settings WHERE key IN ('ai_deepseek_key','ai_deepseek_model')`
    ).all();
    const s = Object.fromEntries((sr || []).map(r => [r.key, String(r.value || '')]));
    deepseekKey  = s.ai_deepseek_key  ? String(s.ai_deepseek_key).trim()  : '';
    deepseekModel = s.ai_deepseek_model ? String(s.ai_deepseek_model).trim() : 'deepseek-v4-flash';
    if (deepseekModel === 'deepseek-chat')     deepseekModel = 'deepseek-v4-flash';
    if (deepseekModel === 'deepseek-reasoner') deepseekModel = 'deepseek-v4-pro';
  } catch (_) {}

  if (!deepseekKey) return err('AI key not configured', 503);

  const notesBlock = secretaryNotes
    ? `\nSecretary's corrections to apply first:\n${secretaryNotes}\n`
    : '';

  const prompt = `You are a skilled church committee secretary. Proofread and refine the following meeting minutes draft.${secretaryNotes ? " First, carefully apply all the secretary's corrections listed below." : ''}
${notesBlock}
Rules:
- Write in clear, professional but natural English that does not read as AI-generated
- Preserve every fact, name, resolution, naira amount, date, and vote outcome exactly
- Fix grammar, awkward phrasing, and formatting inconsistencies
- Maintain the existing Markdown structure (headings, bold, lists)
- Do NOT add, invent, or remove any factual content beyond the specified corrections

Also review the two summaries provided below. Update them ONLY if the corrections significantly changed the meeting content (e.g. a decision changed, attendance corrected, major agenda item added or removed). For minor corrections (grammar or phrasing only), return the summaries exactly as provided.

Return ONLY a valid JSON object. No markdown fences. No text before or after the JSON:
{
  "minutesMarkdown": "<the full corrected minutes in Markdown>",
  "summaryShort": "<1–2 sentence summary — copy the original exactly if changes are minor>",
  "summaryLong": "<detailed narrative summary — copy the original exactly if changes are minor>"
}

Current minutes draft:
${minutesMarkdown}

Current short summary:
${summaryShort || '(none)'}

Current detailed summary:
${summaryLong || '(none)'}`;

  let parsed;
  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
      body: JSON.stringify({
        model: deepseekModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.25,
        max_tokens: 5000,
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      return err(`DeepSeek API error: ${errBody.error?.message || resp.status}`, 502);
    }
    const data = await resp.json();
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    if (!raw) return err('AI returned empty response', 502);
    parsed = parseAiSecretaryJson(raw);
    if (!parsed?.minutesMarkdown) return err('AI returned unexpected format', 502);
  } catch (e) {
    return err(`AI proofread failed: ${e.message}`, 502);
  }

  const improvedMarkdown = String(parsed.minutesMarkdown || '').trim();
  const improvedShort    = String(parsed.summaryShort    || summaryShort).trim();
  const improvedLong     = String(parsed.summaryLong     || summaryLong).trim();

  // Persist improved content and clear stale plain-English cache
  try {
    await DB.prepare(
      `UPDATE ai_secretary_meetings SET minutes_markdown=?, summary_short=?, summary_long=?, plain_english_minutes_md='' WHERE id=?`
    ).bind(improvedMarkdown, improvedShort, improvedLong, id).run();
  } catch (_) {}

  return ok({ minutesMarkdown: improvedMarkdown, summaryShort: improvedShort, summaryLong: improvedLong });
}

async function reconcileAiSecretaryInsights(DB, env, id, body) {
  const minutesMarkdown = String(body?.minutesMarkdown || '').trim();
  if (!minutesMarkdown) return err('No minutes provided', 400);

  const existing = await DB.prepare(`SELECT * FROM ai_secretary_meetings WHERE id=?`).bind(id).first();
  if (!existing || existing.deleted_at) return err('Meeting not found', 404);

  const resolutions       = safeJsonParse(existing.resolutions_json, []);
  const actionItems       = safeJsonParse(existing.action_items_json, []);
  const policyFlags       = safeJsonParse(existing.policy_flags_json, []);
  const suggestedProjects = safeJsonParse(existing.suggested_projects_json, []);

  const hasInsights = resolutions.length || actionItems.length || policyFlags.length;
  if (!hasInsights) {
    return ok({ resolutions, actionItems, policyFlags, suggestedProjects, changes: 'No existing insights to reconcile.' });
  }

  let deepseekKey = '';
  let deepseekModel = 'deepseek-v4-flash';
  try {
    const { results: sr } = await DB.prepare(
      `SELECT key,value FROM settings WHERE key IN ('ai_deepseek_key','ai_deepseek_model')`
    ).all();
    const s = Object.fromEntries((sr || []).map(r => [r.key, String(r.value || '')]));
    deepseekKey   = s.ai_deepseek_key   ? String(s.ai_deepseek_key).trim()   : '';
    deepseekModel = s.ai_deepseek_model ? String(s.ai_deepseek_model).trim() : 'deepseek-v4-flash';
    if (deepseekModel === 'deepseek-chat')     deepseekModel = 'deepseek-v4-flash';
    if (deepseekModel === 'deepseek-reasoner') deepseekModel = 'deepseek-v4-pro';
  } catch (_) {}

  if (!deepseekKey) {
    return ok({ resolutions, actionItems, policyFlags, suggestedProjects, changes: 'AI key not configured — insights left unchanged.' });
  }

  const prompt = `You are an AI secretary for a Nigerian church committee (KPSC). The secretary has just approved the final minutes draft. Your task is to reconcile the saved insight items against those final minutes.

Check each category and make ONLY clearly warranted changes:
- Remove an item only if it is completely absent from the minutes (not just worded differently)
- Modify an item only if the minutes clearly contradict it (e.g. different vote outcome, different assignee)
- Add an item only if the minutes explicitly state something important that is entirely missing
- Leave items unchanged if they reasonably reflect what is in the minutes, even with minor wording differences
- Preserve all existing IDs

Return ONLY a valid JSON object (no markdown fences, no text outside the JSON):
{
  "resolutions": [...],
  "actionItems": [...],
  "policyFlags": [...],
  "suggestedProjects": [...],
  "changes": "One or two sentence summary of what was changed, or exactly the string 'No changes needed' if nothing changed."
}

Final approved minutes:
${minutesMarkdown}

Current resolutions:
${JSON.stringify(resolutions, null, 2)}

Current action items:
${JSON.stringify(actionItems, null, 2)}

Current governance flags:
${JSON.stringify(policyFlags, null, 2)}

Current project suggestions:
${JSON.stringify(suggestedProjects, null, 2)}`;

  let parsed;
  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
      body: JSON.stringify({
        model: deepseekModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.15,
        max_tokens: 4000,
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      return ok({ resolutions, actionItems, policyFlags, suggestedProjects, changes: `AI check skipped: ${errBody.error?.message || resp.status}` });
    }
    const data = await resp.json();
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    if (!raw) return ok({ resolutions, actionItems, policyFlags, suggestedProjects, changes: 'AI returned empty response — insights left unchanged.' });
    parsed = parseAiSecretaryJson(raw);
  } catch (e) {
    return ok({ resolutions, actionItems, policyFlags, suggestedProjects, changes: `AI check failed: ${e.message}` });
  }

  const changes = String(parsed?.changes || 'No changes needed').trim();
  const noChange = changes.toLowerCase().includes('no changes');

  if (noChange) {
    return ok({ resolutions, actionItems, policyFlags, suggestedProjects, changes });
  }

  const updResolutions = Array.isArray(parsed?.resolutions) ? parsed.resolutions : resolutions;
  const updActions     = Array.isArray(parsed?.actionItems) ? parsed.actionItems : actionItems;
  const updFlags       = Array.isArray(parsed?.policyFlags) ? parsed.policyFlags : policyFlags;
  const updProjects    = Array.isArray(parsed?.suggestedProjects) ? parsed.suggestedProjects : suggestedProjects;

  try {
    await DB.prepare(
      `UPDATE ai_secretary_meetings SET resolutions_json=?, action_items_json=?, policy_flags_json=?, suggested_projects_json=? WHERE id=?`
    ).bind(
      JSON.stringify(updResolutions),
      JSON.stringify(updActions),
      JSON.stringify(updFlags),
      JSON.stringify(updProjects),
      id,
    ).run();
  } catch (_) {}

  return ok({ resolutions: updResolutions, actionItems: updActions, policyFlags: updFlags, suggestedProjects: updProjects, changes });
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

// ── VOICE FINGERPRINTING ENDPOINTS (Wave 3 VF-2) ─────────────────────
// Uses a stateless Cloud Run embedder at ${VOICE_FP_URL} (VF-1).
// Threshold tuned for cross-codec matching: enrollment captures webm/opus from
// MediaRecorder (lossy, ~12-24 kbps), identification captures raw PCM. Opus
// compression typically drops same-speaker cosine similarity by 0.10-0.15
// versus PCM-to-PCM. 0.50 matches published ECAPA-TDNN VoxCeleb-O thresholds
// for first-pass identification with real-world acoustic variance.
const VOICE_IDENTIFY_THRESHOLD = 0.50;

/**
 * Forward audio to the VF-1 embedder and return the parsed JSON response.
 * Returns { ok: true, data } on success, or { ok: false, response } with the
 * pre-built error Response that should be returned immediately to the caller.
 */
async function callEmbedder(env, audioBlob) {
  const fpUrl   = String(env.VOICE_FP_URL   || '').replace(/\/$/, '');
  const fpToken = String(env.VOICE_FP_TOKEN || '');
  if (!fpUrl || !fpToken) {
    return { ok: false, response: err('Voice fingerprinting service not configured', 503) };
  }

  const upstreamForm = new FormData();
  upstreamForm.append('audio', audioBlob);

  let upstreamRes;
  try {
    upstreamRes = await fetch(`${fpUrl}/embed`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${fpToken}` },
      body: upstreamForm,
    });
  } catch (e) {
    return { ok: false, response: err(`Voice fingerprinting service unavailable: ${e.message}`, 502) };
  }

  if (!upstreamRes.ok) {
    const data = await upstreamRes.json().catch(() => ({}));
    const msg  = data.detail || data.error || `Upstream error (${upstreamRes.status})`;
    if (upstreamRes.status >= 500) {
      return { ok: false, response: err(`Voice fingerprinting service error: ${msg}`, 502) };
    }
    return { ok: false, response: err(msg, upstreamRes.status) };
  }

  const data = await upstreamRes.json().catch(() => null);
  if (!data) {
    return { ok: false, response: err('Invalid response from voice fingerprinting service', 502) };
  }
  return { ok: true, data };
}

async function voiceEnroll(DB, env, request, memberId) {
  // Fetch the member record; it must already exist (created by the frontend roster save).
  const member = await DB.prepare(`SELECT id, name, voice_sample_count FROM kpsc_members WHERE id=?`)
    .bind(memberId).first();
  if (!member) return err('Member not found', 404);

  // Parse the incoming multipart form — extract the audio file/blob.
  let form;
  try {
    form = await request.formData();
  } catch {
    return err('Expected multipart form data with an "audio" field', 400);
  }
  const audioBlob = form.get('audio');
  if (!audioBlob) return err('Missing "audio" field in form data', 400);

  // Call the VF-1 embedder.
  const result = await callEmbedder(env, audioBlob);
  if (!result.ok) return result.response;

  const embedding = result.data.embedding;
  if (!Array.isArray(embedding) || embedding.length !== 192) {
    return err('Unexpected embedding shape from voice fingerprinting service', 502);
  }

  const enrolledAt    = new Date().toISOString();
  const sampleCount   = Number(member.voice_sample_count || 0) + 1;
  const embeddingBuf  = embeddingToBlob(embedding);

  await DB.prepare(
    `UPDATE kpsc_members SET voice_embedding=?, voice_enrolled_at=?, voice_sample_count=? WHERE id=?`
  ).bind(embeddingBuf, enrolledAt, sampleCount, memberId).run();

  return ok({ ok: true, enrolledAt, sampleCount, embeddingDim: 192 });
}

async function voiceIdentify(DB, env, request) {
  // Parse incoming audio.
  let form;
  try {
    form = await request.formData();
  } catch {
    return err('Expected multipart form data with an "audio" field', 400);
  }
  const audioBlob = form.get('audio');
  if (!audioBlob) return err('Missing "audio" field in form data', 400);

  // Get all enrolled members.
  const { results: enrolled } = await DB.prepare(
    `SELECT id, name, voice_embedding FROM kpsc_members WHERE voice_embedding IS NOT NULL`
  ).all();

  if (!enrolled || enrolled.length === 0) {
    return ok({ match: false, score: 0, threshold: VOICE_IDENTIFY_THRESHOLD, reason: 'no_enrolled_members' });
  }

  // Call the VF-1 embedder.
  const result = await callEmbedder(env, audioBlob);
  if (!result.ok) return result.response;

  const queryEmbedding = result.data.embedding;
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    return err('Unexpected embedding shape from voice fingerprinting service', 502);
  }

  // Find the best match.
  let bestScore  = -1;
  let bestMember = null;
  for (const row of enrolled) {
    const storedEmbedding = blobToEmbedding(row.voice_embedding);
    const score = cosineSim(queryEmbedding, storedEmbedding);
    if (score > bestScore) {
      bestScore  = score;
      bestMember = row;
    }
  }

  if (bestScore >= VOICE_IDENTIFY_THRESHOLD) {
    return ok({
      match:      true,
      memberId:   bestMember.id,
      memberName: bestMember.name,
      score:      bestScore,
      threshold:  VOICE_IDENTIFY_THRESHOLD,
    });
  }
  return ok({ match: false, score: bestScore, threshold: VOICE_IDENTIFY_THRESHOLD });
}

async function voiceDeleteEnrollment(DB, memberId) {
  const member = await DB.prepare(`SELECT id FROM kpsc_members WHERE id=?`).bind(memberId).first();
  if (!member) return err('Member not found', 404);

  await DB.prepare(
    `UPDATE kpsc_members SET voice_embedding=NULL, voice_enrolled_at=NULL, voice_sample_count=0 WHERE id=?`
  ).bind(memberId).run();

  return ok({ ok: true, deleted: true });
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
    try {
      await bucket.put(key, audio.stream(), {
        httpMetadata: { contentType: mimeType },
        customMetadata: { meetingId, uploadSessionId, sequence, createdAt },
      });
      return ok({ uploaded: true, stored: true, key, sequence: Number(sequence) });
    } catch (e) {
      // R2 transient failures (network, throttling) bubble as 502 so the
      // client retries via its existing recFlushUploads backoff. We do not
      // 500 because the chunk itself was valid — only persistence failed.
      return err(`Audio bucket write failed: ${e.message || e}`, 502);
    }
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

// ── VOICE FINGERPRINTING VF-3 ENDPOINTS ──────────────────────────────

/** POST /api/voice-member-sync/:memberId — upsert JSON-roster member into D1 */
async function voiceMemberSync(DB, memberId, body) {
  const name     = String(body?.name     || '').trim();
  const grp      = String(body?.group    || body?.grp || '').trim();
  const position = String(body?.position || '').trim();

  if (!name) return err('name is required', 400);

  await DB.prepare(
    `INSERT INTO kpsc_members(id, name, grp, position)
     VALUES(?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, grp=excluded.grp, position=excluded.position`
  ).bind(memberId, name, grp, position).run();

  return ok({ ok: true, memberId });
}

/** GET /api/voice-enrollment/:memberId — returns enrollment status */
async function voiceGetEnrollment(DB, memberId) {
  const row = await DB.prepare(
    `SELECT id, voice_enrolled_at, voice_sample_count FROM kpsc_members WHERE id=?`
  ).bind(memberId).first();

  if (!row || !row.voice_enrolled_at) {
    return ok({ enrolled: false });
  }
  return ok({ enrolled: true, enrolledAt: row.voice_enrolled_at, sampleCount: row.voice_sample_count || 0 });
}

// ── B5: FOLLOW-UP NUDGES ──────────────────────────────────────────────

/**
 * Pure helper: given an array of meetings and a today-string (YYYY-MM-DD),
 * return the list of overdue action items that need a follow-up generated.
 * Already-followed-up items (passed in `existingFollowupKeys` set of
 * "meetingId:actionId" strings) are excluded.
 */
function classifyOverdueActionItems(meetings, todayStr, existingFollowupKeys = new Set()) {
  const results = [];
  for (const m of meetings) {
    if (m.status !== 'processed') continue;
    const items = Array.isArray(m.action_items) ? m.action_items
      : (Array.isArray(m.actionItems) ? m.actionItems : []);
    for (const item of items) {
      if (!item || !item.id) continue;
      if (item.status === 'done' || item.status === 'cancelled') continue;
      if (!item.dueDate) continue;
      if (item.dueDate >= todayStr) continue;
      const key = `${m.id}:${item.id}`;
      if (existingFollowupKeys.has(key)) continue;
      results.push({
        meetingId: m.id,
        meetingTitle: m.title || '',
        meetingDate: m.meeting_date || m.meetingDate || '',
        actionId: item.id,
        task: item.task || '',
        assignee: item.assignee || 'Unassigned',
        dueDate: item.dueDate,
      });
    }
  }
  return results;
}

/** Verify Bearer CRON_SECRET. Returns null on success, or a Response on failure. */
function requireCronSecret(env, request) {
  const secret = String(env.CRON_SECRET || '').trim();
  if (!secret) return err('CRON_SECRET env var not configured', 503);
  const auth = request.headers.get('Authorization') || '';
  if (auth !== `Bearer ${secret}`) return err('Unauthorized', 401);
  return null;
}

async function runFollowups(DB, env, request) {
  const authErr = requireCronSecret(env, request);
  if (authErr) return authErr;

  const todayStr = new Date().toISOString().slice(0, 10);

  // Load all processed meetings
  const { results: meetingRows } = await DB.prepare(
    `SELECT id, title, meeting_date, status, action_items_json FROM ai_secretary_meetings WHERE status='processed'`
  ).all();

  // Load existing followup keys to avoid double-nudging
  const { results: existingRows } = await DB.prepare(
    `SELECT meeting_id, action_id FROM kpsc_followups`
  ).all();
  const existingFollowupKeys = new Set((existingRows || []).map(r => `${r.meeting_id}:${r.action_id}`));

  // Build meeting objects expected by classifyOverdueActionItems
  const meetings = (meetingRows || []).map(r => ({
    id: r.id,
    title: r.title,
    meeting_date: r.meeting_date,
    status: r.status,
    action_items: safeJsonParse(r.action_items_json, []),
  }));

  const overdue = classifyOverdueActionItems(meetings, todayStr, existingFollowupKeys);

  // Get DeepSeek key from settings
  let deepseekKey = '';
  try {
    const row = await DB.prepare(`SELECT value FROM settings WHERE key='ai_deepseek_key'`).first();
    deepseekKey = row ? String(row.value || '').trim() : '';
  } catch { /* ignore */ }

  let generated = 0;
  let skipped = 0;

  for (const item of overdue) {
    // Double-check no race condition
    const existing = await DB.prepare(
      `SELECT id FROM kpsc_followups WHERE meeting_id=? AND action_id=?`
    ).bind(item.meetingId, item.actionId).first();
    if (existing) { skipped++; continue; }

    let draftMessage = '';
    const firstName = (item.assignee || 'Team').split(/[\s,]+/)[0];
    const fallbackMsg = `Hi ${firstName}, just a gentle reminder that the task "${item.task}" from the KPSC meeting on ${item.meetingDate} was due on ${item.dueDate} and is now overdue. We understand you're busy — where are we on this?`;

    if (deepseekKey) {
      try {
        const prompt = `Generate a one-paragraph WhatsApp message to ${firstName}: a gentle reminder that the task "${item.task}" from the KPSC meeting on ${item.meetingDate} was due on ${item.dueDate} and is now overdue. Be respectful and assume they're busy, not negligent. End with a clear ask: "Where are we?". Do not use a formal greeting like "Dear". Use their first name: ${firstName}.`;
        const resp = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
          body: JSON.stringify({ model: 'deepseek-v4-flash', messages: [{ role: 'user', content: prompt }], max_tokens: 200, temperature: 0.5 }),
        });
        if (resp.ok) {
          const data = await resp.json();
          draftMessage = (data.choices?.[0]?.message?.content || '').trim();
        }
      } catch { /* fall back to template */ }
    }

    if (!draftMessage) draftMessage = fallbackMsg;

    const followupId = newId('FU-');
    await DB.prepare(
      `INSERT OR IGNORE INTO kpsc_followups (id, meeting_id, action_id, assignee, task, due_date, draft_message, status, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`
    ).bind(followupId, item.meetingId, item.actionId, item.assignee, item.task, item.dueDate, draftMessage).run();
    generated++;
  }

  return ok({ ok: true, generated, skipped });
}

async function getFollowups(DB, url) {
  const status = url.searchParams.get('status') || 'pending';
  const { results } = await DB.prepare(
    `SELECT f.*, m.title AS meeting_title, m.meeting_date
     FROM kpsc_followups f
     LEFT JOIN ai_secretary_meetings m ON m.id = f.meeting_id
     WHERE f.status = ?
     ORDER BY f.generated_at DESC`
  ).bind(status).all();
  return ok(results || []);
}

async function patchFollowup(DB, id, body, account) {
  const row = await DB.prepare(`SELECT id FROM kpsc_followups WHERE id=?`).bind(id).first();
  if (!row) return err('Follow-up not found', 404);

  const newStatus = String(body?.status || '').trim();
  const editedMessage = body?.editedMessage !== undefined ? String(body.editedMessage).trim() : undefined;

  const validStatuses = ['approved', 'skipped', 'pending'];
  if (newStatus && !validStatuses.includes(newStatus)) {
    return err(`Invalid status '${newStatus}'. Must be one of: ${validStatuses.join(', ')}`, 400);
  }

  const now = new Date().toISOString();
  if (newStatus === 'approved') {
    await DB.prepare(
      `UPDATE kpsc_followups SET status='approved', approved_at=?, approved_by=?${editedMessage !== undefined ? ', draft_message=?' : ''} WHERE id=?`
    ).bind(...[now, account.name, ...(editedMessage !== undefined ? [editedMessage] : []), id]).run();
  } else if (newStatus === 'skipped') {
    await DB.prepare(`UPDATE kpsc_followups SET status='skipped' WHERE id=?`).bind(id).run();
  } else if (editedMessage !== undefined) {
    await DB.prepare(`UPDATE kpsc_followups SET draft_message=? WHERE id=?`).bind(editedMessage, id).run();
  }

  const updated = await DB.prepare(`SELECT * FROM kpsc_followups WHERE id=?`).bind(id).first();
  return ok(updated);
}

// ── B6: PRE-MEETING BRIEFS ────────────────────────────────────────────

async function runPrebriefs(DB, env, request) {
  const authErr = requireCronSecret(env, request);
  if (authErr) return authErr;

  // Find meetings scheduled within the next 24 hours that don't have a brief yet
  const { results: upcoming } = await DB.prepare(
    `SELECT id, title, scheduled_for FROM ai_secretary_meetings
     WHERE scheduled_for IS NOT NULL
       AND pre_brief_markdown IS NULL
       AND datetime(replace(scheduled_for, 'T', ' ')) BETWEEN datetime('now') AND datetime('now', '+24 hours')`
  ).all();

  if (!upcoming || upcoming.length === 0) return ok({ ok: true, generated: 0 });

  // Get DeepSeek key
  let deepseekKey = '';
  try {
    const row = await DB.prepare(`SELECT value FROM settings WHERE key='ai_deepseek_key'`).first();
    deepseekKey = row ? String(row.value || '').trim() : '';
  } catch { /* ignore */ }

  // Load the most recent processed meeting for context
  const prevRow = await DB.prepare(
    `SELECT title, meeting_date, minutes_markdown, action_items_json FROM ai_secretary_meetings
     WHERE status='processed' ORDER BY meeting_date DESC, processed_at DESC LIMIT 1`
  ).first();

  let generated = 0;
  for (const meeting of upcoming) {
    let brief = '';
    if (deepseekKey && prevRow) {
      try {
        const openItems = safeJsonParse(prevRow.action_items_json, [])
          .filter(a => a.status !== 'done' && a.status !== 'cancelled')
          .map(a => `- ${a.task} (${a.assignee || 'Unassigned'}, due: ${a.dueDate || 'unset'})`)
          .join('\n') || '(none)';
        const prompt = `Generate a pre-meeting brief in markdown for a KPSC committee meeting titled "${meeting.title}" scheduled for ${meeting.scheduled_for}. Use the following context from the last processed meeting (${prevRow.title}, ${prevRow.meeting_date}):

Minutes excerpt:
${(prevRow.minutes_markdown || '').slice(0, 2000)}

Open action items:
${openItems}

Include exactly four sections in your response:
## Open Action Items
## Decisions from the Last Meeting
## Overdue Items
## Suggested Agenda

Keep the total brief under 400 words. Cite specifics (names, dates, amounts) — do not be vague. Return only markdown.`;
        const resp = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
          body: JSON.stringify({ model: 'deepseek-v4-flash', messages: [{ role: 'user', content: prompt }], max_tokens: 800, temperature: 0.3 }),
        });
        if (resp.ok) {
          const data = await resp.json();
          brief = (data.choices?.[0]?.message?.content || '').trim();
        }
      } catch { /* fall back */ }
    }

    if (!brief) {
      brief = `# Pre-Meeting Brief: ${meeting.title}\n\nScheduled: ${meeting.scheduled_for}\n\n` +
        (prevRow ? `## Decisions from the Last Meeting\nSee previous meeting (${prevRow.title}, ${prevRow.meeting_date}) for context.\n\n## Open Action Items\nReview the action items from the previous meeting.\n\n## Overdue Items\nCheck action items with passed due dates.\n\n## Suggested Agenda\nTo be confirmed by the secretary.` : '## No previous meeting context available.');
    }

    const now = new Date().toISOString();
    await DB.prepare(
      `UPDATE ai_secretary_meetings SET pre_brief_markdown=?, pre_brief_generated_at=? WHERE id=?`
    ).bind(brief, now, meeting.id).run();
    generated++;
  }

  return ok({ ok: true, generated });
}

// ── TERMII CRON: HAPPY NEW MONTH SMS (1st of every month) ─────────────────
async function runMonthlySms(DB, env, request) {
  const authErr = requireCronSecret(env, request);
  if (authErr) return authErr;

  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  if (dayOfMonth !== 1) {
    return ok({ ok: true, skipped: true, reason: 'Not the 1st of the month' });
  }

  const t = await getTermiiSettings(DB);
  if (!t.apiKey || !t.newMonthSms) return ok({ ok: true, skipped: true, reason: 'New-month SMS disabled or no Termii key' });

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthName = MONTH_NAMES[now.getUTCMonth()];
  const year = now.getUTCFullYear();

  const { results: partners } = await DB.prepare(
    `SELECT full_name, phone FROM kpsc_partners WHERE COALESCE(deleted_at,'')='' AND status='active' AND phone != ''`
  ).all();

  let sent = 0;
  let failed = 0;
  for (const p of (partners || [])) {
    const msg = `Happy New Month! 🎉 Dear ${p.full_name}, we celebrate with you as we step into ${monthName} ${year}. May this month bring you joy, peace, and abundant blessings. Thank you for your faithful partnership! — RCCG Kingdom Parish`;
    const result = await sendTermiiSms(t.apiKey, t.senderId, p.phone, msg);
    if (result.ok) sent++; else failed++;
  }
  return ok({ ok: true, sent, failed, total: (partners || []).length });
}

// ── TERMII CRON: PAYMENT REMINDER SMS ─────────────────────────────────────
/**
 * Sends payment reminder SMS to active partners who have not paid for the current month.
 * Frequency is controlled by kpsc_termii_reminder_day (day to trigger) and
 * kpsc_termii_reminder_freq:
 *   monthly  — runs once on the configured day each month
 *   biweekly — runs on day N and day N+14 (clamped to month end)
 *   weekly   — runs every 7 days from day N onwards
 */
async function runReminderSms(DB, env, request) {
  const authErr = requireCronSecret(env, request);
  if (authErr) return authErr;

  const t = await getTermiiSettings(DB);
  if (!t.apiKey) return ok({ ok: true, skipped: true, reason: 'No Termii API key configured' });

  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  const reminderDay = t.reminderDay;
  const freq = t.reminderFreq;

  // Decide whether today is a send day based on frequency
  let isSendDay = false;
  // Last valid day of the current month (accounts for variable month lengths)
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (freq === 'monthly') {
    isSendDay = (dayOfMonth === Math.min(reminderDay, lastDayOfMonth));
  } else if (freq === 'biweekly') {
    const firstSendDay  = Math.min(reminderDay, lastDayOfMonth);
    const secondSendDay = Math.min(reminderDay + 14, lastDayOfMonth);
    isSendDay = (dayOfMonth === firstSendDay) || (dayOfMonth === secondSendDay);
  } else if (freq === 'weekly') {
    // Every 7 days starting from reminderDay (clamped to month end)
    const firstSendDay = Math.min(reminderDay, lastDayOfMonth);
    const diff = dayOfMonth - firstSendDay;
    isSendDay = diff >= 0 && diff % 7 === 0;
  }

  if (!isSendDay) return ok({ ok: true, skipped: true, reason: `Not a reminder send day (day=${dayOfMonth}, freq=${freq}, reminderDay=${reminderDay})` });

  // Get template
  const templateRow = await DB.prepare(`SELECT value FROM settings WHERE key='kpsc_reminder_template'`).first();
  const template = String(templateRow?.value || 'Dear {{name}}, this is a reminder to pay your {{month}} partnership pledge. God bless you.').trim();

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthName = MONTH_NAMES[month - 1];

  // Find active partners who haven't paid this month
  const { results: unpaid } = await DB.prepare(`
    SELECT kp.id, kp.full_name, kp.phone, kp.reminder_preference
    FROM kpsc_partners kp
    WHERE COALESCE(kp.deleted_at,'')='' AND kp.status='active' AND kp.phone != ''
      AND kp.reminder_preference != 'none'
      AND kp.id NOT IN (
        SELECT DISTINCT partner_id FROM kpsc_partner_payments
        WHERE year=? AND month=? AND payment_type='monthly_pledge' AND paid=1
          AND COALESCE(deleted_at,'')=''
      )
  `).bind(year, month).all();

  let sent = 0;
  let failed = 0;
  for (const p of (unpaid || [])) {
    const msg = template
      .replace(/\{\{name\}\}/g, p.full_name)
      .replace(/\{\{month\}\}/g, monthName);
    const result = await sendTermiiSms(t.apiKey, t.senderId, p.phone, msg);
    if (result.ok) {
      // Log to kpsc_reminders
      const remId = newId('krm');
      await DB.prepare(
        `INSERT INTO kpsc_reminders (id,partner_id,channel,message,status,year,month,sent_by,sent_at) VALUES (?,?,?,?,?,?,?,?,?)`
      ).bind(remId, p.id, 'sms', msg, 'sent', year, month, 'cron', now.toISOString()).run();
      sent++;
    } else {
      failed++;
    }
  }
  return ok({ ok: true, sent, failed, total: (unpaid || []).length });
}

// ── BULK MEMBER SMS (meeting notification) ────────────────────────────────
/**
 * POST /api/kpsc-sms-send
 * Body: { message: string, memberPhones?: string[] }
 * If memberPhones is omitted, sends to all KPSC roster members with a phone number.
 */
async function sendBulkMemberSms(DB, env, data) {
  const message = String(data?.message || '').trim();
  if (!message) return err('message is required', 400);

  const t = await getTermiiSettings(DB);
  if (!t.apiKey) return err('Termii API key not configured. Please add it in Settings → SMS.', 400);

  // Collect target phone numbers
  let phones = [];
  if (Array.isArray(data?.memberPhones) && data.memberPhones.length > 0) {
    phones = data.memberPhones.map(p => String(p || '').trim()).filter(Boolean);
  } else {
    // Read all member phones from settings JSON blob
    const settingRow = await DB.prepare(`SELECT value FROM settings WHERE key='kpsc_members'`).first();
    const members = settingRow?.value ? JSON.parse(settingRow.value) : [];
    phones = (Array.isArray(members) ? members : [])
      .map(m => String(m?.phone || '').trim())
      .filter(Boolean);
  }

  if (!phones.length) return err('No phone numbers found. Add phone numbers to member profiles first.', 400);

  let sent = 0;
  let failed = 0;
  const errors = [];
  for (const phone of phones) {
    const result = await sendTermiiSms(t.apiKey, t.senderId, phone, message);
    if (result.ok) sent++;
    else {
      failed++;
      if (errors.length < 5) errors.push({ phone, error: result.error || 'unknown' });
    }
  }
  return ok({ ok: true, sent, failed, total: phones.length, errors });
}



async function getAgendaNotes(DB) {
  const { results } = await DB.prepare(
    // Recurring items first so UI can highlight them; then by most recently created
    `SELECT * FROM kpsc_agenda_notes ORDER BY is_recurring DESC, created_at DESC`
  ).all();
  return ok(results || []);
}

async function createAgendaNote(DB, data, auth) {
  const id = newId('AGN-');
  const now = new Date().toISOString();
  const text = String(data.text || '').trim();
  if (!text) return err('text is required', 400);
  await DB.prepare(
    `INSERT INTO kpsc_agenda_notes (id,text,source,tag,created_by,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)`
  ).bind(id, text, data.source || 'typed', data.tag || 'general', auth?.name || '', now, now).run();
  const row = await DB.prepare(`SELECT * FROM kpsc_agenda_notes WHERE id=?`).bind(id).first();
  return ok(row);
}

async function updateAgendaNote(DB, id, data) {
  const existing = await DB.prepare(`SELECT id FROM kpsc_agenda_notes WHERE id=?`).bind(id).first();
  if (!existing) return err('Agenda note not found', 404);
  const now = new Date().toISOString();
  // Support incrementing usage_count (for tracking how often a note is used in agendas)
  const usageCountClause = data.incrementUsage
    ? 'usage_count = usage_count + 1,'
    : '';
  await DB.prepare(
    `UPDATE kpsc_agenda_notes SET ${usageCountClause} text=COALESCE(?,text), tag=COALESCE(?,tag), is_used=COALESCE(?,is_used), is_recurring=COALESCE(?,is_recurring), updated_at=? WHERE id=?`
  ).bind(
    data.text !== undefined ? String(data.text).trim() : null,
    data.tag !== undefined ? data.tag : null,
    data.isUsed !== undefined ? (data.isUsed ? 1 : 0) : null,
    data.isRecurring !== undefined ? (data.isRecurring ? 1 : 0) : null,
    now, id,
  ).run();
  const row = await DB.prepare(`SELECT * FROM kpsc_agenda_notes WHERE id=?`).bind(id).first();
  return ok(row);
}

async function deleteAgendaNote(DB, id) {
  const existing = await DB.prepare(`SELECT id FROM kpsc_agenda_notes WHERE id=?`).bind(id).first();
  if (!existing) return err('Agenda note not found', 404);
  await DB.prepare(`DELETE FROM kpsc_agenda_notes WHERE id=?`).bind(id).run();
  return ok({ id, deleted: true });
}

async function suggestAgendaItems(DB, env, body) {
  // Load recent processed meetings (last 5)
  const { results: recentMeetings } = await DB.prepare(
    `SELECT id,title,meeting_date,summary_short,action_items_json,resolutions_json,minutes_markdown
     FROM ai_secretary_meetings
     WHERE status='processed' AND COALESCE(deleted_at,'')=''
     ORDER BY meeting_date DESC, processed_at DESC LIMIT 5`
  ).all();

  // Load personal agenda notes not yet used
  const { results: agendaNotes } = await DB.prepare(
    `SELECT id,text,tag,is_recurring,usage_count FROM kpsc_agenda_notes WHERE is_used=0 ORDER BY is_recurring DESC, created_at DESC`
  ).all();

  // Get DeepSeek key and model
  const { key: deepseekKey, model: deepseekModel } = await loadDeepseekSettings(DB);

  // Build deterministic fallback suggestions from action items and past meetings
  const fallbackSuggestions = buildFallbackAgendaSuggestions(recentMeetings, agendaNotes);

  if (!deepseekKey) {
    return ok({ suggestions: fallbackSuggestions, source: 'deterministic' });
  }

  // Build AI context
  const meetingContext = (recentMeetings || []).map(m => {
    const openItems = safeJsonParse(m.action_items_json, [])
      .filter(a => a.status !== 'done' && a.status !== 'cancelled')
      .map(a => `  - ${a.task} (${a.assignee || 'Unassigned'}, due: ${a.dueDate || 'unset'})`).join('\n');
    const resolutions = safeJsonParse(m.resolutions_json, [])
      .slice(0, 5).map(r => `  - ${r.text}`).join('\n');
    return `Meeting: ${m.title} (${m.meeting_date})\nSummary: ${m.summary_short || ''}\nOpen actions:\n${openItems || '  (none)'}\nKey decisions:\n${resolutions || '  (none)'}`;
  }).join('\n\n---\n\n');

  const notesContext = (agendaNotes || []).map(n =>
    `[${(n.tag || 'general').toUpperCase()}] ${n.text}`
  ).join('\n') || '(none)';

  const prompt = `You are an intelligent meeting agenda planner for the KPSC (Kingdom Parish Stewardship Committee), a Nigerian church leadership committee.

Analyse the context below from past meetings and personal notes, then suggest a prioritised list of agenda items for the next committee meeting.

For each suggestion, provide:
- topic: concise agenda item title (max 8 words)
- reason: one sentence explaining why this should be on the agenda
- priority: "high" | "medium" | "low"
- source: "action_item" | "past_discussion" | "personal_note" | "recurring"
- carryForward: true if this was deferred or unresolved from a previous meeting

Rules:
- Always include "Matters Arising from Previous Minutes" as the first item
- Always include "Any Other Business / Open Floor" as the last item
- Identify unresolved or deferred matters and flag them as carry_forward
- Identify action items that need a progress update
- Suggest relevant new topics based on patterns (finance, welfare, projects, partnerships)
- Return 8–15 items maximum
- Return only valid JSON: { "suggestions": [ {...}, ... ] }

## Past Meeting Context
${meetingContext || '(no past meetings found)'}

## Chairman/Secretary Personal Notes
${notesContext}

Return only the JSON object, no markdown fences.`;

  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
      body: JSON.stringify({ model: deepseekModel, messages: [{ role: 'user', content: prompt }], max_tokens: 2000, temperature: 0.3 }),
    });
    if (!resp.ok) throw new Error(`DeepSeek error ${resp.status}`);
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || '';
    const parsed = parseAiSecretaryJson(text);
    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : fallbackSuggestions;
    // Merge personal notes into suggestions, deduplicating
    const merged = mergeNotesIntoSuggestions(suggestions, agendaNotes);
    return ok({ suggestions: merged, source: 'ai' });
  } catch (_) {
    return ok({ suggestions: fallbackSuggestions, source: 'deterministic' });
  }
}

function buildFallbackAgendaSuggestions(recentMeetings, agendaNotes) {
  const suggestions = [
    { topic: 'Matters Arising from Previous Minutes', reason: 'Standard opening item to review and follow up on previous decisions.', priority: 'high', source: 'recurring', carryForward: false, isPreTicked: true },
  ];

  // Open action items from last meeting
  const lastMeeting = (recentMeetings || [])[0];
  if (lastMeeting) {
    const openItems = safeJsonParse(lastMeeting.action_items_json, [])
      .filter(a => a.status !== 'done' && a.status !== 'cancelled');
    if (openItems.length) {
      suggestions.push({
        topic: 'Action Item Progress Updates',
        reason: `${openItems.length} action item(s) from the last meeting are still open.`,
        priority: 'high',
        source: 'action_item',
        carryForward: true,
        isPreTicked: true,
      });
    }
  }

  // Recurring personal notes — always include and pre-tick them
  const recurringNotes = (agendaNotes || []).filter(n => n.is_recurring);
  for (const note of recurringNotes) {
    suggestions.push({
      topic: note.text.length > 60 ? note.text.slice(0, 57) + '…' : note.text,
      reason: 'This is a recurring agenda item — always discussed at KPSC meetings.',
      priority: 'high',
      source: 'recurring',
      carryForward: false,
      isPreTicked: true,
      noteId: note.id,
    });
  }

  // Personal notes (non-recurring)
  for (const note of (agendaNotes || []).filter(n => !n.is_recurring).slice(0, 5)) {
    suggestions.push({
      topic: note.text.length > 60 ? note.text.slice(0, 57) + '…' : note.text,
      reason: 'Added from your personal notes.',
      priority: note.tag === 'urgent' ? 'high' : note.tag === 'important' ? 'medium' : 'low',
      source: 'personal_note',
      carryForward: false,
      noteId: note.id,
    });
  }

  suggestions.push({ topic: 'Any Other Business / Open Floor', reason: 'Standard closing item for members to raise miscellaneous matters.', priority: 'low', source: 'recurring', carryForward: false });
  return suggestions;
}

function mergeNotesIntoSuggestions(aiSuggestions, agendaNotes) {
  const merged = Array.isArray(aiSuggestions) ? [...aiSuggestions] : [];
  const usedTexts = new Set(merged.map(s => String(s.topic || '').toLowerCase().trim()));
  // First inject recurring notes (if AI didn't already include them)
  for (const note of (agendaNotes || []).filter(n => n.is_recurring)) {
    const key = note.text.toLowerCase().trim();
    if (!usedTexts.has(key)) {
      // Insert after "Matters Arising" (index 1) if that exists, else prepend
      const insertIdx = merged.length > 0 ? 1 : 0;
      merged.splice(insertIdx, 0, {
        topic: note.text.length > 60 ? note.text.slice(0, 57) + '…' : note.text,
        reason: 'This is a recurring agenda item — always discussed at KPSC meetings.',
        priority: 'high',
        source: 'recurring',
        carryForward: false,
        isPreTicked: true,
        noteId: note.id,
      });
      usedTexts.add(key);
    }
  }
  // Then inject non-recurring notes
  for (const note of (agendaNotes || []).filter(n => !n.is_recurring)) {
    const key = note.text.toLowerCase().trim();
    if (!usedTexts.has(key)) {
      // Insert before the last item if there are at least 2 items; otherwise append.
      const insertIdx = merged.length > 1 ? merged.length - 1 : merged.length;
      merged.splice(insertIdx, 0, {
        topic: note.text.length > 60 ? note.text.slice(0, 57) + '…' : note.text,
        reason: 'Added from your personal notes.',
        priority: note.tag === 'urgent' ? 'high' : note.tag === 'important' ? 'medium' : 'low',
        source: 'personal_note',
        carryForward: false,
        noteId: note.id,
      });
      usedTexts.add(key);
    }
  }
  return merged;
}

// ── WHATSAPP DRAFT HANDLERS ───────────────────────────────────────────────

function whatsappDraftFromRow(row) {
  return {
    id: row.id,
    agendaItems: safeJsonParse(row.agenda_items_json, []),
    meetingTitle: row.meeting_title || '',
    meetingDate: row.meeting_date || '',
    meetingTime: row.meeting_time || '',
    venue: row.venue || '',
    urgency: row.urgency || 'normal',
    tagAll: !!row.tag_all,
    messageText: row.message_text || '',
    status: row.status || 'draft',
    linkedMeetingId: row.linked_meeting_id || '',
    prepChecklist: safeJsonParse(row.prep_checklist_json, []),
    agendaOutcomes: safeJsonParse(row.agenda_outcomes_json, []),
    createdBy: row.created_by || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

async function getWhatsappDrafts(DB) {
  // Return all drafts (no limit) so the full Notification Log can show the complete history.
  const { results } = await DB.prepare(
    `SELECT * FROM kpsc_whatsapp_drafts ORDER BY created_at DESC`
  ).all();
  return ok((results || []).map(whatsappDraftFromRow));
}

// Default prep checklist items every secretary should verify before a meeting.
const DEFAULT_PREP_CHECKLIST = [
  { id: 'venue',       label: 'Venue confirmed and arranged',         done: false },
  { id: 'attendance',  label: 'Attendance sheet prepared',            done: false },
  { id: 'minutes',     label: 'Previous minutes distributed',         done: false },
  { id: 'agenda_copy', label: 'Printed agenda copies ready',          done: false },
  { id: 'sound',       label: 'Sound system / microphone checked',    done: false },
  { id: 'projector',   label: 'Projector / whiteboard available',     done: false },
  { id: 'refresh',     label: 'Refreshments arranged',                done: false },
];

async function createWhatsappDraft(DB, data, auth) {
  const id = newId('WAD-');
  const now = new Date().toISOString();
  const prepChecklist = data.prepChecklist?.length ? data.prepChecklist : DEFAULT_PREP_CHECKLIST;
  await DB.prepare(
    `INSERT INTO kpsc_whatsapp_drafts (id,agenda_items_json,meeting_title,meeting_date,meeting_time,venue,urgency,tag_all,message_text,status,prep_checklist_json,created_by,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id,
    JSON.stringify(data.agendaItems || []),
    String(data.meetingTitle || ''),
    String(data.meetingDate || ''),
    String(data.meetingTime || ''),
    String(data.venue || 'Church Premises'),
    data.urgency || 'normal',
    data.tagAll ? 1 : 0,
    String(data.messageText || ''),
    'draft',
    JSON.stringify(prepChecklist),
    auth?.name || '',
    now, now,
  ).run();
  const row = await DB.prepare(`SELECT * FROM kpsc_whatsapp_drafts WHERE id=?`).bind(id).first();
  return ok(whatsappDraftFromRow(row));
}

async function updateWhatsappDraft(DB, id, data) {
  const existing = await DB.prepare(`SELECT * FROM kpsc_whatsapp_drafts WHERE id=?`).bind(id).first();
  if (!existing) return err('WhatsApp draft not found', 404);
  const now = new Date().toISOString();
  await DB.prepare(
    `UPDATE kpsc_whatsapp_drafts SET agenda_items_json=?, meeting_title=?, meeting_date=?, meeting_time=?, venue=?, urgency=?, tag_all=?, message_text=?, status=?, prep_checklist_json=?, agenda_outcomes_json=?, updated_at=? WHERE id=?`
  ).bind(
    JSON.stringify(data.agendaItems !== undefined ? data.agendaItems : safeJsonParse(existing.agenda_items_json, [])),
    data.meetingTitle !== undefined ? String(data.meetingTitle) : (existing.meeting_title || ''),
    data.meetingDate !== undefined ? String(data.meetingDate) : existing.meeting_date,
    data.meetingTime !== undefined ? String(data.meetingTime) : existing.meeting_time,
    data.venue !== undefined ? String(data.venue) : existing.venue,
    data.urgency !== undefined ? data.urgency : existing.urgency,
    data.tagAll !== undefined ? (data.tagAll ? 1 : 0) : existing.tag_all,
    data.messageText !== undefined ? String(data.messageText) : existing.message_text,
    data.status !== undefined ? data.status : existing.status,
    JSON.stringify(data.prepChecklist !== undefined ? data.prepChecklist : safeJsonParse(existing.prep_checklist_json, DEFAULT_PREP_CHECKLIST)),
    JSON.stringify(data.agendaOutcomes !== undefined ? data.agendaOutcomes : safeJsonParse(existing.agenda_outcomes_json, [])),
    now, id,
  ).run();
  const row = await DB.prepare(`SELECT * FROM kpsc_whatsapp_drafts WHERE id=?`).bind(id).first();
  return ok(whatsappDraftFromRow(row));
}

async function deleteWhatsappDraft(DB, id) {
  const existing = await DB.prepare(`SELECT id FROM kpsc_whatsapp_drafts WHERE id=?`).bind(id).first();
  if (!existing) return err('WhatsApp draft not found', 404);
  await DB.prepare(`DELETE FROM kpsc_whatsapp_drafts WHERE id=?`).bind(id).run();
  return ok({ id, deleted: true });
}

// ── Agenda Templates CRUD ─────────────────────────────────────────

function agendaTemplateFromRow(row) {
  return {
    id: row.id,
    title: row.title || '',
    items: safeJsonParse(row.items_json, []),
    createdBy: row.created_by || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

async function getAgendaTemplates(DB) {
  const { results } = await DB.prepare(
    `SELECT * FROM kpsc_agenda_templates ORDER BY title ASC`
  ).all();
  return ok((results || []).map(agendaTemplateFromRow));
}

async function createAgendaTemplate(DB, data, auth) {
  const title = String(data.title || '').trim();
  if (!title) return err('Template title is required.', 400);
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return err('Template must have at least one agenda item.', 400);
  const id = newId('TPL-');
  const now = new Date().toISOString();
  await DB.prepare(
    `INSERT INTO kpsc_agenda_templates (id,title,items_json,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?)`
  ).bind(id, title, JSON.stringify(items), auth?.name || '', now, now).run();
  const row = await DB.prepare(`SELECT * FROM kpsc_agenda_templates WHERE id=?`).bind(id).first();
  return ok(agendaTemplateFromRow(row));
}

async function updateAgendaTemplate(DB, id, data) {
  const existing = await DB.prepare(`SELECT * FROM kpsc_agenda_templates WHERE id=?`).bind(id).first();
  if (!existing) return err('Template not found', 404);
  const title = data.title !== undefined ? String(data.title).trim() : existing.title;
  const items = data.items !== undefined ? data.items : safeJsonParse(existing.items_json, []);
  const now = new Date().toISOString();
  await DB.prepare(
    `UPDATE kpsc_agenda_templates SET title=?, items_json=?, updated_at=? WHERE id=?`
  ).bind(title, JSON.stringify(items), now, id).run();
  const row = await DB.prepare(`SELECT * FROM kpsc_agenda_templates WHERE id=?`).bind(id).first();
  return ok(agendaTemplateFromRow(row));
}

async function deleteAgendaTemplate(DB, id) {
  const existing = await DB.prepare(`SELECT id FROM kpsc_agenda_templates WHERE id=?`).bind(id).first();
  if (!existing) return err('Template not found', 404);
  await DB.prepare(`DELETE FROM kpsc_agenda_templates WHERE id=?`).bind(id).run();
  return ok({ id, deleted: true });
}

async function buildWhatsappMessage(DB, env, id, body) {
  const existing = await DB.prepare(`SELECT * FROM kpsc_whatsapp_drafts WHERE id=?`).bind(id).first();
  if (!existing) return err('WhatsApp draft not found', 404);

  const agendaItems = safeJsonParse(existing.agenda_items_json, []);
  const meetingDate = existing.meeting_date || '';
  const meetingTime = existing.meeting_time || 'Immediately after service';
  const venue = existing.venue || 'Church Premises';
  const urgency = existing.urgency || 'normal';
  const tagAll = !!existing.tag_all;

  // Format date for display
  let dateDisplay = meetingDate;
  if (meetingDate) {
    try {
      // Use noon (T12:00:00) to avoid DST boundary issues when parsing YYYY-MM-DD strings.
      const d = new Date(meetingDate + 'T12:00:00');
      const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const dayName = days[d.getDay()];
      dateDisplay = `${dayName}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch { /* use raw */ }
  }

  // Get DeepSeek key
  const { key: deepseekKey, model: deepseekModel } = await loadDeepseekSettings(DB);

  // Load last meeting's context for stylistic reference
  let lastMeetingContext = '';
  try {
    const lastRow = await DB.prepare(
      `SELECT summary_short FROM ai_secretary_meetings WHERE status='processed' AND COALESCE(deleted_at,'')='' ORDER BY meeting_date DESC LIMIT 1`
    ).first();
    if (lastRow?.summary_short) lastMeetingContext = lastRow.summary_short;
  } catch { /* ignore */ }

  const agendaList = agendaItems.map((item, i) => {
    const label = typeof item === 'string' ? item : (item.topic || String(item));
    return `${i + 1}. ${label}`;
  }).join('\n');

  const urgencyNote = urgency === 'urgent' ? ' (URGENT)' : urgency === 'extraordinary' ? ' (EXTRAORDINARY)' : '';
  const tagLine = tagAll ? '@all ' : '';

  // Build deterministic fallback message
  const fallbackMessage = buildFallbackWhatsappMessage({ agendaItems, dateDisplay, meetingTime, venue, urgency, tagAll, agendaList, urgencyNote, tagLine });

  if (!deepseekKey) {
    await DB.prepare(`UPDATE kpsc_whatsapp_drafts SET message_text=?, updated_at=? WHERE id=?`)
      .bind(fallbackMessage, new Date().toISOString(), id).run();
    return ok({ messageText: fallbackMessage, source: 'template' });
  }

  const prompt = `You are helping the Chairman of the KPSC (Kingdom Parish Stewardship Committee) of RCCG Kingdom Parish write a WhatsApp meeting notification for committee members.

Write a warm, professional WhatsApp message using *bold* and _italic_ WhatsApp formatting (not HTML). Use numbered emoji items (1️⃣ 2️⃣ 3️⃣ etc.) for the agenda. The tone should be respectful, authoritative, and warm — as a Nigerian church leader would write.

## Meeting Details
- Date: ${dateDisplay || 'To be confirmed'}
- Time: ${meetingTime}
- Venue: ${venue}
- Urgency: ${urgency}${urgencyNote}
- Tag all members: ${tagAll ? 'Yes — start the message with @all' : 'No'}

## Agenda Items
${agendaList || '(agenda to be confirmed)'}

${lastMeetingContext ? `## Context from Last Meeting\n${lastMeetingContext}` : ''}

## Rules
- Use WhatsApp formatting only: *bold*, _italic_, no HTML
- Use numbered emoji for agenda (1️⃣ 2️⃣ 3️⃣ …) — one item per line
- Begin with a warm greeting to all KPSC members
- Include date, time, venue clearly
- End with a motivational/devotional closing line and "— KPSC Secretariat"
- If urgency is "urgent" or "extraordinary", open with an urgent notice at the top
- Keep it concise but complete — no unnecessary repetition
- Return only the message text, nothing else`;

  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
      body: JSON.stringify({ model: deepseekModel, messages: [{ role: 'user', content: prompt }], max_tokens: 1200, temperature: 0.6 }),
    });
    if (!resp.ok) throw new Error(`DeepSeek error ${resp.status}`);
    const data = await resp.json();
    const messageText = (data.choices?.[0]?.message?.content || '').trim() || fallbackMessage;
    await DB.prepare(`UPDATE kpsc_whatsapp_drafts SET message_text=?, updated_at=? WHERE id=?`)
      .bind(messageText, new Date().toISOString(), id).run();
    return ok({ messageText, source: 'ai' });
  } catch (_) {
    await DB.prepare(`UPDATE kpsc_whatsapp_drafts SET message_text=?, updated_at=? WHERE id=?`)
      .bind(fallbackMessage, new Date().toISOString(), id).run();
    return ok({ messageText: fallbackMessage, source: 'template' });
  }
}

function buildFallbackWhatsappMessage({ agendaItems, dateDisplay, meetingTime, venue, urgency, tagAll, agendaList, urgencyNote, tagLine }) {
  const agendaLines = agendaItems.map((item, i) => {
    const label = typeof item === 'string' ? item : (item.topic || String(item));
    return `${EMOJI_NUMS[i] || `${i+1}.`} ${label}`;
  }).join('\n');

  const urgencyHeader = urgency === 'urgent'
    ? '🚨 *URGENT NOTICE* 🚨\n\n'
    : urgency === 'extraordinary'
    ? '📢 *EXTRAORDINARY MEETING NOTICE* 📢\n\n'
    : '';

  return `${urgencyHeader}${tagAll ? '@all\n\n' : ''}*KPSC Meeting Notice*\n\nDear Committee Members,\n\nYou are cordially invited to our next committee meeting.\n\n📅 *Date:* ${dateDisplay || 'To be confirmed'}\n🕐 *Time:* ${meetingTime}\n📍 *Venue:* ${venue}\n\n*Agenda:*\n${agendaLines || '(Agenda to be confirmed)'}\n\n_Please make every effort to attend. Kindly notify the secretary if you are unable to attend._\n\n_"As iron sharpens iron, so one person sharpens another." — Prov 27:17_\n\n— KPSC Secretariat`;
}

async function refineWhatsappMessage(DB, env, id, body) {
  const existing = await DB.prepare(`SELECT * FROM kpsc_whatsapp_drafts WHERE id=?`).bind(id).first();
  if (!existing) return err('WhatsApp draft not found', 404);

  const currentMessage = body.messageText || existing.message_text || '';
  const action = String(body.action || 'proofread').toLowerCase();

  const validActions = ['proofread', 'tone_formal', 'tone_warm', 'tone_urgent', 'tone_casual', 'shorten', 'expand', 'simplify'];
  if (!validActions.includes(action)) return err(`Invalid action. Must be one of: ${validActions.join(', ')}`, 400);

  const instructions = {
    proofread:    'Carefully proofread the WhatsApp message below. Fix any grammatical errors, spelling mistakes, awkward phrasing, or unclear sentences. Preserve the original structure and intent. Return only the corrected message.',
    tone_formal:  'Rewrite the WhatsApp message below in a more formal, authoritative tone suitable for a senior church committee. Maintain the content and structure but elevate the language. Return only the rewritten message.',
    tone_warm:    'Rewrite the WhatsApp message below in a warmer, more personal, encouraging tone. Make members feel welcomed and valued. Maintain all key information. Return only the rewritten message.',
    tone_urgent:  'Rewrite the WhatsApp message below to convey urgency and importance. Members should feel this meeting is critical to attend. Add an urgent opening if not already present. Return only the rewritten message.',
    tone_casual:  'Rewrite the WhatsApp message below in a friendlier, more casual tone. Keep it professional but conversational. Maintain all key information. Return only the rewritten message.',
    shorten:      'Shorten the WhatsApp message below without losing any critical information (date, time, venue, agenda items). Remove redundant phrases, trim lengthy sentences. Return only the shortened message.',
    expand:       'Expand the WhatsApp message below to be more comprehensive. Add warmth, a devotional line if not present, and elaborate on the importance of attending. Keep WhatsApp formatting. Return only the expanded message.',
    simplify:     'Simplify the language in the WhatsApp message below so it is clear and easy to understand for all members, including those less comfortable with formal English. Maintain WhatsApp formatting. Return only the simplified message.',
  };

  let deepseekKey = '';
  let deepseekModel = 'deepseek-v4-flash';
  { const ds = await loadDeepseekSettings(DB); deepseekKey = ds.key; deepseekModel = ds.model; }

  if (!deepseekKey) return err('AI key not configured. Please add your DeepSeek API key in Settings.', 503);

  const prompt = `${instructions[action]}\n\nMessage:\n${currentMessage}`;

  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
    body: JSON.stringify({ model: deepseekModel, messages: [{ role: 'user', content: prompt }], max_tokens: 1200, temperature: 0.4 }),
  });
  if (!resp.ok) return err(`AI service error: ${resp.status}`, 502);
  const data = await resp.json();
  const refined = (data.choices?.[0]?.message?.content || '').trim();
  if (!refined) return err('AI returned an empty response. Please try again.', 502);
  return ok({ messageText: refined });
}

async function finalizeWhatsappDraft(DB, id, body, auth) {
  const existing = await DB.prepare(`SELECT * FROM kpsc_whatsapp_drafts WHERE id=?`).bind(id).first();
  if (!existing) return err('WhatsApp draft not found', 404);

  const messageText = body.messageText || existing.message_text || '';
  if (!messageText.trim()) return err('Message text is empty', 400);

  const now = new Date().toISOString();

  // Mark draft as saved
  await DB.prepare(
    `UPDATE kpsc_whatsapp_drafts SET message_text=?, status='saved', updated_at=? WHERE id=?`
  ).bind(messageText, now, id).run();

  // Mark used agenda notes as used
  const agendaItems = safeJsonParse(existing.agenda_items_json, []);
  const noteIds = agendaItems.filter(i => i && typeof i === 'object' && i.noteId).map(i => i.noteId);
  for (const noteId of noteIds) {
    try {
      await DB.prepare(`UPDATE kpsc_agenda_notes SET is_used=1, updated_at=? WHERE id=?`).bind(now, noteId).run();
    } catch { /* ignore */ }
  }

  // Auto-create a meeting draft if not already linked
  let linkedMeetingId = existing.linked_meeting_id || '';
  if (!linkedMeetingId) {
    const meetingId = newId('AIM-');
    // Build a clean plain-text agenda from the selected agenda items (not the WhatsApp message).
    // The meeting's agenda_text field should hold the structured agenda, while message_text
    // holds the WhatsApp notification (which includes greetings, emojis, and formatting).
    const agendaForMeeting = agendaItems.map((item, i) => {
      const label = typeof item === 'string' ? item : (item.topic || String(item));
      return `${i + 1}. ${label}`;
    }).join('\n');
    const meetingTitle = body.meetingTitle || String(existing.meeting_title || '').trim()
      || ('KPSC Meeting – ' + (existing.meeting_date || now.slice(0, 10)));
    await DB.prepare(`
      INSERT OR IGNORE INTO ai_secretary_meetings
        (id,title,meeting_type,meeting_date,status,participants_json,transcript_text,agenda_text,created_by,created_by_account_id,started_at,created_at,scheduled_for)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      meetingId,
      meetingTitle,
      'routine',
      existing.meeting_date || now.slice(0, 10),
      'draft',
      JSON.stringify([]),
      '',
      agendaForMeeting,
      auth?.name || '',
      auth?.id || '',
      '',
      now,
      existing.meeting_date ? (existing.meeting_date + 'T' + (existing.meeting_time || '09:00') + ':00') : null,
    ).run();
    linkedMeetingId = meetingId;
    await DB.prepare(`UPDATE kpsc_whatsapp_drafts SET linked_meeting_id=?, updated_at=? WHERE id=?`)
      .bind(linkedMeetingId, now, id).run();
  }

  const row = await DB.prepare(`SELECT * FROM kpsc_whatsapp_drafts WHERE id=?`).bind(id).first();
  return ok({ ...whatsappDraftFromRow(row), linkedMeetingId });
}

// ── Post-Meeting Agenda Outcomes ─────────────────────────────────────

async function saveAgendaOutcomes(DB, draftId, body) {
  // Accepts { outcomes: [{ topic, status: 'resolved'|'carry_forward'|'not_discussed' }] }
  const existing = await DB.prepare(`SELECT * FROM kpsc_whatsapp_drafts WHERE id=?`).bind(draftId).first();
  if (!existing) return err('Draft not found', 404);
  const outcomes = Array.isArray(body.outcomes) ? body.outcomes : [];
  const now = new Date().toISOString();
  await DB.prepare(
    `UPDATE kpsc_whatsapp_drafts SET agenda_outcomes_json=?, status='finalized', updated_at=? WHERE id=?`
  ).bind(JSON.stringify(outcomes), now, draftId).run();

  // Increment usage_count on referenced agenda notes so recurring items build their frequency score
  const agendaItems = safeJsonParse(existing.agenda_items_json, []);
  for (const item of agendaItems) {
    if (item && typeof item === 'object' && item.noteId) {
      try {
        await DB.prepare(
          `UPDATE kpsc_agenda_notes SET usage_count = usage_count + 1, updated_at=? WHERE id=?`
        ).bind(now, item.noteId).run();
      } catch { /* safe */ }
    }
  }

  const row = await DB.prepare(`SELECT * FROM kpsc_whatsapp_drafts WHERE id=?`).bind(draftId).first();
  return ok({ ...whatsappDraftFromRow(row), carryForwardItems: outcomes.filter(o => o.status === 'carry_forward' || o.status === 'not_discussed') });
}

// ── TEST-VISIBLE EXPORTS ──────────────────────────────────────────────
// Pure helpers exported so unit tests can exercise them directly without
// going through the full HTTP handler stack.
export { cosineSim, embeddingToBlob, blobToEmbedding, classifyPartnerTone, classifyOverdueActionItems, sendTermiiSms };
