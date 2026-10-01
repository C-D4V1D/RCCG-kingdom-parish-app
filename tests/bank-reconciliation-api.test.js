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
// The statement reader makes ONE vision call per photo, which returns the statement's rows
// as JSON: { period_start, period_end, opening_balance, closing_balance, rows: [{ date,
// date_as_printed, narration, reference, debit, credit, balance }] }. itemsToPage turns
// simple test lines ({ date, amount, type, narration }) into such a page with a consistent
// running balance (oldest first, from an opening balance), so every line passes the
// running-balance check unless a test deliberately breaks it.
function itemsToPage(items, opening = 1000000) {
  let bal = opening;
  return {
    period_start: null, period_end: null, opening_balance: opening, closing_balance: null,
    rows: items.map(it => {
      const out = it.type === 'expense';
      bal = Math.round((bal + (out ? -it.amount : it.amount)) * 100) / 100;
      return {
        date: it.date, date_as_printed: it.date, narration: it.narration ?? '', reference: it.reference ?? '',
        debit: out ? it.amount : 0, credit: out ? 0 : it.amount, balance: bal,
      };
    }),
  };
}
const visionReply = (page) => jsonResponse(200, { model: 'm', choices: [{ message: { content: JSON.stringify(page) }, finish_reason: 'stop' }] });
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const reconCount = (DB) => DB.sqlite.prepare(`SELECT COUNT(*) AS n FROM bank_recon_entries`).get().n;

// Every statement read is deterministic (temperature 0), in JSON mode, and sends the photo at high detail.
function assertStatementVisionRequest(sentBody, model) {
  assert.equal(sentBody.model, model);
  assert.equal(sentBody.temperature, 0, 'the same photo must read the same way every time');
  assert.deepEqual(sentBody.response_format, { type: 'json_object' });
  const content = sentBody.messages?.[0]?.content;
  assert.ok(Array.isArray(content) && content.some(b => b.type === 'image_url' && b.image_url?.detail === 'high'));
  assert.ok(content.some(b => b.type === 'text' && /running-balance/.test(b.text) && /never guess digits/.test(b.text)));
}

function stubDeepseekForStatement(pageOrItems) {
  const page = Array.isArray(pageOrItems) ? itemsToPage(pageOrItems) : pageOrItems;
  return stubFetch((url, init) => {
    if (url === DEEPSEEK_URL) {
      const sentBody = JSON.parse(init.body);
      assertStatementVisionRequest(sentBody, 'deepseek-flash');
      assert.equal(sentBody.max_tokens, 8000);
      return visionReply(page);
    }
    throw new Error(`unexpected fetch in statement test: ${url}`);
  });
}

// bank_recon_ocr_provider='openai' routes the (only) vision call to OpenAI — no DeepSeek
// call is made at all, so no DeepSeek key is needed.
function stubOpenAiForStatement(pageOrItems) {
  const page = Array.isArray(pageOrItems) ? itemsToPage(pageOrItems) : pageOrItems;
  return stubFetch((url, init) => {
    if (url === OPENAI_URL) {
      const sentBody = JSON.parse(init.body);
      assertStatementVisionRequest(sentBody, 'gpt-6.1-sol');
      assert.equal(sentBody.max_completion_tokens, 16000);
      return visionReply(page);
    }
    throw new Error(`unexpected fetch in statement test: ${url}`);
  });
}

async function postStatement(DB, token, body) {
  const res = await onRequest({ request: req('bank-recon/statement', { method: 'POST', headers: bearer(token), body }), env: baseEnv(DB) });
  return { status: res.status, body: await readJson(res) };
}

test('POST /api/bank-recon/statement: a model that rejects temperature 0 is retried once without it', async () => {
  const DB = await freshDB();
  setOpenaiKey(DB);
  setOcrProvider(DB, 'openai');
  const items = [{ date: '2026-10-05', amount: 1000, type: 'expense', narration: 'Misc' }];
  const page = itemsToPage(items);
  const sent = [];
  const restore = stubFetch((url, init) => {
    assert.equal(url, OPENAI_URL);
    const body = JSON.parse(init.body);
    sent.push(body);
    if ('temperature' in body) {
      return jsonResponse(400, { error: { message: "Unsupported value: 'temperature' does not support 0 with this model." } });
    }
    return visionReply(page);
  });
  let res;
  try {
    res = await postStatement(DB, await tokenFor(DB, 'u1'), { imageBase64: 'b', mimeType: 'image/jpeg' });
  } finally { restore(); }
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(sent.length, 2);
  assert.equal(sent[0].temperature, 0);
  assert.ok(!('temperature' in sent[1]));
  assert.deepEqual(sent[1].response_format, { type: 'json_object' });
});

