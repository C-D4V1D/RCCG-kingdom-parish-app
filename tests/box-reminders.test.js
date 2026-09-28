// Clerk box collection reminders + the bot's /month (box/reminders-20260929): the real monthinfo.py against a fake
// parish app, and patch.py against fixture copies of the box files.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '..');
const BUNDLE = path.join(REPO, 'box/reminders-20260929');
const FIX = path.join(REPO, 'tests/fixtures/box');
const PY = process.env.PYTHON || 'python3';
const hasPython = spawnSync(PY, ['--version']).status === 0;
const write = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof o === 'string' ? o : JSON.stringify(o)); };

// October 2026: period Mon 21 Sep - Sun 18 Oct; Sundays 27 Sep, 4, 11, 18 Oct. 11 Oct's collection is missing.
const APP = {
  settings: { remCutoffDatesByYear: { 2026: [18, 22, 22, 19, 24, 21, 19, 23, 20, 18, 22, 13] } },
  income: [
    { date: '2026-09-27', source: 'sunday_collection' }, { date: '2026-10-04', source: null },
    { date: '2026-10-11', source: 'other_income' },
  ],
  attendance: [{ weekEnd: '2026-09-27', status: 'locked' }, { weekEnd: '2026-10-04', status: 'submitted' }, { weekEnd: '2026-10-11', status: 'draft' }],
};

async function withApp(fn) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url, key: req.headers['x-automation-key'], method: req.method });
    res.setHeader('content-type', 'application/json');
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/settings') return res.end(JSON.stringify(APP.settings));
    if (u.pathname === '/api/income') return res.end(JSON.stringify(APP.income));
    if (u.pathname === '/api/attendance') return res.end(JSON.stringify(APP.attendance.filter(w => w.weekEnd >= u.searchParams.get('from') && w.weekEnd <= u.searchParams.get('to'))));
    if (u.pathname === '/api/attendance-further') return res.end(JSON.stringify({ current: null, previous: null }));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await fn(`http://127.0.0.1:${server.address().port}`, seen); } finally { server.close(); }
}

// Runs a small Python driver against monthinfo.py (async so the fake app can answer).
function py(url, driver, state = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'monthinfo-'));
  write(path.join(root, 'remit-runs.json'), state);
  const env = { ...process.env, KP_APP_URL: url, KP_AUTOMATION_KEY: 'test-key', CLERK_REMIT_STATE: path.join(root, 'remit-runs.json'),
    MONTHINFO_CACHE: path.join(root, 'cache.json'), PYTHONDONTWRITEBYTECODE: '1' };
  const code = `import sys, json, datetime as D\nsys.path.insert(0, ${JSON.stringify(BUNDLE)})\nimport monthinfo as M
class Cfg:
    def __init__(s, d=None): s.d = d or {}
    def get(s, p, default=None): return s.d.get(p, default)
    def who(s, t, default, exclude=()): return default
def ladder_at(y, mo, d, h, mi, cfg=None, done=None):
    done = set() if done is None else done
    def once(flag, key):
        if (flag, key) in done: return False
        done.add((flag, key)); return True
    return [(f, w, t) for f, w, t in M.ladder(D.datetime(y, mo, d, h, mi), lambda *a: None, once, cfg or Cfg())]
${driver}`;
  return new Promise((resolve) => {
    const p = spawn(PY, ['-c', code], { env });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
    p.on('close', status => { fs.rmSync(root, { recursive: true, force: true }); resolve({ status, out, err }); });
  });
}

