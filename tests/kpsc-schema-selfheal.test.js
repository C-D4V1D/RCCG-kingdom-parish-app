import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';

// Regression test for a real production incident: /api/init (which runs the full
// migration list, including the ALTER TABLE statements that add confirmed_by,
// confirmed_at, deposited_by, deposited_at to kpsc_finance_entries) is only ever
// called on a fresh sign-in. A browser/PWA session already signed in when the
// income-review feature deployed never calls it again, so on a live database that
// hadn't run that migration yet, every query referencing those columns by name threw
// "no such column" — silently hiding the new card, and (worse) breaking editing of
// ANY existing finance entry via updateKpscFinanceEntry's UPDATE statement. The fix
// is a self-healing ALTER TABLE attempt (ensureKpscConfirmColumns) at the top of
// every function that references these columns explicitly, isolate-lifetime cached.
//
// This file runs as its own test-runner process (separate from
// kpsc-income-review.test.js), so the module-level "already ensured" cache the real
// code keeps starts fresh here — letting this test actually exercise the first-ever
// call into a database that has never seen these columns.

const SESSION_HEADER = JSON.stringify({ accountId: 'ka-test', token: 'ks-test-token' });

function createKpscRequest(url, method = 'GET', body) {
  const init = { method, headers: { 'Content-Type': 'application/json', 'X-KPSC-Session': SESSION_HEADER } };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(url, init);
}

async function readJson(response) {
  return JSON.parse(await response.text());
}

// Simulates a live D1 table that predates the confirmed_by/confirmed_at/deposited_by/
// deposited_at columns: any SQL text naming one of those columns throws "no such
// column" (the real SQLite/D1 error shape) until the matching ALTER TABLE has run.
function createPreMigrationDBMock({ financeEntries = [] }) {
  const knownMissingCols = new Set(['confirmed_by', 'confirmed_at', 'deposited_by', 'deposited_at']);
  const referencesMissingColumn = sql => [...knownMissingCols].some(c => sql.includes(c));

  return {
    prepare(sql) {
      const st = {
        _bound: [],
        bind(...a) { st._bound = a; return st; },
        async first() {
          if (/SELECT account_id, expires_at FROM kpsc_sessions/.test(sql)) {
            return { account_id: 'ka-test', expires_at: Date.now() + 3600_000 };
          }
          if (/SELECT id, name, role, status FROM kpsc_accounts/.test(sql)) {
            return { id: 'ka-test', name: 'Treasurer', role: 'treasurer', status: 'active' };
          }
          if (sql.includes('SELECT * FROM kpsc_finance_entries WHERE id=')) {
            const [id] = st._bound;
            const row = financeEntries.find(e => e.id === id);
            if (!row) return null;
            const out = { ...row };
            for (const c of knownMissingCols) if (!(c in out) || out[c] === undefined) delete out[c];
            return out;
          }
          throw new Error(`Unhandled .first() SQL: ${sql}`);
        },
        async all() {
          if (referencesMissingColumn(sql)) throw new Error(`no such column: confirmed_by`);
          throw new Error(`Unhandled .all() SQL: ${sql}`);
        },
        async run() {
          const m = sql.match(/ALTER TABLE kpsc_finance_entries ADD COLUMN (\w+)/);
          if (m) {
            if (knownMissingCols.has(m[1])) knownMissingCols.delete(m[1]);
            else throw new Error('duplicate column name: ' + m[1]);
            return { meta: { changes: 0 } };
          }
          if (referencesMissingColumn(sql)) throw new Error(`no such column: confirmed_by`);
          if (sql.includes('SET date=?')) {
            const id = st._bound[st._bound.length - 1];
            const row = financeEntries.find(e => e.id === id);
            if (row) Object.assign(row, { confirmed_by: '', confirmed_at: '', deposited_by: '', deposited_at: '' });
            return { meta: { changes: 1 } };
          }
          throw new Error(`Unhandled .run() SQL: ${sql}`);
        },
      };
      return st;
    },
  };
}

test('editing an existing entry self-heals a database that never ran the confirm-columns migration, instead of throwing', async () => {
  const financeEntries = [{
    id: 'kfe1', date: '2026-09-01', entry_type: 'income', category: 'partnership_payment',
    amount: 5000, payment_method: 'cash', partner_id: '', recorded_by: 'Alice',
  }];
  const DB = createPreMigrationDBMock({ financeEntries });

  const res = await onRequest({
    request: createKpscRequest('https://x/api/kpsc-finance/kfe1', 'PUT', { amount: 5500 }),
    env: { DB },
  });
  const json = await readJson(res);

  assert.equal(res.status, 200, `expected a successful edit, got: ${JSON.stringify(json)}`);
});
