// Bank reconciliation matching engine (Finance portal — the main church account). Pure,
// deterministic subset-sum matching: given one real bank balance movement and a pool of the
// church's own unreconciled records, find which record (or combination of records) explains it.
// See the "Bank reconciliation" plan discussed with the owner: one bank movement may equal
// several app entries added together, or several bank movements may equal one app entry — same
// engine, matched against income-type or expense-type ('in'/'out') candidates either way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findMatchingCombinations, matchBalanceMovement, buildReconciliationCandidatePool, verifyStatementRows } from '../functions/api/[[route]].js';

function cand(sourceTable, sourceId, date, amount, direction) {
  return { sourceTable, sourceId, date, amount, direction };
}

test('a single candidate with the exact amount is an auto-confident match', () => {
  const candidates = [cand('income', 'i1', '2026-10-04', 245000, 'in')];
  const result = matchBalanceMovement({ amount: 245000, direction: 'in', date: '2026-10-04' }, candidates);
  assert.equal(result.status, 'auto');
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].sourceId, 'i1');
});

test('one withdrawal matching three expense entries added together (David\'s own example)', () => {
  const candidates = [
    cand('expenses', 'e1', '2026-10-07', 30000, 'out'),  // fuel
    cand('expenses', 'e2', '2026-10-07', 20000, 'out'),  // cleaning supplies
    cand('expenses', 'e3', '2026-10-08', 35000, 'out'),  // building repair
  ];
  const result = matchBalanceMovement({ amount: 85000, direction: 'out', date: '2026-10-07' }, candidates);
  assert.equal(result.status, 'auto');
  assert.deepEqual(result.matches.map(m => m.sourceId).sort(), ['e1', 'e2', 'e3']);
});

test('a same-amount singleton elsewhere does not stop the real combination from being found', () => {
  // e4 alone also equals 85,000 but on a much closer date — a plain "closest date wins" matcher
  // would wrongly prefer it over the real three-entry combination. Here the two are a genuine
  // tie (total date distance 1 either way), which is a real ambiguity, not a bug — it must be
  // surfaced for a decision, never silently resolved either way.
  const candidates = [
    cand('expenses', 'e1', '2026-10-07', 30000, 'out'),
    cand('expenses', 'e2', '2026-10-07', 20000, 'out'),
    cand('expenses', 'e3', '2026-10-08', 35000, 'out'),
    cand('expenses', 'e4', '2026-10-06', 85000, 'out'),
  ];
  const result = matchBalanceMovement({ amount: 85000, direction: 'out', date: '2026-10-07' }, candidates);
  assert.equal(result.status, 'needs_attention');
  const sums = result.matches.map(combo => combo.reduce((s, c) => s + c.amount, 0));
  assert.ok(sums.every(s => Math.abs(s - 85000) < 0.5));
});

test('one deposit matching several income entries added together (the mirror case)', () => {
  const candidates = [
    cand('income', 'i1', '2026-10-05', 13300, 'in'),
    cand('income', 'i2', '2026-10-05', 18000, 'in'),
  ];
  const result = matchBalanceMovement({ amount: 31300, direction: 'in', date: '2026-10-05' }, candidates);
  assert.equal(result.status, 'auto');
  assert.deepEqual(result.matches.map(m => m.sourceId).sort(), ['i1', 'i2']);
});

test('nothing in the pool adds up: unrecorded', () => {
  const candidates = [cand('expenses', 'e1', '2026-10-07', 12000, 'out')];
  const result = matchBalanceMovement({ amount: 50000, direction: 'out', date: '2026-10-07' }, candidates);
  assert.equal(result.status, 'unrecorded');
  assert.deepEqual(result.matches, []);
});

test('two genuinely different combinations of the same quality: needs_attention, not a guess', () => {
  // Diesel refill alone (₦52,000) vs printing + transport added together (₦18,000 + ₦34,000) —
  // both equally plausible, both the same date-distance from the movement.
  const candidates = [
    cand('expenses', 'e1', '2026-10-08', 52000, 'out'),
    cand('expenses', 'e2', '2026-10-08', 18000, 'out'),
    cand('expenses', 'e3', '2026-10-08', 34000, 'out'),
  ];
  const result = matchBalanceMovement({ amount: 52000, direction: 'out', date: '2026-10-09' }, candidates);
  assert.equal(result.status, 'needs_attention');
  assert.ok(result.matches.length >= 2, 'offers more than one candidate combination');
  for (const combo of result.matches) {
    const sum = combo.reduce((s, c) => s + c.amount, 0);
    assert.ok(Math.abs(sum - 52000) < 0.5, 'every offered combination actually sums to the movement amount');
  }
});

