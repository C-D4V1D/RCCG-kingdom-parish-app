// A real in-memory SQLite database wearing the Cloudflare D1 binding's API
// (prepare/bind/first/all/run/batch), so API tests exercise the actual SQL —
// missing columns, WHERE clauses, UPDATE effects — instead of a hand-written fake.
// Lives outside *.test.js so importing it never re-runs another file's tests.
import { DatabaseSync } from 'node:sqlite';

function normalize(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

export function createSqliteD1() {
  const db = new DatabaseSync(':memory:');
  const makeStmt = (sql) => {
    let args = [];
    const stmt = {
      bind(...a) { args = a.map(normalize); return stmt; },
      async first(col) {
        const row = db.prepare(sql).get(...args);
        if (!row) return null;
        const plain = { ...row };
        return col ? plain[col] : plain;
      },
      async all() {
        return { results: db.prepare(sql).all(...args).map(r => ({ ...r })), success: true };
      },
      async run() {
        const info = db.prepare(sql).run(...args);
        return { success: true, meta: { changes: Number(info.changes) } };
      },
    };
    return stmt;
  };
  return {
    sqlite: db,
    prepare: makeStmt,
    async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
    async exec(sql) { db.exec(sql); return { success: true }; },
  };
}

export const TEST_SESSION_HEADER = JSON.stringify({ accountId: 'ka-test', token: 'ks-test-token' });

// Seeds a signed-in KPSC account with the given role, and returns the request helper.
export function seedKpscSession(DB, { role = 'treasurer', name = 'Treasurer' } = {}) {
  DB.sqlite.prepare(`DELETE FROM kpsc_sessions`).run();
  DB.sqlite.prepare(`DELETE FROM kpsc_accounts`).run();
  DB.sqlite.prepare(`INSERT INTO kpsc_accounts (id, name, role, pin, status) VALUES ('ka-test', ?, ?, '', 'active')`).run(name, role);
  DB.sqlite.prepare(`INSERT INTO kpsc_sessions (id, account_id, expires_at) VALUES ('ks-test-token', 'ka-test', ?)`).run(Date.now() + 3600_000);
}

export function kpscRequest(path, method = 'GET', body) {
  const init = { method, headers: { 'Content-Type': 'application/json', 'X-KPSC-Session': TEST_SESSION_HEADER } };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(`https://x/api/${path}`, init);
}
