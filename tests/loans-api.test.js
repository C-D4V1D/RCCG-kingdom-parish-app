// Loans: money lent out or borrowed. One person records, a different person acknowledges, and only then does
// any balance move. Never income, never remittable. Runs the real route handler on an in-memory SQLite D1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';
import { createSqliteD1 } from './sqlite-d1.mjs';
import { FINANCE_AUTH_HEADER, financeToken } from './finance-auth-helper.mjs';

async function setup() {
  const DB = createSqliteD1();
  const call = async (path, { method = 'GET', body, headers } = {}) => {
    const init = { method, headers: { ...(headers || {}) } };
    if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    return onRequest({ request: new Request(`https://x/api/${path}`, init), env: { DB }, waitUntil() {} });
  };
  assert.equal((await call('init', { headers: FINANCE_AUTH_HEADER })).status, 200);
  const as = {};
  for (const [key, role] of [['acct', 'accountant'], ['officer', 'admin_officer'], ['pastor', 'pastor'], ['usher', 'usher'], ['viewer', 'viewer']]) {
    const u = await (await call('users', { method: 'POST', headers: FINANCE_AUTH_HEADER, body: { name: `Test ${key}`, role, pin: '1234' } })).json();
    as[key] = { Authorization: `Bearer ${await financeToken({ uid: u.id, role })}` };
  }
  const record = async (who, over = {}) => {
    const r = await call('loans', { method: 'POST', headers: as[who], body: { person: 'Bro Sam', direction: 'lent', amount: 50000, channel: 'cash', date: '2026-10-05', purpose: 'Rent', ...over } });
    return { status: r.status, body: await r.json() };
  };
  const txCount = async () => (await DB.prepare(`SELECT COUNT(*) n FROM cash_transactions`).first()).n;
  const list = async () => (await (await call('loans', { headers: as.acct })).json());
  return { DB, call, as, record, txCount, list };
}

test('only accountant, admin officer, pastor and IT admin can record; ushers and viewers cannot', async () => {
  const { record } = await setup();
  assert.equal((await record('usher')).status, 403);
  assert.equal((await record('viewer')).status, 403);
  assert.equal((await record('acct')).status, 200);
  assert.equal((await record('officer')).status, 200);
});

test('a recorded loan is pending and changes nothing: no bank entry, no income', async () => {
  const { DB, record, txCount, list } = await setup();
  const r = await record('acct', { channel: 'bank' });
  assert.equal(r.body.status, 'pending');
  assert.equal(await txCount(), 0);
  assert.equal((await DB.prepare(`SELECT COUNT(*) n FROM income`).first()).n, 0);
  const l = (await list())[0];
  assert.equal(l.status, 'pending');
  assert.equal(l.outstanding, 0);
});

test('the person who recorded it cannot acknowledge it; a different person can, once', async () => {
  const { call, as, record } = await setup();
  const { body } = await record('acct');
  const self = await call(`loans/${body.id}/acknowledge`, { method: 'POST', headers: as.acct, body: {} });
  assert.equal(self.status, 403);
  assert.match((await self.json()).error, /different person/i);
  assert.equal((await call(`loans/${body.id}/acknowledge`, { method: 'POST', headers: as.usher, body: {} })).status, 403);
  assert.equal((await call(`loans/${body.id}/acknowledge`, { method: 'POST', headers: as.pastor, body: {} })).status, 200);
  assert.equal((await call(`loans/${body.id}/acknowledge`, { method: 'POST', headers: as.officer, body: {} })).status, 409);
});

test('bank loan: acknowledging creates exactly one bank entry (out for lent, in for borrowed), kept out of collection deposits', async () => {
  const { DB, call, as, record, txCount } = await setup();
  const lent = (await record('acct', { channel: 'bank', direction: 'lent', amount: 20000 })).body;
  await call(`loans/${lent.id}/acknowledge`, { method: 'POST', headers: as.pastor, body: {} });
  const borrowed = (await record('acct', { channel: 'bank', direction: 'borrowed', amount: 7000, person: 'Sis Ada' })).body;
  await call(`loans/${borrowed.id}/acknowledge`, { method: 'POST', headers: as.pastor, body: {} });
  assert.equal(await txCount(), 2);
  const rows = (await DB.prepare(`SELECT type, amount, destination FROM cash_transactions ORDER BY amount`).all()).results;
  assert.deepEqual(rows.map(r => [r.type, r.amount, r.destination]), [
    ['cash_deposit', 7000, 'satellite_passthrough'], ['withdrawal', 20000, 'satellite_passthrough']]);
});

