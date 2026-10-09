// WhatsApp finance feed: each deposit says whether a bank credit matched it. Plus the two new WhatsApp post settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';
import { createSqliteD1 } from './sqlite-d1.mjs';
import { FINANCE_AUTH_HEADER, financeToken } from './finance-auth-helper.mjs';
import { DEFAULT_CONFIG, validateConfig } from '../workers/clerk-watchdog/config.js';

async function setup() {
  const DB = createSqliteD1();
  const call = (path, headers) => onRequest({ request: new Request(`https://x/api/${path}`, { headers }), env: { DB }, waitUntil() {} });
  assert.equal((await call('init', FINANCE_AUTH_HEADER)).status, 200);
  const res = await onRequest({ request: new Request('https://x/api/users', { method: 'POST', headers: { ...FINANCE_AUTH_HEADER, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test acct', role: 'accountant', pin: '1234' }) }), env: { DB }, waitUntil() {} });
  const u = await res.json();
  const auth = { Authorization: `Bearer ${await financeToken({ uid: u.id, role: 'accountant' })}` };
  const deposit = (id, extra = {}) => DB.prepare(`INSERT INTO cash_transactions (id,type,date,amount,recorded_by,destination,group_id,created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .bind(id, 'cash_deposit', '2026-10-05', 1000, 'Tester', '', extra.group || '', '2026-10-05 14:30:09').run();
  const line = (id, status, matched, cands, date = '2026-10-06', direction = 'in') =>
    DB.prepare(`INSERT INTO bank_recon_entries (id,balance_history_id,date,amount,direction,status,matched_refs_json,candidates_json) VALUES (?,?,?,?,?,?,?,?)`)
      .bind(id, 'bh-' + id, date, 1000, direction, status, JSON.stringify(matched.map(sourceId => ({ sourceTable: 'cash_transactions', sourceId }))), JSON.stringify(cands.map(sourceId => ({ sourceTable: 'cash_transactions', sourceId })))).run();
  const feed = async () => (await (await call('whatsapp-finance-events', auth)).json()).deposits;
  return { deposit, line, feed };
}
const byId = (list, id) => list.find(d => d.id === id);

test('deposit matched by an auto or resolved line reports matched with the bank date', async () => {
  const t = await setup();
  await t.deposit('D1'); await t.deposit('D2');
  await t.line('L1', 'auto', ['D1'], [], '2026-10-06');
  await t.line('L2', 'resolved', ['D2'], [], '2026-10-07');
  const f = await t.feed();
  assert.deepEqual([byId(f, 'D1').bankMatch, byId(f, 'D1').bankDate], ['matched', '2026-10-06']);
  assert.deepEqual([byId(f, 'D2').bankMatch, byId(f, 'D2').bankDate], ['matched', '2026-10-07']);
});

test('deposit that is only a candidate of a needs_attention line is review; otherwise none', async () => {
  const t = await setup();
  await t.deposit('D1'); await t.deposit('D3'); await t.deposit('D4');
  await t.line('L1', 'needs_attention', [], ['D1']);
  await t.line('L2', 'unrecorded', ['D4'], []);
  await t.line('L3', 'auto', ['D3'], [], '2026-10-06', 'out');
  const f = await t.feed();
  assert.deepEqual([byId(f, 'D1').bankMatch, byId(f, 'D1').bankDate], ['review', '']);
  assert.deepEqual([byId(f, 'D3').bankMatch, byId(f, 'D3').bankDate], ['none', '']);
  assert.equal(byId(f, 'D4').bankMatch, 'none');
});

test('matched wins over review, and id 12 is not confused with 123', async () => {
  const t = await setup();
  await t.deposit('12'); await t.deposit('123'); await t.deposit('D5');
  await t.line('L1', 'auto', ['123'], []);
  await t.line('L2', 'needs_attention', [], ['1234', 'D5']);
  await t.line('L3', 'auto', ['D5'], []);
  const f = await t.feed();
  assert.equal(byId(f, '12').bankMatch, 'none');
  assert.equal(byId(f, '123').bankMatch, 'matched');
  assert.equal(byId(f, 'D5').bankMatch, 'matched');
});

test('grouped rows are reported separately; recordedAt is ISO UTC; existing fields are kept', async () => {
  const t = await setup();
  await t.deposit('G1', { group: 'GRP' }); await t.deposit('G2', { group: 'GRP' });
  await t.line('L1', 'auto', ['G1'], []);
  const f = await t.feed();
  assert.equal(byId(f, 'G1').bankMatch, 'matched');
  assert.equal(byId(f, 'G2').bankMatch, 'none');
  assert.deepEqual(byId(f, 'G1'), { id: 'G1', groupId: 'GRP', date: '2026-10-05', amount: 1000, recordedBy: 'Tester', verificationStatus: '',
    recordedAt: '2026-10-05T14:30:09Z', bankMatch: 'matched', bankDate: '2026-10-06' });
});

test('config: deposit bank post settings default on, days 1 to 14 only', () => {
  const wa = DEFAULT_CONFIG.automations.whatsapp;
  assert.deepEqual(wa.deposit_bank_confirmed, { enabled: true });
  assert.deepEqual(wa.deposit_bank_missing, { enabled: true, days: 3 });
  assert.deepEqual(validateConfig(DEFAULT_CONFIG), []);
  const withMissing = (m) => { const c = structuredClone(DEFAULT_CONFIG); c.automations.whatsapp.deposit_bank_missing = m; return validateConfig(c); };
  for (const days of [1, 14]) assert.deepEqual(withMissing({ enabled: true, days }), []);
  for (const days of [0, 15, 'x', 2.5]) assert.ok(withMissing({ enabled: true, days }).some(e => e.includes('deposit_bank_missing.days')), String(days));
  assert.ok(withMissing({ enabled: 'yes', days: 3 }).length);
  const c = structuredClone(DEFAULT_CONFIG); c.automations.whatsapp.deposit_bank_confirmed = { enabled: 1 };
  assert.ok(validateConfig(c).some(e => e.includes('deposit_bank_confirmed.enabled')));
});