test('POST /api/bank-recon/statement: bank_recon_ocr_provider=openai routes the one vision call to OpenAI', async () => {
  const DB = await freshDB();
  setOpenaiKey(DB);
  setOcrProvider(DB, 'openai');
  const items = [{ date: '2026-10-05', amount: 1000, type: 'expense', narration: 'Misc' }];
  const restore = stubOpenAiForStatement(items);
  let res;
  try {
    res = await postStatement(DB, await tokenFor(DB, 'u1'), { imageBase64: 'base64data', mimeType: 'image/jpeg' });
  } finally { restore(); }
  assert.equal(res.status, 200, 'OpenAI path succeeds when the OpenAI key is set and the provider is selected');
  assert.deepEqual(fetchCalls.map(c => c.url), [OPENAI_URL], 'one call per photo, and no separate text-parsing call');
  assert.equal(res.body.verification, 'passed');
  const rows = DB.sqlite.prepare(`SELECT date, amount, direction FROM bank_recon_entries`).all();
  assert.deepEqual(rows.map(r => ({ ...r })), [{ date: '2026-10-05', amount: 1000, direction: 'out' }]);
});

test('POST /api/bank-recon/statement: multiple photos are read in parallel, one call each, and checked as one statement in upload order', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  const full = itemsToPage([
    { date: '2026-09-20', amount: 999, type: 'income', narration: 'Page one credit' },
    { date: '2026-09-21', amount: 120, type: 'expense', narration: 'Page one debit' },
    { date: '2026-09-22', amount: 4321, type: 'income', narration: 'Page two credit' },
    { date: '2026-09-23', amount: 700, type: 'expense', narration: 'Page two debit' },
  ]);
  // Page 2 has no opening balance of its own: its first row is proven by page 1's last balance.
  const page1 = { ...full, rows: full.rows.slice(0, 2) };
  const page2 = { ...full, opening_balance: null, rows: full.rows.slice(2) };
  let visionCallCount = 0, inFlight = 0, maxInFlight = 0;
  const restore = stubFetch(async (url, init) => {
    if (url !== DEEPSEEK_URL) throw new Error(`unexpected fetch in multi-page statement test: ${url}`);
    const sentBody = JSON.parse(init.body);
    assertStatementVisionRequest(sentBody, 'deepseek-flash');
    visionCallCount++; inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    const isPage1 = sentBody.messages[0].content.some(b => b.type === 'image_url' && b.image_url.url.endsWith('page1data'));
    // Page 1 answers LAST, so anything built in completion order would put page 2 first
    // and break the running-balance chain across the two photos.
    await new Promise(r => setTimeout(r, isPage1 ? 30 : 0));
    inFlight--;
    return visionReply(isPage1 ? page1 : page2);
  });
  let res;
  try {
    res = await postStatement(DB, await tokenFor(DB, 'u1'), {
      images: [{ imageBase64: 'page1data', mimeType: 'image/jpeg' }, { imageBase64: 'page2data', mimeType: 'image/jpeg' }],
    });
  } finally { restore(); }
  assert.equal(res.status, 200);
  assert.equal(visionCallCount, 2, 'each photo gets exactly one call');
  assert.equal(maxInFlight, 2, 'the photos are read in parallel');
  assert.equal(res.body.itemCount, 4);
  assert.equal(res.body.unverifiedCount, 0);
  assert.equal(res.body.verification, 'passed');
  const rows = DB.sqlite.prepare(`SELECT narration FROM bank_recon_entries ORDER BY date`).all();
  assert.deepEqual(rows.map(r => r.narration), ['Page one credit', 'Page one debit', 'Page two credit', 'Page two debit']);
});