test('cash loan: acknowledging makes no bank entry (cash is counted on the accountant line)', async () => {
  const { call, as, record, txCount, list } = await setup();
  const { body } = await record('acct', { channel: 'cash' });
  await call(`loans/${body.id}/acknowledge`, { method: 'POST', headers: as.pastor, body: {} });
  assert.equal(await txCount(), 0);
  const l = (await list())[0];
  assert.equal(l.status, 'active');
  assert.equal(l.outstanding, 50000);
});

test('rejecting needs a reason and leaves no money movement', async () => {
  const { call, as, record, txCount, list } = await setup();
  const { body } = await record('acct', { channel: 'bank' });
  assert.equal((await call(`loans/${body.id}/reject`, { method: 'POST', headers: as.pastor, body: {} })).status, 400);
  assert.equal((await call(`loans/${body.id}/reject`, { method: 'POST', headers: as.pastor, body: { reason: 'Wrong amount' } })).status, 200);
  assert.equal(await txCount(), 0);
  assert.equal((await list())[0].status, 'rejected');
  assert.equal((await call(`loans/${body.id}/acknowledge`, { method: 'POST', headers: as.officer, body: {} })).status, 409);
});

test('repayments: a different person acknowledges; partial then full settles; over-paying is refused', async () => {
  const { DB, call, as, record, txCount, list } = await setup();
  const { body } = await record('acct', { channel: 'cash', amount: 10000 });
  await call(`loans/${body.id}/acknowledge`, { method: 'POST', headers: as.pastor, body: {} });
  const over = await call(`loans/${body.id}/repay`, { method: 'POST', headers: as.acct, body: { amount: 10001 } });
  assert.equal(over.status, 400);
  const p1 = await (await call(`loans/${body.id}/repay`, { method: 'POST', headers: as.acct, body: { amount: 4000, channel: 'bank', date: '2026-10-06' } })).json();
  assert.equal((await call(`loan-repayments/${p1.id}/acknowledge`, { method: 'POST', headers: as.acct, body: {} })).status, 403);
  let l = (await list())[0];
  assert.equal(l.outstanding, 10000);   // pending repayment changes nothing yet
  assert.equal(await txCount(), 0);
  assert.equal((await call(`loan-repayments/${p1.id}/acknowledge`, { method: 'POST', headers: as.officer, body: {} })).status, 200);
  l = (await list())[0];
  assert.equal(l.outstanding, 6000);
  assert.equal(l.status, 'active');
  // bank repayment of a lent loan = money coming into the bank
  const tx = (await DB.prepare(`SELECT type, amount, destination FROM cash_transactions`).all()).results;
  assert.deepEqual(tx.map(r => [r.type, r.amount, r.destination]), [['cash_deposit', 4000, 'satellite_passthrough']]);
  const tooMuch = await call(`loans/${body.id}/repay`, { method: 'POST', headers: as.acct, body: { amount: 6001 } });
  assert.equal(tooMuch.status, 400);
  const p2 = await (await call(`loans/${body.id}/repay`, { method: 'POST', headers: as.acct, body: { amount: 6000 } })).json();
  const done = await (await call(`loan-repayments/${p2.id}/acknowledge`, { method: 'POST', headers: as.pastor, body: {} })).json();
  assert.equal(done.loanSettled, true);
  l = (await list())[0];
  assert.equal(l.status, 'settled');
  assert.equal(l.outstanding, 0);
  assert.equal(l.repayments.length, 2);
});

test('loans never create income or remittance rows, and every step is in the audit log', async () => {
  const { DB, call, as, record } = await setup();
  const { body } = await record('acct', { channel: 'bank' });
  await call(`loans/${body.id}/acknowledge`, { method: 'POST', headers: as.pastor, body: {} });
  for (const t of ['income', 'remittances']) {
    assert.equal((await DB.prepare(`SELECT COUNT(*) n FROM ${t}`).first()).n, 0, t);
  }
  const types = (await DB.prepare(`SELECT type FROM audit_log WHERE type LIKE 'loan_%' ORDER BY ts`).all()).results.map(r => r.type);
  assert.deepEqual(types, ['loan_recorded', 'loan_acknowledged']);
});