test('monthinfo: /month shows each Sunday, the month-end state and the next step', { skip: !hasPython }, async () => {
  await withApp(async (url, seen) => {
    const r = await py(url, `f = M.facts(today=D.date(2026, 10, 15)); print(json.dumps({"text": M.month_text(f), "miss": [str(x) for x in M.missing_collections(f)]}))`);
    assert.equal(r.status, 0, r.err);
    const { text, miss } = JSON.parse(r.out);
    assert.deepEqual(miss, ['2026-10-11'], 'other income on a Sunday is not a Sunday collection');
    assert.match(text, /October 2026 remittance/);
    assert.match(text, /Period: 21 Sep – 18 Oct \(cut-off Sun 18 Oct\)/);
    assert.match(text, /11 Oct\s+❌\s+❌/);
    assert.match(text, /27 Sep\s+✅\s+✅/);
    assert.match(text, /18 Oct\s+–\s+–/);
    assert.match(text, /Month-end:<\/b> starts when the 18 Oct collection is saved/);
    assert.match(text, /Next:<\/b> Bro\. Divine: record the collection for 11 Oct\./);
    assert.ok(seen.every(s => s.method === 'GET' && s.key === 'test-key'), 'read-only, with the automation key');
  });
});

test('monthinfo: /month after the cut-off reads the month-end record (check sent, RRR, hold)', { skip: !hasPython }, async () => {
  await withApp(async (url) => {
    const key = '2026-09-21..2026-10-18';
    const r1 = await py(url, `print(M.month_end_line(M.facts(month="2026-10", today=D.date(2026, 10, 19))))`,
      { [key]: { month: '2026-10', status: 'awaiting-reply', lastCheckSentAt: '2026-10-18T14:02:00', attendance: { exit: 0 } } });
    assert.match(r1.out, /filed ✅ · check email sent 18 Oct · waiting for Generate RRR/);
    const r2 = await py(url, `print(M.month_end_line(M.facts(month="2026-10", today=D.date(2026, 10, 20))))`,
      { [key]: { status: 'done', rrr: { code: '1234-5678-9012' } } });
    assert.match(r2.out, /RRR 1234-5678-9012 generated/);
    const r3 = await py(url, `print(M.month_end_line(M.facts(month="2026-10", today=D.date(2026, 10, 19))))`,
      { [key]: { status: 'held', hold: { categories: [{ key: 'weekendOffering', label: 'Weekend Offering' }] } } });
    assert.match(r3.out, /on hold: Weekend Offering has no portal line/);
    const r4 = await py(url, `print(M.month_end_line(M.facts(month="2026-10", today=D.date(2026, 10, 20))))`);
    assert.match(r4.out, /not started: waiting for 11 Oct, 18 Oct/);
    // /month with no month: the day after the cut-off it still shows October (until its RRR), then moves on
    const r5 = await py(url, `print(M.facts(today=D.date(2026, 10, 19), prefer_open=True)["month"], M.facts(today=D.date(2026, 10, 19))["month"])`,
      { [key]: { status: 'awaiting-reply' } });
    assert.equal(r5.out.trim(), '2026-10 2026-11');
    const r6 = await py(url, `print(M.facts(today=D.date(2026, 10, 19), prefer_open=True)["month"])`, { [key]: { status: 'done' } });
    assert.equal(r6.out.trim(), '2026-11');
    // a month done outside the automation (no record, cut-off collection saved): not "starting", and /month moves on
    const saved = APP.income;
    APP.income = [...saved, { date: '2026-10-11', source: 'sunday_collection' }, { date: '2026-10-18', source: 'sunday_collection' }];
    try {
      const r7 = await py(url, `f = M.facts(month="2026-10", today=D.date(2026, 10, 28)); print(json.dumps([M.month_end_line(f), M.next_step(f), M.attendance_line(f), M.facts(today=D.date(2026, 10, 28), prefer_open=True)["month"]]))`);
      const [line, next, att, month] = JSON.parse(r7.out);
      assert.match(line, /no automatic run recorded for this month/);
      assert.equal(next, 'Nothing for this month.');
      assert.equal(att, 'no record on the box');
      assert.equal(month, '2026-11');
      const r8 = await py(url, `f = M.facts(month="2026-10", today=D.date(2026, 10, 19)); print(json.dumps([M.month_end_line(f), M.next_step(f), M.facts(today=D.date(2026, 10, 19), prefer_open=True)["month"]]))`);
      const [line8, next8, month8] = JSON.parse(r8.out);
      assert.match(line8, /starting \(the cut-off collection was just saved\)/);
      assert.match(next8, /starting the month-end/);
      assert.equal(month8, '2026-10');
    } finally { APP.income = saved; }
  });
});

