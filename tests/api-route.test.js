import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';

async function readJson(response) {
  return JSON.parse(await response.text());
}

function createRequest(url, method = 'GET', body) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

function createDBMock({ onPrepare }) {
  return {
    prepare(sql) {
      return onPrepare(sql);
    }
  };
}

test('onRequest handles CORS preflight requests', async () => {
  const response = await onRequest({
    request: createRequest('https://example.com/api/users', 'OPTIONS'),
    env: {}
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
});

test('onRequest returns 503 when DB binding is missing', async () => {
  const response = await onRequest({
    request: createRequest('https://example.com/api/users', 'GET'),
    env: {}
  });
  const body = await readJson(response);

  assert.equal(response.status, 503);
  assert.match(body.error, /Database binding "DB" not found/);
});

test('unknown routes return 404', async () => {
  const response = await onRequest({
    request: createRequest('https://example.com/api/does-not-exist', 'GET'),
    env: { DB: createDBMock({ onPrepare: () => ({}) }) }
  });
  const body = await readJson(response);

  assert.equal(response.status, 404);
  assert.match(body.error, /Route not found/);
});

test('create user rejects invalid PIN format', async () => {
  const response = await onRequest({
    request: createRequest('https://example.com/api/users', 'POST', {
      name: 'Test User',
      role: 'viewer',
      pin: '12'
    }),
    env: { DB: createDBMock({ onPrepare: () => ({}) }) }
  });
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.error, 'pin must be 4-6 digits');
});

test('create user stores hashed PIN and returns public user fields', async () => {
  const statements = [];
  const DB = createDBMock({
    onPrepare(sql) {
      const statement = {
        sql,
        binds: [],
        bind(...args) {
          statement.binds = args;
          return statement;
        },
        async run() {
          statements.push(statement);
          return { success: true };
        }
      };
      return statement;
    }
  });

  const response = await onRequest({
    request: createRequest('https://example.com/api/users', 'POST', {
      name: 'Jane Doe',
      role: 'accountant',
      pin: '1234',
      email: 'jane@example.com'
    }),
    env: { DB }
  });
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.ok(body.id.startsWith('u'));
  assert.equal(body.name, 'Jane Doe');
  assert.equal(body.role, 'accountant');
  assert.equal(body.email, 'jane@example.com');
  assert.equal(body.pin, undefined);

  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /INSERT INTO users/);
  assert.equal(statements[0].binds[1], 'Jane Doe');
  assert.equal(statements[0].binds[2], 'accountant');
  assert.match(statements[0].binds[3], /^sha256\$/);
});

test('login requires explicit user selection when multiple users share role', async () => {
  const DB = createDBMock({
    onPrepare(sql) {
      const statement = {
        bind() {
          return statement;
        },
        async all() {
          if (sql === 'SELECT id,name,role,email,pin FROM users WHERE role=? ORDER BY name') {
            return {
              results: [
                { id: 'u1', name: 'Alpha', role: 'viewer', email: '', pin: 'sha256$aaa' },
                { id: 'u2', name: 'Beta', role: 'viewer', email: '', pin: 'sha256$bbb' }
              ]
            };
          }
          throw new Error(`Unexpected SQL in all(): ${sql}`);
        }
      };
      return statement;
    }
  });

  const response = await onRequest({
    request: createRequest('https://example.com/api/auth/login', 'POST', {
      role: 'viewer',
      pin: '0000'
    }),
    env: { DB }
  });
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.error, 'Please select your name');
});

test('login upgrades plaintext PIN to hashed PIN after successful auth', async () => {
  const runs = [];
  const DB = createDBMock({
    onPrepare(sql) {
      const statement = {
        _bound: [],
        bind(...args) {
          statement._bound = args;
          return statement;
        },
        async first() {
          if (/SELECT id,name,role,email,pin FROM users WHERE id=\? AND role=\?/.test(sql)) {
            return { id: 'u7', name: 'Visitor', role: 'viewer', email: '', pin: '9999' };
          }
          throw new Error(`Unexpected SQL in first(): ${sql}`);
        },
        async run() {
          runs.push({ sql, bound: statement._bound });
          return { success: true };
        }
      };
      return statement;
    }
  });

  const response = await onRequest({
    request: createRequest('https://example.com/api/auth/login', 'POST', {
      role: 'viewer',
      pin: '9999',
      userId: 'u7'
    }),
    env: { DB }
  });
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.id, 'u7');
  assert.equal(body.role, 'viewer');
  assert.equal(runs.length, 1);
  assert.match(runs[0].sql, /UPDATE users SET pin=\? WHERE id=\?/);
  assert.equal(runs[0].bound[1], 'u7');
  assert.match(runs[0].bound[0], /^sha256\$/);
});

test('login with hashed PIN does not run upgrade update', async () => {
  const runs = [];
  const crypto = await import('node:crypto');
  const inputPin = '4455';
  const inputHash = crypto.createHash('sha256').update(inputPin).digest('hex');
  const storedHashedPin = `sha256$${inputHash}`;
  const DB = createDBMock({
    onPrepare(sql) {
      const statement = {
        _bound: [],
        bind(...args) {
          statement._bound = args;
          return statement;
        },
        async first() {
          if (/SELECT id,name,role,email,pin FROM users WHERE id=\? AND role=\?/.test(sql)) {
            return { id: 'u5', name: 'Signer', role: 'signatory', email: '', pin: storedHashedPin };
          }
          throw new Error(`Unexpected SQL in first(): ${sql}`);
        },
        async run() {
          runs.push({ sql, bound: statement._bound });
          return { success: true };
        }
      };
      return statement;
    }
  });

  const response = await onRequest({
    request: createRequest('https://example.com/api/auth/login', 'POST', {
      role: 'signatory',
      pin: inputPin,
      userId: 'u5'
    }),
    env: { DB }
  });
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.id, 'u5');
  assert.equal(runs.length, 0);
});
