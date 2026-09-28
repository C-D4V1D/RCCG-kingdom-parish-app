// Clerk box Sunday records reminders + statement send day (box/records-20260928): the real monthinfo.py against a fake
// parish app, patch.py against fixture copies of stmt-runner.py / boxsched.py, and the patched due_check() maths.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '..');
const BUNDLE = path.join(REPO, 'box/records-20260928');
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
    MONTHINFO_CACHE: path.join(root, 'cache.json'), MONTHINFO_LADDER_STATE: path.join(root, 'ladder.json'), PYTHONDONTWRITEBYTECODE: '1' };
  const code = `import sys, json, datetime as D\nsys.path.insert(0, ${JSON.stringify(BUNDLE)})\nimport monthinfo as M
class Cfg:
    def __init__(s, d=None): s.d = d or {}
    def get(s, p, default=None): return s.d.get(p, default)
    def who(s, t, default, exclude=()): return default
    def num(s, p, default): return s.d.get(p, default)
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


const run = (url, driver, state) => py(url, driver, state).then(r => { assert.equal(r.status, 0, r.err); return r.out; });

test('records: weekly message lists each Sunday collection-first; Monthly report only in the cut-off week', { skip: !hasPython }, async () => {
  await withApp(async (url) => {
    // Mon 5 Oct: 27 Sep and 4 Oct have collections -> nothing to send
    assert.equal((await run(url, `print(M.monday_msg("OLD", M.facts(today=D.date(2026,10,5))))`)).trim(), 'None');
    // Mon 12 Oct (cut-off week): 11 Oct has no collection and draft attendance; the Monthly report is not in
    const out = await run(url, `print(M.monday_msg("OLD", M.facts(today=D.date(2026,10,12))))`);
    assert.match(out, /^Good morning Bro\. Divine,/);
    assert.match(out, /Sunday records not complete/);
    assert.match(out, /• Sun 11 Oct: attendance, then collection/);
    assert.match(out, /• Monthly report: not submitted \(needed before the 18 Oct collection\)/);
    assert.match(out, /once the 18 Oct collection is saved/);
    assert.match(out, /God bless\.$/m);
    assert.doesNotMatch(out, /OLD|27 Sep|4 Oct/);
    // app unreadable: the old attendance reminder text is kept
    assert.equal((await run(url, `print(M.monday_msg("OLD", {"error": "x"}))`)).trim(), 'OLD');
  });
});

test('records: attendance in but no collection says "collection (attendance ✅)"', { skip: !hasPython }, async () => {
  const saved = APP.attendance;
  APP.attendance = saved.map(w => ({ ...w, status: 'submitted' }));
  try {
    await withApp(async (url) => {
      assert.match(await run(url, `print(M.monday_msg(None, M.facts(today=D.date(2026,10,12))))`), /• Sun 11 Oct: collection \(attendance ✅\)/);
    });
  } finally { APP.attendance = saved; }
});

test('records: the follow-up ladder over a cut-off week', { skip: !hasPython }, async () => {
  await withApp(async (url) => {
    const out = await run(url, `
done = set()
for when in [(2026,10,15,9,0), (2026,10,15,10,5), (2026,10,15,11,0), (2026,10,18,19,0), (2026,10,18,20,1), (2026,10,19,10,1),
             (2026,10,20,10,1), (2026,10,23,10,1), (2026,10,24,10,1), (2026,10,26,10,1)]:
    for f, w, t in ladder_at(*when, done=done):
        print(json.dumps({"at": "%d-%02d-%02d %02d:%02d" % when, "flag": f, "who": w, "text": t}))
