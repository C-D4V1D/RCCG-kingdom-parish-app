// Month-close (box/monthclose-20260930): RRR payment check on Remita, "I've paid" / /paid, and the month-close checklist.
// Runs the real monthclose.py against a fake /workspace (stub send_msg/mailer, fake clerkinfo, fake parish app).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const REPO = path.resolve(import.meta.dirname, '..');
const BUNDLE = path.join(REPO, 'box/monthclose-20260930');
const FIX = path.join(REPO, 'tests/fixtures/box');
const PY = process.env.PYTHON || 'python3';
const hasPython = spawnSync(PY, ['--version']).status === 0;
const write = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof o === 'string' ? o : JSON.stringify(o)); };
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const M = '2026-10', KEY = '2026-09-21..2026-10-18', RRR = '2515-1524-5138';

const PEOPLE = [
  { key: 'david', name: 'David Chukwuemeka', telegram_chat_id: '101', email: 'david@example.test', app_role: 'it_admin' },
  { key: 'divine', name: 'Divine Faith (Bro. Divine)', telegram_chat_id: '102', email: 'divine@example.test', app_role: 'accountant' },
  { key: 'fabian', name: 'Fabian ALOM (Bro. Fabian)', telegram_chat_id: '103', email: 'fabian@example.test' },
  { key: 'pastor', name: 'Pastor (Henry Ofunne)', telegram_chat_id: null, email: 'pastor@example.test' },
];

