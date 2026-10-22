// POST /api/remittance-receipt-read: needs a signed-in user, and returns what the vision model read, including the RRR.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';
import { FINANCE_AUTH_HEADER } from './finance-auth-helper.mjs';

const DB = { prepare() { const st = { bind() { return st; }, async first() { return null; }, async all() { return { results: [] }; }, async run() { return { meta: {} }; } }; return st; } };
const call = (headers, body) => onRequest({ request: new Request('https://example.com/api/remittance-receipt-read', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }), env: { DB, OPENAI_API_KEY: 'sk-test' }, params: { route: ['remittance-receipt-read'] } });

test('receipt read: not signed in is refused', async () => {
  const r = await call({}, { imageBase64: 'AAAA' });
  assert.ok([401, 403].includes(r.status));
});

test('receipt read: returns amount, date, reference and RRR from the model (fake receipt, mocked model)', async () => {
  const real = globalThis.fetch; let sent;
  globalThis.fetch = async (url, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ vendor: 'Fake Bank', date: '2026-10-21', amount: 79289.41, currency: 'NGN', reference: 'FAKE|REF|1', rrr: '161528198373', items_summary: 'Remita' }) } }] }), { status: 200 }); };
  try {
    const r = await call(FINANCE_AUTH_HEADER, { imageBase64: 'AAAA', mimeType: 'image/jpeg' });
    assert.equal(r.status, 200); const j = await r.json();
    assert.equal(j.amount, 79289.41); assert.equal(j.date, '2026-10-21'); assert.equal(j.reference, 'FAKE|REF|1'); assert.equal(j.rrr, '161528198373');
    assert.match(sent.messages[0].content[0].text, /rrr/);
  } finally { globalThis.fetch = real; }
});
