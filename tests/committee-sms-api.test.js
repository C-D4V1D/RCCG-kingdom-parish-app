import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[route]].js';
import * as api from '../functions/api/[[route]].js';
import * as utils from '../src/js/committee-sms-utils.js';

const SESSION_HEADER = JSON.stringify({ accountId: 'ka-test', token: 'ks-test-token' });

function kpscRequest(url, method = 'GET', body) {
  const init = { method, headers: { 'Content-Type': 'application/json', 'X-KPSC-Session': SESSION_HEADER } };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(url, init);
}

async function readJson(response) {
  return JSON.parse(await response.text());
}

/**
 * Minimal D1 stand-in for the committee-SMS routes. `state` holds the roster,
 * the partner register and the settings the endpoints read; `writes` records
 * every INSERT so tests can assert on what was logged.
 */
function createDB(state) {
  const writes = { reminders: [], settings: [] };
  const DB = {
    prepare(sql) {
      const st = {
        _bound: [],
        bind(...args) { st._bound = args; return st; },
        async first() {
          if (/SELECT account_id, expires_at FROM kpsc_sessions/.test(sql)) {
            return { account_id: 'ka-test', expires_at: Date.now() + 3_600_000 };
          }
          if (/SELECT id, name, role, status FROM kpsc_accounts/.test(sql)) {
            return { id: 'ka-test', name: 'Test Secretary', role: 'general_secretary', status: 'active' };
          }
          if (/key='kpsc_members'/.test(sql)) {
            return state.roster === undefined ? null : { value: JSON.stringify(state.roster) };
          }
          if (/key='kpsc_sms_naira_per_page'/.test(sql)) {
            return state.nairaPerPage === undefined ? null : { value: String(state.nairaPerPage) };
          }
          throw new Error(`Unexpected SQL in first(): ${sql}`);
        },
        async all() {
          if (/FROM settings WHERE key IN/.test(sql)) {
            return { results: Object.entries(state.settings || {}).map(([key, value]) => ({ key, value })) };
          }
          if (/FROM kpsc_partners/.test(sql)) {
            // Mirror the endpoint's own soft-delete filter.
            assert.match(sql, /COALESCE\(deleted_at,''\) = ''/);
            return { results: (state.partners || []).filter(p => !p.deleted_at) };
          }
          throw new Error(`Unexpected SQL in all(): ${sql}`);
        },
        async run() {
          if (/INSERT INTO kpsc_reminders/.test(sql)) writes.reminders.push(st._bound);
          else if (/INSERT INTO settings/.test(sql)) writes.settings.push(st._bound);
          else throw new Error(`Unexpected SQL in run(): ${sql}`);
          return { success: true, meta: { changes: 1 } };
        },
      };
      return st;
    },
  };
  return { DB, writes };
}

const BASE_STATE = () => ({
  settings: { kpsc_termii_api_key: 'tk-test', kpsc_termii_sender_id: 'RCCG-KP', kpsc_termii_partner_sender_id: 'KP-PARTNER' },
  roster: [
    { group: 'men',       name: 'Bro. John Okeke', position: 'Secretary', phone: '08031234567' },
    { group: 'women',     name: 'Grace Eze',       position: '',          phone: '' },
    { group: 'youth',     name: 'Peter Nwosu',     position: 'Youth Rep', phone: '' },
    { group: 'ministers', name: '',                position: '',          phone: '08099999999' },
  ],
  partners: [
    { id: 'P1', full_name: 'Eze Grace',   phone: '2348020000001', status: 'active' },
    { id: 'P2', full_name: 'Samuel Ade',  phone: '2348020000002', status: 'active' },
  ],
});

/** Stub Termii's send endpoint; returns the calls it captured. */
function stubTermii(behaviour = () => ({ ok: true })) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (!/termii/.test(String(url))) throw new Error(`Unexpected fetch: ${url}`);
    const payload = JSON.parse(opts.body);
    calls.push(payload);
    const outcome = behaviour(payload);
    return outcome.ok
      ? new Response(JSON.stringify({ message_id: `mid-${calls.length}` }), { status: 200 })
      : new Response(JSON.stringify({ message: outcome.error || 'rejected' }), { status: 400 });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