test('collection reminders: 2nd reminder on Thursday once, cut-off Sunday evening and the Monday after, to the right people', { skip: !hasPython }, async () => {
  await withApp(async (url) => {
    const r = await py(url, `
done = set()
out = {
 "thu_early": ladder_at(2026, 10, 15, 9, 30, done=done),
 "thu": ladder_at(2026, 10, 15, 10, 5, done=done),
 "thu_again": ladder_at(2026, 10, 15, 16, 0, done=done),
 "wed": ladder_at(2026, 10, 14, 12, 0, done=done),
 "sun_before": ladder_at(2026, 10, 18, 19, 0, done=done),
 "sun": ladder_at(2026, 10, 18, 20, 30, done=done),
 "mon": ladder_at(2026, 10, 19, 10, 0, done=done),
 "off": ladder_at(2026, 10, 15, 11, 0, cfg=Cfg({"automations.collection_reminders.enabled": False})),
}
print(json.dumps(out))`);
    assert.equal(r.status, 0, r.err);
    const o = JSON.parse(r.out);
    assert.deepEqual(o.thu_early, []);
    assert.equal(o.thu.length, 1);
    assert.equal(o.thu[0][0], 'coll2');
    assert.equal(o.thu[0][1], 'divine');
    assert.match(o.thu[0][2], /2nd reminder/);
    assert.match(o.thu[0][2], /Sun 11 Oct/);
    assert.deepEqual(o.thu_again, [], 'never twice the same day');
    assert.deepEqual(o.wed, [], 'only on the chosen day');
    assert.deepEqual(o.sun_before, []);
    assert.equal(o.sun[0][0], 'collcut');
    assert.equal(o.sun[0][1], 'divine,david');
    assert.match(o.sun[0][2], /last Sunday of the October 2026 remittance/);
    assert.match(o.sun[0][2], /Also missing: 11 Oct/);
    assert.equal(o.mon[0][0], 'collafter');
    assert.match(o.mon[0][2], /October 2026 remittance is waiting/);
    assert.deepEqual(o.off, []);
  });
});

test('collection reminders: nothing once the month-end has started, or when nothing is missing', { skip: !hasPython }, async () => {
  await withApp(async (url) => {
    const r = await py(url, `print(json.dumps([ladder_at(2026, 10, 18, 21, 0), ladder_at(2026, 10, 19, 11, 0)]))`,
      { '2026-09-21..2026-10-18': { month: '2026-10', status: 'filling' } });
    assert.deepEqual(JSON.parse(r.out), [[], []]);
    const saved = APP.income;
    APP.income = [...saved, { date: '2026-10-11', source: 'sunday_collection' }];
    try {
      const r2 = await py(url, `print(json.dumps(ladder_at(2026, 10, 15, 11, 0)))`);
      assert.deepEqual(JSON.parse(r2.out), []);
    } finally { APP.income = saved; }
  });
});

test("collection reminders: Monday's missing collections join Bro. Divine's attendance message (one message)", { skip: !hasPython }, async () => {
  await withApp(async (url) => {
    const r = await py(url, `
f = M.facts(today=D.date(2026, 10, 12))
both = M.monday_msg("Good morning Bro. Divine,\\n\\nATTENDANCE CARD\\n\\nGod bless.", f)
only = M.monday_msg(None, f)
print(json.dumps({"both": both, "only": only, "ladder_mon": ladder_at(2026, 10, 12, 10, 0)}))`);
    assert.equal(r.status, 0, r.err);
    const o = JSON.parse(r.out);
    assert.equal(o.both.match(/Good morning/g).length, 1);
    assert.equal(o.both.match(/God bless/g).length, 1);
    assert.ok(o.both.indexOf('ATTENDANCE CARD') < o.both.indexOf('Sun 11 Oct') || !o.both.includes('Sun 11 Oct'));
    assert.match(o.only, /^Good morning Bro\. Divine,/);
    assert.deepEqual(o.ladder_mon, [], 'with the weekly reminder on, Monday is only the combined message');
  });
});

