// /month's RRR, amount remitted and paid status (box/remitinfo-20261003): patch.py is anchored and all-or-nothing, runs twice
// safely and compiles on the botmenu fixtures (after botmenu-20261003's patch); remitinfo.py's offline selftest (made-up
// invoices and app records) and the patched /month screen render. Synthetic data only; nothing is read or sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '..');
const BUNDLE = path.join(REPO, 'box/remitinfo-20261003');
const FIX = path.join(REPO, 'tests/fixtures/box/botmenu');
const PY = process.env.PYTHON || 'python3';
const hasPython = spawnSync(PY, ['--version']).status === 0;
const FILES = ['tools/monthinfo.py', 'tools/satinfo.py'];

function fakeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remitinfo-'));
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(root, 'telegram/srcdoc'), { recursive: true });
  for (const f of ['clerkcfg', 'monthinfo', 'clerkinfo', 'satinfo', 'satbot']) fs.copyFileSync(path.join(FIX, f + '.py'), path.join(root, 'tools', f + '.py'));
  fs.copyFileSync(path.join(FIX, 'poller.py'), path.join(root, 'telegram/srcdoc/poller.py'));
  const r = run(root, [path.join(REPO, 'box/botmenu-20261003/patch.py')]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const f of ['box/botmenu-20261003/botmenu.py', 'box/remitinfo-20261003/remitinfo.py']) fs.copyFileSync(path.join(REPO, f), path.join(root, 'tools', path.basename(f)));
  return root;
}
const env = root => ({ ...process.env, CLERK_ROOT: root, CLERK_CFG: path.join(root, 'config.json'), PYTHONDONTWRITEBYTECODE: '1',
  CLERK_REMIT_STATE: path.join(root, 'rccg-remit/state/remit-runs.json'), CLERK_MONTHCLOSE_STATE: path.join(root, 'state/monthclose.json'),
  REMITINFO_OFFLINE: '1', REMITINFO_CACHE: path.join(root, 'state/remitinfo-cache.json') });
function run(root, args) { return spawnSync(PY, args, { env: env(root), encoding: 'utf8' }); }
const snapshot = root => Object.fromEntries(FILES.map(f => [f, fs.readFileSync(path.join(root, f), 'utf8')]));
const rm = root => fs.rmSync(root, { recursive: true, force: true });

test('patch.py: --check changes nothing, apply patches 2 files, second run is a no-op, offline screens render', { skip: !hasPython }, () => {
  const root = fakeRoot();
  try {
    const before = snapshot(root);
    const c = run(root, [path.join(BUNDLE, 'patch.py'), '--check']);
    assert.equal(c.status, 0, c.stdout + c.stderr);
    assert.match(c.stdout, /CHECK OK: 2 file/);
    assert.deepEqual(snapshot(root), before);
    const a = run(root, [path.join(BUNDLE, 'patch.py')]);
    assert.equal(a.status, 0, a.stdout + a.stderr);
    const after = snapshot(root);
    for (const f of FILES) {
      assert.match(after[f], /# remitinfo-20261003\n$/);
      assert.equal(run(root, ['-m', 'py_compile', path.join(root, f)]).status, 0, f);
    }
    const b = run(root, [path.join(BUNDLE, 'patch.py')]);
    assert.equal((b.stdout.match(/already patched/g) || []).length, 2);
    assert.deepEqual(snapshot(root), after);
    const t = run(root, [path.join(root, 'tools/remitinfo.py'), 'selftest', '--render']);
    assert.equal(t.status, 0, t.stdout + t.stderr);
    assert.match(t.stdout, /selftest OK/);
    assert.match(t.stdout, /screens OK/);
  } finally { rm(root); }
});

test('patch.py: an anchor that does not fit -> NOT CHANGED, files untouched', { skip: !hasPython }, () => {
  const root = fakeRoot();
  try {
    const pf = path.join(root, 'tools/satinfo.py');
    fs.writeFileSync(pf, fs.readFileSync(pf, 'utf8').replace('parish=P.name, srcdoc=srcdoc)', 'parish=P.name, srcdoc=srcdoc )x'));
    const before = snapshot(root);
    for (const args of [['--check'], []]) {
      const r = run(root, [path.join(BUNDLE, 'patch.py'), ...args]);
      assert.equal(r.status, 1);
      assert.match(r.stdout, /NOT CHANGED/);
      assert.deepEqual(snapshot(root), before);
    }
  } finally { rm(root); }
});

test('bundle: valid shell, SHA256SUMS matches, INSTALL-ORDER lists it (step 23), no personal data', () => {
  for (const f of ['install.sh', 'undo.sh']) assert.equal(spawnSync('bash', ['-n', path.join(BUNDLE, f)]).status, 0, f);
  const sums = fs.readFileSync(path.join(BUNDLE, 'SHA256SUMS'), 'utf8').trim().split('\n').map(l => l.split(/\s+/)[1]).sort();
  assert.deepEqual(sums, fs.readdirSync(BUNDLE).filter(f => f !== 'SHA256SUMS').sort());
  const r = spawnSync('sha256sum', ['-c', '--quiet', 'SHA256SUMS'], { cwd: BUNDLE, encoding: 'utf8' });
  if (!r.error) assert.equal(r.status, 0, r.stdout + r.stderr);
  const rows = fs.readFileSync(path.join(REPO, 'box/INSTALL-ORDER.md'), 'utf8').split('\n').filter(l => /^\| \d+ \|/.test(l));
  assert.ok(rows.some(r => /^\| 23 \| `remitinfo-20261003`/.test(r)), 'remitinfo-20261003 is step 23');
  const install = fs.readFileSync(path.join(BUNDLE, 'install.sh'), 'utf8');
  assert.match(install, /-ge 0725/);
  assert.doesNotMatch(install, /botmenu\.py apply|send_msg/, 'the installer must not send anything');
  for (const f of fs.readdirSync(BUNDLE)) {
    const s = fs.readFileSync(path.join(BUNDLE, f), 'utf8');
    assert.doesNotMatch(s, /[\w.+-]+@[\w-]+\.[\w.]+/, f + ' has an email address');
    assert.doesNotMatch(s, /\b\d{13,}\b/, f + ' has a long number (account / phone)');
  }
});