// ── inlined-copy parity ───────────────────────────────────────────────────
test('the API copies of the committee helpers match the canonical module', () => {
  const phones = ['08031234567', '8031234567', '+234 803 123 4567', '23408031234567', '447700900123', '', 'n/a'];
  for (const p of phones) {
    assert.equal(api.normalizeNgPhone(p), utils.normalizeNgPhone(p), `normalizeNgPhone(${p})`);
    assert.equal(api.isLikelyValidPhone(api.normalizeNgPhone(p)), utils.isLikelyValidPhone(utils.normalizeNgPhone(p)));
  }
  const names = ['Bro. John Okeke', 'Okeke John', 'Deaconess Grace Eze', 'Pastor', ''];
  for (const n of names) {
    assert.equal(api.normalizePersonName(n), utils.normalizePersonName(n), `normalizePersonName(${n})`);
    assert.equal(api.firstNameOf(n), utils.firstNameOf(n), `firstNameOf(${n})`);
  }
  const tpl = 'Dear {{firstName}} ({{name}}) - {{position}}, {{group}}. {{venue}}';
  const who = { name: 'John Okeke', position: 'Secretary', group: 'men' };
  assert.equal(api.applyCommitteePlaceholders(tpl, who), utils.applyCommitteePlaceholders(tpl, who));
  assert.deepEqual(api.findUnknownPlaceholders(tpl), utils.findUnknownPlaceholders(tpl));
});

// ── GET /recipients ───────────────────────────────────────────────────────
test('committee recipients: roster phones win, partner phones fill the gaps', async () => {
  const { DB } = createDB(BASE_STATE());
  const res = await onRequest({ request: kpscRequest('https://x.test/api/kpsc-committee-sms/recipients'), env: { DB } });
  const body = await readJson(res);
  assert.equal(res.status, 200);
  assert.equal(body.senderId, 'RCCG-KP', 'must advertise the Members & Staff sender ID');
  assert.equal(body.apiKeyConfigured, true);
  assert.equal(body.nairaPerPage, 5);

  // The nameless roster row is dropped.
  assert.equal(body.recipients.length, 3);
  const [john, grace, peter] = body.recipients;

  assert.equal(john.phone, '2348031234567');
  assert.equal(john.phoneSource, 'roster');
  assert.equal(john.valid, true);

  // "Grace Eze" ↔ partner "Eze Grace" — matched despite the reversed order.
  assert.equal(grace.phone, '2348020000001');
  assert.equal(grace.phoneSource, 'partner');
  assert.equal(grace.partnerId, 'P1');
  assert.equal(grace.valid, true);

  assert.equal(peter.phone, '');
  assert.equal(peter.phoneSource, 'none');
  assert.equal(peter.valid, false);
});

test('committee recipients: an ambiguous name is flagged, never guessed', async () => {
  const state = BASE_STATE();
  state.partners = [
    { id: 'P1', full_name: 'Grace Eze', phone: '2348020000001', status: 'active' },
    { id: 'P2', full_name: 'Eze Grace', phone: '2348020000009', status: 'active' },
  ];
  const { DB } = createDB(state);
  const res = await onRequest({ request: kpscRequest('https://x.test/api/kpsc-committee-sms/recipients'), env: { DB } });
  const grace = (await readJson(res)).recipients.find(r => r.name === 'Grace Eze');
  assert.equal(grace.ambiguous, true);
  assert.equal(grace.phone, '');
  assert.equal(grace.partnerId, '');
});

test('committee recipients: a deleted partner never lends their phone number', async () => {
  const state = BASE_STATE();
  state.partners = [{ id: 'P1', full_name: 'Eze Grace', phone: '2348020000001', status: 'active', deleted_at: '2026-01-02T00:00:00Z' }];
  const { DB } = createDB(state);
  const res = await onRequest({ request: kpscRequest('https://x.test/api/kpsc-committee-sms/recipients'), env: { DB } });
  const grace = (await readJson(res)).recipients.find(r => r.name === 'Grace Eze');
  assert.equal(grace.phone, '');
  assert.equal(grace.phoneSource, 'none');
});

