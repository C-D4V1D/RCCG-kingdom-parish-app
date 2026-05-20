import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';

// ── Helpers ────────────────────────────────────────────────────────────────

async function readJson(response) {
  return JSON.parse(await response.text());
}

function createRequest(url, method = 'GET', body, extraHeaders = {}) {
  const init = {
    method,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.11', 'CF-Ray': 'test-ray-auth', ...extraHeaders },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(url, init);
}

function createDBMock({ onPrepare }) {
  return { prepare(sql) { return onPrepare(sql); } };
}

// DB mock that validates a finance session token and returns a user with the given role
function makeFinanceDB(opts = {}) {
  const {
    role = 'it_admin',
    sessionValid = true,
    returnNullUser = false,
  } = opts;
  return createDBMock({
    onPrepare(sql) {
      const st = {
        _bound: [], bind(...a) { st._bound = a; return st; },
        async first() {
          if (/SELECT user_id, expires_at FROM finance_sessions/.test(sql)) {
            if (!sessionValid) return null;
            return { user_id: 'u-auth-test', expires_at: Date.now() + 3600_000 };
          }
          if (/SELECT id, name, role, email FROM users WHERE id=\?/.test(sql)) {
            if (returnNullUser) return null;
            return { id: 'u-auth-test', name: 'Auth Tester', role, email: '' };
          }
          // login_attempts
          if (/SELECT count, first_at, locked_until FROM login_attempts/.test(sql)) return null;
          if (/SELECT id,name,role,email,pin FROM users WHERE id=\?/.test(sql)) {
            return null;
          }
          return null;
        },
        async all() { return { results: [] }; },
        async run() { return { success: true }; },
      };
      return st;
    }
  });
}

// ── Auth: session token creation and validation ────────────────────────────

test('finance login returns sessionToken and public user fields', async () => {
  const runs = [];
  const crypto = await import('node:crypto');
  const pin = '1234';
  const hash = crypto.createHash('sha256').update(pin).digest('hex');

  const DB = createDBMock({
    onPrepare(sql) {
      const st = {
        _bound: [], bind(...a) { st._bound = a; return st; },
        async first() {
          if (/SELECT count, first_at, locked_until FROM login_attempts/.test(sql)) return null;
          if (/SELECT id,name,role,email,pin FROM users WHERE id=\? AND role=\?/.test(sql)) {
            return { id: 'u1', name: 'Ade Koko', role: 'accountant', email: '', pin: `sha256$${hash}` };
          }
          return null;
        },
        async run() { runs.push(sql); return { success: true }; },
      };
      return st;
    }
  });

  const response = await onRequest({
    request: createRequest('https://example.com/api/auth/login', 'POST', {
      role: 'accountant', pin, userId: 'u1',
    }),
    env: { DB }
  });
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.id, 'u1');
  assert.equal(body.role, 'accountant');
  assert.ok(body.sessionToken, 'should include a session token');
  assert.equal(body.pin, undefined, 'should not expose PIN');

  const sessionInsert = runs.find(s => /INSERT INTO finance_sessions/.test(s));
  assert.ok(sessionInsert, 'should create a finance session row');
});

test('finance login with wrong PIN returns 401', async () => {
  const DB = createDBMock({
    onPrepare(sql) {
      const st = {
        _bound: [], bind(...a) { st._bound = a; return st; },
        async first() {
          if (/SELECT count, first_at, locked_until FROM login_attempts/.test(sql)) return null;
          if (/SELECT id,name,role,email,pin FROM users WHERE id=\? AND role=\?/.test(sql)) {
            return { id: 'u1', name: 'Ade Koko', role: 'accountant', email: '', pin: 'sha256$aaabbbccc' };
          }
          return null;
        },
        async run() { return { success: true }; },
      };
      return st;
    }
  });

  const response = await onRequest({
    request: createRequest('https://example.com/api/auth/login', 'POST', {
      role: 'accountant', pin: '0000', userId: 'u1',
    }),
    env: { DB }
  });
  const body = await readJson(response);
  assert.equal(response.status, 401);
  assert.match(body.error, /Invalid credentials/i);
});

test('protected finance endpoint without session returns 401', async () => {
  const DB = createDBMock({
    onPrepare() {
      return {
        bind() { return this; },
        async first() { return null; },
        async run() { return { success: true }; },
      };
    }
  });

  // Request /api/income with no X-Finance-Session header
  const response = await onRequest({
    request: createRequest('https://example.com/api/income', 'GET'),
    env: { DB }
  });
  assert.equal(response.status, 401);
});

