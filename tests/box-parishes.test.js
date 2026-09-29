// Satellite parishes (box/parishes-20261003): patch.py all-or-nothing, clerkcfg's satellite helpers, and satbot's invite link.
// Runs the real bundle files against a fake /workspace built in a temp dir.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '..');
const BUNDLE = path.join(REPO, 'box/parishes-20261003');
const PY = process.env.PYTHON || 'python3';
const hasPython = spawnSync(PY, ['--version']).status === 0;
const write = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof o === 'string' ? o : JSON.stringify(o)); };
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
const FILES = {
  'tools/clerkcfg.py': 'box/records-20260928/clerkcfg.py',
  'tools/monthend.py': 'box/monthend-20261001/monthend.py',
  'tools/supervisor.sh': 'box/monthclose-20260930/supervisor.sh',
  'telegram/srcdoc/poller.py': 'tests/fixtures/box/parishes/poller.py',
};

// The patch anchors on the bot admin's chat id; take it from patch.py so no id lives in this repo's new files.
const DAVID_ID = /C\.bot_admin\((\d+)\)/.exec(fs.readFileSync(path.join(BUNDLE, 'patch.py'), 'utf8'))[1];

function fakeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'parishes-'));
  for (const [dst, src] of Object.entries(FILES)) copy(path.join(REPO, src), path.join(root, dst));
  const pf = path.join(root, 'telegram/srcdoc/poller.py');
  fs.writeFileSync(pf, fs.readFileSync(pf, 'utf8').replace('__DAVID__', DAVID_ID));
  return root;
}
const snapshot = root => Object.fromEntries(Object.keys(FILES).map(f => [f, fs.readFileSync(path.join(root, f))]));
const patch = (root, ...args) => spawnSync(PY, [path.join(BUNDLE, 'patch.py'), ...args],
  { env: { ...process.env, CLERK_ROOT: root, PYTHONDONTWRITEBYTECODE: '1' }, encoding: 'utf8' });
const compiles = f => spawnSync(PY, ['-c', 'import sys; compile(open(sys.argv[1]).read(), sys.argv[1], "exec")', f], { encoding: 'utf8' });