test('committee recipients: an empty roster is an empty list, not an error', async () => {
  const state = BASE_STATE();
  state.roster = [];
  const { DB } = createDB(state);
  const res = await onRequest({ request: kpscRequest('https://x.test/api/kpsc-committee-sms/recipients'), env: { DB } });
  const body = await readJson(res);
  assert.equal(res.status, 200);
  assert.deepEqual(body.recipients, []);
});

// ── POST / (send) ─────────────────────────────────────────────────────────
test('committee SMS sends under the Members & Staff sender ID and logs each message', async () => {
  const { DB, writes } = createDB(BASE_STATE());
  const termii = stubTermii();
  try {
    const res = await onRequest({
      request: kpscRequest('https://x.test/api/kpsc-committee-sms', 'POST', {
        message: 'Dear Committee Member, our KPSC meeting holds today after service.',
        phones: ['2348031234567', '2348020000001'],
      }),
      env: { DB },
    });
    const body = await readJson(res);
    assert.equal(res.status, 200);
    assert.equal(body.sent, 2);
    assert.equal(body.failed, 0);
    assert.equal(body.total, 2);
    assert.equal(body.pages, 2);   // one GSM-7 page each
    assert.equal(body.cost, 10);   // ₦5 per page
    assert.equal(body.senderId, 'RCCG-KP');

    assert.equal(termii.calls.length, 2);
    for (const call of termii.calls) {
      assert.equal(call.from, 'RCCG-KP', 'must not use the partner sender ID');
      assert.equal(call.type, 'plain', 'GSM-7 body must go out as plain, not unicode');
    }
    assert.deepEqual(termii.calls.map(c => c.to), ['2348031234567', '2348020000001']);

    assert.equal(writes.reminders.length, 2);
    for (const bound of writes.reminders) {
      assert.equal(bound[3], 'Dear Committee Member, our KPSC meeting holds today after service.');
      assert.equal(bound[4], 'sent');
      assert.equal(bound[7], 'committee', 'logged under the committee message type');
      assert.equal(bound[10], 'Test Secretary', 'attributed to the signed-in account');
    }
  } finally {
    termii.restore();
  }
});

test('committee SMS accepts local phone formats and never sends twice to one number', async () => {
  const { DB } = createDB(BASE_STATE());
  const termii = stubTermii();
  try {
    const res = await onRequest({
      request: kpscRequest('https://x.test/api/kpsc-committee-sms', 'POST', {
        message: 'Meeting today.',
        phones: ['08031234567', '+234 803 123 4567', '2348031234567'],
      }),
      env: { DB },
    });
    const body = await readJson(res);
    assert.equal(body.sent, 1);
    assert.equal(body.total, 1);
    assert.equal(termii.calls.length, 1);
    assert.equal(termii.calls[0].to, '2348031234567');
  } finally {
    termii.restore();
  }
});

test('committee SMS personalises per recipient', async () => {
  const { DB, writes } = createDB(BASE_STATE());
  const termii = stubTermii();
  try {
    await onRequest({
      request: kpscRequest('https://x.test/api/kpsc-committee-sms', 'POST', {
        message: 'Dear {{firstName}}, as {{position}} please attend.',
        phones: ['2348031234567', '2348020000001'],
      }),
      env: { DB },
    });
    assert.deepEqual(termii.calls.map(c => c.sms), [
      'Dear John, as Secretary please attend.',
      'Dear Grace, as  please attend.',
    ]);
    // The logged body is the personalised one, not the raw template.
    assert.equal(writes.reminders[0][3], 'Dear John, as Secretary please attend.');
  } finally {
    termii.restore();
  }
});