let appRemittances = [];
async function withApp(fn) {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/remittances') return res.end(JSON.stringify(appRemittances));
    if (u.pathname === '/api/settings') return res.end(JSON.stringify({ remCutoffDatesByYear: { 2026: [18, 22, 22, 19, 24, 21, 19, 23, 20, 18, 22, 13] } }));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

function makeBox({ people = PEOPLE, attendanceExit = 0, slots = [['Admin', 'Oct', '2026', '602757', 'uploaded', '2026-10-23T23:59'], ['Finance', 'Oct', '2026', '602757', 'uploaded', '2026-10-23T23:59']] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'monthclose-'));
  const stub = fs.readFileSync(path.join(FIX, 'stub.py'), 'utf8');
  for (const f of ['telegram/send_msg.py', 'tools/mailer.py']) { write(path.join(root, f), stub); fs.chmodSync(path.join(root, f), 0o755); }
  fs.copyFileSync(path.join(BUNDLE, 'monthclose.py'), path.join(root, 'tools/monthclose.py'));
  fs.copyFileSync(path.join(BUNDLE, 'monthinfo.py'), path.join(root, 'tools/monthinfo.py'));
  fs.copyFileSync(path.join(REPO, 'box/cleanup-20260928/clerkcfg.py'), path.join(root, 'tools/clerkcfg.py'));
  write(path.join(root, 'tools/clerkinfo.py'), `import json, os\ndef srcdoc_slots(parishes):\n    return [tuple(x) for x in json.load(open(os.environ["FAKE_SLOTS"]))]\n`);
  write(path.join(root, 'slots.json'), slots);
  write(path.join(root, 'config.json'), { config_version: 9, is_default: false, config: { people } });
  write(path.join(root, 'scenario.json'), { 'send_msg.py': { stdout: '[]' }, 'mailer.py send': { stdout: '{"ok": true}' } });
  write(path.join(root, `rccg-remit/runs/rrr-${M}.json`), { readAt: '2026-10-19T09:02:00', invoices: [{ amount: 480000, debits: [{ RRR: RRR, amountWithFee: 482322.5 }] }] });
  write(path.join(root, 'rccg-remit/state/remit-runs.json'), { [KEY]: { month: M, status: 'done', rrr: { code: RRR }, attendance: { exit: attendanceExit } } });
  const env = { ...process.env, CLERK_ROOT: root, STUB_ROOT: root, CLERK_CFG: path.join(root, 'config.json'), FAKE_SLOTS: path.join(root, 'slots.json'),
    PYTHONPATH: path.join(root, 'tools'), PYTHONDONTWRITEBYTECODE: '1', KP_AUTOMATION_KEY: 'k', CLERK_REMIT_STATE: path.join(root, 'rccg-remit/state/remit-runs.json') };
  const box = {
    root,
    run: (args, { at, remita = { paid: true, status: '23', message: 'Transaction already processed' }, url } = {}) => new Promise((resolve) => {
      const p = spawn(PY, [path.join(root, 'tools/monthclose.py'), ...args],
        { env: { ...env, MONTHCLOSE_NOW: at, MONTHCLOSE_TEST_REMITA: JSON.stringify(remita), KP_APP_URL: url } });
      let out = '', err = '';
      p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
      p.on('close', status => resolve({ status, out, err }));
    }),
    calls: () => fs.existsSync(path.join(root, 'calls.jsonl')) ? fs.readFileSync(path.join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [],
    tg: () => box.calls().filter(c => c.script === 'send_msg.py').map(c => ({ who: c.args[0], text: c.args[1], key: c.args[c.args.indexOf('--key') + 1] })),
    mails: () => box.calls().filter(c => c.script === 'mailer.py').map(c => ({ type: c.type, ...read(c.args[c.args.indexOf('--payload') + 1]) })),
    state: () => read(path.join(root, 'state/monthclose.json')),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
  return box;
}

test('remita-check: status 23 "Transaction already processed" means paid; anything unclear is "don\'t know"', () => {
  const { classify } = createRequire(import.meta.url)(path.join(BUNDLE, 'remita-check.cjs'));
  assert.equal(classify('{"status":"23","message":"Transaction already processed","data":null}').paid, true);
  assert.equal(classify({ status: '00', message: 'Successful', data: { amount: 1 } }).paid, false);
  assert.equal(classify('{"status":"99","message":"Service unavailable"}').paid, null);
  assert.equal(classify('<html>blocked</html>').paid, null);
});

test('"I\'ve paid" from Bro. Fabian, Remita confirms: everyone gets PAID + checklist once, with titles', { skip: !hasPython }, async () => {
  appRemittances = [];
  await withApp(async (url) => {
    const box = makeBox();
    try {
      const r = await box.run(['paid', '--chat', '103'], { at: '2026-10-20T11:05:00', url });
      assert.equal(r.status, 0, r.err);
      const tg = box.tg();
      assert.equal(tg[0].who, 'fabian');
      assert.match(tg[0].text, /Checking Remita for RRR 2515-1524-5138/);
      const paid = tg.find(m => m.key === `monthclose:${M}:paid`);
      assert.equal(paid.who, 'david,divine,fabian,pastor');
      assert.match(paid.text, /October 2026 remittance PAID/);
      assert.match(paid.text, /Paid by Bro\. Fabian \(Admin Officer\)/);
      assert.match(paid.text, /✅ Attendance filed/);
      assert.match(paid.text, /⚠️ Payment not yet recorded in the app \(Bro\. Divine \(Accountant\)\)/);
      assert.match(paid.text, /Bro\. Divine \(Accountant\): please record the payment in the app/);
      const mail = box.mails();
      assert.equal(mail.length, 1);
      assert.equal(mail[0].type, 'month_close');
      assert.deepEqual(mail[0].to, ['david@example.test', 'divine@example.test', 'fabian@example.test', 'pastor@example.test']);
      assert.equal(box.state()[M].paid.by, 'fabian');

      // a second tap: no new announcement
      await box.run(['paid', '--chat', '103'], { at: '2026-10-20T11:30:00', url });
      assert.equal(box.tg().filter(m => m.key === `monthclose:${M}:paid`).length, 1);
      assert.match(box.tg().at(-1).text, /already confirmed paid \(Bro\. Fabian \(Admin Officer\)\)/);
    } finally { box.cleanup(); }
  });
});

test('not on Remita yet: only the payer is told; a later scheduled check confirms it and names who tapped', { skip: !hasPython }, async () => {
  appRemittances = [];
  await withApp(async (url) => {
    const box = makeBox();
    const notYet = { paid: false, status: '00', message: 'Successful' };
    try {
      await box.run(['paid', '--chat', '101'], { at: '2026-10-20T11:05:00', remita: notYet, url });
      let tg = box.tg();
      assert.equal(tg.length, 2);
      assert.ok(tg.every(m => m.who === 'david'));
      assert.match(tg[1].text, /Remita doesn't show RRR 2515-1524-5138 as paid yet/);
      assert.match(tg[1].text, /10:00, 14:00, 18:00/);
      assert.equal(box.mails().length, 0);

      await box.run(['tick'], { at: '2026-10-20T13:59:00', remita: notYet, url });
      assert.equal(box.state()[M].checks.length, 2, 'the 10:00 slot runs (missed earlier), not twice');
      await box.run(['tick'], { at: '2026-10-20T14:01:00', url });
      tg = box.tg();
      const paid = tg.find(m => m.key === `monthclose:${M}:paid`);
      assert.match(paid.text, /Paid by Bro\. David \(Finance Officer\)/);
      await box.run(['tick'], { at: '2026-10-20T18:05:00', url });
      assert.equal(box.state()[M].checks.length, 3, 'no more Remita checks once paid');
    } finally { box.cleanup(); }
  });
});

test('someone who does not pay the RRR cannot confirm a payment', { skip: !hasPython }, async () => {
  await withApp(async (url) => {
    const box = makeBox();
    try {
      const r = await box.run(['paid', '--chat', '102'], { at: '2026-10-20T11:05:00', url });
      assert.equal(r.status, 3);
      assert.match(box.tg()[0].text, /Only the people who pay the RRR/);
      assert.ok(!fs.existsSync(path.join(box.root, 'state/monthclose.json')) || !box.state()[M]?.presses);
    } finally { box.cleanup(); }
  });
});

test('2 days before the portal closes with something open: one warning; then "complete" once everything is done', { skip: !hasPython }, async () => {
  appRemittances = [];
  await withApp(async (url) => {
    const box = makeBox({ slots: [['Admin', 'Oct', '2026', '602757', 'EMPTY', '2026-10-23T23:59'], ['Finance', 'Oct', '2026', '602757', 'uploaded', '2026-10-23T23:59']] });
    try {
      await box.run(['paid', '--chat', '103'], { at: '2026-10-20T11:05:00', url });
      await box.run(['tick'], { at: '2026-10-20T12:00:00', url });
      assert.ok(!box.tg().some(m => /portal closes/.test(m.key)), 'no warning 3 days before');
      await box.run(['tick'], { at: '2026-10-21T10:30:00', url });
      const warn = box.tg().filter(m => m.key === `monthclose:${M}:warning`);
      assert.equal(warn.length, 1);
      assert.match(warn[0].text, /portal closes 2026-10-23<\/b> \(2 days\)/);
      assert.match(warn[0].text, /Source docs, Admin: NOT uploaded yet/);
      await box.run(['tick'], { at: '2026-10-21T15:00:00', url });
      assert.equal(box.tg().filter(m => m.key === `monthclose:${M}:warning`).length, 1);

      // next day: Admin uploaded and the payment recorded in the app -> complete
      write(path.join(box.root, 'slots.json'), [['Admin', 'Oct', '2026', '602757', 'uploaded', '2026-10-23T23:59'], ['Finance', 'Oct', '2026', '602757', 'uploaded', '2026-10-23T23:59']]);
      appRemittances = [{ status: 'paid', periodTo: '2026-10-18' }];
      await box.run(['tick'], { at: '2026-10-22T10:30:00', url });
      const done = box.tg().filter(m => m.key === `monthclose:${M}:complete`);
      assert.equal(done.length, 1);
      assert.match(done[0].text, /October 2026 month-close COMPLETE/);
      await box.run(['tick'], { at: '2026-10-23T10:30:00', url });
      assert.equal(box.tg().filter(m => m.key === `monthclose:${M}:complete`).length, 1);
    } finally { box.cleanup(); }
  });
});

test('install baseline: months that already had an RRR are not announced', { skip: !hasPython }, async () => {
  await withApp(async (url) => {
    const box = makeBox();
    try {
      await box.run(['baseline'], { at: '2026-09-30T12:00:00', url });
      await box.run(['tick'], { at: '2026-10-01T10:30:00', url });
      assert.deepEqual(box.tg(), []);
      assert.ok(!box.state()[M].checks);
    } finally { box.cleanup(); }
  });
});

test('patch: "I\'ve paid" button under the RRR message for payers only; bot handles /paid and the button', { skip: !hasPython }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'monthclose-patch-'));
  try {
    write(path.join(root, 'telegram/send_msg.py'), fs.readFileSync(path.join(FIX, 'send_msg.py'), 'utf8'));
    write(path.join(root, 'telegram/srcdoc/poller.py'), fs.readFileSync(path.join(FIX, 'poller.py'), 'utf8'));
    const env = { ...process.env, CLERK_ROOT: root, PYTHONDONTWRITEBYTECODE: '1' };
    const apply = spawnSync(PY, [path.join(BUNDLE, 'patch.py')], { env, encoding: 'utf8' });
    assert.equal(apply.status, 0, apply.stdout + apply.stderr);
    const sm = path.join(root, 'telegram/send_msg.py');
    const planFor = (key, people) => JSON.parse(spawnSync(PY, [sm, key, JSON.stringify(people)], { encoding: 'utf8' }).stdout);
    const rrr = planFor('rrr:602757:2026-10', []);
    assert.deepEqual(rrr.map(([w, , kb]) => [w, !!kb]), [['david', true], ['divine', false], ['fabian', true]]);
    assert.deepEqual(rrr[0][2], [[{ text: "✅ I've paid", callback_data: 'paid|2026-10' }]]);
    const chosen = planFor('rrr:602757:2026-10', [{ key: 'david', pays_rrr: false }, { key: 'fabian', pays_rrr: true }]);
    assert.deepEqual(chosen.map(([w, , kb]) => [w, !!kb]), [['david', false], ['divine', false], ['fabian', true]]);
    assert.deepEqual(planFor('check:x:r0', []).map(([, , kb]) => kb), [null, null, null], 'only the RRR message');
    const refused = spawnSync(PY, [sm, 'x', '[]', 'link'], { encoding: 'utf8' });
    assert.match(refused.stderr, /refused: link buttons only for david\/divine/);
    const pol = fs.readFileSync(path.join(root, 'telegram/srcdoc/poller.py'), 'utf8');
    assert.match(pol, /"\/paid - you paid the RRR/);
    assert.match(pol, /def cmd_paid\(chat, month=''\):/);
    assert.ok(pol.indexOf('== "/paid"') < pol.indexOf('frm.get("id") not in PEOPLE'), '/paid works for payers who do not use the bot otherwise');
    assert.ok(pol.indexOf('data.startswith("paid|")') < pol.indexOf('if chat not in PEOPLE'), 'the button works for Bro. Fabian too');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
