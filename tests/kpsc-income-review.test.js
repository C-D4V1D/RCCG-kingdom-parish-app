import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';

// Covers the income-review feature: every income entry (any payment method) needs
// sign-off from the Acting Chairman or Treasurer before it's "confirmed", and cash
// income additionally needs one of them to mark it "deposited" once it's seen to hit
// the bank. Both actions are restricted server-side to those two roles regardless of
// who is otherwise allowed to record or edit finance entries.

const SESSION_HEADER = JSON.stringify({ accountId: 'ka-test', token: 'ks-test-token' });

function createKpscRequest(url, method = 'GET', body) {
  const init = { method, headers: { 'Content-Type': 'application/json', 'X-KPSC-Session': SESSION_HEADER } };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(url, init);
}

async function readJson(response) {
  return JSON.parse(await response.text());
}

function matchesHolder(e, holder) {
  if (!holder) return true;
  const cashHolder = e.cash_holder || '';
  return cashHolder === holder || (cashHolder === '' && e.recorded_by === holder);
}

// A small in-memory stand-in for the D1 binding that mutates a shared
// `financeEntries` array, so confirm/deposit calls can be verified by their actual
// effect on the rows, the same way the real UPDATE statements do.
function createDBMock({ financeEntries = [], partners = [], role = 'treasurer' }) {
  return {
    financeEntries,
    prepare(sql) {
      const st = {
        _bound: [],
        bind(...a) { st._bound = a; return st; },
        async first() {
          if (/SELECT account_id, expires_at FROM kpsc_sessions/.test(sql)) {
            return { account_id: 'ka-test', expires_at: Date.now() + 3600_000 };
          }
          if (/SELECT id, name, role, status FROM kpsc_accounts/.test(sql)) {
            return { id: 'ka-test', name: role === 'treasurer' ? 'Treasurer' : (role === 'acting_chairman' ? 'Bro. David' : 'Financial Secretary'), role, status: 'active' };
          }
          throw new Error(`Unhandled .first() SQL: ${sql}`);
        },
        async all() {
          if (sql.includes('SELECT id FROM kpsc_finance_entries WHERE id IN')) {
            const ids = st._bound;
            const results = financeEntries
              .filter(e => ids.includes(e.id) && e.entry_type === 'income' && !e.confirmed_by && !e.deleted_at)
              .map(e => ({ id: e.id }));
            return { results };
          }
          if (sql.includes('COALESCE(f.confirmed_by')) {
            const results = financeEntries
              .filter(e => e.entry_type === 'income' && !e.confirmed_by && !e.deleted_at)
              .map(e => ({
                id: e.id, date: e.date, amount: e.amount, category: e.category, sub_category: e.sub_category || '',
                narration: e.narration || '', reference: e.reference || '', payment_method: e.payment_method,
                partner_id: e.partner_id || '', recorded_by: e.recorded_by,
                partner_name: (partners.find(p => p.id === e.partner_id) || {}).full_name || null,
              }));
            return { results };
          }
          if (sql.includes("f.payment_method = 'cash'") && sql.includes("f.entry_type = 'income'")) {
            const results = financeEntries
              .filter(e => e.payment_method === 'cash' && e.entry_type === 'income' && !e.deposited_by && !e.deleted_at)
              .map(e => ({
                id: e.id, date: e.date, amount: e.amount, partner_id: e.partner_id || '', recorded_by: e.recorded_by,
                category: e.category, sub_category: e.sub_category || '', narration: e.narration || '',
                cash_holder: e.cash_holder || '',
                partner_name: (partners.find(p => p.id === e.partner_id) || {}).full_name || null,
              }));
            return { results };
          }
          if (sql.includes('f.cash_box_expense = 1')) {
            const results = financeEntries
              .filter(e => e.cash_box_expense === 1 && e.entry_type === 'expense' && !e.deposited_by && !e.deleted_at)
              .map(e => ({ id: e.id, date: e.date, amount: e.amount, narration: e.narration || '', category: e.category, recorded_by: e.recorded_by, cash_holder: e.cash_holder || '' }));
            return { results };
          }
          throw new Error(`Unhandled .all() SQL: ${sql}`);
        },
        async run() {
          if (sql.includes('SET confirmed_by=?')) {
            const [confirmedBy, ...ids] = st._bound;
            let changes = 0;
            for (const e of financeEntries) {
              if (ids.includes(e.id)) { e.confirmed_by = confirmedBy; e.confirmed_at = 'now'; changes++; }
            }
            return { meta: { changes } };
          }
          if (sql.includes('SET deposited_by=?') && sql.includes("entry_type='income'")) {
            const [depositedBy, ...holderBinds] = st._bound;
            const holder = holderBinds[0];
            let changes = 0;
            for (const e of financeEntries) {
              if (e.payment_method === 'cash' && e.entry_type === 'income' && !e.deposited_by && !e.deleted_at && matchesHolder(e, holder)) {
                e.deposited_by = depositedBy; e.deposited_at = 'now'; changes++;
              }
            }
            return { meta: { changes } };
          }
          if (sql.includes('SET deposited_by=?') && sql.includes("entry_type='expense'")) {
            const [depositedBy, ...holderBinds] = st._bound;
            const holder = holderBinds[0];
            let changes = 0;
            for (const e of financeEntries) {
              if (e.cash_box_expense === 1 && e.entry_type === 'expense' && !e.deposited_by && !e.deleted_at && matchesHolder(e, holder)) {
                e.deposited_by = depositedBy; e.deposited_at = 'now'; changes++;
              }
            }
            return { meta: { changes } };
          }
          throw new Error(`Unhandled .run() SQL: ${sql}`);
        },
      };
      return st;
    },
  };
}

