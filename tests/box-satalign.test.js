// Runs the offline Python tests for the satellite check helpers and Fix alignment (box/satcheck-20261022, box/satalign-20261022).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '..');
const PY = process.env.PYTHON || 'python3';
const hasPython = spawnSync(PY, ['--version']).status === 0;
for (const [dir, file] of [['satcheck-20261022', 'test_satcheck.py'], ['satalign-20261022', 'test_satalign.py'], ['instinct-alerts-20261022', 'test_alerts.py'], ['tgrelay-off-20261022', 'test_relay_switch.py']]) {
  test(`box/${dir}: ${file}`, { skip: !hasPython }, () => {
    const r = spawnSync(PY, [path.join(REPO, 'box', dir, file)], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    assert.equal(r.status, 0, r.stderr);
  });
}
