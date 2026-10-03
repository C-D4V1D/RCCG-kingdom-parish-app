// Each person greeted by their own name in the Sunday-records reminders (box/greetings-20261003): patch.py is anchored and
// all-or-nothing, runs twice safely, everything compiles; then the patched files are run against synthetic fixtures (made-up
// people, stubbed Telegram and email) to check that every recipient gets their own greeting, an unknown name falls back to
// "Good morning,", nothing is sent twice, and messages without a greeting are sent exactly as before. No real people.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '..');
const BUNDLE = path.join(REPO, 'box/greetings-20261003');
const FIX = path.join(REPO, 'tests/fixtures/box/greetings');
const PY = process.env.PYTHON || 'python3';
const hasPython = spawnSync(PY, ['--version']).status === 0;
const FILES = ['tools/reminders.py', 'tools/monthinfo.py', 'tools/satinfo.py'];
const write = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof o === 'string' ? o : JSON.stringify(o)); };

function fakeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'greetings-'));
  for (const f of [...FILES, 'tools/clerkcfg.py']) write(path.join(root, f), fs.readFileSync(path.join(FIX, path.basename(f)), 'utf8'));
  return root;
}
const snapshot = root => Object.fromEntries(FILES.map(f => [f, fs.readFileSync(path.join(root, f), 'utf8')]));
const env = (root, extra = {}) => ({ ...process.env, CLERK_ROOT: root, CLERK_CFG: path.join(root, 'config.json'), PYTHONDONTWRITEBYTECODE: '1', ...extra });
const patch = (root, ...args) => spawnSync(PY, [path.join(BUNDLE, 'patch.py'), ...args], { env: env(root), encoding: 'utf8' });
const compiles = f => spawnSync(PY, ['-c', 'import sys; compile(open(sys.argv[1]).read(), sys.argv[1], "exec")', f], { encoding: 'utf8' });
const rm = root => fs.rmSync(root, { recursive: true, force: true });

