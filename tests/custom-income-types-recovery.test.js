// Regression cover for the production failure where a custom collection type's amount
// was accepted into a Sunday record's total but silently dropped from the per-type
// breakdown, because income.custom_collections did not exist on that database yet
// (/api/init runs the migration, and a session restored from localStorage never
// called it). The amount stayed in the ledger but attracted no HQ remittance share.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  onRequest,
  getIncome,
  customAmountsFromMergeNotes,
  backfillCustomCollectionsFromNotes,
} from '../functions/api/[[route]].js';
import { createFinanceDBMock } from './finance-db-mock.mjs';
import { FINANCE_AUTH_HEADER } from './finance-auth-helper.mjs';

const CONVENTION = [{
  key: 'custom_convention_thanksgiving', label: 'Convention Thanksgiving',
  natl: 1, local: 0, active: true, order: 0,
}];

async function readJson(response) { return JSON.parse(await response.text()); }

function post(body) {
  return new Request('https://example.com/api/income', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...FINANCE_AUTH_HEADER }, body: JSON.stringify(body),
  });
}

/** The 16 Aug Sunday exactly as production had it: ₦55,450 already recorded. */
function seedSunday(extra = {}) {
  return {
    id: 'INC-1', date: '2026-08-16', members_tithe: 55450, ministers_tithe: 0, thanksgiving: 0,
    sunday_school: 0, slo: 0, crm: 0, workers_offering: 0, first_fruit: 0, children_offering: 0,
    weekend_offering: 0, holy_communion_offering: 0, total_collection: 55450,
    bank_transfer_amount: 0, direct_petty_cash: 0, source: 'sunday_collection',
    usher: 'Sis Pat', recorded_by: 'Bro. Divine Faith', notes: '', bank_transfer_details: '',
    created_at: '2026-08-16T11:05:00.000Z', ...extra,
  };
}

test('a custom amount recorded against a database missing the column is still stored', async () => {
  const DB = createFinanceDBMock({ noCustomColumn: true, customIncomeTypes: CONVENTION, income: [seedSunday()] });

  const merged = await readJson(await onRequest({
    request: post({
      date: '2026-08-16', usher: 'Sis Pat', recordedBy: 'Bro. Divine Faith', source: 'sunday_collection',
      custom_convention_thanksgiving: 7000, totalCollection: 7000,
    }),
    env: { DB },
  }));

  assert.equal(merged.merged, true);
  assert.equal(merged.totalCollection, 62450);
  // The write heals the schema and retries instead of dropping the amount.
  assert.equal(DB.tables.income[0].custom_collections, '{"custom_convention_thanksgiving":7000}');

  const rows = await readJson(await getIncome(DB));
  assert.equal(rows[0].custom_convention_thanksgiving, 7000, 'the amount must come back on the record');
  assert.equal(rows[0].totalCollection, 62450);
});

test('merge notes yield the custom amounts, and only for a currently-defined type', () => {
  const notes = '[+₦7,000 merged in by Bro. Divine Faith at 2026-08-19 22:54 — Convention Thanksgiving: 7,000 (counted with Sis Pat)]';
  assert.deepEqual(
    customAmountsFromMergeNotes(notes, { custom_convention_thanksgiving: 'Convention Thanksgiving' }),
    { custom_convention_thanksgiving: 7000 },
  );
  // An accountant's free-text note is never mistaken for an audit segment.
  assert.deepEqual(
    customAmountsFromMergeNotes('Convention Thanksgiving: 7,000 was counted late', { custom_convention_thanksgiving: 'Convention Thanksgiving' }),
    {},
  );
  assert.deepEqual(customAmountsFromMergeNotes(notes, { custom_other: 'Something Else' }), {});
  assert.deepEqual(customAmountsFromMergeNotes('', { custom_x: 'X' }), {});
});

test('the backfill restores an amount the ledger counted but never attributed', async () => {
  // Precisely the broken production row: total includes the ₦7,000, the breakdown does not.
  const DB = createFinanceDBMock({
    customIncomeTypes: CONVENTION,
    income: [seedSunday({
      total_collection: 62450,
      notes: '[+₦7,000 merged in by Bro. Divine Faith at 2026-08-19 22:54 — Convention Thanksgiving: 7,000 (counted with Sis Pat)]',
    })],
  });

  await backfillCustomCollectionsFromNotes(DB);

  assert.equal(DB.tables.income[0].custom_collections, '{"custom_convention_thanksgiving":7000}');
  assert.equal(DB.tables.income[0].total_collection, 62450, 'the recorded total was already right and must not move');
  assert.match(DB.tables.audit_log[0].detail, /Convention Thanksgiving: ₦7,000/);

  // Re-running finds no gap left, so it neither double-counts nor re-audits.
  await backfillCustomCollectionsFromNotes(DB);
  assert.equal(DB.tables.income[0].custom_collections, '{"custom_convention_thanksgiving":7000}');
  assert.equal(DB.tables.audit_log.length, 1);
});

test('the backfill leaves a record alone when the note does not explain the gap exactly', async () => {
  const DB = createFinanceDBMock({
    customIncomeTypes: CONVENTION,
    income: [seedSunday({
      total_collection: 70000,   // ₦14,550 unexplained, note only accounts for ₦7,000
      notes: '[+₦7,000 merged in by Bro. Divine Faith at 2026-08-19 22:54 — Convention Thanksgiving: 7,000]',
    })],
  });

  await backfillCustomCollectionsFromNotes(DB);

  assert.ok(!DB.tables.income[0].custom_collections, 'money is never posted on a guess');
  assert.equal(DB.tables.audit_log.length, 0);
});

test('a record that already adds up is never touched', async () => {
  const DB = createFinanceDBMock({
    customIncomeTypes: CONVENTION,
    income: [seedSunday({
      total_collection: 62450,
      custom_collections: '{"custom_convention_thanksgiving":7000}',
      notes: '[+₦7,000 merged in by Bro. Divine Faith at 2026-08-19 22:54 — Convention Thanksgiving: 7,000]',
    })],
  });

  await backfillCustomCollectionsFromNotes(DB);

  assert.equal(DB.tables.income[0].custom_collections, '{"custom_convention_thanksgiving":7000}');
  assert.equal(DB.tables.audit_log.length, 0);
});
