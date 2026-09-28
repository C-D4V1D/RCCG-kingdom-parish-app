import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// box/healthfix-20260928/fix.py against a copy of the box's health.py: removes only the Attendance watch entry,
// is safe to run twice, refuses (changing nothing) when the line isn't there exactly once, and undoes.
const FIX = new URL('../box/healthfix-20260928/fix.py', import.meta.url).pathname;
const HEALTH = new URL('./fixtures/box/health.py', import.meta.url).pathname;
function root() {
  const r = mkdtempSync(join(tmpdir(), 'healthfix-'));
  mkdirSync(join(r, 'tools'));
  copyFileSync(HEALTH, join(r, 'tools/health.py'));
  return r;
}
const run = (r, ...a) => spawnSync('python3', [FIX, ...a], { env: { ...process.env, CLERK_ROOT: r }, encoding: 'utf8' });

test('fix removes Attendance watch only, twice is safe, undo restores', () => {
  const r = root(); const before = readFileSync(join(r, 'tools/health.py'), 'utf8');
  assert.equal(run(r, '--check').status, 0);
  assert.equal(readFileSync(join(r, 'tools/health.py'), 'utf8'), before);
  assert.equal(run(r).status, 0);
  const after = readFileSync(join(r, 'tools/health.py'), 'utf8');
  assert.ok(!after.includes('Attendance watch'));
  assert.ok(after.includes('("Statement runner", "stmt-runner.py"), ("Drive sync", "drive-sync.sh")]'));
  assert.deepEqual(after.replace('\n# healthfix-20260928\n', '\n').replace(', ', ''), before.replace('("Attendance watch", "att-watch.py"), ', '').replace(', ', ''));
  execFileSync('python3', ['-m', 'py_compile', join(r, 'tools/health.py')]);
  const again = run(r); assert.equal(again.status, 0); assert.match(again.stdout, /already fixed/);
  assert.equal(run(r, '--undo').status, 0);
  assert.equal(readFileSync(join(r, 'tools/health.py'), 'utf8'), before);
});

test('fix changes nothing when health.py is not as expected', () => {
  const r = root(); const p = join(r, 'tools/health.py');
  writeFileSync(p, readFileSync(p, 'utf8').replace('("Attendance watch", "att-watch.py"), ', ''));
  const before = readFileSync(p, 'utf8');
  const res = run(r); assert.notEqual(res.status, 0); assert.match(res.stderr, /STOPPED/);
  assert.equal(readFileSync(p, 'utf8'), before);
});
