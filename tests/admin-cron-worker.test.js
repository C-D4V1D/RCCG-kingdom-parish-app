// The rccgkp-admin-cron Worker is the app's scheduler: it must call every scheduled job, every hour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { JOBS, runJobs } from '../workers/admin-cron/worker.js';

test('the Worker calls every job in cronJobRunners()', () => {
  const src = readFileSync(new URL('../functions/api/[[route]].js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('function cronJobRunners()'), src.indexOf('async function invokeCronJob'));
  const jobs = [...block.matchAll(/\[\s*'[^']+',\s*'(run-[a-z0-9-]+)'/g)].map(m => m[1]);
  assert.ok(jobs.length >= 10);
  assert.deepEqual([...JOBS].sort(), [...jobs].sort());
});

test('wrangler.toml runs it hourly against the production app', () => {
  const toml = readFileSync(new URL('../workers/admin-cron/wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /^name = "rccgkp-admin-cron"$/m);
  assert.match(toml, /crons = \["7 \* \* \* \*"\]/);
  assert.match(toml, /PAGES_BASE_URL = "https:\/\/rccg-kingdom-parish-app\.pages\.dev"/);
});

test('each job is called separately with the cron secret, and one failure does not stop the rest', async () => {
  const seen = [];
  const fake = async (url, init) => {
    seen.push({ url, auth: init.headers.Authorization });
    if (url.endsWith('/run-reminder-sms')) throw new Error('timeout');
    return new Response('{}', { status: url.endsWith('/run-followups') ? 500 : 200 });
  };
  const r = await runJobs({ PAGES_BASE_URL: 'https://app.example/', CRON_SECRET: 's3' }, fake);
  assert.equal(seen.length, JOBS.length);
  assert.ok(seen.every(c => c.auth === 'Bearer s3'));
  assert.equal(seen[0].url, 'https://app.example/api/internal/run-monthly-sms');
  assert.equal(r.ok, false);
  assert.equal(r.results['run-followups'], 500);
  assert.match(String(r.results['run-reminder-sms']), /timeout/);
  assert.equal(r.results['run-bank-recon'], 200);
});

test('without the secret nothing is called', async () => {
  let called = false;
  const r = await runJobs({ PAGES_BASE_URL: 'https://app.example' }, async () => { called = true; });
  assert.equal(called, false);
  assert.equal(r.ok, false);
});

test('the scheduled handler hands the run to waitUntil', async () => {
  const waits = [];
  await worker.scheduled({}, { PAGES_BASE_URL: '', CRON_SECRET: '' }, { waitUntil: p => waits.push(p) });
  assert.equal(waits.length, 1);
  await waits[0];
});
