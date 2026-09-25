import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, createIncome, mergeDuplicateSundayCollections } from '../functions/api/[[route]].js';
import { createFinanceDBMock } from './finance-db-mock.mjs';
import { FINANCE_AUTH_HEADER } from './finance-auth-helper.mjs';

async function readJson(response) {
  return JSON.parse(await response.text());
}

function createRequest(url, method = 'GET', body) {
  const init = { method, headers: { ...FINANCE_AUTH_HEADER } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

test('recording a second income type for a date that already has a Sunday collection merges into the existing row', async () => {
  const DB = createFinanceDBMock();

  const first = await onRequest({
    request: createRequest('https://example.com/api/income', 'POST', {
      date: '2026-07-05', usher: 'Bro. Emmanuel', recordedBy: 'Sister Ada', source: 'sunday_collection',
      membersTithe: 76150, totalCollection: 76150, bankTransferAmount: 0, directPettyCash: 0, notes: '',
    }),
    env: { DB },
  });
  const firstBody = await readJson(first);
  assert.equal(firstBody.merged, undefined);
  assert.equal(DB.tables.income.length, 1);

  const second = await onRequest({
    request: createRequest('https://example.com/api/income', 'POST', {
      date: '2026-07-05', usher: 'Bro. Emmanuel', recordedBy: 'Sister Ada', source: 'sunday_collection',
      holyCommunionOffering: 3300, totalCollection: 3300, bankTransferAmount: 0, directPettyCash: 0, notes: '',
    }),
    env: { DB },
  });
  const secondBody = await readJson(second);

  assert.equal(DB.tables.income.length, 1, 'no second row should be created for the same Sunday');
  assert.equal(secondBody.merged, true);
  assert.equal(secondBody.id, firstBody.id);
  assert.equal(secondBody.totalCollection, 79450);
  assert.equal(secondBody.membersTithe, 76150);
  assert.equal(secondBody.holyCommunionOffering, 3300);
  assert.equal(secondBody.previousTotal, 76150);
  assert.equal(secondBody.addedAmount, 3300);
  assert.match(secondBody.notes, /Holy Communion Offering: 3,300/);
});

test('a restore/import that supplies explicit ids never merges, even for a duplicate date', async () => {
  const DB = createFinanceDBMock();
  await createIncome(DB, {
    id: 'INC-OLD-1', date: '2026-07-05', membersTithe: 76150, totalCollection: 76150, source: 'sunday_collection',
  });
  await createIncome(DB, {
    id: 'INC-OLD-2', date: '2026-07-05', holyCommunionOffering: 3300, totalCollection: 3300, source: 'sunday_collection',
  });

  assert.equal(DB.tables.income.length, 2, 'explicit-id inserts (e.g. backup restore) must be preserved as-is');
});

test('mergeDuplicateSundayCollections folds historical duplicate rows for the same date into one, re-pointing linked deposits and expenses', async () => {
  const DB = createFinanceDBMock({
    income: [
      {
        id: 'INC-1', date: '2026-07-05', members_tithe: 0, ministers_tithe: 0, thanksgiving: 0, sunday_school: 0,
        slo: 0, crm: 0, workers_offering: 0, first_fruit: 0, children_offering: 0, weekend_offering: 0,
        holy_communion_offering: 3300, total_collection: 3300, bank_transfer_amount: 0, direct_petty_cash: 0,
        source: 'sunday_collection', usher: 'Bro. Emmanuel', recorded_by: 'Sister Ada', notes: '',
        bank_transfer_details: '', created_at: '2026-07-05T01:23:00.000Z',
      },
      {
        id: 'INC-2', date: '2026-07-05', members_tithe: 76150, ministers_tithe: 0, thanksgiving: 0, sunday_school: 0,
        slo: 0, crm: 0, workers_offering: 0, first_fruit: 0, children_offering: 0, weekend_offering: 0,
        holy_communion_offering: 0, total_collection: 76150, bank_transfer_amount: 0, direct_petty_cash: 0,
        source: 'sunday_collection', usher: 'Bro. Emmanuel', recorded_by: 'Sister Ada', notes: '',
        bank_transfer_details: '', created_at: '2026-07-05T13:22:00.000Z',
      },
    ],
    cash_transactions: [
      { id: 'DEP-1', type: 'cash_deposit', income_ref: 'INC-2', amount: 1850, date: '2026-07-05' },
    ],
    expenses: [
      { id: 'EXP-1', income_ref: 'INC-1', amount: 500, date: '2026-07-05' },
    ],
  });

  await mergeDuplicateSundayCollections(DB);

  assert.equal(DB.tables.income.length, 1, 'the two same-date rows should collapse into one');
  const survivor = DB.tables.income[0];
  assert.equal(survivor.id, 'INC-1', 'the earliest-created row should be the surviving record');
  assert.equal(survivor.total_collection, 79450);
  assert.equal(survivor.members_tithe, 76150);
  assert.equal(survivor.holy_communion_offering, 3300);

  assert.equal(DB.tables.cash_transactions[0].income_ref, 'INC-1', 'deposit linked to the deleted duplicate should be re-pointed to the survivor');
  assert.equal(DB.tables.expenses[0].income_ref, 'INC-1', 'expense already linked to the survivor should be untouched');

  // Re-running should be a safe no-op — no duplicate dates left to merge.
  await mergeDuplicateSundayCollections(DB);
  assert.equal(DB.tables.income.length, 1);
});
