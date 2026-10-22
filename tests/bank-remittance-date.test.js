// A paid remittance sits in the Bank list on the day it was PAID (paidDate), not the day the record was saved.
// Real case, 22 Oct 2026: paid 21 Oct, recorded 22 Oct, so the 21 Sep-21 Oct period view dropped it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/js/app.js', import.meta.url), 'utf8');
test('Bank list, opening balance and recent activity date a remittance by paidDate first', () => {
  const bank = src.split('\n').filter(l => /txType:'remittance'/.test(l));
  assert.equal(bank.length, 1);
  assert.match(bank[0], /date:r\.paidDate\|\|r\.date\|\|r\.createdAt/);
  assert.match(src, /_prePeriod\(r\.paidDate\|\|r\.date\|\|r\.createdAt\)/);
  assert.match(src, /type:'remittance',date:r\.paidDate\|\|r\.date\|\|r\.createdAt/);
  assert.doesNotMatch(src, /txType:'remittance'[^\n]*date:r\.date\|\|r\.createdAt/);
});
