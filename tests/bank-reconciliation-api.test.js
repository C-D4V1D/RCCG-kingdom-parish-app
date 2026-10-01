// HTTP-level tests for the Bank reconciliation feature (Finance portal — the main church
// account; PR 3 of 4). The matching-engine unit tests already live in
// tests/bank-reconciliation.test.js and are untouched — this file only exercises the D1
// table, the /api/bank-recon/* routes, the statement-upload path and the run-bank-recon
// cron job built on top of that engine. Follows automations-api.test.js's style: a real
// in-memory SQLite D1 (sqlite-d1.mjs) so the actual SQL is exercised, signed Finance tokens
// from finance-auth-helper.mjs, and a stubbed global.fetch for the Worker/DeepSeek calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';
import { createSqliteD1 } from './sqlite-d1.mjs';
import { financeToken } from './finance-auth-helper.mjs';

const readJson = async (res) => JSON.parse(await res.text());

function req(path, { method = 'GET', body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  return new Request(`https://x/api/${path}`, init);
}
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

const WATCHDOG_URL = 'https://watchdog.example.test';
const WATCHDOG_TOKEN = 'test-watchdog-token';
const CRON_SECRET = 'test-cron-secret';

function baseEnv(DB, extra = {}) {
  return { DB, CLERK_WATCHDOG_TOKEN: WATCHDOG_TOKEN, CLERK_WATCHDOG_URL: WATCHDOG_URL, CRON_SECRET, ...extra };
}

async function freshDB() {
  const DB = createSqliteD1();
  const res = await onRequest({ request: req('init', { headers: bearer(await financeToken()) }), env: baseEnv(DB) });
  assert.equal(res.status, 200, 'init with a token works');
  // run-bank-recon is dispatched through the generic cronJobRunners() sweep, which (once
  // due) also drives every OTHER cron job on the same request. That sweep mechanism is
  // already covered in tests/api-route.test.js; mark it as "just swept" so these tests only
  // exercise bank-recon's own logic.
  DB.sqlite.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('kpsc_cron_last_sweep', ?)`).run(new Date().toISOString());
  return DB;
}

async function tokenFor(DB, uid, extra = {}) {
  const row = DB.sqlite.prepare(`SELECT id, role, pin FROM users WHERE id=?`).get(uid);
  return financeToken({ uid: row.id, role: row.role, storedPin: row.pin, ...extra });
}
// Forces the 12-hour re-check DB path so authz.finance.name is actually populated
// (the fast path skips the users read and leaves name undefined) — needed for resolved_by.
async function namedToken(DB, uid) {
  const old = Math.floor(Date.now() / 1000) - 13 * 3600;
  return tokenFor(DB, uid, { rv: old, iat: old });
}

let fetchCalls;
function stubFetch(handler) {
  fetchCalls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    fetchCalls.push({ url: u, init });
    return handler(u, init);
  };
  return () => { globalThis.fetch = original; };
}
function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setDeepseekKey(DB) {
  DB.sqlite.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('ai_deepseek_key','test-deepseek-key')`).run();
}
function setOpenaiKey(DB) {
  DB.sqlite.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('ai_openai_key','test-openai-key')`).run();
}
function setOcrProvider(DB, provider) {
  DB.sqlite.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('bank_recon_ocr_provider',?)`).run(provider);
}

// ── GET /api/bank-recon/entries ───────────────────────────────────────────
test('GET /api/bank-recon/entries: it_admin and accountant can read; other roles are forbidden', async () => {
  const DB = await freshDB();
  DB.sqlite.prepare(
    `INSERT INTO bank_recon_entries (id,balance_history_id,date,amount,direction,status,matched_refs_json,candidates_json,narration)
     VALUES ('brc1','bal:1','2026-10-05',5000,'out','auto','[{"sourceTable":"expenses","sourceId":"e1"}]','[]','')`
  ).run();

  const admin = await onRequest({ request: req('bank-recon/entries', { headers: bearer(await tokenFor(DB, 'u1')) }), env: baseEnv(DB) });
  assert.equal(admin.status, 200);
  const list = await readJson(admin);
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'auto');
  assert.deepEqual(list[0].matchedRefs, [{ sourceTable: 'expenses', sourceId: 'e1' }]);

  const accountant = await onRequest({ request: req('bank-recon/entries', { headers: bearer(await tokenFor(DB, 'u3')) }), env: baseEnv(DB) });
  assert.equal(accountant.status, 200);

  const viewer = await onRequest({ request: req('bank-recon/entries', { headers: bearer(await tokenFor(DB, 'u7')) }), env: baseEnv(DB) });
  assert.equal(viewer.status, 403);
});