test('protected finance endpoint with expired/invalid session returns 401', async () => {
  const DB = createDBMock({
    onPrepare(sql) {
      const st = {
        _bound: [], bind(...a) { st._bound = a; return st; },
        async first() {
          // Session lookup returns null → not found
          if (/SELECT user_id, expires_at FROM finance_sessions/.test(sql)) return null;
          return null;
        },
        async run() { return { success: true }; },
      };
      return st;
    }
  });

  const response = await onRequest({
    request: createRequest('https://example.com/api/income', 'GET', undefined, {
      'X-Finance-Session': 'invalid-token',
    }),
    env: { DB }
  });
  assert.equal(response.status, 401);
});

test('protected finance endpoint with wrong role returns 403', async () => {
  // viewer role cannot access income POST
  const DB = makeFinanceDB({ role: 'viewer' });
  const response = await onRequest({
    request: createRequest('https://example.com/api/income', 'POST', {
      date: '2026-01-01', totalCollection: 100000,
    }, { 'X-Finance-Session': 'fs-test' }),
    env: { DB }
  });
  assert.equal(response.status, 403);
});

test('admin finance endpoint with non-admin role returns 403', async () => {
  // accountant cannot hit admin/clear
  const DB = makeFinanceDB({ role: 'accountant' });
  const response = await onRequest({
    request: createRequest('https://example.com/api/admin/clear', 'POST', {}, {
      'X-Finance-Session': 'fs-test',
    }),
    env: { DB }
  });
  assert.equal(response.status, 403);
});

test('admin finance endpoint allows it_admin', async () => {
  const DB = createDBMock({
    onPrepare(sql) {
      const st = {
        _bound: [], bind(...a) { st._bound = a; return st; },
        async first() {
          if (/SELECT user_id, expires_at FROM finance_sessions/.test(sql)) {
            return { user_id: 'u-admin', expires_at: Date.now() + 3600_000 };
          }
          if (/SELECT id, name, role, email FROM users WHERE id=\?/.test(sql)) {
            return { id: 'u-admin', name: 'IT Admin', role: 'it_admin', email: '' };
          }
          return null;
        },
        async all() { return { results: [] }; },
        async run() { return { success: true }; },
      };
      return st;
    }
  });

  const response = await onRequest({
    request: createRequest('https://example.com/api/admin/clear-data', 'POST', {}, {
      'X-Finance-Session': 'fs-admin-token',
    }),
    env: { DB }
  });
  assert.equal(response.status, 200);
});

// ── Rate limiting ──────────────────────────────────────────────────────────

test('login returns 429 after exceeding failed-attempt threshold', async () => {
  const now = Date.now();
  const DB = createDBMock({
    onPrepare(sql) {
      const st = {
        _bound: [], bind(...a) { st._bound = a; return st; },
        async first() {
          if (/SELECT count, first_at, locked_until FROM login_attempts/.test(sql)) {
            // Simulate locked-out state
            return { count: 10, first_at: now - 1000, locked_until: now + 60_000 };
          }
          return null;
        },
        async run() { return { success: true }; },
      };
      return st;
    }
  });

  const response = await onRequest({
    request: createRequest('https://example.com/api/auth/login', 'POST', {
      role: 'accountant', pin: '1234', userId: 'u1',
    }),
    env: { DB }
  });
  assert.equal(response.status, 429);
  assert.ok(response.headers.get('Retry-After'), 'should include Retry-After header');
});

// ── Finance logout ─────────────────────────────────────────────────────────

test('finance logout deletes the session token', async () => {
  const runs = [];
  const DB = createDBMock({
    onPrepare(sql) {
      const st = {
        _bound: [], bind(...a) { st._bound = a; return st; },
        async run() { runs.push({ sql, bound: st._bound }); return { success: true }; },
      };
      return st;
    }
  });

  const response = await onRequest({
    request: createRequest('https://example.com/api/auth/logout', 'POST', {
      sessionToken: 'fs-logout-token',
    }),
    env: { DB }
  });
  const body = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  const deleteRun = runs.find(r => /DELETE FROM finance_sessions/.test(r.sql));
  assert.ok(deleteRun, 'should DELETE the finance session');
  assert.equal(deleteRun.bound[0], 'fs-logout-token');
});

// ── Business rules: income split validation ────────────────────────────────

test('createIncome rejects split where bank+petty exceeds totalCollection', async () => {
  const DB = makeFinanceDB({ role: 'accountant' });

  const response = await onRequest({
    request: createRequest('https://example.com/api/income', 'POST', {
      date: '2026-01-05',
      source: 'sunday_collection',
      totalCollection: 100000,
      bankTransferAmount: 80000,
      directPettyCash: 50000,   // 80000 + 50000 > 100000 → invalid
    }, { 'X-Finance-Session': 'fs-test' }),
    env: { DB }
  });
  assert.equal(response.status, 422);
  const body = await readJson(response);
  assert.match(body.error, /split invalid/i);
});

