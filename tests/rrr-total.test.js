// RRR total from the box becomes Part A due. Fake data, October's real shape (app lines 79,189.40, portal 79,189.41).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequest } from '../functions/api/[[route]].js';

function fakeDb() {
  const store = { rrrTotals: undefined, audit: 0 };
  return { store, prepare(sql) {
    let a = [];
    const st = { bind(...x) { a = x; return st; },
      async first() { return /FROM settings WHERE key/.test(sql) && store[a[0]] !== undefined ? { value: store[a[0]] } : null; },
      async all() { return { results: [] }; },
      async run() { if (/INSERT INTO settings/.test(sql)) store[a[0]] = a[1]; else store.audit++; return { meta: { changes: 1 } }; } };
    return st; } };
}
const call = async (DB, b, token = 'wt') => {
  const res = await onRequest({ request: new Request('https://example.com/api/internal/rrr-total', { method: 'POST', headers: { 'x-watchdog-token': token, 'content-type': 'application/json' }, body: JSON.stringify(b) }), env: { DB, CLERK_WATCHDOG_TOKEN: 'wt' }, params: { route: ['internal', 'rrr-total'] } });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const good = { rrr: '161528198373', total: 79189.41, fee: 300, vat: 22.5, periodTo: '2026-10-21' };

test('route: wrong token and bad input store nothing', async () => {
  const DB = fakeDb();
  assert.equal((await call(DB, good, 'nope')).status, 401);
  for (const o of [{ rrr: '1' }, { total: 0 }, { total: -5 }, { periodTo: '21/10/2026' }]) assert.equal((await call(DB, { ...good, ...o })).status, 400);
  assert.equal(DB.store.rrrTotals, undefined);
});
test('route: stores per period, replaces on repeat, keeps other periods', async () => {
  const DB = fakeDb();
  assert.equal((await call(DB, good)).json.replaced, false);
  assert.equal((await call(DB, { ...good, periodTo: '2026-09-20', total: 5000.5 })).json.ok, true);
  const again = await call(DB, { ...good, total: 79189.42 });
  assert.equal(again.json.replaced, true);
  const m = JSON.parse(DB.store.rrrTotals);
  assert.equal(m['2026-10-21'].total, 79189.42); assert.equal(m['2026-09-20'].total, 5000.5);
});

const src = readFileSync(new URL('../src/js/app.js', import.meta.url), 'utf8');
const fn = src.match(/function rrrRoundingLine[\s\S]*?\n}\n/)[0];
const rrrRoundingLine = new Function('fmt', fn + '; return rrrRoundingLine;')(n => `₦${n}`);
test('page: a kobo gap becomes one adjustment line and due equals the RRR total', () => {
  const l = rrrRoundingLine(79189.40, { rrr: '161528198373', total: 79189.41 });
  assert.equal(l.amount, 0.01); assert.equal(Math.round((79189.40 + l.amount) * 100) / 100, 79189.41);
  assert.equal(rrrRoundingLine(79189.42, { rrr: 'x', total: 79189.41 }).amount, -0.01);
});
test('page: no entry, equal, or a gap above 1 naira changes nothing', () => {
  assert.equal(rrrRoundingLine(100, undefined), null); assert.equal(rrrRoundingLine(100, { total: 100 }), null);
  assert.equal(rrrRoundingLine(100, { total: 100.004 }), null); assert.equal(rrrRoundingLine(100, { total: 105 }), null); assert.equal(rrrRoundingLine(100, { total: 0 }), null);
  assert.match(src, /rrrRoundingLine\(partALines\.reduce/);
});