// ── POST /api/bank-recon/entries/:id/resolve ──────────────────────────────
test('POST /api/bank-recon/entries/:id/resolve: it_admin only; chosenRefs and addNew both resolve correctly', async () => {
  const DB = await freshDB();
  DB.sqlite.prepare(`INSERT INTO bank_recon_entries (id,balance_history_id,date,amount,direction,status) VALUES ('brc1','bal:1','2026-10-05',5000,'out','needs_attention')`).run();
  DB.sqlite.prepare(`INSERT INTO bank_recon_entries (id,balance_history_id,date,amount,direction,status) VALUES ('brc2','bal:2','2026-10-06',3000,'out','needs_attention')`).run();

  const forbidden = await onRequest({
    request: req('bank-recon/entries/brc1/resolve', { method: 'POST', headers: bearer(await tokenFor(DB, 'u3')), body: { chosenRefs: [{ sourceTable: 'expenses', sourceId: 'e1' }] } }),
    env: baseEnv(DB),
  });
  assert.equal(forbidden.status, 403, 'accountant cannot resolve');

  const admin = await namedToken(DB, 'u1');
  const resolved = await onRequest({
    request: req('bank-recon/entries/brc1/resolve', { method: 'POST', headers: bearer(admin), body: { chosenRefs: [{ sourceTable: 'expenses', sourceId: 'e1' }] } }),
    env: baseEnv(DB),
  });
  assert.equal(resolved.status, 200);
  const body = await readJson(resolved);
  assert.equal(body.status, 'resolved');
  assert.deepEqual(body.matchedRefs, [{ sourceTable: 'expenses', sourceId: 'e1' }]);
  assert.equal(body.resolvedBy, 'IT Administrator');
  assert.ok(body.resolvedAt);

  const addNewRes = await onRequest({
    request: req('bank-recon/entries/brc2/resolve', { method: 'POST', headers: bearer(admin), body: { addNew: true } }),
    env: baseEnv(DB),
  });
  assert.equal(addNewRes.status, 200);
  const addNewBody = await readJson(addNewRes);
  assert.equal(addNewBody.status, 'resolved');
  assert.deepEqual(addNewBody.matchedRefs, []);

  const missingBoth = await onRequest({
    request: req('bank-recon/entries/brc2/resolve', { method: 'POST', headers: bearer(admin), body: {} }),
    env: baseEnv(DB),
  });
  assert.equal(missingBoth.status, 400, 'neither chosenRefs nor addNew: a clear error, not a silent no-op');
});

// ── POST /api/bank-recon/statement ────────────────────────────────────────
function stubDeepseekForStatement(items, ocrText = 'OCR transcript of the statement') {
  return stubFetch((url, init) => {
    if (url === 'https://api.deepseek.com/chat/completions') {
      const sentBody = JSON.parse(init.body);
      const content = sentBody.messages?.[0]?.content;
      if (Array.isArray(content)) {
        // The vision OCR call (ocrStatementPhoto): content is an array of blocks.
        assert.equal(sentBody.model, 'deepseek-flash');
        assert.ok(content.some(b => b.type === 'image_url'));
        return jsonResponse(200, { choices: [{ message: { content: ocrText } }] });
      }
      // The text parse call (parseStatementWithAI): plain string content.
      return jsonResponse(200, { choices: [{ message: { content: JSON.stringify(items) } }] });
    }
    throw new Error(`unexpected fetch in statement test: ${url}`);
  });
}

// bank_recon_ocr_provider='openai' routes the vision OCR call to OpenAI instead of
// DeepSeek — the text-parsing step (parseStatementWithAI) is unaffected either way, it
// always uses DeepSeek, so this still stubs both endpoints.
function stubOpenAiForStatement(items, ocrText = 'OCR transcript of the statement') {
  return stubFetch((url, init) => {
    if (url === 'https://api.openai.com/v1/chat/completions') {
      const sentBody = JSON.parse(init.body);
      assert.equal(sentBody.model, 'gpt-6.1-sol');
      assert.ok(sentBody.messages?.[0]?.content?.some(b => b.type === 'image_url'));
      return jsonResponse(200, { choices: [{ message: { content: ocrText } }] });
    }
    if (url === 'https://api.deepseek.com/chat/completions') {
      return jsonResponse(200, { choices: [{ message: { content: JSON.stringify(items) } }] });
    }
    throw new Error(`unexpected fetch in statement test: ${url}`);
  });
}

