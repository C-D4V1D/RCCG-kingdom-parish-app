// Clerk box month-end runner (box/monthend-20261001): runs the real monthend.py / clerkcfg.py / patch.py against a
// fake /workspace whose scripts are stubs (tests/fixtures/box/stub.py) that record every call and answer per scenario.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const REPO = path.resolve(import.meta.dirname, '..');
const BUNDLE = path.join(REPO, 'box/monthend-20261001');
const FIX = path.join(REPO, 'tests/fixtures/box');
// The newest clerkcfg.py (each box bundle ships the version current at the time; the latest one is installed).
const CLERKCFG = path.join(REPO, 'box/cleanup-20260928/clerkcfg.py');
const PY = process.env.PYTHON || 'python3';
const hasPython = spawnSync(PY, ['--version']).status === 0;
const KEY = '2026-09-21..2026-10-18';
const LINES = {
  membersTithe: 'General Tithe', ministersTithe: 'Ministers Tithe', thanksgiving: 'Thanksgiving', slo: 'Sunday Love Offering',
  crm: 'CRM', workersOffering: 'Gospel Fund', sundaySchool: 'Sunday School', childrenOffering: 'Children Offering',
  holyCommunionOffering: 'Holy Communion Offering', firstFruit: 'First Fruit',
};

const write = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof o === 'string' ? o : JSON.stringify(o, null, 1)); };
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));

function breakdown(extra = {}) {
  const sundays = ['2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18'];
  return {
    period: { from: '2026-09-21', to: '2026-10-18', sundays: 4 },
    weeks: sundays.map((sunday, i) => ({ sunday, sundayCollectionTotalByCategory: { membersTithe: 1000, thanksgiving: 200, ...(extra[i] || {}) } })),
    lineItems: { partA: [
      { section: 'A-income', key: 'membersTithe', label: "Members' Tithe (58%)", amount: 2320 },
      { section: 'A-income', key: 'weekendOffering', label: 'Weekend Offering (100%)', amount: 0 },
    ], partB: [] },
    totals: { partATotal: 2320, partBTotal: 0 },
  };
}

const cutoff = (extra = {}) => ({
  id: '0001790000000000-aaaa', event: 'cutoff_collection_saved', collectionDate: '2026-10-18', periodStart: '2026-09-21',
  periodEnd: '2026-10-18', action: 'created', recordId: 'INC-1', savedAt: '2026-10-18T12:00:00Z', parish: '602757', month: '2026-10',
  links: { david: { generate_rrr: 'https://app.example/remit-action?t=d' }, divine: { generate_rrr: 'https://app.example/remit-action?t=v' } },
  linksExpireAt: '2026-11-08T00:00:00Z', handler: 'box', received_at: new Date().toISOString(), ...extra,
});

const checkEmailFiles = {
  '{--out-dir}/david/payload.json': { to: ['david@example.test'], subject: 'Kingdom Parish remittance check: October 2026' },
  '{--out-dir}/divine/payload.json': { to: ['divine@example.test'], subject: 'Kingdom Parish remittance check: October 2026' },
  '{--out-dir}/pastor/payload.json': { to: ['pastor@example.test'], subject: 'Kingdom Parish remittance check: October 2026' },
  '{--out-dir}/check-summary.json': { allAligned: true },
};

function happy(bd = breakdown()) {
  return {
    'api-fill.js precheck': { stdout: { ok: true, existingReport: null, createdByFlow: null },
      files: { 'runs/portal-items-2026-10.json': { data: { paymentItems: [{ paymentItem: 'General Tithe' }, { paymentItem: 'Thanksgiving' }] } } } },
    'compute-remit.js': { files: { '{--out}': bd } },
    'api-fill.js submit': { stdout: { ok: true, posted: true, totalInput: 4800 } },
    'att-fill.js submit': { stdout: { ok: true, action: { posted: true } }, files: { 'runs/att-result-2026-10.json': { app: {} } } },
    'api-fill.js preview': { stdout: { ok: true, storedVsPayload: { matches: true } } },
    'make-check-email.py': { files: checkEmailFiles },
    'mailer.py send': { stdout: '{"ok": true}' },
    'mailer.py sent': { stdout: 'NONE' },
    'send_msg.py': { stdout: '[]' },
  };
}

