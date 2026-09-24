import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';
import { createSqliteD1, seedKpscSession, kpscRequest } from './sqlite-d1.mjs';

// Regression test for a production incident: /api/init (which adds confirmed_by,
// confirmed_at, deposited_by, deposited_at to kpsc_finance_entries) only runs on a
// fresh sign-in. A session already signed in when the income-review feature deployed
// never called it, so on that live database every query naming those columns threw
// "no such column" — hiding the Awaiting Confirmation card and breaking edits to ANY
// finance entry. ensureKpscConfirmColumns now adds them on first use.
//
// Runs as its own test-runner process so the real code's once-per-isolate "already
// ensured" cache starts fresh, letting this exercise the very first call.

test('editing an entry on a database that never ran the migration adds the columns instead of failing', async () => {
  const DB = createSqliteD1();
  DB.sqlite.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE kpsc_accounts (id TEXT PRIMARY KEY, name TEXT, role TEXT, pin TEXT, status TEXT);
    CREATE TABLE kpsc_sessions (id TEXT PRIMARY KEY, account_id TEXT, expires_at INTEGER);
    CREATE TABLE kpsc_finance_entries (
      id TEXT PRIMARY KEY, date TEXT, entry_type TEXT, category TEXT, sub_category TEXT DEFAULT '',
      amount REAL, payment_method TEXT, reference TEXT DEFAULT '', narration TEXT DEFAULT '',
      partner_id TEXT DEFAULT '', recorded_by TEXT DEFAULT '', approved_by TEXT DEFAULT '',
      approval_status TEXT DEFAULT 'recorded', attachment_name TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')), deleted_at TEXT DEFAULT '', deleted_by TEXT DEFAULT '',
      partner_payment_id TEXT DEFAULT '', handover_id TEXT DEFAULT '', cash_holder TEXT DEFAULT '',
      cash_box_expense INTEGER DEFAULT 0
    );
    INSERT INTO kpsc_finance_entries (id, date, entry_type, category, amount, payment_method, recorded_by)
      VALUES ('kfe1', '2026-09-01', 'income', 'partnership_payment', 5000, 'cash', 'Alice');
  `);
  seedKpscSession(DB, { role: 'treasurer', name: 'Treasurer' });

  const res = await onRequest({ request: kpscRequest('kpsc-finance/kfe1', 'PUT', { amount: 5500 }), env: { DB } });
  const json = JSON.parse(await res.text());

  assert.equal(res.status, 200, `expected a successful edit, got: ${JSON.stringify(json)}`);
  assert.equal(json.amount, 5500);
  const cols = DB.sqlite.prepare(`SELECT name FROM pragma_table_info('kpsc_finance_entries')`).all().map(r => r.name);
  for (const c of ['confirmed_by', 'confirmed_at', 'deposited_by', 'deposited_at']) assert.ok(cols.includes(c), `${c} added`);
});