test('POST /api/bank-recon/statement: bank_recon_ocr_provider=openai routes the vision call to OpenAI', async () => {
  const DB = await freshDB();
  setOpenaiKey(DB);
  setDeepseekKey(DB); // parseStatementWithAI (the text-parsing step after OCR) always uses DeepSeek
  setOcrProvider(DB, 'openai');
  const items = [{ date: '2026-10-05', amount: 1000, type: 'expense', narration: 'Misc' }];
  const restore = stubOpenAiForStatement(items);
  let res;
  try {
    res = await onRequest({
      request: req('bank-recon/statement', { method: 'POST', headers: bearer(await tokenFor(DB, 'u1')), body: { imageBase64: 'base64data', mimeType: 'image/jpeg' } }),
      env: baseEnv(DB),
    });
  } finally { restore(); }
  assert.equal(res.status, 200, 'OpenAI OCR path succeeds when the OpenAI key is set and the provider is selected');
});

test('POST /api/bank-recon/statement: multiple photos are OCR\'d separately and joined into one statement before parsing', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  let visionCallCount = 0;
  const restore = stubFetch((url, init) => {
    if (url === 'https://api.deepseek.com/chat/completions') {
      const sentBody = JSON.parse(init.body);
      const content = sentBody.messages?.[0]?.content;
      if (Array.isArray(content)) {
        visionCallCount++;
        return jsonResponse(200, { choices: [{ message: { content: `PAGE-${visionCallCount}-TEXT` } }] });
      }
      // The text-parse call: assert both pages' text arrived, in order, then return no items —
      // this test only cares about the OCR fan-out/join, not the matching that follows.
      assert.match(content, /PAGE-1-TEXT[\s\S]*PAGE-2-TEXT/);
      return jsonResponse(200, { choices: [{ message: { content: JSON.stringify([]) } }] });
    }
    throw new Error(`unexpected fetch in multi-page statement test: ${url}`);
  });
  let res;
  try {
    res = await onRequest({
      request: req('bank-recon/statement', {
        method: 'POST', headers: bearer(await tokenFor(DB, 'u1')),
        body: { images: [{ imageBase64: 'page1data', mimeType: 'image/jpeg' }, { imageBase64: 'page2data', mimeType: 'image/jpeg' }] },
      }),
      env: baseEnv(DB),
    });
  } finally { restore(); }
  assert.equal(res.status, 200);
  assert.equal(visionCallCount, 2, 'each photo gets its own OCR call');
});

test('POST /api/bank-recon/statement: a failure on any one photo fails the whole upload, not a partial result', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  let visionCallCount = 0;
  const restore = stubFetch((url, init) => {
    if (url === 'https://api.deepseek.com/chat/completions') {
      visionCallCount++;
      if (visionCallCount === 2) return jsonResponse(200, { choices: [{ message: { content: '' } }] }); // empty -> throws
      return jsonResponse(200, { choices: [{ message: { content: 'PAGE-1-TEXT' } }] });
    }
    throw new Error('the text-parse call must never be reached when a photo fails');
  });
  let res, body;
  try {
    res = await onRequest({
      request: req('bank-recon/statement', {
        method: 'POST', headers: bearer(await tokenFor(DB, 'u1')),
        body: { images: [{ imageBase64: 'page1data', mimeType: 'image/jpeg' }, { imageBase64: 'page2data', mimeType: 'image/jpeg' }] },
      }),
      env: baseEnv(DB),
    });
    body = await readJson(res);
  } finally { restore(); }
  assert.equal(res.status, 502);
  assert.match(body.error, /Could not read the statement/);
  const reconRows = DB.sqlite.prepare(`SELECT COUNT(*) AS n FROM bank_recon_entries`).get();
  assert.equal(reconRows.n, 0, 'nothing is filed when the upload fails partway through');
});

test('POST /api/bank-recon/statement: it_admin only', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  const restore = stubDeepseekForStatement([]);
  try {
    const res = await onRequest({
      request: req('bank-recon/statement', { method: 'POST', headers: bearer(await tokenFor(DB, 'u3')), body: { imageBase64: 'abc', mimeType: 'image/jpeg' } }),
      env: baseEnv(DB),
    });
    assert.equal(res.status, 403, 'accountant cannot upload a statement');
  } finally { restore(); }
});

