// Admin-defined ("custom") Sunday collection types — Admin Panel → Collection Types.
// Covers the client-side type list plumbing and the server-side storage/merge path
// that keeps their amounts on the income record without a per-type schema change.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createIncome,
  getIncome,
  saveSettings,
  normalizeCustomIncomeTypeDefs,
  parseCustomCollections,
  extractCustomCollections,
  onRequest,
  mergeDuplicateSundayCollections,
} from '../functions/api/[[route]].js';
import { createFinanceDBMock } from './finance-db-mock.mjs';

function makeElement() {
  return {
    style: {}, innerHTML: '', textContent: '', value: '', disabled: false, files: [],
    appendChild() {}, insertBefore() {}, remove() {}, addEventListener() {}, setAttribute() {},
    getAttribute() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
}

const documentStub = {
  readyState: 'complete',
  body: makeElement(),
  getElementById() { return null; },
  createElement() { return makeElement(); },
  addEventListener() {},
};

globalThis.document = documentStub;
globalThis.window = { document: documentStub, location: { pathname: '/' }, addEventListener() {} };
Object.defineProperty(globalThis, 'localStorage', { value: { getItem() { return null; }, setItem() {}, removeItem() {} }, configurable: true });
Object.defineProperty(globalThis, 'history', { value: { replaceState() {} }, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
globalThis.window.localStorage = globalThis.localStorage;
globalThis.window.history = globalThis.history;
globalThis.window.navigator = globalThis.navigator;

await import(new URL(`../src/js/app.js?custom-income-types-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;

const BUILTIN_COUNT = App._BUILTIN_INCOME_TYPES.length;

// Every test that touches INCOME_TYPES restores the built-in-only list afterwards —
// the array is module-level state shared by the whole app.
function withCustomTypes(types, fn) {
  try {
    App._applyCustomIncomeTypes({ customIncomeTypes: types });
    return fn();
  } finally {
    App._applyCustomIncomeTypes({ customIncomeTypes: [] });
  }
}

async function readJson(response) { return JSON.parse(await response.text()); }

function createRequest(url, method = 'GET', body) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

// ── Client: type list ────────────────────────────────────────────────────────

test('applying custom types appends them after the built-ins and is reversible', () => {
  withCustomTypes([{ key: 'custom_harvest_offering', label: 'Harvest Offering', natl: 1 }], () => {
    assert.equal(App._INCOME_TYPES.length, BUILTIN_COUNT + 1);
    const added = App._INCOME_TYPES[App._INCOME_TYPES.length - 1];
    assert.deepEqual(
      { key: added.key, label: added.label, natl: added.natl, local: added.local, custom: added.custom, inactive: added.inactive },
      { key: 'custom_harvest_offering', label: 'Harvest Offering', natl: 1, local: 0, custom: true, inactive: false },
    );
  });
  assert.equal(App._INCOME_TYPES.length, BUILTIN_COUNT);
});

test('a deactivated type stays in INCOME_TYPES for reporting but leaves the entry form', () => {
  withCustomTypes([
    { key: 'custom_retired_offering', label: 'Retired Offering', natl: 1, active: false },
    { key: 'custom_live_offering', label: 'Live Offering', natl: 0.5, active: true },
  ], () => {
    assert.equal(App._INCOME_TYPES.length, BUILTIN_COUNT + 2, 'history must still be summed and reported');
    const selectable = App._selectableIncomeTypes().map(t => t.key);
    assert.ok(!selectable.includes('custom_retired_offering'));
    assert.ok(selectable.includes('custom_live_offering'));
  });
});

test('malformed type definitions are dropped rather than corrupting the type list', () => {
  const cleaned = App._normalizeCustomIncomeTypes([
    { key: 'custom_ok', label: 'Fine' },
    { key: 'membersTithe', label: 'Hijack a built-in' },   // wrong key shape
    { key: 'custom_ok', label: 'Duplicate key' },
    { key: 'custom_no_label', label: '   ' },
    null,
    'nonsense',
  ]);
  assert.deepEqual(cleaned.map(t => t.key), ['custom_ok']);
  assert.equal(cleaned[0].label, 'Fine');
});

test('the National share is clamped to 0–100% and Local is always the remainder', () => {
  const cleaned = App._normalizeCustomIncomeTypes([
    { key: 'custom_over', label: 'Over', natl: 4 },
    { key: 'custom_under', label: 'Under', natl: -2 },
    { key: 'custom_split', label: 'Split', natl: 0.35 },
  ]);
  assert.deepEqual(cleaned.map(t => [t.natl, t.local]), [[1, 0], [0, 1], [0.35, 0.65]]);
});

test('markup characters are stripped from a custom label before it is stored', () => {
  assert.equal(App._sanitizeCustomIncomeLabel('<script>alert(1)</script>Seed'), 'scriptalert(1)/scriptSeed');
  assert.equal(App._sanitizeCustomIncomeLabel('  Harvest   Offering  '), 'Harvest Offering');
  assert.equal(App._sanitizeCustomIncomeLabel("Children's Offering"), "Children's Offering", 'apostrophes are legitimate in collection names');
});

test('generated keys are slugged from the label and never collide', () => {
  assert.equal(App._customIncomeKeyFromLabel('Harvest Thanksgiving Offering!'), 'custom_harvest_thanksgiving_offering');
  assert.equal(App._customIncomeKeyFromLabel('Seed', ['custom_seed']), 'custom_seed_2');
  assert.match(App._customIncomeKeyFromLabel('₦₦₦'), /^custom_collection$/);
});

// ── Client: remittance calculation ───────────────────────────────────────────

test('a custom type flows through the remittance split using its own configured rate', async () => {
  await withCustomTypes([{ key: 'custom_harvest_offering', label: 'Harvest Offering', natl: 0.4 }], async () => {
    const rates = { rates: { custom_harvest_offering: { natl: 0.4, local: 0.6 } },
      tgNational: 0.75, tgArea: 0.05, tgPastor: 0.10, tgMinisters: 0.09, tgSeed: 0.01,
      provinceRebate: 0.20, crmAddon: 0, coastline: 0, insuranceGenTithe: 0, insuranceMinTithe: 0 };
    const res = await App._calcRemittances({ custom_harvest_offering: 10000 }, rates);
    const line = res.lines.find(l => l.key === 'custom_harvest_offering');
    assert.ok(line, 'the custom type must produce a remittance line');
    assert.equal(line.national, 4000);
    assert.equal(line.local, 6000);
    assert.equal(res.totalNatl, 4000);
    assert.equal(res.provinceRebate, 0, 'Province Rebate is charged on tithes only');
    assert.equal(res.netLocal, 6000);
  });
});

test('a custom type with no saved rate falls back to the split held on its definition', async () => {
  await withCustomTypes([{ key: 'custom_building_levy', label: 'Building Levy', natl: 1 }], async () => {
    const rates = { rates: {}, tgNational: 0.75, tgArea: 0.05, tgPastor: 0.10, tgMinisters: 0.09, tgSeed: 0.01,
      provinceRebate: 0.20, crmAddon: 0, coastline: 0, insuranceGenTithe: 0, insuranceMinTithe: 0 };
    const res = await App._calcRemittances({ custom_building_levy: 5000 }, rates);
    const line = res.lines.find(l => l.key === 'custom_building_levy');
    assert.equal(line.national, 5000);
    assert.equal(line.local, 0);
  });
});

test('usage counts identify which custom types already have money recorded against them', () => {
  const usage = App._customIncomeTypeUsage(
    [{ custom_a: 1500 }, { custom_a: 500, custom_b: 0 }, { membersTithe: 900 }],
    ['custom_a', 'custom_b'],
  );
  assert.deepEqual(usage.custom_a, { records: 2, total: 2000 });
  assert.deepEqual(usage.custom_b, { records: 0, total: 0 });
});

// ── Server: storage ──────────────────────────────────────────────────────────

test('server-side normalization mirrors the client rules before anything is stored', () => {
  const cleaned = normalizeCustomIncomeTypeDefs([
    { key: 'custom_valid', label: '<b>Harvest</b> Offering', natl: 2, active: false },
    { key: 'DROP TABLE income', label: 'Bad key' },
    { key: 'custom_valid', label: 'Duplicate' },
  ]);
  assert.equal(cleaned.length, 1);
  assert.deepEqual(
    { key: cleaned[0].key, label: cleaned[0].label, natl: cleaned[0].natl, local: cleaned[0].local, active: cleaned[0].active, order: cleaned[0].order },
    { key: 'custom_valid', label: 'bHarvest/b Offering', natl: 1, local: 0, active: false, order: 0 },
  );
});

test('only well-formed custom keys survive parsing and extraction', () => {
  assert.deepEqual(parseCustomCollections('{"custom_a":100,"membersTithe":900,"custom_b":0,"bad key":5}'), { custom_a: 100 });
  assert.deepEqual(parseCustomCollections('not json'), {});
  assert.deepEqual(extractCustomCollections({ custom_a: 100, totalCollection: 100, notes: 'x' }), { custom_a: 100 });
  assert.deepEqual(
    extractCustomCollections({ customCollections: { custom_a: 40 }, custom_a: 40 }),
    { custom_a: 40 },
    'a nested map wins outright so a round-tripped record is never double-counted',
  );
});

test('a custom-type amount is stored on the income record and read back as a top-level field', async () => {
  const DB = createFinanceDBMock();
  await createIncome(DB, {
    id: 'INC-1', date: '2026-08-16', source: 'sunday_collection',
    membersTithe: 50000, custom_harvest_offering: 7500, totalCollection: 57500,
  });
  assert.equal(DB.tables.income[0].custom_collections, '{"custom_harvest_offering":7500}');

  const rows = await readJson(await getIncome(DB));
  assert.equal(rows[0].custom_harvest_offering, 7500);
  assert.equal(rows[0].membersTithe, 50000);
});

test('a second entry for the same Sunday merges custom-type amounts and re-totals the collection', async () => {
  const DB = createFinanceDBMock({
    customIncomeTypes: [{ key: 'custom_harvest_offering', label: 'Harvest Offering', natl: 1, local: 0, active: true, order: 0 }],
  });

  await onRequest({
    request: createRequest('https://example.com/api/income', 'POST', {
      date: '2026-08-16', usher: 'Bro. Emmanuel', recordedBy: 'Sister Ada', source: 'sunday_collection',
      membersTithe: 50000, custom_harvest_offering: 2500, totalCollection: 52500,
    }),
    env: { DB },
  });

  const second = await readJson(await onRequest({
    request: createRequest('https://example.com/api/income', 'POST', {
      date: '2026-08-16', usher: 'Bro. Emmanuel', recordedBy: 'Sister Ada', source: 'sunday_collection',
      custom_harvest_offering: 1500, totalCollection: 1500,
    }),
    env: { DB },
  }));

  assert.equal(DB.tables.income.length, 1, 'the same Sunday must stay a single record');
  assert.equal(second.merged, true);
  assert.equal(second.custom_harvest_offering, 4000);
  assert.equal(second.totalCollection, 54000, 'custom amounts must be inside the re-computed total');
  assert.equal(second.addedAmount, 1500);
  assert.match(second.notes, /Harvest Offering: 1,500/, 'the merge note names the custom type');
});

test('historical duplicate Sundays fold their custom-type amounts into the surviving row', async () => {
  const DB = createFinanceDBMock({
    customIncomeTypes: [{ key: 'custom_harvest_offering', label: 'Harvest Offering', natl: 1, local: 0, active: true, order: 0 }],
    income: [
      {
        id: 'INC-1', date: '2026-08-16', members_tithe: 50000, ministers_tithe: 0, thanksgiving: 0, sunday_school: 0,
        slo: 0, crm: 0, workers_offering: 0, first_fruit: 0, children_offering: 0, weekend_offering: 0,
        holy_communion_offering: 0, custom_collections: '{"custom_harvest_offering":2500}', total_collection: 52500,
        bank_transfer_amount: 0, direct_petty_cash: 0, source: 'sunday_collection', usher: 'Bro. Emmanuel',
        recorded_by: 'Sister Ada', notes: '', bank_transfer_details: '', created_at: '2026-08-16T01:00:00.000Z',
      },
      {
        id: 'INC-2', date: '2026-08-16', members_tithe: 0, ministers_tithe: 0, thanksgiving: 0, sunday_school: 0,
        slo: 0, crm: 0, workers_offering: 0, first_fruit: 0, children_offering: 0, weekend_offering: 0,
        holy_communion_offering: 0, custom_collections: '{"custom_harvest_offering":1500}', total_collection: 1500,
        bank_transfer_amount: 0, direct_petty_cash: 0, source: 'sunday_collection', usher: 'Bro. Emmanuel',
        recorded_by: 'Sister Ada', notes: '', bank_transfer_details: '', created_at: '2026-08-16T13:00:00.000Z',
      },
    ],
  });

  await mergeDuplicateSundayCollections(DB);

  assert.equal(DB.tables.income.length, 1);
  const survivor = DB.tables.income[0];
  assert.equal(survivor.custom_collections, '{"custom_harvest_offering":4000}');
  assert.equal(survivor.total_collection, 54000);
  assert.match(survivor.notes, /Harvest Offering: ₦1,500/);
});

test('saving settings normalizes the collection-type list on the way into the database', async () => {
  const stored = {};
  const DB = {
    prepare(sql) {
      return {
        bind(...binds) {
          return {
            async run() {
              if (sql.includes('INSERT OR REPLACE INTO settings')) stored[binds[0]] = binds[1];
              return { success: true };
            },
          };
        },
      };
    },
  };
  await saveSettings(DB, {
    churchName: 'RCCG Kingdom Parish, Aguleri',
    customIncomeTypes: [{ key: 'custom_x', label: 'X Offering', natl: 5 }, { key: 'nope', label: 'Dropped' }],
  });
  assert.equal(stored.churchName, 'RCCG Kingdom Parish, Aguleri');
  const list = JSON.parse(stored.customIncomeTypes);
  assert.equal(list.length, 1);
  assert.equal(list[0].key, 'custom_x');
  assert.equal(list[0].natl, 1);
});

// ── Admin panel: Collection Types tab ────────────────────────────────────────

test('the Collection Types tab lists built-ins read-only and custom types as editable rows', () => {
  const html = App._renderAdminIncomeTypes(
    {
      customIncomeTypes: [
        { key: 'custom_harvest_offering', label: 'Harvest Offering', natl: 0.4, active: true, order: 0 },
        { key: 'custom_retired_levy', label: 'Retired Levy', natl: 1, active: false, order: 1 },
      ],
      remittanceRates: { custom_harvest_offering: { natl: 0.4, local: 0.6 } },
    },
    [{ custom_harvest_offering: 2500 }, { custom_harvest_offering: 1500 }],
  );

  assert.match(html, /Sunday Collection Types/);
  // Built-in section is informational only — no inputs bound to built-in keys.
  assert.match(html, /Members&#39; Tithe<\/td>\s*<td class="td-c">58%/);
  assert.ok(!html.includes('cit_label_membersTithe'));
  // Custom rows are editable and carry the effective saved rate.
  assert.match(html, /id="cit_label_custom_harvest_offering" class="form-input" value="Harvest Offering"/);
  assert.match(html, /id="cit_natl_custom_harvest_offering" class="form-input" value="40"/);
  // A type with recorded money reports its usage and cannot be deleted.
  assert.match(html, /2 records/);
  assert.match(html, /confirmDeleteIncomeType\('custom_harvest_offering'\)[^>]*disabled/);
  // A deactivated type is shown as inactive and offers reactivation.
  assert.match(html, /Reactivate/);
  assert.match(html, /Not used yet/);
});

test('the tab renders cleanly when the parish has not added any type yet', () => {
  const html = App._renderAdminIncomeTypes({}, []);
  assert.match(html, /No extra collection types yet/);
  assert.match(html, /Add a New Collection Type/);
  assert.ok(!html.includes('cit_label_'));
});

test('a custom label containing markup is rendered escaped in the admin table', () => {
  const html = App._renderAdminIncomeTypes(
    { customIncomeTypes: [{ key: 'custom_x', label: '<img src=x onerror=alert(1)>', natl: 1 }] },
    [],
  );
  assert.ok(!html.includes('<img src=x'), 'the label must never reach the page as markup');
});
