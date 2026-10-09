// Loans: an AI-checked receipt photo can confirm a loan or repayment with no second person.
// OpenAI is stubbed through global fetch; nothing leaves the machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';
import { createSqliteD1 } from './sqlite-d1.mjs';
import { FINANCE_AUTH_HEADER, financeToken } from './finance-auth-helper.mjs';

const realFetch = globalThis.fetch;
const today = new Date().toISOString().slice(0, 10);
const photo = tag => `data:image/jpeg;base64,${Buffer.from('receipt-' + tag).toString('base64')}`;

// reply = object for the AI JSON, or a function / 'throw'
function stubAI(reply) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes('api.openai.com')) return realFetch(url, init);
    calls.push(url);
    if (reply === 'throw') throw new Error('network down');
    const r = typeof reply === 'function' ? reply() : reply;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(r) } }] }), { status: 200 });
  };
  return calls;
}
const good = (over = {}) => ({ is_receipt: true, amount: 50000, reference: 'REF1', date: today, bank: 'X', confidence: 'high', notes: '', ...over });

async function setup({ key = 'test-key' } = {}) {
  const DB = createSqliteD1();
  const env = key ? { DB, OPENAI_API_KEY: key } : { DB };
  const call = async (path, { method = 'GET', body, headers } = {}) => {
    const init = { method, headers: { ...(headers || {}) } };
    if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    return onRequest({ request: new Request(`https://x/api/${path}`, init), env, waitUntil() {} });
  };
  assert.equal((await call('init', { headers: FINANCE_AUTH_HEADER })).status, 200);
  const as = {};
  for (const [k, role] of [['acct', 'accountant'], ['pastor', 'pastor'], ['usher', 'usher'], ['viewer', 'viewer']]) {
    const u = await (await call('users', { method: 'POST', headers: FINANCE_AUTH_HEADER, body: { name: `Test ${k}`, role, pin: '1234' } })).json();
    as[k] = { Authorization: `Bearer ${await financeToken({ uid: u.id, role })}` };
  }
  const record = async (who, over = {}) => {
    const r = await call('loans', { method: 'POST', headers: as[who], body: { person: 'Bro Sam', direction: 'lent', amount: 50000, channel: 'cash', date: today, ...over } });
    return { status: r.status, body: await r.json() };
  };
  const list = async () => (await call('loans', { headers: as.acct })).json();
  return { DB, call, as, record, list };
}

test.afterEach(() => { globalThis.fetch = realFetch; });

test('verified receipt confirms a cash loan with no second person; list has no photo', async () => {
  stubAI(good());
  const { record, list, DB } = await setup();
  const r = await record('pastor', { photoData: photo('a') });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.status, r.body.confirmedBy, r.body.receiptStatus], ['active', 'receipt', 'verified']);
  const l = (await list())[0];
  assert.deepEqual([l.status, l.confirmedBy, l.receiptStatus, l.hasReceipt], ['active', 'receipt', 'verified', true]);
  assert.ok(!JSON.stringify(await list()).includes('base64'));
  const a = await DB.prepare(`SELECT COUNT(*) n FROM audit_log WHERE type='loan_confirmed_by_receipt'`).first().catch(() => null);
  if (a) assert.equal(a.n, 1);
});

test('verified receipt confirms a repayment and settles the loan', async () => {
  const { record, call, as, list } = await setup();
  stubAI(good());
  const loan = (await record('pastor', { photoData: photo('l') })).body;
  stubAI(good({ amount: 50000, reference: 'REF2' }));
  const rep = await (await call(`loans/${loan.id}/repay`, { method: 'POST', headers: as.pastor, body: { amount: 50000, date: today, photoData: photo('r') } })).json();
  assert.deepEqual([rep.status, rep.confirmedBy, rep.loanSettled], ['confirmed', 'receipt', true]);
  const l = (await list())[0];
  assert.equal(l.status, 'settled');
  assert.equal(l.repayments[0].confirmedBy, 'receipt');
});

test('amount mismatch is flagged, stays pending, and the note is shown', async () => {
  stubAI(good({ amount: 40000 }));
  const { record, list } = await setup();
  const r = await record('pastor', { photoData: photo('b') });
  assert.deepEqual([r.body.status, r.body.receiptStatus], ['pending', 'flagged']);
  const l = (await list())[0];
  assert.match(l.receiptNote, /40,?000/);
});

test('low confidence, not-a-receipt and old receipt are flagged', async () => {
  const { record } = await setup();
  for (const over of [{ confidence: 'low' }, { is_receipt: false }, { date: '2020-01-01' }]) {
    stubAI(good({ reference: 'R' + JSON.stringify(over), ...over }));
    const r = await record('pastor', { photoData: photo(JSON.stringify(over)) });
    assert.deepEqual([r.body.status, r.body.receiptStatus], ['pending', 'flagged'], JSON.stringify(over));
  }
});

test('no AI key leaves it pending for a second person', async () => {
  const calls = stubAI(good());
  const { record } = await setup({ key: '' });
  const r = await record('pastor', { photoData: photo('c') });
  assert.deepEqual([r.body.status, r.body.receiptStatus], ['pending', 'pending']);
  assert.equal(calls.length, 0);
});

test('a network error leaves the entry recorded and pending', async () => {
  stubAI('throw');
  const { record, list } = await setup();
  const r = await record('pastor', { photoData: photo('d') });
  assert.deepEqual([r.status, r.body.status, r.body.receiptStatus], [200, 'pending', 'pending']);
  assert.equal((await list()).length, 1);
});

test('the same photo or same reference on another entry is flagged', async () => {
  stubAI(good());
  const { record, list } = await setup();
  assert.equal((await record('pastor', { photoData: photo('e') })).body.receiptStatus, 'verified');
  const same = await record('pastor', { photoData: photo('e') });
  assert.deepEqual([same.body.status, same.body.receiptStatus], ['pending', 'flagged']);
  const ref = await record('pastor', { photoData: photo('f') });   // different photo, same AI reference and amount
  assert.equal(ref.body.receiptStatus, 'flagged');
  assert.match((await list()).find(l => l.id === ref.body.id).receiptNote, /already used/);
});

test('only loan roles can open a receipt photo', async () => {
  stubAI(good());
  const { record, call, as } = await setup();
  const { body } = await record('pastor', { photoData: photo('g') });
  for (const who of ['viewer', 'usher']) assert.equal((await call(`loan-receipt?kind=loan&id=${body.id}`, { headers: as[who] })).status, 403);
  const ok = await call(`loan-receipt?kind=loan&id=${body.id}`, { headers: as.acct });
  assert.equal(ok.status, 200);
  const j = await ok.json();
  assert.deepEqual([j.photoData, j.aiStatus, j.aiAmount, j.aiReference], [photo('g'), 'verified', 50000, 'REF1']);
});

test('oversize or non-image photos are refused with 400 and nothing is recorded', async () => {
  stubAI(good());
  const { record, list } = await setup();
  assert.equal((await record('pastor', { photoData: 'data:image/jpeg;base64,' + 'A'.repeat(2000001) })).status, 400);
  assert.equal((await record('pastor', { photoData: 'data:text/plain;base64,QQ==' })).status, 400);
  assert.equal((await list()).length, 0);
});