test('patch: reminders, /status, /refresh and /month fit the box files, compile, and run twice safely', { skip: !hasPython }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reminders-patch-'));
  try {
    for (const [src, dst] of [['reminders.py', 'tools/reminders.py'], ['clerkinfo.py', 'tools/clerkinfo.py'],
      ['att-refresh.py', 'tools/att-refresh.py'], ['poller.py', 'telegram/srcdoc/poller.py']]) {
      write(path.join(root, dst), fs.readFileSync(path.join(FIX, src), 'utf8'));
    }
    const env = { ...process.env, CLERK_ROOT: root, PYTHONDONTWRITEBYTECODE: '1' };
    const check = spawnSync(PY, [path.join(BUNDLE, 'patch.py'), '--check'], { env, encoding: 'utf8' });
    assert.equal(check.status, 0, check.stdout + check.stderr);
    const apply = spawnSync(PY, [path.join(BUNDLE, 'patch.py')], { env, encoding: 'utf8' });
    assert.equal(apply.status, 0, apply.stdout + apply.stderr);
    const again = spawnSync(PY, [path.join(BUNDLE, 'patch.py')], { env, encoding: 'utf8' });
    assert.match(again.stdout, /already patched telegram\/srcdoc\/poller\.py/);

    const rem = fs.readFileSync(path.join(root, 'tools/reminders.py'), 'utf8');
    assert.match(rem, /import monthinfo as MI/);
    assert.match(rem, /t = MI\.monday_msg\(t, MI\.facts\(\)\)/);
    assert.match(rem, /\n    if MI is not None:[^\n]*\n        try: MI\.ladder\(now, tg, once, C\)\n[^\n]*\n    if C\.enabled\("weekly_attendance_reminder"\)/, 'ladder runs every cycle, before the Monday block');
    const pol = fs.readFileSync(path.join(root, 'telegram/srcdoc/poller.py'), 'utf8');
    assert.match(pol, /"\/month - this month's remittance/);
    assert.match(pol, /\ndef cmd_month\(chat, arg\):/);
    assert.match(pol, /if cmd\.split\(\)\[0\] == "\/month":/);
    assert.match(pol, /if not m or m not in _filed:/);

    // /refresh now finds a month filed by att-fill.js from the month-end run (marker file), not only att-watch.py's
    const drive = `import sys, os, json, types\nsys.modules['monthinfo'] = types.SimpleNamespace(att_filed=lambda m: 'filed on the portal' if m == '2026-10' else None)
sys.path.insert(0, ${JSON.stringify(path.join(root, 'tools'))})
import clerkinfo, importlib.util
print(json.dumps(clerkinfo.att_lines({}, ['2026-10', '2026-11'])))
spec = importlib.util.spec_from_file_location('ar', ${JSON.stringify(path.join(root, 'tools/att-refresh.py'))}); ar = importlib.util.module_from_spec(spec); spec.loader.exec_module(ar)
os.makedirs('runs', exist_ok=True); open('runs/att-submit-2026-10.json', 'w').write('{}')
print(json.dumps(ar.apply('2026-10', 'David')))`;
    const r = spawnSync(PY, ['-c', drive], { env, encoding: 'utf8', cwd: root });
    assert.equal(r.status, 0, r.stderr);
    const [lines, runs] = r.stdout.trim().split('\n').map(l => JSON.parse(l));
    assert.deepEqual(lines, ['2026-10: filed on the portal', '2026-11: not filed']);
    assert.deepEqual(runs['2026-10'].refreshes, [{ n: 1 }]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