`);
    const r = out.trim().split('\n').map(l => JSON.parse(l));
    assert.deepEqual(r.map(x => [x.at, x.flag, x.who]), [
      ['2026-10-15 10:05', 'coll2', 'divine'],
      ['2026-10-18 20:01', 'collcut', 'divine,david'],
      ['2026-10-19 10:01', 'collafter', 'divine,david'],
      ['2026-10-20 10:01', 'collafter', 'divine,david'],
      ['2026-10-23 10:01', 'collafter', 'divine,david'],   // day 5 after the cut-off, the last one
    ]);
    assert.match(r[0].text, /^Good morning Bro\. Divine,[\s\S]*\(2nd reminder\)[\s\S]*• Sun 11 Oct: attendance, then collection[\s\S]*Monthly report/);
    assert.match(r[1].text, /Today \(18 Oct\) is the last Sunday of the October 2026 remittance/);
    assert.match(r[1].text, /• Sun 11 Oct: attendance, then collection\n• Sun 18 Oct: attendance, then collection\n• Monthly report/);
    assert.doesNotMatch(r[1].text, /Good morning/);
    assert.match(r[2].text, /October 2026 remittance is waiting/);
    assert.match(r[2].text, /cut-off was Sun 18 Oct \(1 day ago\)/);
    assert.match(r[4].text, /\(5 days ago\)/);
    // the weekly message on the Monday after the cut-off is left to the daily follow-up (no double message)
    assert.equal((await run(url, `print(M.monday_msg("OLD", M.facts(today=D.date(2026,10,19))))`)).trim(), 'None');
  });
});

test('records: settings and month-end state switch reminders off', { skip: !hasPython }, async () => {
  await withApp(async (url) => {
    const n = async (drv, state) => (await run(url, drv, state)).trim();
    // after_days 0: nothing after the cut-off
    assert.equal(await n(`print(len(ladder_at(2026,10,19,10,1, cfg=Cfg({"automations.collection_reminders.after_days": 0}))))`), '0');
    // after_days 2: day 3 is quiet
    assert.equal(await n(`print(len(ladder_at(2026,10,21,10,1, cfg=Cfg({"automations.collection_reminders.after_days": 2}))))`), '0');
    // follow-ups switched off
    assert.equal(await n(`print(len(ladder_at(2026,10,18,20,1, cfg=Cfg({"automations.collection_reminders.enabled": False}))))`), '0');
    // weekly message off: the ladder sends the Monday one instead
    assert.equal(await n(`print([f for f, w, t in ladder_at(2026,10,12,10,1, cfg=Cfg({"automations.weekly_attendance_reminder.enabled": False}))])`), "['coll1']");
    // month-end already started for the period: nothing on the cut-off evening or after
    const st = { '2026-09-21..2026-10-18': { status: 'running', month: '2026-10' } };
    assert.equal(await n(`print(len(ladder_at(2026,10,18,20,1)) + len(ladder_at(2026,10,19,10,1)))`, st), '0');
  });
});

test('records: the app is read once per slot a day, not every 5 minutes', { skip: !hasPython }, async () => {
  await withApp(async (url, seen) => {
    await run(url, `
done = set()
for mi in (1, 6, 11, 16):
    M.ladder(D.datetime(2026,10,15,10,mi), lambda *a: None, lambda f, k: (f, k) not in done and not done.add((f, k)), Cfg())
`);
    assert.equal(seen.filter(s => s.url === '/api/settings').length, 1);
  });
});

// ---------------------------------------------------------------- patch.py
const FIXR = path.join(REPO, 'tests/fixtures/box/records');
function fakeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'records-root-'));
  write(path.join(root, 'tools/stmt-runner.py'), fs.readFileSync(path.join(FIXR, 'stmt-runner.py'), 'utf8'));
  write(path.join(root, 'telegram/srcdoc/boxsched.py'), fs.readFileSync(path.join(FIXR, 'boxsched.py'), 'utf8'));
  return root;
}
const patch = (root, ...a) => spawnSync(PY, [path.join(BUNDLE, 'patch.py'), ...a], { env: { ...process.env, CLERK_ROOT: root }, encoding: 'utf8' });

test('records patch: check changes nothing, apply patches both files, twice is safe, a broken anchor changes nothing', { skip: !hasPython }, () => {
  const root = fakeRoot();
  const files = ['tools/stmt-runner.py', 'telegram/srcdoc/boxsched.py'].map(f => path.join(root, f));
  const before = files.map(f => fs.readFileSync(f, 'utf8'));
  let r = patch(root, '--check'); assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /CHECK OK: 2 file/);
  assert.deepEqual(files.map(f => fs.readFileSync(f, 'utf8')), before);
  r = patch(root); assert.equal(r.status, 0, r.stdout + r.stderr);
  const [sr, bs] = files.map(f => fs.readFileSync(f, 'utf8'));
  assert.match(sr, /rc, out, err = due_check\(\)  # records-20260928/);
  assert.match(sr, /"--live", "--month", to\[:7\]\]/);
  assert.match(sr, /"--render-only"/);  // test() untouched
  assert.match(bs, /off = max\(1, int\(cfg\(\).get\("statement_offset_days", 1\)\)\)/);
  assert.match(bs, /dt.timedelta\(days=off\) > today/);
  r = patch(root); assert.equal(r.status, 0); assert.match(r.stdout, /already patched tools\/stmt-runner.py/);
  // broken anchor in one file: neither file changes
  const root2 = fakeRoot();
  const b2 = path.join(root2, 'telegram/srcdoc/boxsched.py');
  fs.writeFileSync(b2, fs.readFileSync(b2, 'utf8').replace('default=None)', 'default=None, x=1)'));
  const s2 = fs.readFileSync(path.join(root2, 'tools/stmt-runner.py'), 'utf8');
  r = patch(root2); assert.equal(r.status, 1); assert.match(r.stdout, /NOT CHANGED/);
  assert.equal(fs.readFileSync(path.join(root2, 'tools/stmt-runner.py'), 'utf8'), s2);
});

test('records patch: statement due day and catch-up (stmt-runner due_check, boxsched window)', { skip: !hasPython }, () => {
  const root = fakeRoot();
  assert.equal(patch(root).status, 0);
  const sr = fs.readFileSync(path.join(root, 'tools/stmt-runner.py'), 'utf8');
  const fn = sr.slice(sr.indexOf('def due_check():'), sr.indexOf('def cycle():'));
  const bs = fs.readFileSync(path.join(root, 'telegram/srcdoc/boxsched.py'), 'utf8');
  const code = `import datetime, json, datetime as D