function makeBox({ scenario = happy(), lines = LINES, handler = 'box', state = null, events = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clerkbox-'));
  const stub = fs.readFileSync(path.join(FIX, 'stub.py'), 'utf8');
  for (const f of ['rccg-remit/build-run.py', 'rccg-remit/make-check-email.py', 'rccg-remit/remit-action-claim.py',
    'rccg-remit/make-rrr-email.py', 'rccg-attendance/make-att-email.py', 'telegram/send_msg.py', 'telegram/tg_msgs.py',
    'tools/mailer.py', 'bin/node']) {
    write(path.join(root, f), stub); fs.chmodSync(path.join(root, f), 0o755);
  }
  fs.copyFileSync(path.join(FIX, 'remit_match.py'), path.join(root, 'rccg-remit/remit_match.py'));
  fs.copyFileSync(path.join(FIX, 'api-fill.js'), path.join(root, 'rccg-remit/api-fill.js'));
  fs.copyFileSync(CLERKCFG, path.join(root, 'tools/clerkcfg.py'));
  fs.copyFileSync(path.join(BUNDLE, 'monthend.py'), path.join(root, 'tools/monthend.py'));
  write(path.join(root, 'app.js'), '// app\n'.repeat(3000));
  setConfig(root, { handler, lines });
  write(path.join(root, 'scenario.json'), scenario);
  if (state) write(path.join(root, 'rccg-remit/state/remit-runs.json'), state);
  for (const ev of events) write(path.join(root, 'state/monthend/inbox', `${ev.id}.json`), ev);
  const env = {
    ...process.env, CLERK_ROOT: root, STUB_ROOT: root, MONTHEND_NODE: path.join(root, 'bin/node'), MONTHEND_RETRY_WAIT: '0',
    CLERK_CFG: path.join(root, 'config.json'), CLERK_MONTHEND_DIR: path.join(root, 'state/monthend'),
    MONTHEND_TEST_WAKE_FILE: path.join(root, 'wakes.jsonl'), MONTHEND_APPJS_URL: 'file://' + path.join(root, 'app.js'),
    PYTHONPATH: path.join(root, 'tools'), PYTHONDONTWRITEBYTECODE: '1',
  };
  const patch = spawnSync(PY, [path.join(BUNDLE, 'patch.py')], { env, encoding: 'utf8' });
  assert.equal(patch.status, 0, patch.stdout + patch.stderr);
  const box = {
    root, env,
    run: (...args) => {
      const r = spawnSync(PY, [path.join(root, 'tools/monthend.py'), 'run', ...args], { env, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      return r;
    },
    calls: () => fs.existsSync(path.join(root, 'calls.jsonl'))
      ? fs.readFileSync(path.join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [],
    entry: () => (read(path.join(root, 'rccg-remit/state/remit-runs.json')))[KEY],
    status: () => read(path.join(root, 'state/monthend/status.json')),
    wakes: () => fs.existsSync(path.join(root, 'wakes.jsonl'))
      ? fs.readFileSync(path.join(root, 'wakes.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [],
    inbox: () => fs.readdirSync(path.join(root, 'state/monthend/inbox')),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
  return box;
}

function setConfig(root, { handler = 'box', lines = LINES } = {}) {
  write(path.join(root, 'config.json'), { config_version: 5, is_default: false, config: {
    people: [{ key: 'david', email: 'david@example.test' }, { key: 'divine', email: 'divine@example.test' }],
    remittance: { handler, lines },
  } });
}

const only = (calls, script, sub) => calls.filter(c => c.script === script && (sub === undefined || c.sub === sub));
const payloadOf = c => read(c.args[c.args.indexOf('--payload') + 1]);

test('box month-end: a normal cut-off is filed once, read back and the three check emails go out', { skip: !hasPython }, () => {
  const box = makeBox({ events: [cutoff()] });
  try {
    box.run();
    const calls = box.calls();
    assert.equal(only(calls, 'api-fill.js', 'submit').length, 1, 'the report is POSTed exactly once');
    assert.deepEqual(calls.filter(c => c.script === 'api-fill.js').map(c => c.sub), ['precheck', 'submit', 'preview']);
    assert.equal(only(calls, 'att-fill.js', 'submit').length, 1, 'attendance is filed in the same run');
    const mcArgs = only(calls, 'make-check-email.py')[0].args;
    assert.ok(mcArgs.includes('--attendance'), 'the check email carries the attendance section');
    const sends = only(calls, 'mailer.py', 'send');
    assert.equal(sends.length, 3);
    assert.ok(sends.every(c => c.type === 'remittance_check'));
    assert.deepEqual(sends.map(c => payloadOf(c).to[0]), ['david@example.test', 'divine@example.test', 'pastor@example.test']);
    const e = box.entry();
    assert.equal(e.status, 'awaiting-reply');
    assert.deepEqual(Object.keys(e.checkEmails).sort(), ['david', 'divine', 'pastor']);
    assert.ok(e.lastCheckSentAt);
    assert.equal(e.portalReport.createdByFlow, true);
    assert.deepEqual(box.inbox(), []);
    assert.deepEqual(box.wakes(), [], 'the Clerk AI is not woken on a normal run');
    assert.ok(fs.existsSync(path.join(box.root, 'rccg-remit/runs/links-2026-10.json')));
  } finally { box.cleanup(); }
});

test('box month-end: a category with no portal line holds the month; saving the line in the app lets it carry on', { skip: !hasPython }, () => {
  const box = makeBox({ scenario: happy(breakdown({ 1: { weekendOffering: 500 } })), events: [cutoff()] });
  try {
    box.run();
    assert.equal(only(box.calls(), 'api-fill.js', 'submit').length, 0, 'nothing is filed while held');
    assert.equal(box.entry().status, 'held');
    const hold = box.status().hold;
    assert.equal(hold.month, '2026-10');
    assert.deepEqual(hold.categories.map(c => [c.key, c.amount]), [['weekendOffering', 500]]);
    const mail = only(box.calls(), 'mailer.py', 'send');
    assert.equal(mail.length, 1);
    assert.deepEqual(payloadOf(mail[0]).to, ['david@example.test', 'divine@example.test']);
    assert.match(payloadOf(mail[0]).subject, /on hold/);
    assert.equal(only(box.calls(), 'send_msg.py')[0].args[0], 'david,divine');
    assert.deepEqual(box.wakes(), [], 'a hold never wakes the Clerk AI');

    // Running again without a change does not tell them twice.
    box.run('--resume');
    assert.equal(only(box.calls(), 'mailer.py', 'send').length, 1);

    // David marks Weekend Offering "Not remitted" in the app -> the box files the month.
    setConfig(box.root, { lines: { ...LINES, weekendOffering: '__not_remitted__' } });
    box.run('--resume');
    assert.equal(only(box.calls(), 'api-fill.js', 'submit').length, 1);
    assert.equal(box.entry().status, 'awaiting-reply');
    assert.equal(box.status().hold, null);
  } finally { box.cleanup(); }
});

test('box month-end: a portal API failure is retried once, then people are told and the Clerk AI is woken', { skip: !hasPython }, () => {
  const box = makeBox({ scenario: { ...happy(), 'api-fill.js precheck': { exit: 11, stdout: { ok: false, error: 'fetchPaymentItems: HTTP 502' } } },
    events: [cutoff()] });
  try {
    box.run();
    assert.equal(only(box.calls(), 'api-fill.js', 'precheck').length, 2, 'one automatic retry');
    assert.equal(only(box.calls(), 'api-fill.js', 'submit').length, 0);
    const e = box.entry();
    assert.equal(e.status, 'failed');
    assert.equal(e.failure.step, '1e pre-check');
    const w = box.wakes();
    assert.equal(w.length, 1);
    assert.equal(w[0].event, 'monthend_needs_ai');
    assert.equal(w[0].details.step, '1e pre-check');
    const mail = payloadOf(only(box.calls(), 'mailer.py', 'send')[0]);
    assert.deepEqual(mail.to, ['david@example.test', 'divine@example.test']);
    assert.match(mail.subject, /automatic run stopped \(October 2026\)/);
  } finally { box.cleanup(); }
});

test('box month-end: a report someone else made is never touched and the AI is not woken', { skip: !hasPython }, () => {
  const box = makeBox({ scenario: { ...happy(), 'api-fill.js precheck': { exit: 12, stdout: { ok: false, existingReport: { totalAmount: 5000, paymentStatus: 'UNPAID' } } } },
    events: [cutoff()] });
  try {
    box.run();
    assert.equal(only(box.calls(), 'api-fill.js', 'precheck').length, 1, 'working-as-designed stops are not retried');
    assert.equal(only(box.calls(), 'api-fill.js', 'submit').length, 0);
    assert.equal(box.entry().status, 'failed');
    assert.deepEqual(box.wakes(), []);
  } finally { box.cleanup(); }
});

test('box month-end: a second delivery for the same cut-off is ignored', { skip: !hasPython }, () => {
  const box = makeBox({ events: [cutoff()] });
  try {
    box.run();
    write(path.join(box.root, 'state/monthend/inbox/0001790000000001-bbbb.json'), cutoff({ id: '0001790000000001-bbbb' }));
    box.run();
    assert.equal(only(box.calls(), 'api-fill.js', 'submit').length, 1);
    assert.equal(only(box.calls(), 'mailer.py', 'send').length, 3);
  } finally { box.cleanup(); }
});

test('box month-end: Generate RRR from Bro. Divine tells David, generates once and emails the RRR', { skip: !hasPython }, () => {
  const scenario = {
    'remit-action-claim.py': { stdout: { result: 'accepted', key: KEY, month: '2026-10', person: 'divine', personName: 'Bro. Divine',
      action: 'generate_rrr', actionLabel: 'Generate RRR', clickedAtUk: '19 Oct 2026, 10:00', other: 'david', otherName: 'David',
      otherAddress: 'david@example.test' } },
    'api-fill.js rrr': { stdout: { ok: true, invoices: [{ amount: 3000, invoiceNumber: 'INV1', debits: [{ RRR: '1234-5678-9012', amountWithFee: 3322.5 }] }] } },
    'make-rrr-email.py': { files: { '{--out-dir}/payload.json': { to: ['david@example.test'], subject: 'Kingdom Parish remittance RRR: October 2026' },
      '{--out-dir}/rrr-summary.json': {} } },
    'mailer.py send': { stdout: '{"ok": true}' }, 'mailer.py sent': { stdout: 'NONE' }, 'send_msg.py': { stdout: '[]' },
  };
  const state = { [KEY]: { month: '2026-10', status: 'generating', checkEmails: { david: { to: ['david@example.test'], subject: 'Kingdom Parish remittance check: October 2026' } } } };
  const ev = { id: '0001790000000002-cccc', event: 'remit_action', action: 'generate_rrr', parish: '602757', month: '2026-10',
    person: 'divine', test: false, clickedAt: '2026-10-19T09:00:00Z', handler: 'box' };
  const box = makeBox({ scenario, state, events: [ev] });
  try {
    box.run();
    const rrr = only(box.calls(), 'api-fill.js', 'rrr');
    assert.equal(rrr.length, 1);
    assert.ok(rrr[0].args.includes('--yes'));
    const sends = only(box.calls(), 'mailer.py', 'send');
    assert.equal(sends.length, 2);
    assert.equal(payloadOf(sends[0]).subject, 'Re: Kingdom Parish remittance check: October 2026', 'David is told first, on his check subject');
    assert.match(payloadOf(sends[0]).body, /Bro\. Divine confirmed Generate RRR/);
    assert.equal(sends[1].type, 'rrr_generated');
    const e = box.entry();
    assert.equal(e.status, 'done');
    assert.equal(e.rrr.code, '1234-5678-9012');
    assert.equal(e.rrr.confirmedBy, 'divine');
  } finally { box.cleanup(); }
});

test('box month-end: a press that the claim ignores does nothing', { skip: !hasPython }, () => {
  const scenario = { 'remit-action-claim.py': { exit: 20, stdout: { result: 'ignored', reason: 'duplicate-delivery', key: KEY, month: '2026-10' } },
    'send_msg.py': { stdout: '[]' } };
  const ev = { id: '0001790000000003-dddd', event: 'remit_action', action: 'refresh', parish: '602757', month: '2026-10', person: 'david', handler: 'box' };
  const box = makeBox({ scenario, events: [ev] });
  try {
    box.run();
    assert.deepEqual(box.calls().map(c => c.script), ['remit-action-claim.py']);
  } finally { box.cleanup(); }
});

test('practice run (Clerk AI mode): waits for the AI, then compares offline and never signs in or emails', { skip: !hasPython }, () => {
  const data = JSON.stringify({ week1: { paymentItems: [{ itemSlug: 'general-tithe', totalAmount: 1000 }] }, week2: { paymentItems: [] },
    week3: { paymentItems: [] }, week4: { paymentItems: [] }, week5: { paymentItems: [] } });
  const scenario = { ...happy(), 'api-fill.js submit': { stdout: { ok: true, dryRun: true, lines: 1, totalInput: 1000 },
    files: { '{--payload-out}': { data } } } };
  const box = makeBox({ scenario, handler: 'clerk_ai', events: [cutoff({ handler: 'clerk_ai' })] });
  try {
    box.run();
    assert.deepEqual(box.calls(), [], 'nothing happens while the Clerk AI is still working');
    assert.equal(box.inbox().length, 1, 'the signal waits in the inbox');

    write(path.join(box.root, 'rccg-remit/state/remit-runs.json'), { [KEY]: { month: '2026-10', status: 'awaiting-reply' } });
    write(path.join(box.root, 'rccg-remit/runs/api-payload-2026-10.json'), { data });
    write(path.join(box.root, 'rccg-remit/runs/portal-items-2026-10.json'), { data: { paymentItems: [{ paymentItem: 'General Tithe' }] } });
    box.run();
    const calls = box.calls();
    const api = calls.filter(c => c.script === 'api-fill.js');
    assert.equal(api.length, 1);
    assert.ok(api[0].args.includes('--dry-run') && api[0].args.includes('--items-file'), 'offline dry run only');
    assert.equal(only(calls, 'mailer.py').length, 0, 'no email in practice');
    assert.equal(only(calls, 'att-fill.js').length, 0);
    const tgc = only(calls, 'send_msg.py');
    assert.equal(tgc.length, 1);
    assert.equal(tgc[0].args[0], 'david');
    assert.match(tgc[0].args[1], /Same as what the Clerk AI filed/);
    assert.equal(box.status().practice.matches, true);
    assert.equal(box.entry().status, 'awaiting-reply', "the AI's state is left alone");
    assert.deepEqual(box.inbox(), []);
  } finally { box.cleanup(); }
});

test('practice run: a difference from what the AI filed is reported', { skip: !hasPython }, () => {
  const mk = amt => JSON.stringify({ week1: { paymentItems: [{ itemSlug: 'general-tithe', totalAmount: amt }] } });
  const scenario = { ...happy(), 'api-fill.js submit': { stdout: { ok: true, lines: 1, totalInput: 900 }, files: { '{--payload-out}': { data: mk(900) } } } };
  const box = makeBox({ scenario, handler: 'clerk_ai', events: [cutoff({ handler: 'clerk_ai' })],
    state: { [KEY]: { month: '2026-10', status: 'awaiting-reply' } } });
  try {
    write(path.join(box.root, 'rccg-remit/runs/api-payload-2026-10.json'), { data: mk(1000) });
    write(path.join(box.root, 'rccg-remit/runs/portal-items-2026-10.json'), { data: { paymentItems: [] } });
    box.run();
    assert.match(only(box.calls(), 'send_msg.py')[0].args[1], /Differs from what the Clerk AI filed.*week 1 general-tithe: box 900, AI 1000/s);
    assert.equal(box.status().practice.matches, false);
  } finally { box.cleanup(); }
});

test('patch: the app lines drive remit_match.py, and api-fill.js adds up categories that share a line', { skip: !hasPython }, () => {
  const box = makeBox({ lines: { ...LINES, custom_harvest: 'Thanksgiving', weekendOffering: '__not_remitted__' } });
  try {
    const code = "import json, remit_match as m; print(json.dumps([m.APP_KEY_TO_WEEKLY_LINE, sorted(m.UNMAPPED_APP_KEYS), sorted(m.NOT_REMITTED_APP_KEYS)]))";
    const r = spawnSync(PY, ['-c', code], { env: { ...box.env, PYTHONPATH: `${path.join(box.root, 'rccg-remit')}:${path.join(box.root, 'tools')}` }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const [weekly, unmapped, notRemitted] = JSON.parse(r.stdout);
    assert.deepEqual(weekly.at(-1), ['custom_harvest', 'Thanksgiving']);
    assert.equal(weekly.length, 11);
    assert.deepEqual(unmapped, ['custom_convention_thanksgiving']);
    assert.deepEqual(notRemitted, ['weekendOffering']);

    const require = createRequire(import.meta.url);
    const { weekEntries } = require(path.join(box.root, 'rccg-remit/api-fill.js'));
    const map = { weekly: [['thanksgiving', 'Thanksgiving'], ['membersTithe', 'General Tithe'], ['custom_harvest', 'Thanksgiving']] };
    assert.deepEqual(weekEntries(map, { thanksgiving: 100.1, membersTithe: 50, custom_harvest: 20.2 }), [['Thanksgiving', 120.3], ['General Tithe', 50]]);

    // Running the patch again changes nothing; a file whose line moved is refused and nothing is changed.
    const again = spawnSync(PY, [path.join(BUNDLE, 'patch.py')], { env: box.env, encoding: 'utf8' });
    assert.match(again.stdout, /already patched rccg-remit\/remit_match\.py/);
    const fresh = makeBox();
    try {
      fs.copyFileSync(path.join(FIX, 'remit_match.py'), path.join(fresh.root, 'rccg-remit/remit_match.py'));
      const broken = fs.readFileSync(path.join(FIX, 'api-fill.js'), 'utf8').replace('entries.push([nm, c[k]]);', 'entries.push([nm, c[k] ]); // moved');
      write(path.join(fresh.root, 'rccg-remit/api-fill.js'), broken);
      const before = fs.readFileSync(path.join(fresh.root, 'rccg-remit/remit_match.py'), 'utf8');
      const bad = spawnSync(PY, [path.join(BUNDLE, 'patch.py')], { env: fresh.env, encoding: 'utf8' });
      assert.equal(bad.status, 1);
      assert.equal(fs.readFileSync(path.join(fresh.root, 'rccg-remit/remit_match.py'), 'utf8'), before, 'all or nothing');
    } finally { fresh.cleanup(); }
  } finally { box.cleanup(); }
});

test('patch: with no Remittance lines saved in the app, remit_match.py keeps its built-in lists', { skip: !hasPython }, () => {
  const box = makeBox();
  try {
    write(path.join(box.root, 'config.json'), { config_version: 4, is_default: false, config: { people: [] } });
    const code = "import json, remit_match as m; print(json.dumps([len(m.APP_KEY_TO_WEEKLY_LINE), sorted(m.UNMAPPED_APP_KEYS)]))";
    const r = spawnSync(PY, ['-c', code], { env: { ...box.env, PYTHONPATH: `${path.join(box.root, 'rccg-remit')}:${path.join(box.root, 'tools')}` }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), [10, ['custom_convention_thanksgiving', 'weekendOffering']]);
  } finally { box.cleanup(); }
});

test('clerkcfg sync: collects new mailbox signals once and starts the runner; old signals are skipped', { skip: !hasPython }, async () => {
  let eventsLast = '0001000000000-old';
  const served = [];
  const server = http.createServer((req, res) => {
    served.push(req.url);
    res.setHeader('content-type', 'application/json');
    if (req.headers['x-watchdog-token'] !== 'tok') { res.statusCode = 401; return res.end('{}'); }
    if (req.url === '/config/version') return res.end(JSON.stringify({ config_version: 5, events_last: eventsLast }));
    if (req.url === '/config') return res.end(JSON.stringify({ config_version: 5, is_default: false, config: { people: [] } }));
    if (req.url.startsWith('/events?after=')) {
      const after = decodeURIComponent(req.url.split('=')[1]);
      const all = [{ id: '0002000000000-new1', event: 'cutoff_collection_saved' }, { id: '0003000000000-new2', event: 'remit_action' }];
      const events = all.filter(e => e.id > after);
      return res.end(JSON.stringify({ events, last: events.length ? events.at(-1).id : after }));
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clerkcfg-'));
  const marker = path.join(root, 'runner-started');
  write(path.join(root, 'token'), 'tok');
  write(path.join(root, 'fake-monthend.py'), `import sys\nopen(${JSON.stringify(marker)}, 'a').write(' '.join(sys.argv[1:]) + '\\n')\n`);
  write(path.join(root, 'config.json'), { config_version: 5, is_default: false, config: { people: [] } });
  const env = { ...process.env, CLERK_CFG: path.join(root, 'config.json'), CLERK_WORKER: `http://127.0.0.1:${server.address().port}`,
    CLERK_TOKEN_FILE: path.join(root, 'token'), CLERK_MONTHEND_DIR: path.join(root, 'monthend'), CLERK_MONTHEND: path.join(root, 'fake-monthend.py'),
    PYTHONDONTWRITEBYTECODE: '1' };
  const sync = () => new Promise((resolve) => {
    const p = spawn(PY, [CLERKCFG, 'sync'], { env });
    let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
    p.on('close', code => resolve({ code, out }));
  });
  const waitFor = async (f) => { for (let i = 0; i < 50 && !fs.existsSync(f); i++) await new Promise(r => setTimeout(r, 100)); };
  try {
    let r = await sync();
    assert.equal(r.code, 0, r.out);
    assert.equal(fs.readFileSync(path.join(root, 'monthend/cursor'), 'utf8'), '0001000000000-old', 'first run starts from the newest signal');
    assert.deepEqual(fs.readdirSync(path.join(root, 'monthend/inbox')), []);
    assert.ok(!served.some(u => u.startsWith('/events')));

    eventsLast = '0003000000000-new2';
    r = await sync();
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(fs.readdirSync(path.join(root, 'monthend/inbox')).sort(), ['0002000000000-new1.json', '0003000000000-new2.json']);
    assert.equal(fs.readFileSync(path.join(root, 'monthend/cursor'), 'utf8'), '0003000000000-new2');
    await waitFor(marker);
    assert.match(fs.readFileSync(marker, 'utf8'), /^run/);

    // Nothing new: nothing fetched again.
    const before = served.filter(u => u.startsWith('/events')).length;
    await sync();
    assert.equal(served.filter(u => u.startsWith('/events')).length, before);
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('clerkcfg health: reports the month-end card and the remittance block the app reads', { skip: !hasPython }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clerkcfg-'));
  try {
    write(path.join(root, 'config.json'), { config_version: 6, is_default: false, config: { remittance: { handler: 'box', lines: {} } } });
    write(path.join(root, 'monthend/status.json'), { state: 'held', summary: 'October 2026: on hold', portal_lines: ['General Tithe'],
      categories: { weekendOffering: 'Weekend Offering' }, hold: { month: '2026-10', reason: 'unmapped', categories: [{ key: 'weekendOffering', label: 'Weekend Offering', amount: 500 }] } });
    const env = { ...process.env, CLERK_CFG: path.join(root, 'config.json'), CLERK_MONTHEND_DIR: path.join(root, 'monthend'), PYTHONDONTWRITEBYTECODE: '1' };
    const r = spawnSync(PY, [CLERKCFG, 'health'], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const h = JSON.parse(r.stdout);
    assert.equal(h.runners.month_end.status, 'warn');
    assert.equal(h.runners.month_end.summary, 'October 2026: on hold');
    assert.equal(h.remittance.handler, 'box');
    assert.deepEqual(h.remittance.portal_lines, ['General Tithe']);
    assert.equal(h.remittance.hold.categories[0].amount, 500);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('box month-end: each Refresh re-reads app and portal and sends a new round of three emails (never the report again)', { skip: !hasPython }, () => {
  const claim = n => ({ stdout: { result: 'accepted', key: KEY, month: '2026-10', person: 'david', personName: 'David', action: 'refresh',
    actionLabel: 'Refresh', clickedAtUk: `19 Oct 2026, 1${n}:00`, other: 'divine', otherName: 'Bro. Divine', otherAddress: 'divine@example.test' } });
  const scenario = { ...happy(), 'remit-action-claim.py': [claim(0), claim(1)],
    'make-check-email.py': { files: Object.fromEntries(Object.entries(checkEmailFiles).map(([k, v]) =>
      [k, v.subject ? { ...v, subject: 'Updated – ' + v.subject } : v])) } };
  const state = { [KEY]: { month: '2026-10', status: 'refreshing', checkEmails: { divine: { to: ['divine@example.test'], subject: 'x' } } } };
  const press = id => ({ id, event: 'remit_action', action: 'refresh', parish: '602757', month: '2026-10', person: 'david', handler: 'box' });
  const box = makeBox({ scenario, state, events: [press('0001790000000004-eeee')] });
  try {
    write(path.join(box.root, 'rccg-remit/runs/links-2026-10.json'), { month: '2026-10', links: cutoff().links, linksExpireAt: cutoff().linksExpireAt });
    box.run();
    write(path.join(box.root, 'state/monthend/inbox/0001790000000005-ffff.json'), press('0001790000000005-ffff'));
    box.run();
    const calls = box.calls();
    assert.equal(only(calls, 'api-fill.js', 'submit').length, 0, 'Refresh never posts the report');
    assert.equal(only(calls, 'api-fill.js', 'preview').length, 2);
    assert.equal(only(calls, 'compute-remit.js').length, 2);
    const outDirs = only(calls, 'make-check-email.py').map(c => c.args[c.args.indexOf('--out-dir') + 1]);
    assert.deepEqual(outDirs, ['runs/out-2026-10-r1', 'runs/out-2026-10-r2']);
    assert.ok(only(calls, 'build-run.py').every(c => c.args.includes('--refresh-by')));
    const checks = only(calls, 'mailer.py', 'send').filter(c => c.type === 'remittance_check');
    assert.equal(checks.length, 6, 'three new emails per Refresh, even with the same subject');
    assert.equal(box.entry().status, 'awaiting-reply');
  } finally { box.cleanup(); }
});

test('clerkcfg (cleanup): no attendance polling, the Attendance card shows the month-end result, portal lines come from the portal', { skip: !hasPython }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clerkcfg-'));
  try {
    const sched = path.join(root, 'sched_config.json');
    write(sched, { memo: true, attendance: true });
    write(path.join(root, 'config.json'), { config_version: 7, is_default: false, config: { automations: { attendance: { enabled: true } } } });
    write(path.join(root, 'remit/state/remit-runs.json'), {
      '2026-08-24..2026-09-20': { month: '2026-09', attendance: { exit: 0, posted: true, at: '2026-09-20T13:00:00' } },
      '2026-09-21..2026-10-18': { month: '2026-10', attendance: { exit: 15, posted: false, at: '2026-10-18T13:00:00' } },
    });
    write(path.join(root, 'remit/runs/portal-items-2026-09.json'), { data: { paymentItems: [{ paymentItem: 'OLD LINE' }] } });
    write(path.join(root, 'remit/runs/portal-items-2026-10.json'), { data: { paymentItems: [{ paymentItem: 'THANKSGIVING' }, { paymentItem: 'General Tithe' }] } });
    // the tests point SCHED_CONFIG at a temp file by running apply() from a small wrapper
    const code = `import sys; sys.path.insert(0, ${JSON.stringify(path.dirname(CLERKCFG))}); import clerkcfg as C; C.SCHED_CONFIG = ${JSON.stringify(sched)}; C.apply(C.config()); import json; print(json.dumps(C.health()))`;
    const env = { ...process.env, CLERK_CFG: path.join(root, 'config.json'), CLERK_MONTHEND_DIR: path.join(root, 'monthend'),
      CLERK_REMIT_DIR: path.join(root, 'remit'), PYTHONDONTWRITEBYTECODE: '1' };
    const r = spawnSync(PY, ['-c', code], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(read(sched).attendance, false, 'the scheduler never polls attendance, even with attendance enabled');
    assert.equal(read(sched).memo, true);
    const h = JSON.parse(r.stdout);
    assert.match(h.runners.attendance.summary, /^October 2026: not filed: not everything was in the app/);
    assert.equal(h.runners.attendance.status, 'warn');
    assert.equal(h.activity.attendance.length, 2);
    assert.deepEqual(h.remittance.portal_lines, ['General Tithe', 'THANKSGIVING'], 'from the newest portal item list');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
