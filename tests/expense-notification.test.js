// Every recorded expense drops an "Expense Recorded" notification, and a notification failure never loses the expense.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';
import { createSqliteD1 } from './sqlite-d1.mjs';
import { FINANCE_AUTH_HEADER } from './finance-auth-helper.mjs';

async function setup({ failNotifications = false } = {}) {
  const real = createSqliteD1();
  const DB = failNotifications
    ? new Proxy(real, {
        get(t, p) {
          if (p !== 'prepare') return t[p];
          return (sql) => {
            if (/INSERT INTO notifications/i.test(sql)) throw new Error('notifications down');
            return t.prepare(sql);
          };
        },
      })
    : real;
  const call = (path, method = 'GET', body) => {
    const init = { method, headers: { ...FINANCE_AUTH_HEADER } };
    if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    return onRequest({ request: new Request(`https://x/api/${path}`, init), env: { DB }, waitUntil() {} });
  };
  assert.equal((await call('init')).status, 200);
  const post = (over = {}) => call('expenses', 'POST', {
    date: '2026-10-05', category: 'bank', subCategory: 'Money transfer charges',
    description: 'POS terminal charges', amount: 200, paymentMethod: 'cash', status: 'approved', ...over,
  });
  const notes = async () => (await real.prepare(`SELECT * FROM notifications WHERE title='Expense Recorded'`).all()).results;
  return { real, post, notes };
}

test('POST /api/expenses saves the expense and adds one Expense Recorded notification', async () => {
  const { real, post, notes } = await setup();
  const res = await post();
  assert.equal(res.status, 200);
  const { id } = await res.json();
  assert.ok(await real.prepare(`SELECT id FROM expenses WHERE id=?`).bind(id).first());
  const n = await notes();
  assert.equal(n.length, 1);
  assert.match(n[0].body, /₦200/);
  assert.match(n[0].body, /bank \/ Money transfer charges/);
  assert.match(n[0].body, /\(POS terminal charges\)/);
});

test('float noise in the amount is rounded to 2dp in the notification', async () => {
  const { post, notes } = await setup();
  assert.equal((await post({ amount: 270.8999999999942 })).status, 200);
  const [n] = await notes();
  assert.match(n.body, /₦270\.9(?!\d)/);
});

test('decimal amounts are comma-grouped in the notification', async () => {
  const { post, notes } = await setup();
  assert.equal((await post({ amount: 1234.5 })).status, 200);
  const [n] = await notes();
  assert.match(n.body, /₦1,234\.5(?!\d)/);
});

test('a failing notification insert never loses the expense', async () => {
  const { real, post, notes } = await setup({ failNotifications: true });
  const res = await post();
  assert.equal(res.status, 200);
  const { id } = await res.json();
  assert.ok(await real.prepare(`SELECT id FROM expenses WHERE id=?`).bind(id).first());
  assert.equal((await notes()).length, 0);
});