test('POST /api/bank-recon/statement: a failure on any one photo fails the whole upload with diagnostics, not a partial result', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  const restore = stubFetch((url, init) => {
    if (url !== DEEPSEEK_URL) throw new Error(`unexpected fetch: ${url}`);
    const isPage2 = JSON.parse(init.body).messages[0].content.some(b => b.image_url?.url.endsWith('page2data'));
    if (isPage2) return jsonResponse(200, { model: 'deepseek-flash', choices: [{ message: { content: '' }, finish_reason: 'stop' }] });
    return visionReply(itemsToPage([{ date: '2026-10-05', amount: 100, type: 'income', narration: 'x' }]));
  });
  let res;
  try {
    res = await postStatement(DB, await tokenFor(DB, 'u1'), {
      images: [{ imageBase64: 'page1data', mimeType: 'image/jpeg' }, { imageBase64: 'page2data', mimeType: 'image/jpeg' }],
    });
  } finally { restore(); }
  assert.equal(res.status, 502);
  assert.match(res.body.error, /Could not read the statement: photo 2 of 2: DeepSeek returned no statement data/);
  assert.match(res.body.error, /"finish_reason":"stop"/, 'diagnostic detail is kept');
  assert.equal(reconCount(DB), 0, 'nothing is filed when the upload fails partway through');
});

test('POST /api/bank-recon/statement: a ```json-fenced reply is still read; a reply in the wrong shape fails with diagnostics', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  const admin = await tokenFor(DB, 'u1');
  const page = itemsToPage([{ date: '2026-10-05', amount: 2500, type: 'income', narration: 'Fenced' }]);
  let restore = stubFetch(() => jsonResponse(200, { choices: [{ message: { content: '```json\n' + JSON.stringify(page) + '\n```' }, finish_reason: 'stop' }] }));
  let res;
  try { res = await postStatement(DB, admin, { imageBase64: 'x', mimeType: 'image/jpeg' }); } finally { restore(); }
  assert.equal(res.status, 200);
  assert.equal(reconCount(DB), 1);

  restore = stubFetch(() => jsonResponse(200, { model: 'deepseek-flash', choices: [{ message: { content: 'Sorry, I cannot read this.' }, finish_reason: 'stop' }] }));
  try { res = await postStatement(DB, admin, { imageBase64: 'x', mimeType: 'image/jpeg' }); } finally { restore(); }
  assert.equal(res.status, 502);
  assert.match(res.body.error, /unexpected format.*"model":"deepseek-flash".*Sorry, I cannot read this/);
  assert.equal(reconCount(DB), 1, 'nothing more filed');
});

test('POST /api/bank-recon/statement: a reply cut off for length fails clearly ("take it in two halves") and files nothing', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  const restore = stubFetch(() => jsonResponse(200, { choices: [{ message: { content: '{"rows":[{"date":"2026-' }, finish_reason: 'length' }] }));
  let res;
  try {
    res = await postStatement(DB, await tokenFor(DB, 'u1'), { imageBase64: 'x', mimeType: 'image/jpeg' });
  } finally { restore(); }
  assert.equal(res.status, 422);
  assert.match(res.body.error, /too many rows to read in one go — take it in two halves/);
  assert.equal(reconCount(DB), 0);
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
  assert.deepEqual(body, { itemCount: 2, autoCount: 2, chargeCount: 1, needsAttentionCount: 0, unrecordedCount: 0, duplicateCount: 0,
    unverifiedCount: 0, unverifiedRows: [], verification: 'passed' });

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
  assert.deepEqual(second.body, { itemCount: 3, autoCount: 0, chargeCount: 0, needsAttentionCount: 0, unrecordedCount: 0, duplicateCount: 3,
    unverifiedCount: 0, unverifiedRows: [], verification: 'passed' });
  assert.equal(reconCount(DB), 3, 'no new rows on re-upload');
  assert.equal(DB.sqlite.prepare(`SELECT COUNT(*) AS n FROM expenses WHERE category='bank'`).get().n, 1, 'charge not re-filed');
});

test('POST /api/bank-recon/statement: a re-read with different AI narration wording is still a duplicate, and AI notes are stripped', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  const admin = await tokenFor(DB, 'u1');
  const first = await uploadStatement(DB, admin, [{ date: '2026-09-26', amount: 115, type: 'income', narration: 'Bulk Credit - 291212 - 151824 [truncated]' }]);
  assert.equal(first.body.duplicateCount, 0);
  const second = await uploadStatement(DB, admin, [{ date: '2026-09-26', amount: 115, type: 'income', narration: 'Bulk Credit - 291212 - 151824[cut off]' }]);
  assert.equal(second.body.duplicateCount, 1);
  assert.equal(reconCount(DB), 1);
  assert.equal(DB.sqlite.prepare(`SELECT narration FROM bank_recon_entries`).get().narration, 'Bulk Credit - 291212 - 151824');
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

test('POST /api/bank-recon/statement: a photo with no readable transactions is a 422 error, not an empty success', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  const admin = await tokenFor(DB, 'u1');
  const res = await uploadStatement(DB, admin, []);
  assert.equal(res.status, 422);
  assert.match(res.body.error, /No transactions could be read/);
  assert.equal(reconCount(DB), 0);
});