test('POST /api/bank-recon/statement: a clean single-candidate match lands as auto, and an SMS-alert narration is filed as a bank charge (deduped on re-upload)', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  // One income record that exactly explains the first parsed line — a clean 'auto' match.
  DB.sqlite.prepare(`INSERT INTO income (id,date,bank_transfer_amount) VALUES ('i1','2026-10-05',50000)`).run();

  const items = [
    { date: '2026-10-05', amount: 50000, type: 'income', reference: 'REF1', narration: 'Transfer from Member' },
    { date: '2026-10-06', amount: 500, type: 'expense', reference: 'REF2', narration: 'SMS Alert Charge' },
  ];

  let restore = stubDeepseekForStatement(items);
  const admin = await tokenFor(DB, 'u1');
  let res, body;
  try {
    res = await onRequest({
      request: req('bank-recon/statement', { method: 'POST', headers: bearer(admin), body: { imageBase64: 'base64data', mimeType: 'image/jpeg' } }),
      env: baseEnv(DB),
    });
    body = await readJson(res);
  } finally { restore(); }

  assert.equal(res.status, 200);
  assert.deepEqual(body, { itemCount: 2, autoCount: 2, chargeCount: 1, needsAttentionCount: 0, unrecordedCount: 0, duplicateCount: 0 });

  const expenseRows = DB.sqlite.prepare(`SELECT * FROM expenses WHERE category='bank'`).all();
  assert.equal(expenseRows.length, 1, 'the SMS-alert charge was filed once');
  assert.equal(expenseRows[0].subcategory, 'SMS alert fees from the bank');
  assert.equal(expenseRows[0].amount, 500);
  assert.equal(expenseRows[0].recorded_by, 'AI Statement Upload');

  const reconRows = DB.sqlite.prepare(`SELECT * FROM bank_recon_entries ORDER BY amount`).all();
  assert.equal(reconRows.length, 2);
  const incomeEntry = reconRows.find(r => r.amount === 50000);
  assert.equal(incomeEntry.status, 'auto');
  assert.deepEqual(JSON.parse(incomeEntry.matched_refs_json), [{ sourceTable: 'income', sourceId: 'i1' }]);
  const chargeEntry = reconRows.find(r => r.amount === 500);
  assert.equal(chargeEntry.status, 'auto');
  assert.deepEqual(JSON.parse(chargeEntry.matched_refs_json), [{ sourceTable: 'expenses', sourceId: expenseRows[0].id }]);

  // Re-upload an overlapping statement (same charge line present again): must never
  // double-file the same bank charge (the line is recognised as already uploaded).
  restore = stubDeepseekForStatement(items);
  try {
    const res2 = await onRequest({
      request: req('bank-recon/statement', { method: 'POST', headers: bearer(admin), body: { imageBase64: 'base64data', mimeType: 'image/jpeg' } }),
      env: baseEnv(DB),
    });
    assert.equal(res2.status, 200);
  } finally { restore(); }

  const expenseRowsAfter = DB.sqlite.prepare(`SELECT * FROM expenses WHERE category='bank'`).all();
  assert.equal(expenseRowsAfter.length, 1, 'the dedup check stopped a second filing of the same charge');
});

// ── run-bank-recon cron job ────────────────────────────────────────────────
function stubWatchdogForSweep(history) {
  return stubFetch((url, init) => {
    if (url === `${WATCHDOG_URL}/balance-history?after=`) {
      return jsonResponse(200, { history, last: history.length ? history[history.length - 1].id : '' });
    }
    if (url === `${WATCHDOG_URL}/config`) {
      return jsonResponse(200, { config_version: 1, config: { automations: { supervisor: { balance_match_window_days: 7 } } } });
    }
    if (url === `${WATCHDOG_URL}/notify`) {
      return jsonResponse(200, { ok: true, sent: 1, of: 1 });
    }
    throw new Error(`unexpected fetch in run-bank-recon test: ${url}`);
  });
}