test('patch.py: --check, apply, second run, everything compiles', { skip: !hasPython }, () => {
  const root = fakeRoot();
  try {
    const before = snapshot(root);
    const c = patch(root, '--check');
    assert.equal(c.status, 0, c.stdout + c.stderr);
    assert.match(c.stdout, /CHECK OK: 4 file/);
    assert.deepEqual(snapshot(root), before, '--check changes nothing');
    const a = patch(root);
    assert.equal(a.status, 0, a.stdout + a.stderr);
    for (const f of Object.keys(FILES)) {
      assert.match(a.stdout, new RegExp('patched ' + f.replace(/[./]/g, '\\$&')));
      assert.match(fs.readFileSync(path.join(root, f), 'utf8'), /parishes-20261003/);
      if (f.endsWith('.py')) { const r = compiles(path.join(root, f)); assert.equal(r.status, 0, f + r.stderr); }
    }
    const after = snapshot(root);
    const b = patch(root);
    assert.equal(b.status, 0);
    assert.equal((b.stdout.match(/already patched/g) || []).length, 4);
    assert.deepEqual(snapshot(root), after);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('patch.py: one anchor that does not fit -> NOT CHANGED and every file untouched', { skip: !hasPython }, () => {
  const root = fakeRoot();
  try {
    const pf = path.join(root, 'telegram/srcdoc/poller.py');
    fs.writeFileSync(pf, fs.readFileSync(pf, 'utf8').replace(/^DAVID = .*\n/m, ''));
    const before = snapshot(root);
    for (const args of [['--check'], []]) {
      const r = patch(root, ...args);
      assert.equal(r.status, 1);
      assert.match(r.stdout, /NOT CHANGED/);
      assert.deepEqual(snapshot(root), before);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

const CFG = {
  config_version: 5, is_default: false,
  config: {
    people: [
      { key: 'david', name: 'David', telegram_chat_id: '111', can_upload: true, full_status: true, buttons: true, email: 'd@example.com' },
      { key: 'p659840', name: 'Pastor Test', parish: '659840', can_upload: true, tg_invite: 'abc123def0', email: 'p@example.com', full_status: false, buttons: false },
    ],
    parishes: [
      { code: '602757', name: 'Kingdom Parish', active: true },
      { code: '659840', name: 'Sanctuary of Favour Parish', active: true, copies: ['david'] },
    ],
    routing: {}, automations: {},
  },
};

function patchedRoot() {
  const root = fakeRoot();
  const r = patch(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  write(path.join(root, 'config.json'), CFG);
  write(path.join(root, 'state/satlinks.json'), { p659840: 333 });
  return root;
}

test('clerkcfg (patched): satellite people are kept out of people() but linked chats reach the bot', { skip: !hasPython }, () => {
  const root = patchedRoot();
  try {
    const code = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(root, 'tools'))})
import clerkcfg as C
print(json.dumps({
  "people": [p["key"] for p in C.people()],
  "all": {p["key"]: p.get("telegram_chat_id") for p in C.all_people()},
  "sat": {str(k): v for k, v in C.bot_sat_parishes().items()},
  "merged": sorted(C.merge_contacts({})),
  "allowed": C.tg_allowed("remittance_check", "p659840"),
}))`;
    const r = spawnSync(PY, ['-c', code], { encoding: 'utf8',
      env: { ...process.env, CLERK_ROOT: root, CLERK_CFG: path.join(root, 'config.json'), CLERK_MONTHEND_DIR: path.join(root, 'state/monthend'), PYTHONDONTWRITEBYTECODE: '1' } });
    assert.equal(r.status, 0, r.stderr);
    const o = JSON.parse(r.stdout);
    assert.deepEqual(o.people, ['david']);
    assert.equal(o.all.p659840, '333');
    assert.equal(o.all.david, '111');
    assert.deepEqual(o.sat, { 333: '659840' });
    assert.deepEqual(o.merged, ['david', 'p659840']);
    assert.equal(o.allowed, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('satbot link: a valid invite links the chat to its parish; a bad code is refused', { skip: !hasPython }, () => {
  const root = patchedRoot();
  try {
    const tools = path.join(root, 'tools');
    copy(path.join(BUNDLE, 'satinfo.py'), path.join(tools, 'satinfo.py'));
    copy(path.join(BUNDLE, 'satbot.py'), path.join(tools, 'satbot.py'));
    copy(path.join(REPO, 'box/records-20260928/monthinfo.py'), path.join(tools, 'monthinfo.py'));
    write(path.join(root, 'telegram/send_msg.py'), 'print("[]")\n');
    write(path.join(root, 'state/satlinks.json'), {});
    const env = { ...process.env, CLERK_ROOT: root, CLERK_TOOLS: tools, CLERK_CFG: path.join(root, 'config.json'),
      CLERK_MONTHEND_DIR: path.join(root, 'state/monthend'), PYTHONDONTWRITEBYTECODE: '1' };
    const run = code => spawnSync(PY, [path.join(tools, 'satbot.py'), 'link', '--chat', '444', '--code', code], { env, encoding: 'utf8' });
    const good = run('abc123def0');
    assert.equal(good.status, 0, good.stderr);
    const j = JSON.parse(good.stdout.trim().split('\n').pop());
    assert.equal(j.ok, true);
    assert.equal(j.parish, '659840');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'state/satlinks.json'), 'utf8')), { p659840: 444 });
    const bad = run('zzzzzz999');
    assert.equal(bad.status, 0, bad.stderr);
    const k = JSON.parse(bad.stdout.trim().split('\n').pop());
    assert.equal(k.ok, undefined);
    assert.match(k.reply, /isn't valid/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