test('committee SMS records failures with the carrier reason instead of dropping them', async () => {
  const { DB, writes } = createDB(BASE_STATE());
  const termii = stubTermii(payload => (payload.to === '2348020000001' ? { ok: false, error: 'DND active' } : { ok: true }));
  try {
    const res = await onRequest({
      request: kpscRequest('https://x.test/api/kpsc-committee-sms', 'POST', {
        message: 'Meeting today.',
        phones: ['2348031234567', '2348020000001'],
      }),
      env: { DB },
    });
    const body = await readJson(res);
    assert.equal(body.sent, 1);
    assert.equal(body.failed, 1);
    assert.equal(body.pages, 1, 'only delivered pages are billed');
    assert.equal(body.errors.length, 1);
    assert.equal(body.errors[0].name, 'Grace Eze');
    assert.match(body.errors[0].error, /DND active/);

    const failedRow = writes.reminders.find(b => b[4] === 'failed');
    assert.ok(failedRow, 'the failed attempt must still be logged for retry');
    assert.equal(failedRow[7], 'committee');
    assert.match(String(failedRow[13]), /DND active/);
  } finally {
    termii.restore();
  }
});

test('committee SMS refuses a message with a placeholder it cannot fill', async () => {
  const { DB } = createDB(BASE_STATE());
  const termii = stubTermii();
  try {
    const res = await onRequest({
      request: kpscRequest('https://x.test/api/kpsc-committee-sms', 'POST', {
        message: 'Meeting at {{venue}} today.',
        phones: ['2348031234567'],
      }),
      env: { DB },
    });
    assert.equal(res.status, 400);
    assert.match((await readJson(res)).error, /\{\{venue\}\}/);
    assert.equal(termii.calls.length, 0, 'nothing may be sent when the message is rejected');
  } finally {
    termii.restore();
  }
});

test('committee SMS refuses numbers that are not on the roster', async () => {
  const { DB } = createDB(BASE_STATE());
  const termii = stubTermii();
  try {
    const res = await onRequest({
      request: kpscRequest('https://x.test/api/kpsc-committee-sms', 'POST', {
        message: 'Meeting today.',
        phones: ['2348031234567', '2349999999999'],
      }),
      env: { DB },
    });
    assert.equal(res.status, 400);
    assert.match((await readJson(res)).error, /no longer on the committee roster/);
    assert.equal(termii.calls.length, 0, 'a partial send would be worse than none');
  } finally {
    termii.restore();
  }
});

test('committee SMS validates message and recipients before touching Termii', async () => {
  const { DB } = createDB(BASE_STATE());
  const termii = stubTermii();
  try {
    const blank = await onRequest({
      request: kpscRequest('https://x.test/api/kpsc-committee-sms', 'POST', { message: '   ', phones: ['2348031234567'] }),
      env: { DB },
    });
    assert.equal(blank.status, 400);

    const noOne = await onRequest({
      request: kpscRequest('https://x.test/api/kpsc-committee-sms', 'POST', { message: 'Hello', phones: [] }),
      env: { DB },
    });
    assert.equal(noOne.status, 400);
    assert.equal(termii.calls.length, 0);
  } finally {
    termii.restore();
  }
});

test('committee SMS is refused when no Termii API key is configured', async () => {
  const state = BASE_STATE();
  state.settings = { kpsc_termii_sender_id: 'RCCG-KP' };
  const { DB } = createDB(state);
  const res = await onRequest({
    request: kpscRequest('https://x.test/api/kpsc-committee-sms', 'POST', { message: 'Hi', phones: ['2348031234567'] }),
    env: { DB },
  });
  assert.equal(res.status, 400);
  assert.match((await readJson(res)).error, /Termii API key/);
});

test('committee SMS requires a signed-in KPSC account', async () => {
  const { DB } = createDB(BASE_STATE());
  const res = await onRequest({
    request: new Request('https://x.test/api/kpsc-committee-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hi', phones: ['2348031234567'] }),
    }),
    env: { DB },
  });
  assert.equal(res.status, 401);
});