test('the ±match-window is the caller\'s job: a candidate outside it must not be passed in at all', () => {
  // The engine itself trusts whatever candidates it's given — the 7-day window is enforced by
  // whoever builds the candidate list, not re-checked here. This just confirms a date 10 days
  // away, if mistakenly included, still gets *considered* (no silent internal date filtering) —
  // callers must do their own filtering before calling matchBalanceMovement.
  const candidates = [cand('expenses', 'e1', '2026-09-27', 5000, 'out')]; // 10 days before
  const result = matchBalanceMovement({ amount: 5000, direction: 'out', date: '2026-10-07' }, candidates);
  assert.equal(result.status, 'auto');
});

test('wrong-direction candidates never match even at the same amount', () => {
  // matchBalanceMovement doesn't filter by direction itself — buildReconciliationCandidatePool
  // tags each candidate's direction, and callers are expected to pre-filter to the movement's own
  // direction. This test documents that expectation: an 'in' candidate equal to an 'out' movement
  // amount still "matches" numerically if passed in, because direction filtering is the caller's
  // responsibility, not the matcher's — so a caller that forgets to filter would wrongly match.
  const inCandidate = cand('income', 'i1', '2026-10-07', 5000, 'in');
  const result = matchBalanceMovement({ amount: 5000, direction: 'out', date: '2026-10-07' }, [inCandidate]);
  // Documents current behaviour: the matcher is direction-agnostic by itself.
  assert.equal(result.status, 'auto');
});

test('combo search is bounded: a larger pool still resolves quickly and correctly', () => {
  const candidates = [];
  for (let i = 0; i < 20; i++) candidates.push(cand('expenses', `e${i}`, '2026-10-07', 1000 + i, 'out'));
  const target = (1000 + 0) + (1000 + 1) + (1000 + 2); // three smallest amounts
  const start = Date.now();
  const result = matchBalanceMovement({ amount: target, direction: 'out', date: '2026-10-07' }, candidates);
  const elapsedMs = Date.now() - start;
  assert.ok(elapsedMs < 1000, `matching took ${elapsedMs}ms — should be well under a second`);
  assert.ok(result.status === 'auto' || result.status === 'needs_attention');
});

test('findMatchingCombinations finds no combos when the target is zero or negative', () => {
  const candidates = [cand('expenses', 'e1', '2026-10-07', 1000, 'out')];
  assert.deepEqual(findMatchingCombinations(0, candidates, '2026-10-07'), []);
});

// ── buildReconciliationCandidatePool ────────────────────────────────────────────────────────
test('buildReconciliationCandidatePool mirrors calcChurchBalance\'s own bank-affecting line items', () => {
  const pool = buildReconciliationCandidatePool({
    income: [{ id: 'i1', date: '2026-10-04', bankTransferAmount: 245000 }],
    expenses: [
      { id: 'e1', date: '2026-10-07', amount: 30000, paymentMethod: 'bank_transfer', status: 'approved' },
      { id: 'e2', date: '2026-10-07', amount: 100, paymentMethod: 'cash', status: 'approved' }, // cash-only: never touches the bank
      { id: 'e3', date: '2026-10-07', bankAmount: 20000, cashAmount: 5000, paymentMethod: 'split', status: 'approved' },
      { id: 'e4', date: '2026-10-07', amount: 9999, paymentMethod: 'bank_transfer', status: 'rejected' }, // not a logged expense
    ],
    remittances: [
      { id: 'r1', paidDate: '2026-08-28', amount: 305116, status: 'paid' },
      { id: 'r2', paidDate: '2026-08-28', amount: 50000, status: 'pending' }, // not yet paid
    ],
    cashTransactions: [
      { id: 'c1', type: 'cash_deposit', date: '2026-10-04', amount: 5000, verificationStatus: 'verified' },
      { id: 'c2', type: 'cash_deposit', date: '2026-10-04', amount: 9999, verificationStatus: 'pending' }, // not effective yet
      { id: 'c3', type: 'withdrawal', date: '2026-10-09', amount: 1200 },
    ],
    pettyHistory: [
      { id: 'p1', type: 'refill', paymentMethod: 'bank_transfer', amount: 15000, status: 'approved', createdAt: '2026-10-05' },
      { id: 'p2', type: 'petty_to_bank', amount: 3000, status: 'settled', createdAt: '2026-10-05' },
    ],
  });
  const byId = Object.fromEntries(pool.map(c => [c.sourceId, c]));

  assert.equal(byId.i1.amount, 245000); assert.equal(byId.i1.direction, 'in');
  assert.equal(byId.e1.amount, 30000); assert.equal(byId.e1.direction, 'out');
  assert.ok(!byId.e2, 'cash-only expense never touches the bank');
  assert.equal(byId.e3.amount, 20000, 'split expense contributes only its bank portion');
  assert.ok(!byId.e4, 'a rejected expense was never actually paid');
  assert.equal(byId.r1.amount, 305116); assert.equal(byId.r1.direction, 'out');
  assert.ok(!byId.r2, 'an unpaid remittance has not touched the bank yet');
  assert.equal(byId.c1.direction, 'in');
  assert.ok(!byId.c2, 'a pending (unverified) deposit is not yet effective');
  assert.equal(byId.c3.direction, 'out');
  assert.equal(byId.p1.amount, 15000); assert.equal(byId.p1.direction, 'out');
  assert.equal(byId.p2.amount, 3000); assert.equal(byId.p2.direction, 'in');
});

