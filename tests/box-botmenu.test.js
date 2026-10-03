// Telegram bot menus and screens (box/botmenu-20261003): patch.py is anchored and all-or-nothing, runs twice safely,
// everything compiles; botmenu.py works out each person's commands, help, the once-a-day reply to strangers and only
// calls Telegram when the menus changed; monthinfo's new /month screen renders. Synthetic fixtures, no real people.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '..');
const BUNDLE = path.join(REPO, 'box/botmenu-20261003');
const FIX = path.join(REPO, 'tests/fixtures/box/botmenu');
const PY = process.env.PYTHON || 'python3';
const hasPython = spawnSync(PY, ['--version']).status === 0;
const FILES = {
  'tools/clerkcfg.py': 'clerkcfg.py', 'tools/monthinfo.py': 'monthinfo.py', 'tools/clerkinfo.py': 'clerkinfo.py',
  'tools/satinfo.py': 'satinfo.py', 'tools/satbot.py': 'satbot.py', 'telegram/srcdoc/poller.py': 'poller.py',
};
const write = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof o === 'string' ? o : JSON.stringify(o)); };

function fakeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'botmenu-'));
  for (const [dst, src] of Object.entries(FILES)) write(path.join(root, dst), fs.readFileSync(path.join(FIX, src), 'utf8'));
  return root;
}
const snapshot = root => Object.fromEntries(Object.keys(FILES).map(f => [f, fs.readFileSync(path.join(root, f), 'utf8')]));
const env = root => ({ ...process.env, CLERK_ROOT: root, CLERK_CFG: path.join(root, 'config.json'), PYTHONDONTWRITEBYTECODE: '1' });
const patch = (root, ...args) => spawnSync(PY, [path.join(BUNDLE, 'patch.py'), ...args], { env: env(root), encoding: 'utf8' });
const compiles = f => spawnSync(PY, ['-c', 'import sys; compile(open(sys.argv[1]).read(), sys.argv[1], "exec")', f], { encoding: 'utf8' });

