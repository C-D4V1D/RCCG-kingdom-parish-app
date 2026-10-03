// /month's SOURCE DOCUMENTS and attendance from the portal (box/srcdocinfo-20261003): patch.py is anchored and
// all-or-nothing, runs twice safely and compiles on the botmenu fixtures after botmenu, month-parishes and remitinfo;
// srcdocinfo.py's offline selftest and the patched /month screen render. Synthetic data only; nothing is read or sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '..');
const BUNDLE = path.join(REPO, 'box/srcdocinfo-20261003');
const FIX = path.join(REPO, 'tests/fixtures/box/botmenu');
const PY = process.env.PYTHON || 'python3';
const hasPython = spawnSync(PY, ['--version']).status === 0;
// The box's poller after botmenu: the Kingdom /month line and main() (month-parishes hooks the picker in there).
const POLLER_SRC = `import os
WORK = "/tmp"
def _send_long(chat, text, kb=None): pass
def handle_message(st, msg): pass
def handle_callback(st, cq): pass
def _month_kingdom(chat, m, src, kb):
        _send_long(chat, MI.month_text(MI.facts(month=m, prefer_open=True), srcdoc=src), kb)


def main():
    os.makedirs(WORK, exist_ok=True)


if __name__ == "__main__":
    main()
# botmenu-20261003
`;
const FILES = ['tools/monthinfo.py', 'tools/satinfo.py', 'tools/satbot.py', 'tools/monthpick.py', 'telegram/srcdoc/poller.py'];

const env = root => ({ ...process.env, CLERK_ROOT: root, CLERK_CFG: path.join(root, 'config.json'), PYTHONDONTWRITEBYTECODE: '1',
  CLERK_REMIT_STATE: path.join(root, 'rccg-remit/state/remit-runs.json'), CLERK_MONTHCLOSE_STATE: path.join(root, 'state/monthclose.json'),
  REMITINFO_OFFLINE: '1', SRCDOCINFO_OFFLINE: '1', REMITINFO_CACHE: path.join(root, 'state/r.json'), SRCDOCINFO_CACHE: path.join(root, 'state/s.json') });
const run = (root, args) => spawnSync(PY, args, { env: env(root), encoding: 'utf8' });
function fakeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'srcdocinfo-'));
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(root, 'telegram/srcdoc'), { recursive: true });
  for (const f of ['clerkcfg', 'monthinfo', 'clerkinfo', 'satinfo', 'satbot']) fs.copyFileSync(path.join(FIX, f + '.py'), path.join(root, 'tools', f + '.py'));
  fs.copyFileSync(path.join(FIX, 'poller.py'), path.join(root, 'telegram/srcdoc/poller.py'));
  for (const b of ['botmenu-20261003', 'month-parishes-20261003', 'remitinfo-20261003']) {
    if (b === 'month-parishes-20261003') fs.writeFileSync(path.join(root, 'telegram/srcdoc/poller.py'), POLLER_SRC);
    const r = run(root, [path.join(REPO, 'box', b, 'patch.py')]);
    assert.equal(r.status, 0, b + r.stdout + r.stderr);
  }
  // The box's satinfo.py command line (not in the botmenu fixture).
  fs.appendFileSync(path.join(root, 'tools/satinfo.py'), `

if __name__ == "__main__":
    import re, sys
    a = sys.argv[1:]
    if a[:1] == ["month"] and len(a) > 1:
        print(month_text(Parish(a[1]), a[2] if len(a) > 2 else None))
`);
  for (const f of ['botmenu-20261003/botmenu.py', 'month-parishes-20261003/monthpick.py', 'remitinfo-20261003/remitinfo.py', 'srcdocinfo-20261003/srcdocinfo.py'])
    fs.copyFileSync(path.join(REPO, 'box', f), path.join(root, 'tools', path.basename(f)));
  return root;
}
const snapshot = root => Object.fromEntries(FILES.map(f => [f, fs.readFileSync(path.join(root, f), 'utf8')]));
const rm = root => fs.rmSync(root, { recursive: true, force: true });