test('run-bank-recon: processes new balance-history entries, updates the cursor, and notifies on every movement (plus an extra alert for needs_attention)', async () => {
  const DB = await freshDB();
  // Entry0 seeds the baseline balance only (no prior cursor exists yet) — never itself a row.
  // Entry1: -12345 on 2026-10-05, one clean expense candidate (an amount that collides with
  // nothing else seeded below, even added together) -> auto.
  DB.sqlite.prepare(`INSERT INTO expenses (id,date,amount,payment_method,status) VALUES ('e1','2026-10-05',12345,'bank_transfer','approved')`).run();
  // Entry2: -85000 on 2026-10-07 — the same genuine two-combination ambiguity as the matching-engine
  // unit test (David's own example vs a same-amount singleton) -> needs_attention.
  DB.sqlite.prepare(`INSERT INTO expenses (id,date,amount,payment_method,status) VALUES ('e2','2026-10-07',30000,'bank_transfer','approved')`).run();
  DB.sqlite.prepare(`INSERT INTO expenses (id,date,amount,payment_method,status) VALUES ('e3','2026-10-07',20000,'bank_transfer','approved')`).run();
  DB.sqlite.prepare(`INSERT INTO expenses (id,date,amount,payment_method,status) VALUES ('e4','2026-10-08',35000,'bank_transfer','approved')`).run();
  DB.sqlite.prepare(`INSERT INTO expenses (id,date,amount,payment_method,status) VALUES ('e5','2026-10-06',85000,'bank_transfer','approved')`).run();
  // Entry3: -10000 on 2026-10-09, nothing in the pool explains it -> unrecorded.

  const history = [
    { id: 'bal1', balance: 500000, checked_at: '2026-10-04T08:00:00Z' },
    { id: 'bal2', balance: 487655, checked_at: '2026-10-05T08:00:00Z' }, // -12345
    { id: 'bal3', balance: 402655, checked_at: '2026-10-07T08:00:00Z' }, // -85000
    { id: 'bal4', balance: 392655, checked_at: '2026-10-09T08:00:00Z' }, // -10000
  ];
  const restore = stubWatchdogForSweep(history);
  let res, body;
  try {
    res = await onRequest({
      request: req('internal/run-bank-recon', { method: 'POST', headers: bearer(CRON_SECRET) }),
      env: baseEnv(DB),
    });
    body = await readJson(res);
  } finally { restore(); }

  assert.equal(res.status, 200);
  assert.equal(body.processed, 3, 'entry0 only seeds the baseline, entries 1-3 are processed');
  assert.equal(body.autoCount, 1);
  assert.equal(body.needsAttentionCount, 1);
  assert.equal(body.unrecordedCount, 1);

  const notifyCalls = fetchCalls.filter(c => c.url === `${WATCHDOG_URL}/notify`).map(c => JSON.parse(c.init.body));
  const detected = notifyCalls.filter(n => n.type === 'bank_transaction_detected');
  const needsReview = notifyCalls.filter(n => n.type === 'bank_transaction_needs_review');
  assert.equal(detected.length, 3, 'every processed movement gets the plain FYI, regardless of status');
  assert.equal(needsReview.length, 1, 'only the needs_attention movement also gets the actionable alert');
  assert.match(needsReview[0].text, /85,000|85000/);
  assert.ok(detected.some(n => /85,000|85000/.test(n.text)), 'the FYI for the ambiguous movement still names the amount');
  assert.ok(detected.some(n => n.text.startsWith('✅')), 'the auto-matched movement gets a success-styled FYI');
  assert.ok(detected.some(n => n.text.startsWith('❓')), 'the unrecorded movement gets a question-styled FYI');

  const reconRows = DB.sqlite.prepare(`SELECT * FROM bank_recon_entries ORDER BY date`).all();
  assert.equal(reconRows.length, 3);
  assert.deepEqual(reconRows.map(r => r.status), ['auto', 'needs_attention', 'unrecorded']);
  assert.deepEqual(reconRows.map(r => r.balance_history_id), ['bal2', 'bal3', 'bal4']);

  const cursorRow = DB.sqlite.prepare(`SELECT value FROM settings WHERE key='bank_recon_balance_cursor'`).get();
  const cursor = JSON.parse(cursorRow.value);
  assert.equal(cursor.afterId, 'bal4');
  assert.equal(cursor.lastBalance, 392655);
});

test('run-bank-recon: re-running after a partial failure never double-inserts or double-notifies an already-processed movement', async () => {
  const DB = await freshDB();
  DB.sqlite.prepare(`INSERT INTO expenses (id,date,amount,payment_method,status) VALUES ('e1','2026-10-05',30000,'bank_transfer','approved')`).run();
  const history = [
    { id: 'bal1', balance: 500000, checked_at: '2026-10-04T08:00:00Z' },
    { id: 'bal2', balance: 470000, checked_at: '2026-10-05T08:00:00Z' },
  ];
  let restore = stubWatchdogForSweep(history);
  try {
    await onRequest({ request: req('internal/run-bank-recon', { method: 'POST', headers: bearer(CRON_SECRET) }), env: baseEnv(DB) });
  } finally { restore(); }
  assert.equal(DB.sqlite.prepare(`SELECT COUNT(*) AS n FROM bank_recon_entries`).get().n, 1);

  // Simulate a cron scheduler re-hitting the same endpoint before/without the Worker ever
  // advancing (e.g. a retried tick) — the cursor already moved past bal2, so the Worker
  // would not resend it, but even if it somehow did, the per-row id check must still hold.
  restore = stubWatchdogForSweep(history.map(h => ({ ...h, id: h.id }))); // same ids
  // Force the cursor back to simulate "never advanced" while the row already exists.
  DB.sqlite.prepare(`UPDATE settings SET value=? WHERE key='bank_recon_balance_cursor'`).run(JSON.stringify({ afterId: '', lastBalance: null }));
  try {
    await onRequest({ request: req('internal/run-bank-recon', { method: 'POST', headers: bearer(CRON_SECRET) }), env: baseEnv(DB) });
  } finally { restore(); }

  assert.equal(DB.sqlite.prepare(`SELECT COUNT(*) AS n FROM bank_recon_entries`).get().n, 1, 'the already-processed balance_history_id was skipped, not duplicated');
});

