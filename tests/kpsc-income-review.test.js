import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';
import { createSqliteD1, seedKpscSession, kpscRequest } from './sqlite-d1.mjs';

// Income review: bank transfer / POS / cheque income needs the Acting Chairman or
// Treasurer to confirm it arrived in the bank; cash instead needs one of them to
// confirm its deposit. Runs against a real SQLite database built by /api/init, so the SQL
// itself — WHERE clauses, UPDATE effects, the one-time history settle — is what's
// being tested.

async function initDb() {
  const DB = createSqliteD1();
  const res = await onRequest({ request: new Request('https://x/api/init'), env: { DB } });
  assert.equal(res.status, 200);
  seedKpscSession(DB, { role: 'treasurer', name: 'Treasurer' });
  return DB;
}

function addEntry(DB, e) {
  const row = {
    date: '2026-09-20', entry_type: 'income', category: 'other_income', amount: 0,
    payment_method: 'cash', narration: '', partner_id: '', recorded_by: 'Bro Samuel Onuorah',
    cash_holder: '', cash_box_expense: 0, handover_id: '', confirmed_by: '', confirmed_at: '',
    deposited_by: '', deposited_at: '', deleted_at: '', ...e,
  };
  const cols = Object.keys(row);
  DB.sqlite.prepare(`INSERT INTO kpsc_finance_entries (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...cols.map(c => row[c]));
}

const entry = (DB, id) => DB.sqlite.prepare(`SELECT * FROM kpsc_finance_entries WHERE id=?`).get(id);

async function call(DB, path, method = 'GET', body) {
  const res = await onRequest({ request: kpscRequest(path, method, body), env: { DB } });
  return { status: res.status, json: JSON.parse(await res.text()) };
}

function seedTypicalMonth(DB) {
  DB.sqlite.prepare(`INSERT INTO kpsc_partners (id, full_name, partnership_type, status) VALUES ('p1', 'Partner One', 'covenant_partner', 'active')`).run();
  addEntry(DB, { id: 'kfe1', category: 'partnership_pledge', amount: 5000, partner_id: 'p1', recorded_by: 'Alice' });
  addEntry(DB, { id: 'kfe2', category: 'welfare_&_development_offering', narration: 'Welfare & Development Offering', amount: 5800 });
  addEntry(DB, { id: 'kfe3', category: 'one_time_donation', amount: 20000, payment_method: 'bank_transfer', recorded_by: 'Financial Secretary' });
}

test('bank, POS and cheque income awaits confirmation, cash does not; cash of any category counts as in hand', async () => {
  const DB = await initDb();
  seedTypicalMonth(DB);
  addEntry(DB, { id: 'kfe4', amount: 1500, payment_method: 'pos' });
  addEntry(DB, { id: 'kfe5', amount: 2500, payment_method: 'cheque' });
  addEntry(DB, { id: 'kfe6', amount: 900, payment_method: 'other' });
  const { json } = await call(DB, 'kpsc-income-review');

  assert.deepEqual(json.pendingConfirmation.map(e => e.id).sort(), ['kfe3', 'kfe4', 'kfe5']);
  assert.equal(json.awaitingConfirmationTotal, 20000 + 1500 + 2500);
  assert.equal(json.cashInHandTotal, 5000 + 5800);
  const samuel = json.holders.find(h => h.name === 'Bro Samuel Onuorah');
  assert.equal(samuel.inHand, 5800);
  assert.equal(samuel.lots[0].partnerName, 'Welfare & Development Offering');
  assert.equal(json.holders.find(h => h.name === 'Alice').lots[0].partnerName, 'Partner One');
});

test('cash banked through the old Transfer to Bank flow never counts as cash in hand', async () => {
  const DB = await initDb();
  addEntry(DB, { id: 'kfe-old', amount: 3000, handover_id: 'kch1', confirmed_by: 'Treasurer' });
  addEntry(DB, { id: 'kfe-new', amount: 1000 });
  const { json } = await call(DB, 'kpsc-income-review');
  assert.equal(json.cashInHandTotal, 1000);
});

test('Confirm marks bank-side entries confirmed, never cash; other roles are refused', async () => {
  const DB = await initDb();
  seedTypicalMonth(DB);

  seedKpscSession(DB, { role: 'financial_secretary', name: 'Financial Secretary' });
  const refused = await call(DB, 'kpsc-finance-confirm', 'POST', { ids: ['kfe1'] });
  assert.equal(refused.status, 403);
  assert.equal(entry(DB, 'kfe1').confirmed_by, '');

  seedKpscSession(DB, { role: 'treasurer', name: 'Treasurer' });
  const ok = await call(DB, 'kpsc-finance-confirm', 'POST', { ids: ['kfe1', 'kfe3'] });
  assert.equal(ok.json.confirmed, 1);
  assert.equal(entry(DB, 'kfe3').confirmed_by, 'Treasurer');
  assert.equal(entry(DB, 'kfe1').confirmed_by, '', 'cash is never confirmed — only its deposit is');

  const { json } = await call(DB, 'kpsc-income-review');
  assert.deepEqual(json.pendingConfirmation.map(e => e.id), []);
});

test('Deposited for one holder clears only their cash; Deposit All clears everyone', async () => {
  const DB = await initDb();
  seedTypicalMonth(DB);
  seedKpscSession(DB, { role: 'acting_chairman', name: 'Bro. David' });

  await call(DB, 'kpsc-cash-deposit', 'POST', { holder: 'Bro Samuel Onuorah' });
  assert.equal(entry(DB, 'kfe2').deposited_by, 'Bro. David');
  assert.equal(entry(DB, 'kfe1').deposited_by, '', "another holder's cash must be untouched");
  assert.equal(entry(DB, 'kfe3').deposited_by, '', 'bank transfers have nothing to deposit');
  assert.equal((await call(DB, 'kpsc-income-review')).json.cashInHandTotal, 5000);

  await call(DB, 'kpsc-cash-deposit', 'POST', {});
  assert.equal((await call(DB, 'kpsc-income-review')).json.cashInHandTotal, 0);
});

test('a cash-box expense reduces its holder\'s cash in hand', async () => {
  const DB = await initDb();
  seedTypicalMonth(DB);
  addEntry(DB, { id: 'kfx1', entry_type: 'expense', category: 'transport', amount: 500, cash_box_expense: 1 });
  const { json } = await call(DB, 'kpsc-income-review');
  assert.equal(json.holders.find(h => h.name === 'Bro Samuel Onuorah').inHand, 5300);
});

test('editing the wording keeps the sign-off; changing the money voids it; the recorder is never overwritten', async () => {
  const DB = await initDb();
  addEntry(DB, {
    id: 'kfe1', amount: 5800, narration: 'Welfare offfering',
    confirmed_by: 'Treasurer', confirmed_at: '2026-09-24 10:00:00',
    deposited_by: 'Treasurer', deposited_at: '2026-09-25 10:00:00',
  });

  seedKpscSession(DB, { role: 'acting_chairman', name: 'Bro. David' });
  await call(DB, 'kpsc-finance/kfe1', 'PUT', { narration: 'Welfare offering', recordedBy: 'Bro. David' });
  let row = entry(DB, 'kfe1');
  assert.equal(row.narration, 'Welfare offering');
  assert.equal(row.confirmed_by, 'Treasurer');
  assert.equal(row.deposited_by, 'Treasurer');
  assert.equal(row.recorded_by, 'Bro Samuel Onuorah');

  await call(DB, 'kpsc-finance/kfe1', 'PUT', { amount: 6000, recordedBy: 'Bro. David' });
  row = entry(DB, 'kfe1');
  assert.equal(row.amount, 6000);
  assert.equal(row.confirmed_by, '');
  assert.equal(row.deposited_by, '');
  assert.equal(row.recorded_by, 'Bro Samuel Onuorah');
});

test('correcting a partner payment updates its Finance entry, and only a real change voids the sign-off', async () => {
  const DB = await initDb();
  DB.sqlite.prepare(`INSERT INTO kpsc_partners (id, full_name, partnership_type, status, monthly_pledge) VALUES ('p1', 'Peter M', 'covenant_partner', 'active', 1000)`).run();

  seedKpscSession(DB, { role: 'financial_secretary', name: 'Bro Samuel Onuorah' });
  const recorded = await call(DB, 'kpsc-partner-payments', 'POST', {
    partnerId: 'p1', year: 2026, month: 9, amount: 500, paid: true, reference: 'cash',
    recordedBy: 'Bro Samuel Onuorah', skipSms: true,
  });
  const paymentId = recorded.json.id;
  const finId = () => DB.sqlite.prepare(`SELECT id FROM kpsc_finance_entries WHERE partner_payment_id=?`).get(paymentId).id;
  DB.sqlite.prepare(`UPDATE kpsc_finance_entries SET confirmed_by='Treasurer', confirmed_at='2026-09-24 10:00:00' WHERE id=?`).run(finId());

  // Re-sending the same values (e.g. ticking "recorded in physical card") keeps the sign-off.
  await call(DB, 'kpsc-partner-payments', 'POST', {
    id: paymentId, partnerId: 'p1', year: 2026, month: 9, amount: 500, paid: true, reference: 'cash',
    recordedBy: 'Treasurer', skipSms: true,
  });
  assert.equal(entry(DB, finId()).confirmed_by, 'Treasurer');

  // A corrected amount reaches Finance and goes back for confirmation; the recorder stays.
  seedKpscSession(DB, { role: 'treasurer', name: 'Treasurer' });
  await call(DB, 'kpsc-partner-payments', 'POST', {
    id: paymentId, partnerId: 'p1', year: 2026, month: 9, amount: 1000, paid: true, reference: 'cash',
    recordedBy: 'Treasurer', skipSms: true,
  });
  const row = entry(DB, finId());
  assert.equal(row.amount, 1000);
  assert.equal(row.confirmed_by, '');
  assert.equal(row.recorded_by, 'Bro Samuel Onuorah');
});

test('settling history undoes system stamps on September income and unbanked cash, never a person\'s sign-off', async () => {
  const DB = await initDb();
  const SYS = 'System (auto)';
  // What the live database looked like after the first (too broad) backfill ran.
  addEntry(DB, { id: 'aug', date: '2026-08-15', amount: 1000, confirmed_by: SYS, deposited_by: SYS, handover_id: 'kch0' });
  addEntry(DB, { id: 'sep-cash', amount: 8000, confirmed_by: SYS, deposited_by: SYS });
  addEntry(DB, { id: 'sep-bank', amount: 2000, payment_method: 'bank_transfer', confirmed_by: SYS });
  addEntry(DB, { id: 'sep-person', amount: 700, confirmed_by: 'Treasurer', deposited_by: 'Treasurer' });
  addEntry(DB, { id: 'sep-spend', entry_type: 'expense', amount: 300, cash_box_expense: 1, deposited_by: SYS });
  // Banked through the old Transfer to Bank flow, but never stamped.
  addEntry(DB, { id: 'jul-banked', date: '2026-07-10', amount: 400, handover_id: 'kch1' });

  DB.sqlite.prepare(`DELETE FROM settings WHERE key='kpsc_income_review_history_v2'`).run();
  await onRequest({ request: new Request('https://x/api/init'), env: { DB } });

  assert.equal(entry(DB, 'aug').confirmed_by, SYS, 'older months stay settled');
  assert.equal(entry(DB, 'aug').deposited_by, SYS, 'banked via old flow stays deposited');
  assert.equal(entry(DB, 'sep-cash').confirmed_by, '');
  assert.equal(entry(DB, 'sep-cash').deposited_by, '', 'cash never banked comes back in hand');
  assert.equal(entry(DB, 'sep-bank').confirmed_by, '');
  assert.equal(entry(DB, 'sep-person').confirmed_by, 'Treasurer');
  assert.equal(entry(DB, 'sep-person').deposited_by, 'Treasurer');
  assert.equal(entry(DB, 'sep-spend').deposited_by, '');
  assert.equal(entry(DB, 'jul-banked').confirmed_by, SYS);
  assert.equal(entry(DB, 'jul-banked').deposited_by, SYS);

  const { json } = await call(DB, 'kpsc-income-review');
  assert.equal(json.cashInHandTotal, 8000 - 300);
  assert.deepEqual(json.pendingConfirmation.map(e => e.id), ['sep-bank']);

  // Runs once: a later person-free edit to the flag-protected rows isn't re-touched.
  DB.sqlite.prepare(`UPDATE kpsc_finance_entries SET confirmed_by=? WHERE id='sep-bank'`).run(SYS);
  await onRequest({ request: new Request('https://x/api/init'), env: { DB } });
  assert.equal(entry(DB, 'sep-bank').confirmed_by, SYS);
});
