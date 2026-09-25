import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, remCutoffPeriodForDate } from '../functions/api/[[route]].js';
import { createFinanceDBMock } from './finance-db-mock.mjs';
import { FINANCE_AUTH_HEADER } from './finance-auth-helper.mjs';

const CUTOFFS_2026 = [18, 22, 22, 19, 24, 21, 19, 23, 20, 18, 22, 13];

// Finance mock plus the one settings read the webhook makes.
function dbWithCutoffs(settings = { remCutoffDatesByYear: { 2026: CUTOFFS_2026 } }) {
  const DB = createFinanceDBMock();
  const prepare = DB.prepare.bind(DB);
  DB.prepare = (sql) => {
    if (sql.includes("WHERE key IN ('remCutoffDatesByYear','remCutoffDates')")) {
      return {
        bind() { return this; },
        async all() { return { results: Object.entries(settings).map(([key, v]) => ({ key, value: JSON.stringify(v) })) }; },
      };
    }
    return prepare(sql);
  };
  return DB;
}

function postIncome(body) {
  return new Request('https://example.com/api/income', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...FINANCE_AUTH_HEADER }, body: JSON.stringify(body),
  });
}

// Runs one POST /api/income with a stubbed global fetch; returns the response and captured calls.
async function save(body, env, { fetchImpl } = {}) {
  const calls = [];
  const jobs = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return fetchImpl ? fetchImpl(url, init) : new Response('ok'); };
  try {
    const res = await onRequest({ request: postIncome(body), env, waitUntil: (p) => jobs.push(p) });
    await Promise.all(jobs);
    return { res, calls, jobs };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const sunday = (date, extra = {}) => ({
  date, source: 'sunday_collection', membersTithe: 1000, totalCollection: 1000,
  bankTransferAmount: 0, directPettyCash: 0, notes: '', recordedBy: 'Test', ...extra,
});

test('remCutoffPeriodForDate matches only configured cut-off dates and derives the period', () => {
  const s = { remCutoffDatesByYear: { 2026: CUTOFFS_2026 } };
  assert.deepEqual(remCutoffPeriodForDate(s, '2026-09-20'), { periodStart: '2026-08-24', periodEnd: '2026-09-20' });
  assert.deepEqual(remCutoffPeriodForDate(s, '2026-03-22'), { periodStart: '2026-02-23', periodEnd: '2026-03-22' });
  assert.equal(remCutoffPeriodForDate(s, '2026-09-13'), null);
  // January with no previous-year config falls back to the 1st, like computeRemPeriodDates.
  assert.deepEqual(remCutoffPeriodForDate(s, '2026-01-18'), { periodStart: '2026-01-01', periodEnd: '2026-01-18' });
  // Legacy remCutoffDates shape is honoured for its own year.
  assert.deepEqual(remCutoffPeriodForDate({ remCutoffDates: { year: 2026, dates: CUTOFFS_2026 } }, '2026-10-18'),
    { periodStart: '2026-09-21', periodEnd: '2026-10-18' });
  assert.equal(remCutoffPeriodForDate({}, '2026-09-20'), null);
});

test('no REMIT_WEBHOOK_URL: saving the cut-off Sunday sends nothing', async () => {
  const DB = dbWithCutoffs();
  const { res, calls, jobs } = await save(sunday('2026-09-20'), { DB });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 0);
  assert.equal(jobs.length, 0);
});

test('creating then merging into the cut-off Sunday posts created/updated with the Bearer key', async () => {
  const DB = dbWithCutoffs();
  const env = { DB, REMIT_WEBHOOK_URL: 'https://hooks.example/remit', REMIT_WEBHOOK_KEY: 'k-123' };

  const first = await save(sunday('2026-09-20'), env);
  assert.equal(first.res.status, 200);
  const saved = await first.res.json();
  assert.equal(first.calls.length, 1);
  assert.equal(first.calls[0].url, 'https://hooks.example/remit');
  assert.equal(first.calls[0].init.method, 'POST');
  assert.equal(first.calls[0].init.headers.Authorization, 'Bearer k-123');
  const p1 = JSON.parse(first.calls[0].init.body);
  assert.equal(p1.event, 'cutoff_collection_saved');
  assert.equal(p1.collectionDate, '2026-09-20');
  assert.equal(p1.periodStart, '2026-08-24');
  assert.equal(p1.periodEnd, '2026-09-20');
  assert.equal(p1.action, 'created');
  assert.equal(p1.recordId, saved.id);
  assert.ok(!Number.isNaN(Date.parse(p1.savedAt)));

  const second = await save(sunday('2026-09-20', { membersTithe: 0, holyCommunionOffering: 500, totalCollection: 500 }), env);
  const p2 = JSON.parse(second.calls[0].init.body);
  assert.equal(p2.action, 'updated');
  assert.equal(p2.recordId, saved.id);
});

test('custom key header carries the raw key; no key means no auth header', async () => {
  const withHeader = await save(sunday('2026-09-20'), {
    DB: dbWithCutoffs(), REMIT_WEBHOOK_URL: 'https://hooks.example/remit', REMIT_WEBHOOK_KEY: 'k-9', REMIT_WEBHOOK_KEY_HEADER: 'X-Automation-Key',
  });
  assert.equal(withHeader.calls[0].init.headers['X-Automation-Key'], 'k-9');
  assert.equal(withHeader.calls[0].init.headers.Authorization, undefined);

  const noKey = await save(sunday('2026-09-20'), { DB: dbWithCutoffs(), REMIT_WEBHOOK_URL: 'https://hooks.example/remit' });
  assert.equal(noKey.calls[0].init.headers.Authorization, undefined);
});

test('non-cut-off Sundays and other income never notify', async () => {
  const env = { DB: dbWithCutoffs(), REMIT_WEBHOOK_URL: 'https://hooks.example/remit' };
  assert.equal((await save(sunday('2026-09-13'), env)).calls.length, 0);
  const other = await save({ date: '2026-09-20', source: 'seed', totalCollection: 500, donorName: 'X' }, env);
  assert.equal(other.res.status, 200);
  assert.equal(other.calls.length, 0);
});

test('a failing webhook is logged and never fails the save', async () => {
  const errors = [];
  const realError = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try {
    const env = { DB: dbWithCutoffs(), REMIT_WEBHOOK_URL: 'https://hooks.example/remit' };
    const down = await save(sunday('2026-09-20'), env, { fetchImpl: async () => { throw new Error('network down'); } });
    assert.equal(down.res.status, 200);
    const rejected = await save(sunday('2026-09-20'), env, { fetchImpl: async () => new Response('no', { status: 401 }) });
    assert.equal(rejected.res.status, 200);
  } finally {
    console.error = realError;
  }
  assert.ok(errors.some(e => e.includes('network down')));
  assert.ok(errors.some(e => e.includes('401')));
});