// ── Running-balance verification at the endpoint ───────────────────────────
test('POST /api/bank-recon/statement: a line that doesn\'t add up with the running balance is NOT filed and comes back in unverifiedRows', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  const page = itemsToPage([
    { date: '2026-09-20', amount: 5000, type: 'income', narration: 'Transfer from Bro. A' },
    { date: '2026-09-21', amount: 3000, type: 'expense', narration: 'Diesel' },
    { date: '2026-09-22', amount: 2000, type: 'income', narration: 'Transfer from Sis. B' },
  ]);
  page.rows[1].debit = 8000; // misread: the printed balances say 3,000 left the account
  const res = await uploadStatement(DB, await tokenFor(DB, 'u1'), page);
  assert.equal(res.status, 200);
  assert.equal(res.body.verification, 'partial');
  assert.equal(res.body.itemCount, 2, 'only the two proven lines go on to matching');
  assert.equal(res.body.unverifiedCount, 1);
  assert.equal(res.body.unverifiedRows.length, 1);
  const u = res.body.unverifiedRows[0];
  assert.deepEqual({ date: u.date, amount: u.amount, direction: u.direction, narration: u.narration },
    { date: '2026-09-21', amount: 8000, direction: 'out', narration: 'Diesel' });
  assert.match(u.reason, /doesn't add up with the running balance/);
  const rows = DB.sqlite.prepare(`SELECT amount, narration FROM bank_recon_entries ORDER BY date`).all();
  assert.deepEqual(rows.map(r => r.narration), ['Transfer from Bro. A', 'Transfer from Sis. B']);
  assert.ok(!rows.some(r => r.amount === 8000 || r.amount === 3000), 'the unproven line was not filed at any amount');
});

test('POST /api/bank-recon/statement: when lines are read but none can be proven, it is a 422 listing them, and nothing is filed', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  const page = itemsToPage([
    { date: '2026-09-20', amount: 5000, type: 'income', narration: 'First' },
    { date: '2026-09-21', amount: 3000, type: 'expense', narration: 'Second' },
  ]);
  page.rows[0].credit = 6000;
  page.rows[1].debit = 2000;
  const res = await uploadStatement(DB, await tokenFor(DB, 'u1'), page);
  assert.equal(res.status, 422);
  assert.match(res.body.error, /None of the 2 lines read could be double-checked, so nothing was added/);
  assert.match(res.body.error, /2026-09-20 · ₦6,000 in · "First" — doesn't add up/);
  assert.equal(res.body.unverifiedRows.length, 2);
  assert.equal(reconCount(DB), 0);
});

test('POST /api/bank-recon/statement: a statement with no running-balance column is filed as before but reported as "unavailable"', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  const page = itemsToPage([
    { date: '2026-09-20', amount: 5000, type: 'income', narration: 'In' },
    { date: '2026-09-21', amount: 3000, type: 'expense', narration: 'Out' },
  ]);
  page.opening_balance = null;
  for (const r of page.rows) r.balance = null;
  page.rows.push({ date: '2026-09-22', date_as_printed: '22 Sep', narration: 'Both columns', reference: '', debit: 100, credit: 100, balance: null });
  const res = await uploadStatement(DB, await tokenFor(DB, 'u1'), page);
  assert.equal(res.status, 200);
  assert.equal(res.body.verification, 'unavailable');
  assert.equal(res.body.itemCount, 2);
  assert.equal(res.body.unverifiedCount, 1, 'a line with both a debit and a credit is still rejected');
  assert.match(res.body.unverifiedRows[0].reason, /both a money-in and a money-out/);
  assert.equal(reconCount(DB), 2);
});