function baseEntries() {
  return [
    {
      id: 'kfe1', date: '2026-09-01', entry_type: 'income', category: 'partnership_payment',
      amount: 5000, payment_method: 'cash', partner_id: 'p1', recorded_by: 'Alice', cash_holder: '',
      confirmed_by: '', deposited_by: '', deleted_at: '',
    },
    {
      id: 'kfe2', date: '2026-09-20', entry_type: 'income', category: 'welfare_&_development_offering',
      narration: 'Welfare & Development Offering', amount: 5800, payment_method: 'cash',
      partner_id: '', recorded_by: 'Bro Samuel Onuorah', cash_holder: '',
      confirmed_by: '', deposited_by: '', deleted_at: '',
    },
    {
      id: 'kfe3', date: '2026-09-22', entry_type: 'income', category: 'one_time_donation',
      narration: 'Building fund transfer', amount: 20000, payment_method: 'bank_transfer',
      partner_id: '', recorded_by: 'Financial Secretary', cash_holder: '',
      confirmed_by: '', deposited_by: '', deleted_at: '',
    },
  ];
}

test('every income entry, cash or bank, shows up awaiting confirmation regardless of category', async () => {
  const financeEntries = baseEntries();
  const partners = [{ id: 'p1', full_name: 'Partner One' }];
  const DB = createDBMock({ financeEntries, partners });
  const res = await onRequest({ request: createKpscRequest('https://x/api/kpsc-income-review', 'GET'), env: { DB } });
  const json = await readJson(res);

  assert.equal(json.awaitingConfirmationTotal, 5000 + 5800 + 20000);
  assert.equal(json.pendingConfirmation.length, 3);
  assert.equal(json.cashInHandTotal, 5000 + 5800);

  const samuel = json.holders.find(h => h.name === 'Bro Samuel Onuorah');
  assert.ok(samuel, 'cash income under a non-partner category should still count as cash in hand');
  assert.equal(samuel.inHand, 5800);
  assert.equal(samuel.lots[0].partnerName, 'Welfare & Development Offering');

  const alice = json.holders.find(h => h.name === 'Alice');
  assert.equal(alice.lots[0].partnerName, 'Partner One');
});