// ── Dedupe, one-record-one-line, ignore/unmatch, matchedDetails ────────────
async function uploadStatement(DB, token, items) {
  const restore = stubDeepseekForStatement(items);
  try {
    const res = await onRequest({
      request: req('bank-recon/statement', { method: 'POST', headers: bearer(token), body: { imageBase64: 'base64data', mimeType: 'image/jpeg' } }),
      env: baseEnv(DB),
    });
    return { status: res.status, body: await readJson(res) };
  } finally { restore(); }
}
const reconCount = (DB) => DB.sqlite.prepare(`SELECT COUNT(*) AS n FROM bank_recon_entries`).get().n;

test('POST /api/bank-recon/statement: re-uploading the same statement files nothing new and reports duplicateCount', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  DB.sqlite.prepare(`INSERT INTO income (id,date,bank_transfer_amount) VALUES ('i1','2026-10-05',50000)`).run();
  const items = [
    { date: '2026-10-05', amount: 50000, type: 'income', narration: 'Transfer from Member' },
    { date: '2026-10-06', amount: 500, type: 'expense', narration: 'SMS Alert Charge' },
    { date: '2026-10-07', amount: 7777, type: 'expense', narration: '  Unknown debit  ' },
  ];
  const admin = await tokenFor(DB, 'u1');
  const first = await uploadStatement(DB, admin, items);
  assert.equal(first.status, 200);
  assert.equal(first.body.duplicateCount, 0);
  assert.equal(reconCount(DB), 3);

  // Same lines again, amounts off by float noise and narration whitespace differing.
  const again = items.map(i => ({ ...i, amount: i.amount + 0.001, narration: ` ${i.narration.trim()} ` }));
  const second = await uploadStatement(DB, admin, again);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, { itemCount: 3, autoCount: 0, chargeCount: 0, needsAttentionCount: 0, unrecordedCount: 0, duplicateCount: 3 });
  assert.equal(reconCount(DB), 3, 'no new rows on re-upload');
  assert.equal(DB.sqlite.prepare(`SELECT COUNT(*) AS n FROM expenses WHERE category='bank'`).get().n, 1, 'charge not re-filed');
});

test('POST /api/bank-recon/statement: two identical lines with only one matching record -> only one is auto', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  DB.sqlite.prepare(`INSERT INTO income (id,date,bank_transfer_amount) VALUES ('i1','2026-10-05',50000)`).run();
  const line = { date: '2026-10-05', amount: 50000, type: 'income', narration: 'Transfer from Member' };
  const admin = await tokenFor(DB, 'u1');
  const res = await uploadStatement(DB, admin, [line, { ...line }]);
  assert.equal(res.status, 200);
  assert.equal(res.body.autoCount, 1);
  assert.equal(res.body.unrecordedCount, 1);
  assert.equal(res.body.duplicateCount, 0, 'identical lines within ONE statement are both filed');
  const rows = DB.sqlite.prepare(`SELECT status, matched_refs_json FROM bank_recon_entries`).all();
  assert.deepEqual(rows.map(r => r.status).sort(), ['auto', 'unrecorded']);

  // Re-uploading the same statement now skips both.
  const again = await uploadStatement(DB, admin, [line, { ...line }]);
  assert.equal(again.body.duplicateCount, 2);
  assert.equal(reconCount(DB), 2);
});

