// Loans screens (pop-ups opened from the dashboard card): who sees which buttons, and what each button sends.
// Runs the real app code with a fake page and a fake server.
import test from 'node:test';
import assert from 'node:assert/strict';

const els = {};
let lastOverlay = null;
function makeElement(id) {
  return {
    id, style: {}, innerHTML: '', textContent: '', value: '', disabled: false, files: [], dataset: {}, className: '',
    appendChild() {}, insertBefore() {}, remove() {}, addEventListener() {}, setAttribute() {},
    getAttribute() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, focus() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }
  };
}
const documentStub = {
  readyState: 'complete',
  body: makeElement('body'),
  getElementById(id) { return els[id] || (els[id] = makeElement(id)); },
  createElement() { const e = makeElement(); lastOverlay = e; return e; },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  addEventListener() {}
};
const localStorageStub = { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.document = documentStub;
globalThis.window = { document: documentStub, location: { pathname: '/' }, addEventListener() {}, localStorage: localStorageStub };
Object.defineProperty(globalThis, 'localStorage', { value: localStorageStub, configurable: true });
Object.defineProperty(globalThis, 'history', { value: { replaceState() {}, pushState() {} }, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
globalThis.window.history = globalThis.history;
globalThis.window.navigator = globalThis.navigator;

let loans = [];
const posts = [];
globalThis.fetch = async (url, init = {}) => {
  const p = String(url).replace(/^\/api\//, '').split('?')[0];
  if ((init.method || 'GET') !== 'GET') posts.push({ path: p, method: init.method, body: init.body ? JSON.parse(init.body) : null });
  const body = (init.method || 'GET') === 'GET' ? (p === 'loans' ? loans : []) : { ok: true };
  const text = JSON.stringify(body);
  return { ok: true, status: 200, headers: { get() { return null; } }, body: null, json: async () => JSON.parse(text), text: async () => text };
};
console.error = () => {};

await import('../src/js/app.js?loans-ui=' + Date.now());
const App = globalThis.window.App;

const sample = () => [
  { id: 'P-other', status: 'pending', direction: 'lent', person: 'Bro Sam', amount: 20000, date: '2026-10-05', channel: 'cash', recordedById: 'u2', recordedByName: 'Ada', repayments: [] },
  { id: 'P-mine', status: 'pending', direction: 'borrowed', person: 'Sis Ada', amount: 5000, date: '2026-10-05', channel: 'bank', recordedById: 'u1', recordedByName: 'Me', repayments: [] },
  { id: 'A-1', status: 'active', direction: 'lent', person: 'Bro Joe', amount: 10000, date: '2026-10-01', channel: 'cash', recordedById: 'u2', recordedByName: 'Ada', repaid: 0, outstanding: 10000,
    repayments: [{ id: 'R-pend', status: 'pending', amount: 3000, date: '2026-10-06', channel: 'cash', recordedById: 'u2' }] },
  { id: 'A-2', status: 'active', direction: 'borrowed', person: 'Pastor X', amount: 8000, date: '2026-10-01', channel: 'cash', recordedById: 'u1', recordedByName: 'Me', repaid: 0, outstanding: 8000, repayments: [] },
];

async function open(role, id = 'u1') {
  App._setTestUser({ id, name: 'Me', role });
  loans = sample();
  await App.showLoans();
  return lastOverlay.innerHTML;
}

test('the accountant can record, acknowledge other people\'s entries, and cancel their own', async () => {
  const html = await open('accountant');
  assert.match(html, /\+ Record a loan/);
  assert.match(html, /Waiting for acknowledgement/);
  assert.match(html, /acknowledgeLoan\('P-other'/);                       // recorded by someone else: can acknowledge
  assert.doesNotMatch(html, /acknowledgeLoan\('P-mine'/);                 // recorded by me: cannot
  assert.match(html, /You recorded this, so someone else must acknowledge it\./);
  assert.match(html, /showRejectLoan\('loan','P-mine'\)/);                // but can cancel it
  assert.match(html, /acknowledgeLoanRepayment\('R-pend'/);               // a repayment someone else recorded
  assert.match(html, /showLoanRepaymentForm\('A-2'\)/);
  assert.match(html, /Lent to Bro Sam/);
  assert.match(html, /Borrowed from Sis Ada/);
});

test('a viewer sees the loans but no buttons that change anything', async () => {
  const html = await open('viewer', 'u9');
  assert.match(html, /Lent to Bro Sam/);
  assert.doesNotMatch(html, /\+ Record a loan/);
  assert.doesNotMatch(html, /acknowledgeLoan\(/);
  assert.doesNotMatch(html, /acknowledgeLoanRepayment\(/);
  assert.doesNotMatch(html, /showLoanRepaymentForm\(/);
});

test('an usher cannot open the record form', async () => {
  App._setTestUser({ id: 'u8', name: 'U', role: 'usher' });
  lastOverlay = null;
  await App.showLoanForm();
  assert.ok(!lastOverlay || !lastOverlay.innerHTML.includes('Record a loan'), 'the form must not open');
});

test('recording a loan sends what was typed; blank name or amount sends nothing', async () => {
  App._setTestUser({ id: 'u1', name: 'Me', role: 'accountant' });
  loans = [];
  posts.length = 0;
  await App.showLoanForm();
  els.ln_person = Object.assign(makeElement('ln_person'), { value: '' });
  els.ln_amount = Object.assign(makeElement('ln_amount'), { value: '25000' });
  await App.submitLoan(null);
  assert.equal(posts.length, 0, 'blank name must not post');
  els.ln_person.value = 'Bro Sam';
  els.ln_amount.value = '0';
  await App.submitLoan(null);
  assert.equal(posts.length, 0, 'zero amount must not post');
  els.ln_amount.value = '25000';
  els.ln_date = Object.assign(makeElement('ln_date'), { value: '2026-10-07' });
  els.ln_purpose = Object.assign(makeElement('ln_purpose'), { value: 'Rent' });
  await App.submitLoan(null);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].path, 'loans');
  assert.deepEqual(posts[0].body, { direction: 'lent', channel: 'cash', person: 'Bro Sam', amount: 25000, date: '2026-10-07', purpose: 'Rent', dueDate: '', reference: '' });
});

test('acknowledge and reject go to the right place; a reject without a reason sends nothing', async () => {
  App._setTestUser({ id: 'u1', name: 'Me', role: 'accountant' });
  loans = sample();
  posts.length = 0;
  await App.acknowledgeLoan('P-other', null);
  assert.deepEqual(posts.map(p => p.path), ['loans/P-other/acknowledge']);
  posts.length = 0;
  await App.acknowledgeLoanRepayment('R-pend', null);
  assert.deepEqual(posts.map(p => p.path), ['loan-repayments/R-pend/acknowledge']);
  posts.length = 0;
  els.ln_reason = Object.assign(makeElement('ln_reason'), { value: '' });
  await App.submitRejectLoan('loan', 'P-other', null);
  assert.equal(posts.length, 0);
  els.ln_reason.value = 'Wrong amount';
  await App.submitRejectLoan('loan', 'P-other', null);
  assert.deepEqual(posts.map(p => [p.path, p.body.reason]), [['loans/P-other/reject', 'Wrong amount']]);
});

test('a repayment is sent to the loan with the amount typed', async () => {
  App._setTestUser({ id: 'u1', name: 'Me', role: 'accountant' });
  loans = sample();
  posts.length = 0;
  await App.showLoanRepaymentForm('A-1');
  els.lr_amount = Object.assign(makeElement('lr_amount'), { value: '4000' });
  els.lr_date = Object.assign(makeElement('lr_date'), { value: '2026-10-07' });
  els.lr_ref = Object.assign(makeElement('lr_ref'), { value: '' });
  await App.submitLoanRepayment('A-1', null);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].path, 'loans/A-1/repay');
  assert.equal(posts[0].body.amount, 4000);
  assert.equal(posts[0].body.channel, 'cash');
});

test('the record form offers the three kinds of money; the IT admin alone gets Reverse buttons', async () => {
  App._setTestUser({ id: 'u1', name: 'Me', role: 'accountant' });
  await App.showLoanForm();
  const form = lastOverlay.innerHTML;
  assert.match(form, /Cash with the Accountant/);
  assert.match(form, /Petty cash \(with the Admin Officer\)/);
  assert.match(form, /Through the bank/);

  loans = sample();
  loans[2].repayments = [{ id: 'R-ok', status: 'confirmed', amount: 2000, date: '2026-10-06', channel: 'petty', recordedById: 'u2' }];
  App._setTestUser({ id: 'u1', name: 'Me', role: 'accountant' });
  await App.showLoans();
  assert.doesNotMatch(lastOverlay.innerHTML, /_reverse/);
  assert.match(lastOverlay.innerHTML, /petty cash/);                       // the channel is named in plain words
  App._setTestUser({ id: 'u7', name: 'Admin', role: 'it_admin' });
  await App.showLoans();
  assert.match(lastOverlay.innerHTML, /showRejectLoan\('loan_reverse','A-1'\)/);
  assert.match(lastOverlay.innerHTML, /showRejectLoan\('repayment_reverse','R-ok'\)/);
});

test('reversing needs a reason and goes to the reverse endpoints', async () => {
  App._setTestUser({ id: 'u7', name: 'Admin', role: 'it_admin' });
  loans = sample();
  posts.length = 0;
  els.ln_reason = Object.assign(makeElement('ln_reason'), { value: '' });
  await App.submitRejectLoan('loan_reverse', 'A-1', null);
  assert.equal(posts.length, 0);
  els.ln_reason.value = 'Entered twice';
  await App.submitRejectLoan('loan_reverse', 'A-1', null);
  await App.submitRejectLoan('repayment_reverse', 'R-ok', null);
  assert.deepEqual(posts.map(p => [p.path, p.body.reason]), [['loans/A-1/reverse', 'Entered twice'], ['loan-repayments/R-ok/reverse', 'Entered twice']]);
});