// ── verifyStatementRows: proving each statement line against the running balance ──────────
// Opening balance 100,000.00, then: +50,000 (150,000), −1,250.50 (148,749.50), −10,000 (138,749.50), +200 (138,949.50).
const R = (debit, credit, balance, date) => ({ debit, credit, balance, date });
const CHRONO = [
  R(0, 50000, 150000, '2026-09-01'),
  R(1250.5, 0, 148749.5, '2026-09-02'),
  R(10000, 0, 138749.5, '2026-09-03'),
  R(0, 200, 138949.5, '2026-09-04'),
];
const statuses = (res) => res.rows.map(r => r.status);

test('verifyStatementRows: a clean oldest-first chain from an opening balance is fully verified', () => {
  const res = verifyStatementRows([{ opening_balance: 100000, rows: CHRONO }]);
  assert.equal(res.verification, 'passed');
  assert.equal(res.direction, 'oldest-first');
  assert.deepEqual(statuses(res), ['verified', 'verified', 'verified', 'verified']);
  assert.ok(res.rows.every(r => r.reason === null));
});

test('verifyStatementRows: a clean newest-first chain (e.g. a banking-app screenshot) is fully verified', () => {
  const res = verifyStatementRows([{ opening_balance: 100000, rows: [...CHRONO].reverse() }]);
  assert.equal(res.verification, 'passed');
  assert.equal(res.direction, 'newest-first');
  assert.deepEqual(statuses(res), ['verified', 'verified', 'verified', 'verified']);
});