test('POST /api/bank-recon/statement: a record already used by an auto/resolved entry is never re-matched; needs_attention candidates are not reserved', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  DB.sqlite.prepare(`INSERT INTO income (id,date,bank_transfer_amount) VALUES ('i1','2026-10-05',50000)`).run();
  DB.sqlite.prepare(`INSERT INTO income (id,date,bank_transfer_amount) VALUES ('i2','2026-10-05',20000)`).run();
  DB.sqlite.prepare(
    `INSERT INTO bank_recon_entries (id,balance_history_id,date,amount,direction,status,matched_refs_json) VALUES ('brcA','bal:1','2026-10-05',50000,'in','resolved','[{"sourceTable":"income","sourceId":"i1"}]')`
  ).run();
  DB.sqlite.prepare(
    `INSERT INTO bank_recon_entries (id,balance_history_id,date,amount,direction,status,candidates_json) VALUES ('brcB','bal:2','2026-10-05',20000,'in','needs_attention','[[{"sourceTable":"income","sourceId":"i2"}]]')`
  ).run();
  const admin = await tokenFor(DB, 'u1');
  const res = await uploadStatement(DB, admin, [
    { date: '2026-10-05', amount: 50000, type: 'income', narration: 'Transfer A' },
    { date: '2026-10-05', amount: 20000, type: 'income', narration: 'Transfer B' },
  ]);
  assert.equal(res.status, 200);
  const rows = DB.sqlite.prepare(`SELECT amount, status, matched_refs_json FROM bank_recon_entries WHERE balance_history_id LIKE 'stmt:%'`).all();
  assert.equal(rows.find(r => r.amount === 50000).status, 'unrecorded', 'i1 is already resolved elsewhere');
  const b = rows.find(r => r.amount === 20000);
  assert.equal(b.status, 'auto');
  assert.deepEqual(JSON.parse(b.matched_refs_json), [{ sourceTable: 'income', sourceId: 'i2' }]);
});

test('run-bank-recon: two identical drops with one matching expense -> only one auto', async () => {
  const DB = await freshDB();
  DB.sqlite.prepare(`INSERT INTO expenses (id,date,amount,payment_method,status) VALUES ('e1','2026-10-05',30000,'bank_transfer','approved')`).run();
  const history = [
    { id: 'bal1', balance: 500000, checked_at: '2026-10-04T08:00:00Z' },
    { id: 'bal2', balance: 470000, checked_at: '2026-10-05T08:00:00Z' },
    { id: 'bal3', balance: 440000, checked_at: '2026-10-05T12:00:00Z' },
  ];
  const restore = stubWatchdogForSweep(history);
  let body;
  try {
    const res = await onRequest({ request: req('internal/run-bank-recon', { method: 'POST', headers: bearer(CRON_SECRET) }), env: baseEnv(DB) });
    body = await readJson(res);
  } finally { restore(); }
  assert.equal(body.autoCount, 1);
  assert.equal(body.unrecordedCount, 1);
});

test('POST /api/bank-recon/entries/:id/ignore and /unmatch: it_admin only, status changes, unmatch frees the record', async () => {
  const DB = await freshDB();
  DB.sqlite.prepare(`INSERT INTO bank_recon_entries (id,balance_history_id,date,amount,direction,status,matched_refs_json,candidates_json) VALUES ('brc1','bal:1','2026-10-05',5000,'out','auto','[{"sourceTable":"expenses","sourceId":"e1"}]','[[{"sourceTable":"expenses","sourceId":"e1"}]]')`).run();
  DB.sqlite.prepare(`INSERT INTO bank_recon_entries (id,balance_history_id,date,amount,direction,status) VALUES ('brc2','bal:2','2026-10-06',5000,'out','unrecorded')`).run();
  const accountant = await tokenFor(DB, 'u3');
  const admin = await namedToken(DB, 'u1');
  const post = (path, token, body) => onRequest({ request: req(path, { method: 'POST', headers: bearer(token), body }), env: baseEnv(DB) });

  assert.equal((await post('bank-recon/entries/brc2/ignore', accountant)).status, 403);
  assert.equal((await post('bank-recon/entries/brc1/unmatch', accountant)).status, 403);
  assert.equal((await post('bank-recon/entries/nope/ignore', admin)).status, 404);

  // brc1 holds e1, so resolving brc2 to e1 conflicts.
  const conflict = await post('bank-recon/entries/brc2/resolve', admin, { chosenRefs: [{ sourceTable: 'expenses', sourceId: 'e1' }] });
  assert.equal(conflict.status, 409);
  assert.match((await readJson(conflict)).error, /already matched to another bank line/);
  // Re-resolving brc1 itself to its own ref is not a conflict.
  assert.equal((await post('bank-recon/entries/brc1/resolve', admin, { chosenRefs: [{ sourceTable: 'expenses', sourceId: 'e1' }] })).status, 200);

  const unmatched = await post('bank-recon/entries/brc1/unmatch', admin);
  assert.equal(unmatched.status, 200);
  const u = await readJson(unmatched);
  assert.equal(u.status, 'unrecorded');
  assert.deepEqual(u.matchedRefs, []);
  assert.deepEqual(u.candidates, []);
  assert.equal(u.resolvedBy, '');
  assert.equal(u.resolvedAt, '');
  assert.equal(DB.sqlite.prepare(`SELECT resolved_at FROM bank_recon_entries WHERE id='brc1'`).get().resolved_at, null);

  // e1 is free again.
  const nowOk = await post('bank-recon/entries/brc2/resolve', admin, { chosenRefs: [{ sourceTable: 'expenses', sourceId: 'e1' }] });
  assert.equal(nowOk.status, 200);

  const ignored = await post('bank-recon/entries/brc1/ignore', admin);
  assert.equal(ignored.status, 200);
  const ig = await readJson(ignored);
  assert.equal(ig.status, 'ignored');
  assert.deepEqual(ig.matchedRefs, []);
  assert.equal(ig.resolvedBy, 'IT Administrator');
  assert.ok(ig.resolvedAt);
});