test('patch.py: --check changes nothing, apply patches all 6 files, a second run is a no-op, all compile', { skip: !hasPython }, () => {
  const root = fakeRoot();
  try {
    const before = snapshot(root);
    const c = patch(root, '--check');
    assert.equal(c.status, 0, c.stdout + c.stderr);
    assert.match(c.stdout, /CHECK OK: 6 file/);
    assert.deepEqual(snapshot(root), before);
    const a = patch(root);
    assert.equal(a.status, 0, a.stdout + a.stderr);
    for (const f of Object.keys(FILES)) {
      assert.match(a.stdout, new RegExp('patched ' + f.replace(/[./]/g, '\\$&')));
      assert.match(fs.readFileSync(path.join(root, f), 'utf8'), /# botmenu-20261003\n$/);
      const r = compiles(path.join(root, f)); assert.equal(r.status, 0, f + r.stderr);
    }
    const after = snapshot(root);
    const b = patch(root);
    assert.equal(b.status, 0);
    assert.equal((b.stdout.match(/already patched/g) || []).length, 6);
    assert.deepEqual(snapshot(root), after);
    assert.equal(compiles(path.join(BUNDLE, 'botmenu.py')).status, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('patch.py: one anchor that does not fit -> NOT CHANGED and every file untouched', { skip: !hasPython }, () => {
  const root = fakeRoot();
  try {
    const pf = path.join(root, 'telegram/srcdoc/poller.py');
    fs.writeFileSync(pf, fs.readFileSync(pf, 'utf8').replace('near-instant Refresh pickup', 'changed on the box'));
    const before = snapshot(root);
    for (const args of [['--check'], []]) {
      const r = patch(root, ...args);
      assert.equal(r.status, 1);
      assert.match(r.stdout, /NOT CHANGED/);
      assert.match(r.stdout, /telegram\/srcdoc\/poller\.py/);
      assert.deepEqual(snapshot(root), before);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

const CFG = {
  config_version: 3, is_default: false,
  config: {
    people: [
      { key: 'boss', name: 'Test Admin', called: 'Bro. Admin', telegram_chat_id: '101', can_upload: true, full_status: true, buttons: true, pays_rrr: true },
      { key: 'acct', name: 'Test Accountant (Bro. Acct)', telegram_chat_id: '102', can_upload: true, buttons: true, app_role: 'accountant' },
      { key: 'payer', name: 'Test Payer', telegram_chat_id: '103', pays_rrr: true },
      { key: 'nochat', name: 'No Chat', can_upload: true },
      { key: 'satp', name: 'Test Pastor', parish: '659840', can_upload: true },
    ],
    parishes: [{ code: '602757', name: 'KINGDOM PARISH' }, { code: '659840', name: 'Test Satellite Parish' }],
    automations: { telegram_bot: { menu: { refresh: 'off', balance: 'everyone', statement: 'payers' }, previous_months: 40,
      month_portal_check: 'nonsense', unknown_contact: 'the test office' } },
  },
};

test('botmenu.py: menus per person, help, strangers, Telegram only when changed; the new /month screen', { skip: !hasPython }, () => {
  const root = fakeRoot();
  try {
    assert.equal(patch(root).status, 0);
    fs.copyFileSync(path.join(BUNDLE, 'botmenu.py'), path.join(root, 'tools/botmenu.py'));
    write(path.join(root, 'config.json'), CFG);
    write(path.join(root, 'state/satlinks.json'), { satp: 201 });
    const code = `
import datetime, json, sys
sys.path.insert(0, ${JSON.stringify(path.join(root, 'tools'))})
import botmenu as BM, clerkcfg as C, monthinfo as MI
calls = []
def api(method, **p):
    calls.append(method); return {"ok": True}
s = C.bot_settings()
L = BM.linked()
cmds = {str(c): [x[0] for x in BM.commands_for(p)] for c, p in L.items()}
first = BM.apply_menus(api); n1 = len(calls)
second = BM.apply_menus(api); n2 = len(calls) - n1
d = datetime.date
f = MI.facts([{"date": "2026-09-06", "source": "sunday_collection", "totalCollection": 100},
              {"date": "2026-09-13", "source": "sunday_collection", "totalCollection": 50}],
             d(2026, 8, 31), d(2026, 9, 27), d(2026, 9, 22))
print(json.dumps({
  "settings": s, "cmds": cmds, "known": [BM.known(101), BM.known(999)],
  "allowed": [BM.allowed(201, "statement"), BM.allowed(103, "statement"), BM.allowed(102, "statement"), BM.allowed(103, "upload")],
  "help_sat": BM.help_text(201), "help_payer": BM.help_text(103),
  "unknown": [BM.unknown_reply(999), BM.unknown_reply(999)],
  "first": first, "n1": n1, "second": second, "n2": n2,
  "screen": MI.month_text(f, srcdoc=["slots here"]), "total": f["total"],
}, default=str))`;
    const r = spawnSync(PY, ['-c', code], { env: env(root), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const o = JSON.parse(r.stdout);
    // settings: bad values fall back to the defaults, numbers are clamped
    assert.equal(o.settings.previous_months, 12);
    assert.equal(o.settings.month_portal_check, 'button');
    assert.equal(o.settings.menu.refresh, 'off');
    assert.equal(o.settings.unknown_contact, 'the test office');
    // who gets what: no chat id -> not linked; satellite pastor linked by invite; Kingdom-only commands never for a satellite
    assert.deepEqual(Object.keys(o.cmds).sort(), ['101', '102', '103', '201']);
    assert.deepEqual(o.cmds['101'], ['month', 'upload', 'paid', 'statement', 'balance', 'system', 'help']);
    assert.deepEqual(o.cmds['102'], ['month', 'upload', 'balance', 'help']);
    assert.deepEqual(o.cmds['103'], ['month', 'paid', 'statement', 'balance', 'help']);
    assert.deepEqual(o.cmds['201'], ['month', 'upload', 'paid', 'help']);
    assert.deepEqual(o.known, [true, false]);
    assert.deepEqual(o.allowed, [false, true, false, false]);
    assert.match(o.help_sat, /Test Satellite Parish · Clerk bot/);
    assert.doesNotMatch(o.help_sat, /\/statement|\/balance|\/system/);
    assert.match(o.help_sat, /Send photos or PDFs any time/);
    assert.match(o.help_payer, /Kingdom Parish · Clerk bot/);
    assert.doesNotMatch(o.help_payer, /\/upload|Send photos/);
    // a stranger: one polite reply a day, naming the contact from the settings
    assert.match(o.unknown[0], /the test office/);
    assert.equal(o.unknown[1], null);
    // Telegram: default menu + one per linked person the first time, nothing when unchanged
    assert.equal(o.first[0], true);
    assert.equal(o.n1, 5);
    assert.deepEqual(o.second, [true, 'unchanged']);
    assert.equal(o.n2, 0);
    // the month screen: header, sections, totals from the same read, no hard-coded names
    assert.equal(o.total, 150);
    assert.match(o.screen, /📅 <b>Kingdom Parish · September 2026<\/b>/);
    assert.match(o.screen, /Period: Mon 31 Aug – Sun 27 Sep/);
    assert.match(o.screen, /Total collection: ₦150\.00/);
    assert.match(o.screen, /<b>SOURCE DOCUMENTS<\/b>\nslots here/);
    assert.match(o.screen, /<b>Next step:<\/b> Bro\. Acct: record the collection for Sun 20 Sep\./);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
