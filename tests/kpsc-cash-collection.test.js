import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';

// Regression test for: cash income recorded under any category other than the
// auto-synced 'partnership_pledge' rows (e.g. a manually entered "Welfare &
// Development Offering" with payment method Cash) used to be silently excluded
// from the Cash in Hand tracker (getKpscCashCollection filtered on
// category='partnership_pledge'). It should now count any cash income entry.

const SESSION_HEADER = JSON.stringify({ accountId: 'ka-test', token: 'ks-test-token' });

function createKpscRequest(url, method = 'GET', body) {
  const init = { method, headers: { 'Content-Type': 'application/json', 'X-KPSC-Session': SESSION_HEADER } };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(url, init);
}

async function readJson(response) {
  return JSON.parse(await response.text());
}

function createDBMock({ financeEntries, partners = [], handovers = [] }) {
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
          throw new Error(`Unhandled .first() SQL: ${sql}`);
        },
        async all() {
          // Cash income lots
          if (sql.includes('FROM kpsc_finance_entries f') && sql.includes('LEFT JOIN kpsc_partners p') && sql.includes("f.entry_type = 'income'")) {
            const results = financeEntries
              .filter(e => e.payment_method === 'cash' && e.entry_type === 'income' && !e.handover_id && !e.deleted_at)
              .map(e => ({
                id: e.id, date: e.date, amount: e.amount, partner_id: e.partner_id || '', recorded_by: e.recorded_by,
                category: e.category, sub_category: e.sub_category || '', narration: e.narration || '',
                cash_holder: e.cash_holder || '',
                partner_name: (partners.find(p => p.id === e.partner_id) || {}).full_name || null,
              }));
            return { results };
          }
          // Unreconciled cash-box expenses
          if (sql.includes('FROM kpsc_finance_entries f') && sql.includes('f.cash_box_expense = 1')) {
            const results = financeEntries
              .filter(e => e.cash_box_expense === 1 && e.entry_type === 'expense' && !e.handover_id && !e.deleted_at)
              .map(e => ({ id: e.id, date: e.date, amount: e.amount, narration: e.narration || '', category: e.category, recorded_by: e.recorded_by, cash_holder: e.cash_holder || '' }));
            return { results };
          }
          if (sql.includes('FROM kpsc_cash_handovers')) {
            return { results: handovers };
          }
          throw new Error(`Unhandled .all() SQL: ${sql}`);
        },
        async run() { throw new Error(`Unhandled .run() SQL: ${sql}`); },
      };
      return st;
    },
  };
}

test('cash income recorded under a non-partnership-pledge category counts toward Cash in Hand', async () => {
  const financeEntries = [
    {
      id: 'kfe1', date: '2026-09-01', entry_type: 'income', category: 'partnership_pledge',
      amount: 5000, payment_method: 'cash', partner_id: 'p1', recorded_by: 'Alice', cash_holder: '',
      handover_id: '', deleted_at: '',
    },
    {
      id: 'kfe2', date: '2026-09-20', entry_type: 'income', category: 'welfare_&_development_offering',
      narration: 'Welfare & Development Offering', amount: 5800, payment_method: 'cash',
      partner_id: '', recorded_by: 'Bro Samuel Onuorah', cash_holder: '', handover_id: '', deleted_at: '',
    },
  ];
  const partners = [{ id: 'p1', full_name: 'Partner One' }];

  const DB = createDBMock({ financeEntries, partners });
  const res = await onRequest({
    request: createKpscRequest('https://x/api/kpsc-cash-collection', 'GET'),
    env: { DB },
  });
  const json = await readJson(res);

  assert.equal(json.collectedTotal, 10800);
  assert.equal(json.pendingTotal, 10800);

  const samuel = json.holders.find(h => h.name === 'Bro Samuel Onuorah');
  assert.ok(samuel, 'Welfare & Development Offering holder should appear in Cash in Hand');
  assert.equal(samuel.collected, 5800);
  assert.equal(samuel.lots[0].partnerName, 'Welfare & Development Offering');

  const alice = json.holders.find(h => h.name === 'Alice');
  assert.ok(alice);
  assert.equal(alice.lots[0].partnerName, 'Partner One');
});

test('a retained-change synthetic entry is still labeled correctly, not mistaken for real income', async () => {
  const financeEntries = [
    {
      id: 'kfe3', date: '2026-09-05', entry_type: 'income', category: 'partnership_pledge',
      sub_category: 'retained_change', narration: 'Cash retained (change from handover to bank)',
      amount: 1500, payment_method: 'cash', partner_id: '', recorded_by: 'Bola', cash_holder: 'Bola',
      handover_id: '', deleted_at: '',
    },
  ];
  const DB = createDBMock({ financeEntries });
  const res = await onRequest({
    request: createKpscRequest('https://x/api/kpsc-cash-collection', 'GET'),
    env: { DB },
  });
  const json = await readJson(res);
  const bola = json.holders.find(h => h.name === 'Bola');
  assert.ok(bola);
  assert.equal(bola.lots[0].partnerName, 'Cash retained (change)');
});