test('GET /api/bank-recon/entries: matchedDetails describes each matched record, flags missing ones', async () => {
  const DB = await freshDB();
  DB.sqlite.prepare(`INSERT INTO expenses (id,date,amount,payment_method,bank_amount,description,status) VALUES ('e1','2026-10-05',8000,'split',5000,'Generator diesel','approved')`).run();
  DB.sqlite.prepare(`INSERT INTO income (id,date,bank_transfer_amount,source,donor_name) VALUES ('i1','2026-10-04',2000,'donation','Bro. Ade')`).run();
  DB.sqlite.prepare(`INSERT INTO remittances (id,label,amount,paid_date,bank_amount,status) VALUES ('r1','Area remittance',3000,'2026-10-03',3000,'paid')`).run();
  DB.sqlite.prepare(`INSERT INTO cash_transactions (id,type,date,amount,description) VALUES ('c1','withdrawal','2026-10-02',1000,'')`).run();
  DB.sqlite.prepare(`INSERT INTO petty_cash (id,type,purpose,amount,payment_method,created_at) VALUES ('p1','refill','Float top-up',4000,'bank_transfer','2026-10-01 09:00:00')`).run();
  const refs = [
    { sourceTable: 'expenses', sourceId: 'e1' }, { sourceTable: 'remittances', sourceId: 'r1' },
    { sourceTable: 'cash_transactions', sourceId: 'c1' }, { sourceTable: 'petty_cash', sourceId: 'p1' },
    { sourceTable: 'expenses', sourceId: 'gone' },
  ];
  DB.sqlite.prepare(`INSERT INTO bank_recon_entries (id,balance_history_id,date,amount,direction,status,matched_refs_json) VALUES ('brc1','bal:1','2026-10-05',13000,'out','resolved',?)`).run(JSON.stringify(refs));
  DB.sqlite.prepare(`INSERT INTO bank_recon_entries (id,balance_history_id,date,amount,direction,status,matched_refs_json) VALUES ('brc2','bal:2','2026-10-04',2000,'in','auto','[{"sourceTable":"income","sourceId":"i1"}]')`).run();
  DB.sqlite.prepare(`INSERT INTO bank_recon_entries (id,balance_history_id,date,amount,direction,status) VALUES ('brc3','bal:3','2026-10-03',1,'in','unrecorded')`).run();

  const res = await onRequest({ request: req('bank-recon/entries', { headers: bearer(await tokenFor(DB, 'u3')) }), env: baseEnv(DB) });
  assert.equal(res.status, 200);
  const list = await readJson(res);
  const e1 = list.find(e => e.id === 'brc1');
  assert.deepEqual(e1.matchedDetails, [
    { sourceTable: 'expenses', sourceId: 'e1', date: '2026-10-05', amount: 5000, description: 'Generator diesel' },
    { sourceTable: 'remittances', sourceId: 'r1', date: '2026-10-03', amount: 3000, description: 'Area remittance' },
    { sourceTable: 'cash_transactions', sourceId: 'c1', date: '2026-10-02', amount: 1000, description: 'withdrawal' },
    { sourceTable: 'petty_cash', sourceId: 'p1', date: '2026-10-01', amount: 4000, description: 'Float top-up' },
    { sourceTable: 'expenses', sourceId: 'gone', missing: true },
  ]);
  assert.deepEqual(list.find(e => e.id === 'brc2').matchedDetails,
    [{ sourceTable: 'income', sourceId: 'i1', date: '2026-10-04', amount: 2000, description: 'donation: Bro. Ade' }]);
  assert.deepEqual(list.find(e => e.id === 'brc3').matchedDetails, []);
});