test('createIncome accepts valid split (bank + petty ≤ total)', async () => {
  const runs = [];
  const DB = createDBMock({
    onPrepare(sql) {
      const st = {
        _bound: [], bind(...a) { st._bound = a; return st; },
        async first() {
          if (/SELECT user_id, expires_at FROM finance_sessions/.test(sql)) {
            return { user_id: 'u-test', expires_at: Date.now() + 3600_000 };
          }
          if (/SELECT id, name, role, email FROM users WHERE id=\?/.test(sql)) {
            return { id: 'u-test', name: 'Accountant', role: 'accountant', email: '' };
          }
          return null;
        },
        async all() { return { results: [] }; },
        async run() { runs.push(sql); return { success: true }; },
      };
      return st;
    }
  });

  const response = await onRequest({
    request: createRequest('https://example.com/api/income', 'POST', {
      date: '2026-01-05',
      source: 'sunday_collection',
      totalCollection: 100000,
      bankTransferAmount: 60000,
      directPettyCash: 20000,  // 60000 + 20000 = 80000 ≤ 100000 → valid
    }, { 'X-Finance-Session': 'fs-test' }),
    env: { DB }
  });
  assert.equal(response.status, 200);
});

// ── Business rules: petty cash state machine ──────────────────────────────

test('petty cash status change from unknown → approved is rejected', async () => {
  const DB = createDBMock({
    onPrepare(sql) {
      const st = {
        _bound: [], bind(...a) { st._bound = a; return st; },
        async first() {
          if (/SELECT user_id, expires_at FROM finance_sessions/.test(sql)) {
            return { user_id: 'u-test', expires_at: Date.now() + 3600_000 };
          }
          if (/SELECT id, name, role, email FROM users WHERE id=\?/.test(sql)) {
            return { id: 'u-test', name: 'Accountant', role: 'accountant', email: '' };
          }
          if (/SELECT status FROM petty_cash WHERE id=\?/.test(sql)) {
            return { status: 'settled' };  // invalid transition to approved from settled
          }
          return null;
        },
        async run() { return { success: true }; },
      };
      return st;
    }
  });

  const response = await onRequest({
    request: createRequest('https://example.com/api/petty/pc-1', 'PUT', {
      status: 'approved',
      approvedBy: 'Admin',
      approvedAt: '2026-01-05T10:00:00Z',
    }, { 'X-Finance-Session': 'fs-test' }),
    env: { DB }
  });
  assert.equal(response.status, 422);
  const body = await readJson(response);
  assert.match(body.error, /transition.*not permitted/i);
});

test('petty cash valid transition pending_approval → approved requires approvedBy', async () => {
  const DB = createDBMock({
    onPrepare(sql) {
      const st = {
        _bound: [], bind(...a) { st._bound = a; return st; },
        async first() {
          if (/SELECT user_id, expires_at FROM finance_sessions/.test(sql)) {
            return { user_id: 'u-test', expires_at: Date.now() + 3600_000 };
          }
          if (/SELECT id, name, role, email FROM users WHERE id=\?/.test(sql)) {
            return { id: 'u-test', name: 'Accountant', role: 'accountant', email: '' };
          }
          if (/SELECT status FROM petty_cash WHERE id=\?/.test(sql)) {
            return { status: 'pending_approval' };
          }
          return null;
        },
        async run() { return { success: true }; },
      };
      return st;
    }
  });

  // Missing approvedBy + approvedAt → 422
  const response = await onRequest({
    request: createRequest('https://example.com/api/petty/pc-1', 'PUT', {
      status: 'approved',
    }, { 'X-Finance-Session': 'fs-test' }),
    env: { DB }
  });
  assert.equal(response.status, 422);
  const body = await readJson(response);
  assert.match(body.error, /approvedBy and approvedAt/i);
});

test('petty cash valid transition with required fields succeeds', async () => {
  const DB = createDBMock({
    onPrepare(sql) {
      const st = {
        _bound: [], bind(...a) { st._bound = a; return st; },
        async first() {
          if (/SELECT user_id, expires_at FROM finance_sessions/.test(sql)) {
            return { user_id: 'u-test', expires_at: Date.now() + 3600_000 };
          }
          if (/SELECT id, name, role, email FROM users WHERE id=\?/.test(sql)) {
            return { id: 'u-test', name: 'Accountant', role: 'accountant', email: '' };
          }
          if (/SELECT status FROM petty_cash WHERE id=\?/.test(sql)) {
            return { status: 'pending_approval' };
          }
          // updatePettyEntry SELECT *
          if (/SELECT \* FROM petty_cash WHERE id=\?/.test(sql)) {
            return {
              id: 'pc-1', type: 'disbursement', amount: 5000, purpose: 'Stationery',
              status: 'pending_approval', requested_by: 'Sister X', date_needed: '2026-01-01',
            };
          }
          return null;
        },
        async run() { return { success: true }; },
      };
      return st;
    }
  });

  const response = await onRequest({
    request: createRequest('https://example.com/api/petty/pc-1', 'PUT', {
      status: 'approved',
      approvedBy: 'Pastor James',
      approvedAt: '2026-01-05T10:00:00Z',
    }, { 'X-Finance-Session': 'fs-test' }),
    env: { DB }
  });
  assert.equal(response.status, 200);
});