test('bad input is refused with a plain message', async () => {
  const { record } = await setup();
  assert.equal((await record('acct', { person: '' })).status, 400);
  assert.equal((await record('acct', { amount: 0 })).status, 400);
  assert.equal((await record('acct', { amount: 'abc' })).status, 400);
  assert.equal((await record('acct', { direction: 'gift' })).status, 400);
});

// ── Thoroughness round: petty cash, reversals, who sees names, who is notified ──
async function acknowledged(over = {}, by = 'pastor') {
  const t = await setup();
  const r = (await t.record('acct', over)).body;
  assert.equal((await t.call(`loans/${r.id}/acknowledge`, { method: 'POST', headers: t.as[by], body: {} })).status, 200);
  return { ...t, id: r.id };
}
const pettyRows = DB => DB.prepare(`SELECT type, status, amount, payment_method, date_needed FROM petty_cash`).all().then(r => r.results);

test('petty cash loan: lending is a petty disbursement, borrowing is a petty refill paid by "loan"; no bank entry', async () => {
  const lent = await acknowledged({ channel: 'petty', direction: 'lent', amount: 12000, date: '2026-10-05' });
  assert.deepEqual((await pettyRows(lent.DB)).map(r => [r.type, r.status, r.amount, r.payment_method, r.date_needed]), [['disbursement', 'approved', 12000, '', '2026-10-05']]);
  assert.equal(await lent.txCount(), 0);
  const borrowed = await acknowledged({ channel: 'petty', direction: 'borrowed', amount: 7000, date: '2026-10-06' });
  assert.deepEqual((await pettyRows(borrowed.DB)).map(r => [r.type, r.status, r.amount, r.payment_method]), [['refill', 'approved', 7000, 'loan']]);
});

test('petty cash loan: nothing moves until acknowledged, and a petty repayment mirrors the other way', async () => {
  const t = await setup();
  const r = (await t.record('acct', { channel: 'petty', direction: 'lent', amount: 10000 })).body;
  assert.equal((await pettyRows(t.DB)).length, 0);
  await t.call(`loans/${r.id}/acknowledge`, { method: 'POST', headers: t.as.pastor, body: {} });
  const p = await (await t.call(`loans/${r.id}/repay`, { method: 'POST', headers: t.as.acct, body: { amount: 4000, channel: 'petty' } })).json();
  assert.equal((await pettyRows(t.DB)).length, 1);   // still pending: no new entry
  await t.call(`loan-repayments/${p.id}/acknowledge`, { method: 'POST', headers: t.as.officer, body: {} });
  assert.deepEqual((await pettyRows(t.DB)).map(x => [x.type, x.amount, x.payment_method]), [['disbursement', 10000, ''], ['refill', 4000, 'loan']]);
});

test('an unknown channel falls back to cash with the accountant', async () => {
  const { list, record } = await setup();
  await record('acct', { channel: 'mystery' });
  assert.equal((await list())[0].channel, 'cash');
});

test('only the IT admin can reverse; a reversal removes the ledger entry, keeps the loan visible and is audited', async () => {
  const t = await acknowledged({ channel: 'bank', amount: 9000 });
  assert.equal(await t.txCount(), 1);
  for (const who of ['acct', 'officer', 'pastor']) {
    assert.equal((await t.call(`loans/${t.id}/reverse`, { method: 'POST', headers: t.as[who], body: { reason: 'x' } })).status, 403, who);
  }
  assert.equal((await t.call(`loans/${t.id}/reverse`, { method: 'POST', headers: FINANCE_AUTH_HEADER, body: {} })).status, 400);
  assert.equal((await t.call(`loans/${t.id}/reverse`, { method: 'POST', headers: FINANCE_AUTH_HEADER, body: { reason: 'Entered twice' } })).status, 200);
  assert.equal(await t.txCount(), 0);
  const l = (await t.list())[0];
  assert.equal(l.status, 'reversed');
  assert.equal(l.outstanding, 0);
  assert.equal((await t.call(`loans/${t.id}/reverse`, { method: 'POST', headers: FINANCE_AUTH_HEADER, body: { reason: 'again' } })).status, 409);
  const types = (await t.DB.prepare(`SELECT type FROM audit_log WHERE type='loan_reversed'`).all()).results;
  assert.equal(types.length, 1);
});