test('patch.py: --check changes nothing, apply patches 5 files once, offline screens pass', { skip: !hasPython }, () => {
  const root = fakeRoot();
  try {
    const before = snapshot(root);
    const c = run(root, [path.join(BUNDLE, 'patch.py'), '--check']);
    assert.equal(c.status, 0, c.stdout + c.stderr);
    assert.match(c.stdout, /CHECK OK: 5 file/);
    assert.deepEqual(snapshot(root), before);
    const a = run(root, [path.join(BUNDLE, 'patch.py')]);
    assert.equal(a.status, 0, a.stdout + a.stderr);
    const after = snapshot(root);
    for (const f of FILES) {
      assert.match(after[f], /# srcdocinfo-20261003\n$/, f);
      assert.equal(run(root, ['-m', 'py_compile', path.join(root, f)]).status, 0, f);
    }
    const b = run(root, [path.join(BUNDLE, 'patch.py')]);
    assert.equal((b.stdout.match(/already patched/g) || []).length, 5);
    assert.deepEqual(snapshot(root), after);
    const t = run(root, [path.join(root, 'tools/srcdocinfo.py'), 'selftest', '--render']);
    assert.equal(t.status, 0, t.stdout + t.stderr);
    assert.match(t.stdout, /screens OK/);
    // monthpick's own selftest needs the box's full clerkcfg (box-month-parishes.test.js runs it); here: the viewer is passed.
    assert.match(after['tools/monthpick.py'], /def sat_month_text\(code, month=None, viewer=None\)/);
    assert.match(after['telegram/srcdoc/poller.py'], /MP\.sat_month_text\(code, m, chat\)/);
    assert.match(after['telegram/srcdoc/poller.py'], /f\["viewer"\] = chat/);
    assert.match(after['tools/satbot.py'], /viewer=chat/);
  } finally { rm(root); }
});

test('patch.py: an anchor that does not fit -> NOT CHANGED, files untouched', { skip: !hasPython }, () => {
  const root = fakeRoot();
  try {
    const pf = path.join(root, 'tools/satbot.py');
    fs.writeFileSync(pf, fs.readFileSync(pf, 'utf8').replace('srcdoc=src), True, kb=kb)', 'srcdoc=src), True, kb=kb )'));
    const before = snapshot(root);
    for (const args of [['--check'], []]) {
      const r = run(root, [path.join(BUNDLE, 'patch.py'), ...args]);
      assert.equal(r.status, 1);
      assert.match(r.stdout, /NOT CHANGED/);
      assert.deepEqual(snapshot(root), before);
    }
  } finally { rm(root); }
});

test('bundle: valid shell and JS, SHA256SUMS matches, INSTALL-ORDER lists it as step 24, no personal data', () => {
  for (const f of ['install.sh', 'undo.sh']) assert.equal(spawnSync('bash', ['-n', path.join(BUNDLE, f)]).status, 0, f);
  assert.equal(spawnSync(process.execPath, ['--check', path.join(BUNDLE, 'portal-month.cjs')]).status, 0);
  const sums = fs.readFileSync(path.join(BUNDLE, 'SHA256SUMS'), 'utf8').trim().split('\n').map(l => l.split(/\s+/)[1]).sort();
  assert.deepEqual(sums, fs.readdirSync(BUNDLE).filter(f => f !== 'SHA256SUMS').sort());
  const r = spawnSync('sha256sum', ['-c', '--quiet', 'SHA256SUMS'], { cwd: BUNDLE, encoding: 'utf8' });
  if (!r.error) assert.equal(r.status, 0, r.stdout + r.stderr);
  const rows = fs.readFileSync(path.join(REPO, 'box/INSTALL-ORDER.md'), 'utf8').split('\n').filter(l => /^\| \d+ \|/.test(l));
  assert.ok(rows.some(r => /^\| 24 \| `srcdocinfo-20261003`/.test(r)));
  const install = fs.readFileSync(path.join(BUNDLE, 'install.sh'), 'utf8');
  assert.match(install, /-ge 0725/);
  assert.doesNotMatch(install, /botmenu\.py apply|send_msg/, 'the installer must not send anything');
  assert.doesNotMatch(fs.readFileSync(path.join(BUNDLE, 'portal-month.cjs'), 'utf8'), /\bpost(Form)?\(/, 'the portal helper must only read');
  for (const f of fs.readdirSync(BUNDLE)) {
    const s = fs.readFileSync(path.join(BUNDLE, f), 'utf8');
    assert.doesNotMatch(s, /[\w.+-]+@[\w-]+\.[\w.]+/, f + ' has an email address');
    assert.doesNotMatch(s, /\b\d{9,}\b/, f + ' has a long number (chat id / phone)');
  }
});
