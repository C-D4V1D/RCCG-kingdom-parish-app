// The weekly Sunday-records message and the memo back-up follow their settings (box/followticks-20261003): patch.py is
// anchored and all-or-nothing, runs twice safely and compiles on fixtures of the box files; the offline selftest passes.
// Synthetic data only; nothing is read or sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '..');
const BUNDLE = path.join(REPO, 'box/followticks-20261003');
const FIX = path.join(REPO, 'tests/fixtures/box/followticks');
const PY = process.env.PYTHON || 'python3';
const hasPython = spawnSync(PY, ['--version']).status === 0;
// The scheduler's cfg() and memo line, as on the box.
const BOXSCHED_SRC = `import json, os
CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sched_config.json")
DEFAULTS = {"memo": True, "memo_time": "09:00", "sunday": True, "sunday_time": "09:00"}
def log(*a): pass
def cfg():
    c = dict(DEFAULTS)
    try: c.update(json.load(open(CONFIG)))
    except FileNotFoundError: pass
    except Exception as e: log("bad sched_config.json, using defaults:", repr(e)[:200])
    return c
def at_or_after(t, hhmm):
    h, m = map(int, hhmm.split(":")); return (t.hour, t.minute) >= (h, m)
def tick(t, wd, c):
    want_memo = (wd <= 5 and c["memo"] and at_or_after(t, c["memo_time"])) or (wd == 6 and c["sunday"] and at_or_after(t, c["sunday_time"]))
    return want_memo
`;
const FILES = ['tools/clerkcfg.py', 'tools/reminders.py', 'telegram/srcdoc/boxsched.py'];
const run = (root, args) => spawnSync(PY, args, { env: { ...process.env, CLERK_ROOT: root, PYTHONDONTWRITEBYTECODE: '1' }, encoding: 'utf8' });
function fakeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'followticks-'));
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(root, 'telegram/srcdoc'), { recursive: true });
  for (const f of ['clerkcfg.py', 'reminders.py']) fs.copyFileSync(path.join(FIX, f), path.join(root, 'tools', f));
  fs.writeFileSync(path.join(root, 'telegram/srcdoc/boxsched.py'), BOXSCHED_SRC);
  return root;
}
const snapshot = root => Object.fromEntries(FILES.map(f => [f, fs.readFileSync(path.join(root, f), 'utf8')]));
const rm = root => fs.rmSync(root, { recursive: true, force: true });

test('patch applies once, runs twice safely, compiles, and the offline selftest passes', { skip: !hasPython }, () => {
  const root = fakeRoot();
  try {
    assert.equal(run(root, [path.join(BUNDLE, 'patch.py'), '--check']).status, 0);
    const r1 = run(root, [path.join(BUNDLE, 'patch.py')]);
    assert.equal(r1.status, 0, r1.stdout + r1.stderr);
    const after = snapshot(root);
    for (const f of FILES) assert.match(after[f], /followticks-20261003/, f);
    assert.match(after['tools/reminders.py'], /C\.weekly_records_who\("divine"\)/);
    assert.doesNotMatch(after['tools/reminders.py'], /C\.one\("weekly_attendance_reminder", "divine"\)/);
    const r2 = run(root, [path.join(BUNDLE, 'patch.py')]);
    assert.equal(r2.status, 0);
    assert.match(r2.stdout, /already patched/);
    assert.deepEqual(snapshot(root), after);
    for (const f of FILES) assert.equal(spawnSync(PY, ['-m', 'py_compile', path.join(root, f)]).status, 0, f);
    const t = run(root, [path.join(BUNDLE, 'selftest.py'), 'test', '--root', root]);
    assert.equal(t.status, 0, t.stdout + t.stderr);
    assert.match(t.stdout, /SELFTEST OK/);
  } finally { rm(root); }
});

test('a broken anchor changes nothing', { skip: !hasPython }, () => {
  const root = fakeRoot();
  try {
    const pf = path.join(root, 'telegram/srcdoc/boxsched.py');
    fs.writeFileSync(pf, fs.readFileSync(pf, 'utf8').replace('want_memo = (wd <= 5 and', 'want_memo = (wd < 6 and'));
    const before = snapshot(root);
    for (const args of [['--check'], []]) {
      const r = run(root, [path.join(BUNDLE, 'patch.py'), ...args]);
      assert.equal(r.status, 1);
      assert.match(r.stdout, /NOT CHANGED/);
      assert.deepEqual(snapshot(root), before);
    }
  } finally { rm(root); }
});

test('bundle: valid shell, SHA256SUMS matches, INSTALL-ORDER lists it as step 25, nothing sent, no personal data', () => {
  for (const f of ['install.sh', 'undo.sh']) assert.equal(spawnSync('bash', ['-n', path.join(BUNDLE, f)]).status, 0, f);
  const sums = fs.readFileSync(path.join(BUNDLE, 'SHA256SUMS'), 'utf8').trim().split('\n').map(l => l.split(/\s+/)[1]).sort();
  assert.deepEqual(sums, fs.readdirSync(BUNDLE).filter(f => f !== 'SHA256SUMS').sort());
  const r = spawnSync('sha256sum', ['-c', '--quiet', 'SHA256SUMS'], { cwd: BUNDLE, encoding: 'utf8' });
  if (!r.error) assert.equal(r.status, 0, r.stdout + r.stderr);
  const rows = fs.readFileSync(path.join(REPO, 'box/INSTALL-ORDER.md'), 'utf8').split('\n').filter(l => /^\| \d+ \|/.test(l));
  assert.match(rows[rows.length - 1], /^\| 25 \| `followticks-20261003`/);
  const install = fs.readFileSync(path.join(BUNDLE, 'install.sh'), 'utf8');
  assert.match(install, /-ge 0725/);
  assert.match(install, /--check/);
  assert.doesNotMatch(install, /python3 \S*reminders\.py|send_msg|botmenu\.py apply/, 'the installer must not run a sender');
  for (const dir of [BUNDLE, FIX]) for (const f of fs.readdirSync(dir)) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.doesNotMatch(s, /[\w.+-]+@[\w-]+\.[\w.]+/, f + ' has an email address');
    assert.doesNotMatch(s, /\b\d{9,}\b/, f + ' has a long number (chat id / phone)');
  }
});