test('Confirm marks entries confirmed and removes them from the awaiting list', async () => {
  const financeEntries = baseEntries();
  const DB = createDBMock({ financeEntries, role: 'treasurer' });
  const res = await onRequest({
    request: createKpscRequest('https://x/api/kpsc-finance-confirm', 'POST', { ids: ['kfe1', 'kfe3'] }),
    env: { DB },
  });
  const json = await readJson(res);
  assert.equal(json.confirmed, 2);
  assert.equal(json.confirmedBy, 'Treasurer');

  const reviewRes = await onRequest({ request: createKpscRequest('https://x/api/kpsc-income-review', 'GET'), env: { DB } });
  const review = await readJson(reviewRes);
  assert.equal(review.pendingConfirmation.length, 1);
  assert.equal(review.pendingConfirmation[0].id, 'kfe2');
});

test('Confirm is refused for a role other than Acting Chairman or Treasurer', async () => {
  const financeEntries = baseEntries();
  const DB = createDBMock({ financeEntries, role: 'financial_secretary' });
  const res = await onRequest({
    request: createKpscRequest('https://x/api/kpsc-finance-confirm', 'POST', { ids: ['kfe1'] }),
    env: { DB },
  });
  assert.equal(res.status, 403);
  assert.equal(financeEntries.find(e => e.id === 'kfe1').confirmed_by, '');
});

test('Deposit for one holder clears only their cash, leaving other holders and bank transfers untouched', async () => {
  const financeEntries = baseEntries();
  const DB = createDBMock({ financeEntries, role: 'acting_chairman' });
  const res = await onRequest({
    request: createKpscRequest('https://x/api/kpsc-cash-deposit', 'POST', { holder: 'Bro Samuel Onuorah' }),
    env: { DB },
  });
  const json = await readJson(res);
  assert.equal(json.depositedBy, 'Bro. David');

  const samuel = financeEntries.find(e => e.id === 'kfe2');
  assert.equal(samuel.deposited_by, 'Bro. David');
  const alice = financeEntries.find(e => e.id === 'kfe1');
  assert.equal(alice.deposited_by, '', 'a different holder\'s cash must not be swept by someone else\'s deposit');
  const bankEntry = financeEntries.find(e => e.id === 'kfe3');
  assert.equal(bankEntry.deposited_by, '', 'bank transfers have nothing to deposit — deposit only ever touches cash');

  const reviewRes = await onRequest({ request: createKpscRequest('https://x/api/kpsc-income-review', 'GET'), env: { DB } });
  const review = await readJson(reviewRes);
  assert.equal(review.cashInHandTotal, 5000); // only Alice's undeposited cash remains
});

test('Deposit All with no holder sweeps every pending holder\'s cash at once', async () => {
  const financeEntries = baseEntries();
  const DB = createDBMock({ financeEntries, role: 'treasurer' });
  const res = await onRequest({
    request: createKpscRequest('https://x/api/kpsc-cash-deposit', 'POST', {}),
    env: { DB },
  });
  const json = await readJson(res);
  assert.equal(json.holder, 'all holders');
  assert.ok(financeEntries.find(e => e.id === 'kfe1').deposited_by);
  assert.ok(financeEntries.find(e => e.id === 'kfe2').deposited_by);
});

test('a cash-box expense reduces cash in hand for its holder until deposited', async () => {
  const financeEntries = baseEntries();
  financeEntries.push({
    id: 'kfx1', date: '2026-09-21', entry_type: 'expense', category: 'transport',
    narration: 'Fuel', amount: 500, payment_method: 'cash', cash_box_expense: 1,
    recorded_by: 'Bro Samuel Onuorah', cash_holder: '', deposited_by: '', deleted_at: '',
  });
  const DB = createDBMock({ financeEntries });
  const res = await onRequest({ request: createKpscRequest('https://x/api/kpsc-income-review', 'GET'), env: { DB } });
  const json = await readJson(res);
  const samuel = json.holders.find(h => h.name === 'Bro Samuel Onuorah');
  assert.equal(samuel.inHand, 5800 - 500);
});