test('a loan with a confirmed repayment cannot be reversed until the repayment is; reversing a repayment reopens a settled loan', async () => {
  const t = await acknowledged({ channel: 'cash', amount: 5000 });
  const p = await (await t.call(`loans/${t.id}/repay`, { method: 'POST', headers: t.as.acct, body: { amount: 5000 } })).json();
  await t.call(`loan-repayments/${p.id}/acknowledge`, { method: 'POST', headers: t.as.officer, body: {} });
  assert.equal((await t.list())[0].status, 'settled');
  assert.equal((await t.call(`loans/${t.id}/reverse`, { method: 'POST', headers: FINANCE_AUTH_HEADER, body: { reason: 'x' } })).status, 409);
  assert.equal((await t.call(`loan-repayments/${p.id}/reverse`, { method: 'POST', headers: t.as.pastor, body: { reason: 'x' } })).status, 403);
  assert.equal((await t.call(`loan-repayments/${p.id}/reverse`, { method: 'POST', headers: FINANCE_AUTH_HEADER, body: { reason: 'Wrong person' } })).status, 200);
  const l = (await t.list())[0];
  assert.equal(l.status, 'active');
  assert.equal(l.outstanding, 5000);
  assert.equal((await t.call(`loans/${t.id}/reverse`, { method: 'POST', headers: FINANCE_AUTH_HEADER, body: { reason: 'Now allowed' } })).status, 200);
});

test('reversing a loan removes the petty entry too', async () => {
  const t = await acknowledged({ channel: 'petty', amount: 3000 });
  assert.equal((await pettyRows(t.DB)).length, 1);
  await t.call(`loans/${t.id}/reverse`, { method: 'POST', headers: FINANCE_AUTH_HEADER, body: { reason: 'Mistake' } });
  assert.equal((await pettyRows(t.DB)).length, 0);
});

test('people outside the four roles get amounts and status only: no names, purposes, notes or who recorded it', async () => {
  const t = await setup();
  await t.record('acct', { person: 'Bro Sam', purpose: 'Rent', note: 'secret note', reference: 'REF1' });
  await t.record('acct', { person: 'Sis Ada', amount: 1000 });
  await t.record('acct', { person: 'bro sam ', amount: 2000 });
  const seen = await (await t.call('loans', { headers: t.as.usher })).json();
  const text = JSON.stringify(seen);
  for (const secret of ['Bro Sam', 'Sis Ada', 'Rent', 'secret note', 'REF1', 'Test acct']) assert.ok(!text.includes(secret), secret);
  assert.equal(seen.length, 3);
  assert.equal(new Set(seen.map(l => l.person)).size, 2);         // same person keeps the same label, so counts still work
  assert.ok(seen.every(l => typeof l.amount === 'number' && l.status === 'pending'));
  const full = await t.list();                                    // the accountant sees everything
  assert.ok(JSON.stringify(full).includes('Bro Sam'));
});

test('notifications about loans reach only the four roles (IT admin sees all); others are untouched', async () => {
  const t = await setup();
  await t.record('acct');
  const mine = role => t.call('notifications', { headers: role === 'it_admin' ? FINANCE_AUTH_HEADER : t.as[role] }).then(r => r.json());
  assert.equal((await mine('pastor')).filter(n => /Loan/.test(n.title)).length, 1);
  assert.equal((await mine('officer')).filter(n => /Loan/.test(n.title)).length, 1);
  assert.equal((await mine('it_admin')).filter(n => /Loan/.test(n.title)).length, 1);
  assert.equal((await mine('usher')).filter(n => /Loan/.test(n.title)).length, 0);
  assert.equal((await mine('viewer')).filter(n => /Loan/.test(n.title)).length, 0);
  // an ordinary notification (no roles) still reaches everyone
  await t.call('notifications', { method: 'POST', headers: t.as.acct, body: { title: 'Hello all', body: 'x' } });
  assert.equal((await mine('usher')).filter(n => n.title === 'Hello all').length, 1);
});