// ── SMS Logs names the recipient, not just the message type ───────────────
function createLogsDB(state, logRows) {
  return {
    prepare(sql) {
      const st = {
        _bound: [],
        bind(...args) { st._bound = args; return st; },
        async first() {
          if (/FROM kpsc_sessions/.test(sql)) return { account_id: 'ka-test', expires_at: Date.now() + 3_600_000 };
          if (/FROM kpsc_accounts/.test(sql)) return { id: 'ka-test', name: 'Test Secretary', role: 'general_secretary', status: 'active' };
          if (/key='kpsc_members'/.test(sql)) return { value: JSON.stringify(state.roster) };
          if (/key='kpsc_sms_naira_per_page'/.test(sql)) return null;
          if (/COUNT\(\*\) AS total/.test(sql)) return { total: logRows.length, sent: logRows.length, failed: 0, skipped: 0, delivered: 0, dnd: 0, pending: 0 };
          if (/FROM settings WHERE key='kpsc_termii_api_key'/.test(sql)) return null;
          return null;
        },
        async all() {
          if (/FROM kpsc_reminders r/.test(sql)) return { results: logRows };
          if (/FROM kpsc_partners/.test(sql)) return { results: state.partners || [] };
          if (/FROM settings WHERE key IN/.test(sql)) {
            return { results: Object.entries(state.settings || {}).map(([key, value]) => ({ key, value })) };
          }
          return { results: [] };
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
      };
      return st;
    },
  };
}

test('SMS logs name a committee recipient resolved from the destination number', async () => {
  const state = BASE_STATE();
  const DB = createLogsDB(state, [
    { id: 'k1', partner_id: '', phone: '2348031234567', message: 'Meeting today.', status: 'sent', delivery_status: 'delivered', reminder_type: 'committee', sent_at: '2026-08-16T08:48:00.000Z', created_at: '2026-08-16T08:48:00.000Z' },
    { id: 'k2', partner_id: '', phone: '2348020000001', message: 'Meeting today.', status: 'sent', delivery_status: 'delivered', reminder_type: 'committee', sent_at: '2026-08-16T08:48:00.000Z', created_at: '2026-08-16T08:48:00.000Z' },
    { id: 'k3', partner_id: '', phone: '2349999999999', message: 'Meeting today.', status: 'sent', delivery_status: 'delivered', reminder_type: 'committee', sent_at: '2026-08-16T08:48:00.000Z', created_at: '2026-08-16T08:48:00.000Z' },
  ]);
  const res = await onRequest({
    request: kpscRequest('https://x.test/api/kpsc-sms-logs?year=2026&month=8'),
    env: { DB },
  });
  const body = await readJson(res);
  assert.equal(res.status, 200);

  // Roster phone → roster name.
  assert.equal(body.logs[0].recipientName, 'Bro. John Okeke');
  // Number inherited from the partner record → still the roster name, since the
  // message went to them as a committee member.
  assert.equal(body.logs[1].recipientName, 'Grace Eze');
  // Nobody we know — falls back to the message-type label in the UI.
  assert.equal(body.logs[2].recipientName, '');
});

test('SMS logs keep the joined partner name when there is one', async () => {
  const state = BASE_STATE();
  const DB = createLogsDB(state, [
    { id: 'k1', partner_id: 'P2', partner_name: 'Samuel Ade', phone: '2348020000002', message: 'Pledge reminder.', status: 'sent', reminder_type: 'reminder', sent_at: '2026-08-16T08:00:00.000Z', created_at: '2026-08-16T08:00:00.000Z' },
  ]);
  const res = await onRequest({
    request: kpscRequest('https://x.test/api/kpsc-sms-logs?year=2026&month=8'),
    env: { DB },
  });
  const body = await readJson(res);
  assert.equal(body.logs[0].partnerName, 'Samuel Ade');
  assert.equal(body.logs[0].recipientName, 'Samuel Ade');
});

// ── retry picks the sender ID the original send used ──────────────────────
function createRetryDB(logRow) {
  const updates = [];
  return {
    updates,
    DB: {
      prepare(sql) {
        const st = {
          _bound: [],
          bind(...args) { st._bound = args; return st; },
          async first() {
            if (/FROM kpsc_sessions/.test(sql)) return { account_id: 'ka-test', expires_at: Date.now() + 3_600_000 };
            if (/FROM kpsc_accounts/.test(sql)) return { id: 'ka-test', name: 'Test Secretary', role: 'general_secretary', status: 'active' };
            if (/FROM kpsc_reminders WHERE id=\?/.test(sql)) return logRow;
            throw new Error(`Unexpected SQL in first(): ${sql}`);
          },
          async all() {
            if (/FROM settings WHERE key IN/.test(sql)) {
              return { results: [
                { key: 'kpsc_termii_api_key', value: 'tk-test' },
                { key: 'kpsc_termii_sender_id', value: 'RCCG-KP' },
                { key: 'kpsc_termii_partner_sender_id', value: 'KP-PARTNER' },
              ] };
            }
            throw new Error(`Unexpected SQL in all(): ${sql}`);
          },
          async run() { updates.push([sql, st._bound]); return { success: true, meta: { changes: 1 } }; },
        };
        return st;
      },
    },
  };
}

test('retrying a committee SMS reuses the Members & Staff sender ID', async () => {
  const { DB } = createRetryDB({
    id: 'krm1', partner_id: '', phone: '2348031234567', message: 'Meeting today.',
    status: 'failed', reminder_type: 'committee',
  });
  const termii = stubTermii();
  try {
    await onRequest({
      request: kpscRequest('https://x.test/api/kpsc-sms-retry', 'POST', { id: 'krm1' }),
      env: { DB },
    });
    assert.equal(termii.calls.length, 1);
    assert.equal(termii.calls[0].from, 'RCCG-KP');
  } finally {
    termii.restore();
  }
});

test('retrying a partner reminder still uses the partner sender ID', async () => {
  const { DB } = createRetryDB({
    id: 'krm2', partner_id: '', phone: '2348031234567', message: 'Pledge reminder.',
    status: 'failed', reminder_type: 'reminder',
  });
  const termii = stubTermii();
  try {
    await onRequest({
      request: kpscRequest('https://x.test/api/kpsc-sms-retry', 'POST', { id: 'krm2' }),
      env: { DB },
    });
    assert.equal(termii.calls.length, 1);
    assert.equal(termii.calls[0].from, 'KP-PARTNER');
  } finally {
    termii.restore();
  }
});

// ── POST /adopt-phones ────────────────────────────────────────────────────
test('adopt-phones writes matched partner numbers back onto the roster', async () => {
  const { DB, writes } = createDB(BASE_STATE());
  const res = await onRequest({
    request: kpscRequest('https://x.test/api/kpsc-committee-sms/adopt-phones', 'POST', {}),
    env: { DB },
  });
  const body = await readJson(res);
  assert.equal(res.status, 200);
  assert.equal(body.updated, 1);

  assert.equal(writes.settings.length, 1);
  const [key, value] = writes.settings[0];
  assert.equal(key, 'kpsc_members');
  const saved = JSON.parse(value);
  assert.equal(saved.length, 4, 'no roster row may be lost');
  assert.equal(saved[0].phone, '08031234567', 'an existing roster number is left exactly as typed');
  assert.equal(saved[1].phone, '2348020000001', 'the matched partner number is adopted');
  assert.equal(saved[1].position, '', 'other roster fields are preserved');
  assert.equal(saved[2].phone, '', 'an unmatched member is left blank');
});

test('adopt-phones writes nothing when there is nothing to adopt', async () => {
  const state = BASE_STATE();
  state.partners = [];
  const { DB, writes } = createDB(state);
  const res = await onRequest({
    request: kpscRequest('https://x.test/api/kpsc-committee-sms/adopt-phones', 'POST', {}),
    env: { DB },
  });
  assert.equal((await readJson(res)).updated, 0);
  assert.equal(writes.settings.length, 0);
});
