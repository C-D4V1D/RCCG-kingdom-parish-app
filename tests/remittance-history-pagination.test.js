// Payment History is 10 a page with Previous/Next. Pure paging logic is lifted from the source and run on fake rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/js/app.js', import.meta.url), 'utf8');
const body = src.match(/const REM_HISTORY_PAGE_SIZE[\s\S]*?\nfunction remHistoryPager/)[0].replace(/\nfunction remHistoryPager$/, '');
const state = { remHistPage: 1 };
const { remHistoryPage } = new Function('state', body + '; return { remHistoryPage };')(state);
const rows = n => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
test('10 per page, newest first order kept, last page short', () => {
  const a = remHistoryPage(rows(23), 1); assert.deepEqual([a.rows.length, a.pages, a.rows[0].id], [10, 3, 1]);
  const c = remHistoryPage(rows(23), 3); assert.deepEqual([c.rows.length, c.page, c.rows[0].id], [3, 3, 21]);
});
test('out of range pages clamp; empty list is one empty page', () => {
  assert.equal(remHistoryPage(rows(23), 99).page, 3); assert.equal(remHistoryPage(rows(23), -4).page, 1); assert.equal(remHistoryPage(rows(23), 'x').page, 1);
  const e = remHistoryPage([], 1); assert.deepEqual([e.rows.length, e.pages, e.page], [0, 1, 1]);
});
test('screen uses it: no hard 10 slice left, pager shown, handler exported', () => {
  assert.doesNotMatch(src, /allPaidRems\.slice\(0,10\)/);
  assert.match(src, /\$\{remHistoryPager\(allPaidRems\)\}/);
  assert.match(src, /setRemHistPage, _remHistoryPage/);
});