CUT = [datetime.date(2026,9,20), datetime.date(2026,10,18)]  # cut-off Sundays
class Cc:
    def __init__(s, d): s.d = d
    def num(s, p, default): return s.d.get(p, default)
SENT = []
def load(p, d): return SENT
def js(s): return json.loads(s)
FIN = "."
def run(cmd, cwd, timeout):
    day = datetime.date.fromisoformat(cmd[cmd.index("--today") + 1])
    y = day - datetime.timedelta(days=1)
    if y in CUT: return 0, json.dumps({"due": True, "from": "x", "to": y.isoformat()}), ""
    return 10, "{}", ""
${fn.replace(/`/g, '\\`')}
class FakeDate(datetime.date):
    T = None
    @classmethod
    def today(c): return c.T
def due_on(t, **kw):
    global C
    C = Cc(kw); FakeDate.T = t; datetime.date = FakeDate
    try: rc, out, _ = due_check()
    finally: datetime.date = D.date
    return json.loads(out)["to"] if rc == 0 else None
d = datetime.date
res = {}
res["n1_mon"] = due_on(d(2026,10,19))
res["n1_fri_catchup"] = due_on(d(2026,10,23))
res["n1_day8"] = due_on(d(2026,10,26))
res["n5_mon"] = due_on(d(2026,10,19), **{"automations.statement.days_after_cutoff": 5})
res["n5_fri"] = due_on(d(2026,10,23), **{"automations.statement.days_after_cutoff": 5})
SENT.append({"period_from": "x", "period_to": "2026-10-18"})
res["n1_tue_already_sent"] = due_on(d(2026,10,20))
ns = {}
exec(${JSON.stringify('')} + open(${JSON.stringify(path.join(root, 'telegram/srcdoc/boxsched.py'))}).read(), ns)
ps = [{"cutoff": c} for c in CUT]
for off in (1, 5):
    ns["cfg"] = lambda off=off: {"statement_offset_days": off}
    for t in (d(2026,10,19), d(2026,10,23), d(2026,10,29), d(2026,10,30)):
        due, nxt = ns["statement_analysis"](ps, t, 7)
        res[f"bs{off}_{t.day}"] = [str(p["cutoff"]) for p in due]
print(json.dumps(res))
`;
  const r = spawnSync(PY, ['-c', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const res = JSON.parse(r.stdout);
  assert.equal(res.n1_mon, '2026-10-18');           // default: the Monday
  assert.equal(res.n1_fri_catchup, '2026-10-18');   // missed Monday: caught up later in the week
  assert.equal(res.n1_day8, null);                  // after 7 days of catch-up it stops (the AI back-up is the next step)
  assert.equal(res.n5_mon, null);                   // set to 5: not on the Monday
  assert.equal(res.n5_fri, '2026-10-18');           // ... but on the Friday
  assert.equal(res.n1_tue_already_sent, null);      // already emailed: never again
  assert.deepEqual([res.bs1_19, res.bs1_23, res.bs1_29], [['2026-10-18'], ['2026-10-18'], []]);
  assert.deepEqual([res.bs5_19, res.bs5_23, res.bs5_29, res.bs5_30], [[], ['2026-10-18'], ['2026-10-18'], []]);
});