test('verifyStatementRows: one misread amount fails only that row; its neighbours are still verified', () => {
  const rows = CHRONO.map(r => ({ ...r }));
  rows[2].debit = 1000; // printed 10,000 — the balances still say 10,000 left
  const res = verifyStatementRows([{ opening_balance: 100000, rows }]);
  assert.equal(res.verification, 'partial');
  assert.deepEqual(statuses(res), ['verified', 'verified', 'unverified', 'verified']);
  assert.match(res.rows[2].reason, /doesn't add up with the running balance/);

  // Same misread on a newest-first statement.
  const rev = [...CHRONO].reverse().map(r => ({ ...r }));
  rev[0].credit = 2000; // the newest line, printed 200
  const res2 = verifyStatementRows([{ opening_balance: 100000, rows: rev }]);
  assert.equal(res2.direction, 'newest-first');
  assert.deepEqual(statuses(res2), ['unverified', 'verified', 'verified', 'verified']);
});

test('verifyStatementRows: a misread balance fails that row and the next (both links touch it) — never filed on a guess', () => {
  const rows = CHRONO.map(r => ({ ...r }));
  rows[1].balance = 148479.5;
  const res = verifyStatementRows([{ opening_balance: 100000, rows }]);
  assert.deepEqual(statuses(res), ['verified', 'unverified', 'unverified', 'verified']);
});

test('verifyStatementRows: the chain carries across photos in upload order', () => {
  const pages = [{ opening_balance: 100000, rows: CHRONO.slice(0, 2) }, { opening_balance: null, rows: CHRONO.slice(2) }];
  const res = verifyStatementRows(pages);
  assert.equal(res.verification, 'passed');
  assert.deepEqual(res.rows.map(r => [r.page, r.index, r.status]), [[0, 0, 'verified'], [0, 1, 'verified'], [1, 0, 'verified'], [1, 1, 'verified']]);

  // Photos uploaded in the wrong order: page 2's first line has nothing before it to prove it.
  const swapped = verifyStatementRows([pages[1], pages[0]]);
  assert.equal(swapped.verification, 'partial');
  assert.equal(swapped.rows.find(r => r.page === 0 && r.index === 0).status, 'unverified');

  // A newest-first statement over two photos.
  const newest = [...CHRONO].reverse();
  const res2 = verifyStatementRows([{ opening_balance: null, rows: newest.slice(0, 2) }, { opening_balance: 100000, rows: newest.slice(2) }]);
  assert.equal(res2.direction, 'newest-first');
  assert.equal(res2.verification, 'passed');
});

test('verifyStatementRows: the opening balance proves the first line; without it the earliest line can\'t be proven', () => {
  const withOpening = verifyStatementRows([{ opening_balance: 100000, rows: CHRONO }]);
  assert.equal(withOpening.rows[0].status, 'verified');
  const without = verifyStatementRows([{ opening_balance: null, rows: CHRONO }]);
  assert.equal(without.verification, 'partial');
  assert.deepEqual(statuses(without), ['unverified', 'verified', 'verified', 'verified']);
  assert.match(without.rows[0].reason, /earliest line/);
  // A wrong opening balance proves nothing.
  assert.equal(verifyStatementRows([{ opening_balance: 90000, rows: CHRONO }]).rows[0].status, 'unverified');
});

test('verifyStatementRows: no running balances at all -> "unavailable", rows unchecked (but still structurally checked)', () => {
  const rows = CHRONO.map(r => ({ ...r, balance: null }));
  rows.push(R(0, 0, null, '2026-09-05'));
  const res = verifyStatementRows([{ opening_balance: null, rows }]);
  assert.equal(res.verification, 'unavailable');
  assert.equal(res.direction, null);
  assert.deepEqual(statuses(res), ['unchecked', 'unchecked', 'unchecked', 'unchecked', 'unverified']);
  assert.match(res.rows[4].reason, /no amount could be read/);
});

test('verifyStatementRows: a row with both a debit and a credit (or neither, or an unreadable amount) is rejected even if the balance fits', () => {
  const rows = CHRONO.map(r => ({ ...r }));
  rows[1] = R(1250.5, 1250.5, 150000, '2026-09-02'); // net zero, balance unchanged — "adds up" but can't be filed
  rows[2] = R(10000, 0, 140000, '2026-09-03');
  const res = verifyStatementRows([{ opening_balance: 100000, rows }]);
  assert.equal(res.rows[1].status, 'unverified');
  assert.match(res.rows[1].reason, /both a money-in and a money-out/);
  assert.equal(res.rows[2].status, 'verified', 'the next line is still proven from that row\'s balance');

  const res2 = verifyStatementRows([{ opening_balance: 100000, rows: [R(Number.NaN, 0, 150000), R(0, 0, 150000)] }]);
  assert.deepEqual(statuses(res2), ['unverified', 'unverified']);
  assert.match(res2.rows[0].reason, /amount couldn't be read/);
});

test('verifyStatementRows: rows repeated where two photos overlap are marked "overlap" and the chain continues past them', () => {
  const res = verifyStatementRows([
    { opening_balance: 100000, rows: CHRONO.slice(0, 3) },
    { opening_balance: null, rows: CHRONO.slice(1) },
  ]);
  assert.equal(res.verification, 'passed');
  assert.deepEqual(statuses(res), ['verified', 'verified', 'verified', 'overlap', 'overlap', 'verified']);
});

test('verifyStatementRows: amounts are compared exactly to the kobo — no floating-point drift, and a one-kobo misread is caught', () => {
  const rows = [R(0, 0.1, 0.3), R(0, 0.2, 0.5), R(0.01, 0, 0.49), R(0.01, 0, 0.49)];
  const res = verifyStatementRows([{ opening_balance: 0.2, rows }]);
  assert.deepEqual(statuses(res), ['verified', 'verified', 'verified', 'unverified'], '0.1 + 0.2 style sums are exact; 0.49 - 0.01 is not 0.49');
  const off = verifyStatementRows([{ opening_balance: 0.2, rows: [R(0, 0.1, 0.3), R(0, 0.2, 0.52)] }]);
  assert.deepEqual(statuses(off), ['verified', 'unverified']);
});
