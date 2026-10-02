import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Every scheduled job the app defines must actually be called by the GitHub cron workflow.
// A job left off the list silently never runs (the bank reconciliation sweep did exactly that).
test('cron-followups workflow calls every job in cronJobRunners()', () => {
  const src = readFileSync(new URL('../functions/api/[[route]].js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('function cronJobRunners()'), src.indexOf('async function invokeCronJob'));
  const jobs = [...block.matchAll(/\[\s*'[^']+',\s*'(run-[a-z0-9-]+)'/g)].map(m => m[1]);
  assert.ok(jobs.length >= 10, `expected the cron job table, found ${jobs.length}`);

  const wf = readFileSync(new URL('../.github/workflows/cron-followups.yml', import.meta.url), 'utf8');
  const listed = (wf.match(/ENDPOINTS="([\s\S]*?)"/) || [])[1] || '';
  const endpoints = listed.split(/\s+/).filter(Boolean);
  for (const job of jobs) assert.ok(endpoints.includes(job), `${job} is not called by .github/workflows/cron-followups.yml`);
});