test('POST /api/bank-recon/statement: a missing year comes from the statement period; a line with no readable date is not filed', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  const page = itemsToPage([
    { date: null, amount: 5000, type: 'income', narration: 'No year printed' },
    { date: null, amount: 3000, type: 'expense', narration: 'No date at all' },
    { date: '2026-13-45', amount: 1000, type: 'income', narration: 'Bad ISO, good print' },
  ]);
  page.period_start = '2025-12-15';
  page.period_end = '2026-01-14';
  page.rows[0].date_as_printed = '28 Dec';      // inside the period -> 2025, not 2026
  page.rows[1].date_as_printed = '';
  page.rows[2].date_as_printed = '03/01';        // day-first -> 3 Jan, inside the period -> 2026
  const res = await uploadStatement(DB, await tokenFor(DB, 'u1'), page);
  assert.equal(res.status, 200);
  assert.equal(res.body.unverifiedCount, 1);
  assert.equal(res.body.unverifiedRows[0].narration, 'No date at all');
  assert.equal(res.body.unverifiedRows[0].reason, 'date couldn\'t be read');
  const rows = DB.sqlite.prepare(`SELECT date, narration FROM bank_recon_entries ORDER BY date`).all();
  assert.deepEqual(rows.map(r => [r.date, r.narration]), [['2025-12-28', 'No year printed'], ['2026-01-03', 'Bad ISO, good print']]);
});

test('POST /api/bank-recon/statement: rows repeated where two photos overlap are filed once (counted as duplicates)', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  const full = itemsToPage([
    { date: '2026-09-20', amount: 999, type: 'income', narration: 'A' },
    { date: '2026-09-21', amount: 120, type: 'expense', narration: 'B' },
    { date: '2026-09-22', amount: 4321, type: 'income', narration: 'C' },
    { date: '2026-09-23', amount: 700, type: 'expense', narration: 'D' },
  ]);
  const top = { ...full, rows: full.rows.slice(0, 3) };
  const bottom = { ...full, opening_balance: null, rows: full.rows.slice(1).map(r => ({ ...r, narration: r.narration + ' (re-read)' })) };
  const restore = stubFetch((url, init) => {
    const isTop = JSON.parse(init.body).messages[0].content.some(b => b.image_url?.url.endsWith('top'));
    return visionReply(isTop ? top : bottom);
  });
  let res;
  try {
    res = await postStatement(DB, await tokenFor(DB, 'u1'), { images: [{ imageBase64: 'top' }, { imageBase64: 'bottom' }] });
  } finally { restore(); }
  assert.equal(res.status, 200);
  assert.equal(res.body.verification, 'passed');
  assert.equal(res.body.itemCount, 6);
  assert.equal(res.body.duplicateCount, 2, 'B and C appear on both photos');
  const rows = DB.sqlite.prepare(`SELECT narration FROM bank_recon_entries ORDER BY date`).all();
  assert.deepEqual(rows.map(r => r.narration), ['A', 'B', 'C', 'D (re-read)']);
});

// parseStatementWithAI is no longer part of the bank-recon upload, but still serves the
// KPSC portal's paste-a-statement route — its own cut-off check must keep working there.
test('kpsc-parse-statement (parseStatementWithAI): a reply cut off for length is reported clearly', async () => {
  const DB = await freshDB();
  setDeepseekKey(DB);
  DB.sqlite.prepare(`INSERT INTO kpsc_accounts (id,name,role,pin,status) VALUES ('k1','Treasurer','treasurer','x','active')`).run();
  DB.sqlite.prepare(`INSERT INTO kpsc_sessions (id,account_id,expires_at) VALUES ('tok','k1',?)`).run(Date.now() + 3600000);
  const restore = stubFetch((url, init) => {
    assert.equal(url, DEEPSEEK_URL);
    assert.equal(JSON.parse(init.body).max_tokens, 8000);
    return jsonResponse(200, { choices: [{ message: { content: '[{"date":"2026-' }, finish_reason: 'length' }] });
  });
  let res, body;
  try {
    res = await onRequest({
      request: req('kpsc-parse-statement', { method: 'POST', headers: { 'X-KPSC-Session': JSON.stringify({ accountId: 'k1', token: 'tok' }) }, body: { statementText: 'some rows' } }),
      env: baseEnv(DB),
    });
    body = await readJson(res);
  } finally { restore(); }
  assert.ok(res.status >= 400);
  assert.match(body.error, /too many lines/);
});