test('patch.py: --check changes nothing, apply patches the 3 files, a second run is a no-op, all compile', { skip: !hasPython }, () => {
  const root = fakeRoot();
  try {
    const before = snapshot(root);
    const c = patch(root, '--check');
    assert.equal(c.status, 0, c.stdout + c.stderr);
    assert.match(c.stdout, /CHECK OK: 3 file/);
    assert.deepEqual(snapshot(root), before);
    const a = patch(root);
    assert.equal(a.status, 0, a.stdout + a.stderr);
    for (const f of FILES) {
      assert.match(a.stdout, new RegExp('patched ' + f.replace(/[./]/g, '\\$&')));
      assert.match(fs.readFileSync(path.join(root, f), 'utf8'), /# greetings-20261003\n$/);
      const r = compiles(path.join(root, f)); assert.equal(r.status, 0, f + r.stderr);
    }
    const after = snapshot(root);
    assert.doesNotMatch(after['tools/monthinfo.py'], /Good morning Bro\. Divine/);
    assert.doesNotMatch(after['tools/reminders.py'], /Good morning Bro\. Divine/);
    const b = patch(root);
    assert.equal(b.status, 0);
    assert.equal((b.stdout.match(/already patched/g) || []).length, 3);
    assert.deepEqual(snapshot(root), after);
    for (const f of ['patch.py', 'greet.py']) assert.equal(compiles(path.join(BUNDLE, f)).status, 0, f);
  } finally { rm(root); }
});

test('patch.py: an anchor that does not fit (or fits twice) -> NOT CHANGED and every file untouched', { skip: !hasPython }, () => {
  for (const [file, edit] of [
    ['tools/satinfo.py', s => s.replace('routed(k, mtype, "email")]', 'routed(k, mtype, "mail")]')],
    ['tools/monthinfo.py', s => s + '\n' + s.split('\n').find(l => l.includes('Good morning Bro. Divine')) + '\n'],
  ]) {
    const root = fakeRoot();
    try {
      const pf = path.join(root, file);
      fs.writeFileSync(pf, edit(fs.readFileSync(pf, 'utf8')));
      const before = snapshot(root);
      for (const args of [['--check'], []]) {
        const r = patch(root, ...args);
        assert.equal(r.status, 1, file);
        assert.match(r.stdout, /NOT CHANGED/);
        assert.match(r.stdout, new RegExp(file.replace(/[./]/g, '\\$&')));
        assert.deepEqual(snapshot(root), before);
      }
    } finally { rm(root); }
  }
});

test('patch.py: anchors ignore differences in spaces and line breaks', { skip: !hasPython }, () => {
  const root = fakeRoot();
  try {
    const pf = path.join(root, 'tools/reminders.py');
    const s = fs.readFileSync(pf, 'utf8');
    assert.ok(s.includes('def tg(who, text, mtype=None):\n    if who: subprocess'));
    fs.writeFileSync(pf, s.replace('def tg(who, text, mtype=None):\n    if who: subprocess', 'def tg(who,  text, mtype=None):\n\n    if   who: subprocess'));
    const r = patch(root);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(compiles(pf).status, 0);
  } finally { rm(root); }
});

const CFG = {
  config_version: 5, is_default: false,
  config: {
    people: [
      { key: 'acct', name: 'Test Accountant', called: 'Bro. Acct', telegram_chat_id: '101' },
      { key: 'second', name: 'Pastor Demo Kingdom', telegram_chat_id: '102' },
      { key: 'noname', name: '', telegram_chat_id: '103' },
      { key: 'p1', name: 'Test Pastor One', called: 'Pastor Ade', parish: '659840', telegram_chat_id: '201' },
      { key: 'p2', name: 'Deacon Bola Test', parish: '659840', email: 'p2@example.invalid' },
      { key: 'p3', name: 'Test Three (Sis. Three)', parish: '659840', telegram_chat_id: '203' },
      { key: 'p4', name: 'Dup Mail', called: 'Bro. Dup', parish: '659840', email: 'P2@example.invalid' },
      { key: 'office', name: 'Area Office', called: 'Mr. Area', telegram_chat_id: '301' },
    ],
    parishes: [{ code: '602757', name: 'KINGDOM PARISH' },
      { code: '659840', name: 'Test Satellite', active: true, copies: ['acct'], late_alert: ['office', 'ghost'] }],
    routing: {
      collection_reminder: { acct: { telegram: true }, second: { telegram: true }, noname: { telegram: true },
        p1: { telegram: true, email: true }, p2: { telegram: true, email: true }, p3: { telegram: true },
        p4: { telegram: true, email: true } },
    },
    automations: { collection_reminders: { enabled: true, time: '10:00' } },
  },
};

// the box's send_msg.py / mailer.py / common.py / clerkinfo.py replaced by stubs that record what would be sent
function behaviourRoot() {
  const root = fakeRoot();
  const out = path.join(root, 'out');
  fs.mkdirSync(out, { recursive: true });
  write(path.join(root, 'telegram/send_msg.py'),
    `import json, os, sys\nopen(${JSON.stringify(out + '/tg.jsonl')}, 'a').write(json.dumps({'argv': sys.argv[1:], 'type': os.environ.get('CLERK_MSG_TYPE')}) + '\\n')\nprint('[]')\n`);
  write(path.join(root, 'tools/mailer.py'),
    `import json, sys\np = json.load(open(sys.argv[sys.argv.index('--payload') + 1]))\nopen(${JSON.stringify(out + '/mail.jsonl')}, 'a').write(json.dumps(p) + '\\n')\n`);
  write(path.join(root, 'tools/common.py'),
    'import html\nBUL = "\\u2022 "; MON3 = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()\n' +
    'def card(icon, title, sub=None, body=(), step=None, foot=None):\n    L = ["<b>" + html.escape(title) + "</b>"] + ([html.escape(sub)] if sub else [])\n' +
    '    if body: L += [""] + [html.escape(x) for x in body]\n    if foot: L += ["", html.escape(foot)]\n    return "\\n".join(L)\n');
  write(path.join(root, 'tools/clerkinfo.py'), '');
  write(path.join(root, 'config.json'), CFG);
  fs.copyFileSync(path.join(BUNDLE, 'greet.py'), path.join(root, 'tools/greet.py'));
  return { root, out };
}

const SNIPPET = (root, out) => `
import datetime, json, os, sys
root, out = ${JSON.stringify(root)}, ${JSON.stringify(out)}
sys.path.insert(0, root + '/tools')
import clerkcfg as C, monthinfo as MI, reminders as R, satinfo as SI, greet as G
MI.LADDER_STATE = out + '/ladder.json'
R.TG = root + '/telegram/send_msg.py'; R.T = out
d = datetime.date
f = {"month": "2026-10", "start": d(2026, 9, 7), "end": d(2026, 10, 4), "today": d(2026, 10, 1), "report": False, "entry": {},
     "sundays": [{"date": d(2026, 9, 13), "collection": True, "attendance": "submitted"},
                 {"date": d(2026, 9, 20), "collection": False, "attendance": "submitted"},
                 {"date": d(2026, 10, 4), "collection": False, "attendance": None}]}
def take():
    res = {"tg": [], "mail": []}
    for name, k in (("tg.jsonl", "tg"), ("mail.jsonl", "mail")):
        p = out + "/" + name
        if os.path.exists(p):
            res[k] = [json.loads(l) for l in open(p)]
            os.remove(p)
    return res
def tg_view(r):
    return [{"to": j["argv"][0], "first": j["argv"][1].split("\\n")[0], "key": j["argv"][j["argv"].index("--key") + 1] if "--key" in j["argv"] else None, "type": j["type"]} for j in r["tg"]]
o = {}
# Kingdom: the Thursday 2nd reminder through the real ladder and the real tg()
sent = MI.ladder(datetime.datetime(2026, 10, 1, 10, 30), R.tg, R.once, C, f=f)
o["k_ladder"] = [[a, b] for a, b, _ in sent]
o["k_second"] = tg_view(take())
R.tg("acct,second,acct", MI.records_msg(f, "weekly", d(2026, 10, 1)), "weekly_attendance_reminder")
o["k_weekly"] = tg_view(take())
R.tg("acct,second", "Plain text, no greeting\\n\\nbody", "x")
o["k_plain"] = [j["argv"] for j in take()["tg"]]
o["k_srcdoc"] = R.divine_srcdoc_msg([(1, "2026-10-05", "602757", "Slot A")]).split("\\n")[0]
R.tg("noname", R.divine_srcdoc_msg([(1, "2026-10-05", "602757", "Slot A")]), "source_doc_reminder")
o["k_noname"] = tg_view(take())
o["greet_unknown"] = [G.personalise(G.NEUTRAL + "\\n\\nx", "nobody").split("\\n")[0], G.personalise(G.NEUTRAL + "\\n\\nx", "").split("\\n")[0]]
# a person whose greeting is not set up
# satellite parish: Thursday 2nd reminder, then the cut-off Sunday evening, then Thursday again
MI.cached_facts = lambda today, month=None, max_age_min=30: f
P = SI.parishes()[0]
SI.remind(P, datetime.datetime(2026, 10, 1, 10, 30))
r = take()
o["s_second"] = tg_view(r)
o["s_second_mail"] = [{"to": j["to"], "first": j["body"].split("\\n")[0]} for j in r["mail"]]
f2 = dict(f, today=d(2026, 10, 4))
MI.cached_facts = lambda today, month=None, max_age_min=30: f2
SI.remind(P, datetime.datetime(2026, 10, 4, 20, 30))
r = take()
o["s_cutoff"] = [{"to": j["argv"][0], "first": j["argv"][1].split("\\n")[0]} for j in r["tg"]]
o["s_cutoff_mail"] = [{"to": j["to"], "first": j["body"].split("\\n")[0]} for j in r["mail"]]
MI.cached_facts = lambda today, month=None, max_age_min=30: f
SI.remind(P, datetime.datetime(2026, 10, 1, 10, 45))
o["s_again"] = take()
print(json.dumps(o, default=str))
`;

test('behaviour: every recipient gets their own greeting (Kingdom and a satellite parish), nothing is sent twice', { skip: !hasPython }, () => {
  const { root, out } = behaviourRoot();
  try {
    assert.equal(patch(root).status, 0);
    const r = spawnSync(PY, ['-c', SNIPPET(root, out)], { env: env(root), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const o = JSON.parse(r.stdout);
    // Kingdom: one message per person, each with their own name; a person without a name gets the plain greeting
    assert.deepEqual(o.k_ladder, [['coll2', 'acct,second,noname']]);
    assert.deepEqual(o.k_second.map(x => [x.to, x.first]), [['acct', 'Good morning Bro. Acct,'], ['second', 'Good morning Pastor Demo,'], ['noname', 'Good morning,']]);
    assert.ok(o.k_second.every(x => x.type === 'collection_reminder'), 'the message type (routing) is still sent');
    // the weekly message: same, and a person named twice is sent to once
    assert.deepEqual(o.k_weekly.map(x => [x.to, x.first]), [['acct', 'Good morning Bro. Acct,'], ['second', 'Good morning Pastor Demo,']]);
    // a message with no greeting line is one call to everyone, as before
    assert.deepEqual(o.k_plain.map(a => a[0]), ['acct,second']);
    // the two other Kingdom messages use the plain greeting, personalised when sent
    assert.equal(o.k_srcdoc, 'Good morning,');
    assert.deepEqual(o.k_noname.map(x => x.first), ['Good morning,']);
    assert.deepEqual(o.greet_unknown, ['Good morning,', 'Good morning,']);
    // satellite: each person of the parish their own name (called, then the name in brackets, then first word of the name,
    // a title kept with the next word), same guard key for everyone (the box's guard is per key and per person)
    assert.deepEqual(o.s_second.map(x => [x.to, x.first]), [['p1', 'Good morning Pastor Ade,'], ['p2', 'Good morning Deacon Bola,'],
      ['p3', 'Good morning Sis. Three,'], ['p4', 'Good morning Bro. Dup,']]);
    assert.deepEqual([...new Set(o.s_second.map(x => x.key))], ['satrem:659840:second:2026-10-01']);
    // people with no chat id get an email each, each address once (the same address in another case counts as the same)
    assert.deepEqual(o.s_second_mail, [{ to: ['p2@example.invalid'], first: 'Good morning Deacon Bola,' }]);
    // the cut-off evening message has no greeting: still one call to the people and the copies, one email to the others
    assert.deepEqual(o.s_cutoff.map(x => x.to), ['p1,p2,p3,p4,acct']);
    assert.match(o.s_cutoff[0].first, /last Sunday/);
    assert.equal(o.s_cutoff_mail.length, 1);
    assert.deepEqual(o.s_cutoff_mail[0].to, ['p2@example.invalid', 'P2@example.invalid']);
    // running again the same day sends nothing
    assert.deepEqual(o.s_again, { tg: [], mail: [] });
  } finally { rm(root); }
});

test('behaviour: without greet.py or when it fails, the reminders are still sent (plain greeting, one call as before)', { skip: !hasPython }, () => {
  const { root, out } = behaviourRoot();
  try {
    assert.equal(patch(root).status, 0);
    fs.rmSync(path.join(root, 'tools/greet.py'));
    const code = `
import datetime, json, os, sys
root, out = ${JSON.stringify(root)}, ${JSON.stringify(out)}
sys.path.insert(0, root + '/tools')
import monthinfo as MI, reminders as R, satinfo as SI
R.TG = root + '/telegram/send_msg.py'
d = datetime.date
f = {"month": "2026-10", "start": d(2026, 9, 7), "end": d(2026, 10, 4), "today": d(2026, 10, 1), "report": False, "entry": {},
     "sundays": [{"date": d(2026, 9, 20), "collection": False, "attendance": "submitted"}]}
R.tg("acct,second", MI.records_msg(f, "weekly", d(2026, 10, 1)), "weekly_attendance_reminder")
MI.LADDER_STATE = out + '/ladder.json'
MI.cached_facts = lambda today, month=None, max_age_min=30: f
SI.remind(SI.parishes()[0], datetime.datetime(2026, 10, 1, 10, 30))
rows = [json.loads(l) for l in open(out + '/tg.jsonl')]
print(json.dumps([[j["argv"][0], j["argv"][1].split("\\n")[0]] for j in rows]))`;
    const r = spawnSync(PY, ['-c', code], { env: env(root), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), [['acct,second', 'Good morning,'], ['p1,p2,p3,p4', 'Good morning,']]);
  } finally { rm(root); }
});

test('greet.py: names from Automations -> People, HTML-safe, unknown people get the plain greeting', { skip: !hasPython }, () => {
  const { root } = behaviourRoot();
  try {
    const r = spawnSync(PY, [path.join(root, 'tools/greet.py'), 'selftest'], { env: env(root), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /greet selftest OK/);
    const s = spawnSync(PY, [path.join(root, 'tools/greet.py'), 'show'], { env: env(root), encoding: 'utf8' });
    assert.equal(s.status, 0, s.stderr);
    assert.match(s.stdout, /acct: Good morning Bro\. Acct,/);
    assert.match(s.stdout, /noname: \(no name: plain Good morning,\)/);
  } finally { rm(root); }
});

test('bundle: install.sh and undo.sh are valid shell, SHA256SUMS matches, INSTALL-ORDER lists it (step 21), no personal data', () => {
  for (const f of ['install.sh', 'undo.sh']) assert.equal(spawnSync('bash', ['-n', path.join(BUNDLE, f)]).status, 0, f);
  const sums = fs.readFileSync(path.join(BUNDLE, 'SHA256SUMS'), 'utf8').trim().split('\n');
  assert.equal(sums.length, 5);
  for (const line of sums) {
    const [hash, name] = line.split(/\s+/);
    const crypto = spawnSync('sha256sum', [path.join(BUNDLE, name)], { encoding: 'utf8' });
    if (crypto.status === 0) assert.equal(crypto.stdout.split(/\s+/)[0], hash, name);
  }
  const order = fs.readFileSync(path.join(REPO, 'box/INSTALL-ORDER.md'), 'utf8');
  const rows = order.split('\n').filter(l => /^\| \d+ \|/.test(l));
  assert.ok(rows.some(r => /^\| 21 \| `greetings-20261003`/.test(r)), 'greetings-20261003 is step 21');
  const install = fs.readFileSync(path.join(BUNDLE, 'install.sh'), 'utf8');
  assert.match(install, /botmenu-20261003 is not installed/);
  assert.match(install, /\/workspace\/backups\/\$TAG/);
  assert.match(install, /-ge 0725/);
  for (const f of fs.readdirSync(BUNDLE)) {
    const s = fs.readFileSync(path.join(BUNDLE, f), 'utf8');
    assert.doesNotMatch(s, /[\w.+-]+@[\w-]+\.[\w.]+/, f + ' has an email address');
    assert.doesNotMatch(s, /\b\d{9,}\b/, f + ' has a long number (chat id / phone)');
  }
});
