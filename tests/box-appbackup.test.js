// box/appbackup-20261003: the Clerk box's weekly full backup of the app, saved where drive-sync copies it to Google Drive.
// The real appbackup.py and patch.py run against a temporary /workspace and a fake app; plus the app side of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { onRequest } from '../functions/api/[[route]].js';
import { createSqliteD1 } from './sqlite-d1.mjs';
import { FINANCE_AUTH_HEADER, TEST_AUTOMATION_KEY } from './finance-auth-helper.mjs';

const DIR = new URL('../box/appbackup-20261003/', import.meta.url).pathname;
const SUPERVISOR = new URL('./fixtures/box/supervisor-20261003.sh', import.meta.url).pathname;
const hasPython = spawnSync('python3', ['--version']).status === 0;

function workspace() {
  const r = mkdtempSync(join(tmpdir(), 'appbackup-'));
  mkdirSync(join(r, 'tools')); mkdirSync(join(r, '.secrets'));
  copyFileSync(SUPERVISOR, join(r, 'tools/supervisor.sh'));
  writeFileSync(join(r, '.secrets/kp-automation-key'), 'box-key\n');
  return r;
}
// spawn (not spawnSync): the fake app runs in this same process and must keep answering.
const py = (args, env) => new Promise(resolve => {
  const p = spawn('python3', args, { env: { ...process.env, ...env } });
  let out = '', errOut = '';
  p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { errOut += d; });
  p.on('close', status => resolve({ status, stdout: out, stderr: errOut }));
});

test('patch.py adds the weekly backup step to the live supervisor.sh once, and refuses a file it does not recognise', { skip: !hasPython }, async () => {
  const r = workspace(); const sup = join(r, 'tools/supervisor.sh');
  const before = readFileSync(sup, 'utf8');
  assert.equal((await py([join(DIR, 'patch.py'), '--check'], { CLERK_ROOT: r })).status, 0);
  assert.equal(readFileSync(sup, 'utf8'), before, '--check changes nothing');
  assert.equal((await py([join(DIR, 'patch.py')], { CLERK_ROOT: r })).status, 0);
  const after = readFileSync(sup, 'utf8');
  assert.match(after, /appbackup\.py tick .*# appbackup-20261003\n  D=\$\(\( \$\(date \+%s\) - T0 \)\)/);
  execFileSync('bash', ['-n', sup]);
  const again = await py([join(DIR, 'patch.py')], { CLERK_ROOT: r });
  assert.match(again.stdout, /already patched/);
  assert.equal(readFileSync(sup, 'utf8'), after);

  const r2 = workspace(); const sup2 = join(r2, 'tools/supervisor.sh');
  writeFileSync(sup2, readFileSync(sup2, 'utf8').replace('satinfo.py tick', 'satinfo.py run'));
  const changed = readFileSync(sup2, 'utf8');
  const res = await py([join(DIR, 'patch.py')], { CLERK_ROOT: r2 });
  assert.notEqual(res.status, 0);
  assert.equal(readFileSync(sup2, 'utf8'), changed);
});

test('appbackup.py saves a gzipped full backup once a week, retries a failure after 6 hours, keeps 12 files', { skip: !hasPython }, async () => {
  let mode = 'ok'; const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url, key: req.headers['x-automation-key'] });
    res.setHeader('content-type', 'application/json');
    if (mode === 'bad') return res.end('{"error":"nope"}');
    res.end(JSON.stringify({ format: 'rccg-full-backup', version: 2, databases: {
      main: { tables: { income: [{ id: 'INC-1' }, { id: 'INC-2' }], users: [{ id: 'u1' }] } },
      sat_659840: { tables: { income: [{ id: 'S1' }] } } } }));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const r = workspace();
  const env = (at) => ({ CLERK_ROOT: r, KP_APP_URL: `http://127.0.0.1:${server.address().port}`, CLERK_NOW: at, PYTHONDONTWRITEBYTECODE: '1' });
  const tick = at => py([join(DIR, 'appbackup.py'), 'tick'], env(at));
  try {
    assert.equal((await tick('2026-10-04T22:00:00+01:00')).status, 0);
    assert.deepEqual(seen.map(s => [s.url, s.key]), [['/api/admin/backup', 'box-key']]);
    const files = readdirSync(join(r, 'app-backups'));
    assert.deepEqual(files, ['rccg-full-backup-2026-10-04.json.gz']);
    const saved = JSON.parse(gunzipSync(readFileSync(join(r, 'app-backups', files[0]))).toString());
    assert.equal(saved.format, 'rccg-full-backup');
    const st = JSON.parse(readFileSync(join(r, 'state/appbackup.json'), 'utf8'));
    assert.equal(st.last_records, 4); assert.equal(st.last_error, '');

    await tick('2026-10-08T22:00:00+01:00');              // 4 days later: not due
    await tick('2026-10-11T08:00:00+01:00');              // a week later, but in the 07:00-09:30 quiet time
    assert.equal(seen.length, 1);
    mode = 'bad';
    await tick('2026-10-11T22:00:00+01:00');              // due: tries, fails
    assert.equal(seen.length, 2);
    assert.match(JSON.parse(readFileSync(join(r, 'state/appbackup.json'), 'utf8')).last_error, /not a full backup/);
    await tick('2026-10-12T01:00:00+01:00');              // 3 h after the failure: waits
    assert.equal(seen.length, 2);
    mode = 'ok';
    await tick('2026-10-12T04:30:00+01:00');              // 6.5 h after: tries again, works
    assert.equal(seen.length, 3);
    assert.ok(!readdirSync(join(r, 'app-backups')).some(n => n.endsWith('.tmp')), 'no half-written file is left');

    for (let d = 1; d <= 14; d++) writeFileSync(join(r, 'app-backups', `rccg-full-backup-2025-01-${String(d).padStart(2, '0')}.json.gz`), 'x');
    assert.equal((await py([join(DIR, 'appbackup.py'), 'now'], env('2026-10-20T22:00:00+01:00'))).status, 0);
    const kept = readdirSync(join(r, 'app-backups')).sort();
    assert.equal(kept.length, 12);
    assert.equal(kept.at(-1), 'rccg-full-backup-2026-10-20.json.gz');
    assert.ok(!kept.includes('rccg-full-backup-2025-01-01.json.gz'), 'the oldest go first');
  } finally {
    server.close();
  }
});

test('the app gives the box its full backup with the read-only key, and notes when', async () => {
  const DB = createSqliteD1();
  const call = (path, method = 'GET', headers = FINANCE_AUTH_HEADER, body) =>
    onRequest({ request: new Request(`https://x/api/${path}`, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }), env: { DB }, waitUntil() {} });
  assert.equal((await call('init')).status, 200);
  const box = { 'X-Automation-Key': TEST_AUTOMATION_KEY };
  const res = await call('admin/backup', 'GET', box);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).format, 'rccg-full-backup');
  assert.equal((await call('admin/time-travel', 'GET', box)).status, 403, 'nothing else under admin');
  assert.equal((await call('admin/restore-table', 'POST', box, { db: 'main', table: 'income', rows: [] })).status, 403);
  const info = await (await call('admin/time-travel')).json();
  assert.ok(Date.now() - Date.parse(info.lastBoxBackup) < 60000);
});
