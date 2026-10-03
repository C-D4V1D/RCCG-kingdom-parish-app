// /month for another parish (box/month-parishes-20261003): patch.py is anchored and all-or-nothing, runs twice safely and
// compiles; monthpick.py's offline selftest (made-up people and parishes) and the patched bot's buttons with stand-ins for
// Telegram pass. Synthetic fixtures only: no real people, nothing is sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '..');
const BUNDLE = path.join(REPO, 'box/month-parishes-20261003');
const PY = process.env.PYTHON || 'python3';
const hasPython = spawnSync(PY, ['--version']).status === 0;
const POLLER = 'telegram/srcdoc/poller.py';
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

// Just enough of the box's clerkcfg.py for monthpick.py (same function names and behaviour).
const CLERKCFG = `import json, os, re
CFG = os.environ.get("CLERK_CFG", "/nonexistent/config.json")
_cache = {"mtime": None, "data": None}
def _raw():
    try: m = os.path.getmtime(CFG)
    except OSError: return None
    if _cache["mtime"] != m:
        try: _cache["data"] = json.load(open(CFG))
        except Exception: _cache["data"] = None
        _cache["mtime"] = m
    return _cache["data"]
def config():
    d = _raw()
    if not isinstance(d, dict) or d.get("is_default") or not isinstance(d.get("config"), dict): return None
    return d["config"]
def all_people():
    return [dict(p) for p in (config() or {}).get("people", []) if isinstance(p, dict) and p.get("key")]
def is_sat(p): return str(p.get("parish") or "602757") != "602757"
def parish_name(code, default=None):
    p = next((p for p in (config() or {}).get("parishes") or [] if str(p.get("code")) == str(code)), None)
    n = str((p or {}).get("name") or "").strip() or default or f"Parish {code}"
    return " ".join(w.lower() if i and w.lower() in ("of", "and") else w.capitalize() for i, w in enumerate(n.split())) if n.isupper() else n
`;
const POLLER_SRC = `import os
WORK = "/tmp"
def handle_message(st, msg): pass
def handle_callback(st, cq): pass


def main():
    os.makedirs(WORK, exist_ok=True)


if __name__ == "__main__":
    main()
# botmenu-20261003
`;

function fakeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'month-parishes-'));
  write(path.join(root, POLLER), POLLER_SRC);
  write(path.join(root, 'tools/clerkcfg.py'), CLERKCFG);
  fs.copyFileSync(path.join(BUNDLE, 'monthpick.py'), path.join(root, 'tools/monthpick.py'));
  return root;
}
const env = root => ({ ...process.env, CLERK_ROOT: root, CLERK_CFG: path.join(root, 'config.json'), PYTHONDONTWRITEBYTECODE: '1' });
const run = (root, args) => spawnSync(PY, args, { env: env(root), encoding: 'utf8' });
const rm = root => fs.rmSync(root, { recursive: true, force: true });

test('patch.py: --check changes nothing, apply patches poller.py once, second run is a no-op, compiles', { skip: !hasPython }, () => {
  const root = fakeRoot();
  try {
    const pf = path.join(root, POLLER);
    const c = run(root, [path.join(BUNDLE, 'patch.py'), '--check']);
    assert.equal(c.status, 0, c.stdout + c.stderr);
    assert.match(c.stdout, /CHECK OK: 1 file/);
    assert.equal(fs.readFileSync(pf, 'utf8'), POLLER_SRC);
    const a = run(root, [path.join(BUNDLE, 'patch.py')]);
    assert.equal(a.status, 0, a.stdout + a.stderr);
    const after = fs.readFileSync(pf, 'utf8');
    assert.match(after, /# month-parishes-20261003\n$/);
    assert.match(after, /_handle_callback_before_monthpick = handle_callback/);
    assert.equal(run(root, ['-m', 'py_compile', pf]).status, 0);
    const b = run(root, [path.join(BUNDLE, 'patch.py')]);
    assert.match(b.stdout, /already patched/);
    assert.equal(fs.readFileSync(pf, 'utf8'), after);
    const t = run(root, [path.join(root, 'tools/monthpick.py'), 'selftest', '--poller', pf]);
    assert.equal(t.status, 0, t.stdout + t.stderr);
    assert.match(t.stdout, /selftest OK/);
    assert.match(t.stdout, /bot buttons OK/);
  } finally { rm(root); }
});

test('patch.py: a missing or doubled anchor -> NOT CHANGED, file untouched', { skip: !hasPython }, () => {
  for (const edit of [s => s.replace('def main():', 'def main2():'), s => s + '\ndef main():\n    os.makedirs(WORK, exist_ok=True)\n']) {
    const root = fakeRoot();
    try {
      const pf = path.join(root, POLLER);
      fs.writeFileSync(pf, edit(POLLER_SRC));
      const before = fs.readFileSync(pf, 'utf8');
      for (const args of [['--check'], []]) {
        const r = run(root, [path.join(BUNDLE, 'patch.py'), ...args]);
        assert.equal(r.status, 1);
        assert.match(r.stdout, /NOT CHANGED/);
        assert.equal(fs.readFileSync(pf, 'utf8'), before);
      }
    } finally { rm(root); }
  }
});

test('bundle: valid shell, INSTALL-ORDER lists it last, no personal data', () => {
  for (const f of ['install.sh', 'undo.sh']) assert.equal(spawnSync('bash', ['-n', path.join(BUNDLE, f)]).status, 0, f);
  const rows = fs.readFileSync(path.join(REPO, 'box/INSTALL-ORDER.md'), 'utf8').split('\n').filter(l => /^\| \d+ \|/.test(l));
  assert.match(rows[rows.length - 1], /month-parishes-20261003/);
  const install = fs.readFileSync(path.join(BUNDLE, 'install.sh'), 'utf8');
  assert.match(install, /--check/);
  assert.match(install, /-ge 0725/);
  assert.doesNotMatch(install, /botmenu\.py apply|send_msg/, 'the installer must not send anything');
  for (const f of fs.readdirSync(BUNDLE)) {
    const s = fs.readFileSync(path.join(BUNDLE, f), 'utf8');
    assert.doesNotMatch(s, /[\w.+-]+@[\w-]+\.[\w.]+/, f + ' has an email address');
    assert.doesNotMatch(s, /\b\d{9,}\b/, f + ' has a long number (chat id / phone)');
  }
});

test('bundle: SHA256SUMS lists every file and matches', () => {
  const sums = fs.readFileSync(path.join(BUNDLE, 'SHA256SUMS'), 'utf8').trim().split('\n').map(l => l.split(/\s+/)[1]).sort();
  const files = fs.readdirSync(BUNDLE).filter(f => f !== 'SHA256SUMS').sort();
  assert.deepEqual(sums, files);
  const r = spawnSync('sha256sum', ['-c', '--quiet', 'SHA256SUMS'], { cwd: BUNDLE, encoding: 'utf8' });
  if (r.error) return;  // no sha256sum on this machine
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
