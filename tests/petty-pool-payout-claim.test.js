// A joint RCCG payment split between the parish and the Satellite/Zone pool and
// paid from petty cash puts money out of the Admin Officer's wallet twice over:
// the parish share becomes an expense, the pool share becomes a petty
// 'disbursement'. Only the expense used to reach the top-up list, so the pool
// share silently left him out of pocket — ₦34,500 offered for recovery when
// ₦39,500 had actually gone out.
import test from 'node:test';
import assert from 'node:assert/strict';

function makeElement(id) {
  return {
    id, style: {}, innerHTML: '', textContent: '', value: '', disabled: false, files: [],
    appendChild() {}, insertBefore() {}, remove() {}, addEventListener() {}, setAttribute() {},
    getAttribute() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
}
const documentStub = {
  readyState: 'complete', body: makeElement('body'),
  getElementById() { return null; },
  createElement() { return makeElement('new'); },
  querySelector() { return null; },
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

await import(new URL(`../src/js/app.js?petty-pool-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;
const unclaimed = (e, p) => App._pettyUnclaimedOutflows(e, p);
const total = (refs, e, p) => App._pettyClaimsTotal(refs, e, p);

// The wallet in the screenshots: three petty expenses totalling ₦34,500, plus a
// ₦5,000 pool payout from the same joint payment as the ₦10,000 parish share.
const EXPENSES = [
  { id: 'EXP-1', date: '2026-09-02', createdAt: '2026-09-02T13:01:00Z', status: 'approved',
    paymentMethod: 'petty_cash', amount: 10000, category: 'rccg_payments', subCategory: 'Programme or Event' },
  { id: 'EXP-2', date: '2026-08-30', createdAt: '2026-08-30T08:13:00Z', status: 'approved',
    paymentMethod: 'petty_cash', amount: 7000, category: 'transportation', subCategory: 'Transport' },
  { id: 'EXP-3', date: '2026-08-30', createdAt: '2026-08-30T08:09:00Z', status: 'approved',
    paymentMethod: 'petty_cash', amount: 17500, category: 'power_energy', subCategory: 'Fuel' },
  { id: 'EXP-4', date: '2026-08-28', createdAt: '2026-08-28T09:31:00Z', status: 'approved',
    paymentMethod: 'bank', amount: 50, category: 'bank_charges', subCategory: 'Transfer charge' },
];
const POOL_PAYOUT = {
  id: 'PC-pool1', type: 'disbursement', status: 'approved', amount: 5000,
  date: '2026-09-02', createdAt: '2026-09-02T13:01:00Z',
  purpose: 'Satellite/Zone Pool payout — joint area zone', reference: 'JZ-mtk3uwdxmwe0',
};

test('a pool payout paid from petty cash is offered for recovery', () => {
  const claims = unclaimed(EXPENSES, [POOL_PAYOUT]);
  const ids = claims.map(c => c.id);
  assert.ok(ids.includes('PC-pool1'), 'the ₦5,000 pool share must be claimable');
  // ₦10,000 + ₦7,000 + ₦17,500 petty expenses + ₦5,000 pool payout.
  assert.equal(claims.reduce((s, c) => s + c.amount, 0), 39500);
});

test('a bank-paid expense never enters the wallet claim', () => {
  const ids = unclaimed(EXPENSES, [POOL_PAYOUT]).map(c => c.id);
  assert.ok(!ids.includes('EXP-4'), 'the ₦50 bank charge did not come out of the wallet');
});

test('a split expense claims only its petty portion', () => {
  const split = [{ id: 'EXP-9', date: '2026-09-01', createdAt: '2026-09-01T10:00:00Z', status: 'approved',
                   paymentMethod: 'split', amount: 12000, pettyAmount: 4000, category: 'transportation' }];
  const claims = unclaimed(split, []);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].amount, 4000, 'only the petty share left the wallet');
});

test('anything already on a top-up request drops out, expense or pool payout', () => {
  const request = {
    id: 'PC-req1', type: 'topup_request', status: 'pending_approval',
    expenseRefs: ['EXP-2', 'PC-pool1'],
  };
  const ids = unclaimed(EXPENSES, [POOL_PAYOUT, request]).map(c => c.id);
  assert.deepEqual(ids.sort(), ['EXP-1', 'EXP-3'], 'claimed items must not be offered twice');
});

test('a cancelled or rejected request does not lock its items away', () => {
  for (const status of ['rejected', 'cancelled']) {
    const request = { id: 'PC-req2', type: 'topup_request', status, expenseRefs: ['PC-pool1'] };
    const ids = unclaimed(EXPENSES, [POOL_PAYOUT, request]).map(c => c.id);
    assert.ok(ids.includes('PC-pool1'), `a ${status} request must release the pool payout again`);
  }
});

test('a pending disbursement is not claimable until it is approved', () => {
  const pending = { ...POOL_PAYOUT, status: 'pending_approval' };
  const ids = unclaimed(EXPENSES, [pending]).map(c => c.id);
  assert.ok(!ids.includes('PC-pool1'));
});

test('advances and bank deposits are not claimable — they are not wallet expenses', () => {
  // An advance is settled with a receipt (becoming an expense) or returned as
  // change; claiming it here would recover the same money twice.
  const other = [
    { id: 'PC-adv', type: 'advance', status: 'approved', amount: 3000, date: '2026-09-01' },
    { id: 'PC-dep', type: 'petty_to_bank', status: 'approved', amount: 2000, date: '2026-09-01' },
  ];
  const ids = unclaimed([], other).map(c => c.id);
  assert.deepEqual(ids, []);
});

// ── live re-resolution of a request's refs ─────────────────────────────────
test('a request total resolves both expenses and pool payouts', () => {
  // Resolving expenses alone valued the pool payout at zero, so an approved
  // request would have been recorded and settled ₦5,000 short.
  assert.equal(total(['EXP-1', 'PC-pool1'], EXPENSES, [POOL_PAYOUT]), 15000);
});

test('a ref that no longer resolves contributes nothing rather than stranding the request', () => {
  assert.equal(total(['EXP-1', 'EXP-deleted'], EXPENSES, [POOL_PAYOUT]), 10000);
});

// ── the type badge ─────────────────────────────────────────────────────────
test('a pool payout is not labelled an Advance', () => {
  // Every non-refill, non-top-up row used to fall through to "Advance", which is
  // how a Satellite/Zone payout came to show as one in the wallet history.
  assert.match(App._pettyTypeBadge(POOL_PAYOUT), /Pool Payout/);
  assert.match(App._pettyTypeBadge({ type: 'advance' }), /Advance/);
  assert.match(App._pettyTypeBadge({ type: 'refill' }), /Top-Up Paid/);
  assert.match(App._pettyTypeBadge({ type: 'topup_request' }), /Top-Up Request/);
  assert.match(App._pettyTypeBadge({ type: 'petty_to_bank' }), /Deposit to Bank/);
});