// ── Business rules: remittance approval role ──────────────────────────────

test('remittance status change to approved rejected for accountant role', async () => {
  const DB = createDBMock({
    onPrepare(sql) {
      const st = {
        _bound: [], bind(...a) { st._bound = a; return st; },
        async first() {
          if (/SELECT user_id, expires_at FROM finance_sessions/.test(sql)) {
            return { user_id: 'u-test', expires_at: Date.now() + 3600_000 };
          }
          if (/SELECT id, name, role, email FROM users WHERE id=\?/.test(sql)) {
            return { id: 'u-test', name: 'Accountant', role: 'accountant', email: '' };
          }
          if (/SELECT \* FROM remittances WHERE id=\?/.test(sql)) {
            return { id: 'r-1', status: 'pending_approval', amount: 50000, notes: '' };
          }
          return null;
        },
        async run() { return { success: true }; },
      };
      return st;
    }
  });

  const response = await onRequest({
    request: createRequest('https://example.com/api/remittances/r-1', 'PUT', {
      status: 'approved',
    }, { 'X-Finance-Session': 'fs-test' }),
    env: { DB }
  });
  assert.equal(response.status, 403);
  const body = await readJson(response);
  assert.match(body.error, /cannot approve/i);
});

test('remittance status change to approved allowed for signatory role', async () => {
  const DB = createDBMock({
    onPrepare(sql) {
      const st = {
        _bound: [], bind(...a) { st._bound = a; return st; },
        async first() {
          if (/SELECT user_id, expires_at FROM finance_sessions/.test(sql)) {
            return { user_id: 'u-sig', expires_at: Date.now() + 3600_000 };
          }
          if (/SELECT id, name, role, email FROM users WHERE id=\?/.test(sql)) {
            return { id: 'u-sig', name: 'Elder Kojo', role: 'signatory', email: '' };
          }
          if (/SELECT \* FROM remittances WHERE id=\?/.test(sql)) {
            return { id: 'r-1', status: 'pending_approval', amount: 50000, notes: '' };
          }
          return null;
        },
        async run() { return { success: true }; },
      };
      return st;
    }
  });

  const response = await onRequest({
    request: createRequest('https://example.com/api/remittances/r-1', 'PUT', {
      status: 'approved',
      approvedBy: 'Elder Kojo',
      approvedAt: '2026-01-05T10:00:00Z',
    }, { 'X-Finance-Session': 'fs-test' }),
    env: { DB }
  });
  assert.equal(response.status, 200);
});

// ── KPSC read endpoints now require KPSC session ──────────────────────────

test('GET /api/kpsc-accounts without session returns 401', async () => {
  const DB = createDBMock({ onPrepare: () => ({
    bind() { return this; },
    async first() { return null; },
    async all() { return { results: [] }; },
    async run() { return { success: true }; },
  }) });

  const response = await onRequest({
    request: new Request('https://example.com/api/kpsc-accounts', { method: 'GET' }),
    env: { DB }
  });
  assert.equal(response.status, 401);
});

test('GET /api/kpsc-dashboard without session returns 401', async () => {
  const DB = createDBMock({ onPrepare: () => ({
    bind() { return this; },
    async first() { return null; },
    async all() { return { results: [] }; },
    async run() { return { success: true }; },
  }) });

  const response = await onRequest({
    request: new Request('https://example.com/api/kpsc-dashboard', { method: 'GET' }),
    env: { DB }
  });
  assert.equal(response.status, 401);
});

// ── CORS: origin allowlist ─────────────────────────────────────────────────

test('CORS: known origin uses primary allowlisted origin header', async () => {
  const response = await onRequest({
    request: new Request('https://kpaguleri.org/api/income', {
      method: 'OPTIONS',
      headers: { 'Origin': 'https://kpaguleri.org' },
    }),
    env: {}
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://rccg-kingdom-parish-app.pages.dev');
});

test('CORS: unknown origin falls back to primary domain', async () => {
  const response = await onRequest({
    request: new Request('https://evil.com/api/income', {
      method: 'OPTIONS',
      headers: { 'Origin': 'https://evil.com' },
    }),
    env: {}
  });
  assert.equal(response.status, 204);
  const origin = response.headers.get('Access-Control-Allow-Origin');
  assert.notEqual(origin, 'https://evil.com', 'should not echo unknown origin');
  assert.notEqual(origin, '*', 'should not use wildcard');
});
