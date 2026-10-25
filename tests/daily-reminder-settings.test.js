import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_CONFIG, validateConfig, DAILY_REMINDER_TASKS } from '../workers/clerk-watchdog/config.js';

const clone = () => JSON.parse(JSON.stringify(DEFAULT_CONFIG));
const errs = (c) => validateConfig(c);

test('daily reminder default is off and validates (fake data only)', () => {
  const c = clone();
  assert.equal(c.automations.daily_reminder.enabled, false);
  assert.equal(c.automations.daily_reminder.group.time, '09:00');
  assert.equal(c.automations.daily_reminder.private.time, '10:00');
  assert.equal(c.automations.daily_reminder.parishes, undefined); // not chosen = Kingdom + every active satellite
  assert.deepEqual(c.automations.daily_reminder.wa_tags, {});
  assert.deepEqual(Object.keys(c.automations.daily_reminder.owners).sort(), [...DAILY_REMINDER_TASKS].sort());
  assert.equal(errs(c).filter((e) => /daily_reminder/.test(e)).length, 0);
});
test('daily reminder rejects bad owner, tag, parish and time', () => {
  for (const [mut, re] of [
    [(c) => { c.automations.daily_reminder.owners.rrr_unpaid = ['nobody-here']; }, /owners/],
    [(c) => { c.automations.daily_reminder.wa_tags = { divine: 'abc' }; }, /wa_tags/],
    [(c) => { c.automations.daily_reminder.parishes = ['Kingdom']; }, /parishes/],
    [(c) => { c.automations.daily_reminder.group.time = '9am'; }, /time/],
    [(c) => { c.automations.daily_reminder.private.time = '25:00'; }, /time/],
  ]) {
    const c = clone(); mut(c);
    assert.ok(errs(c).some((e) => re.test(e) && /daily_reminder/.test(e)), String(re));
  }
});
test('config without the block still validates (existing configs are not broken)', () => {
  const c = clone(); delete c.automations.daily_reminder;
  assert.equal(errs(c).filter((e) => /daily_reminder/.test(e)).length, 0);
});
test('settings UI offers every task owner and tag input', () => {
  const s = readFileSync(new URL('../src/js/app.js', import.meta.url), 'utf8');
  for (const k of DAILY_REMINDER_TASKS) assert.ok(s.includes(`key:'${k}'`), k);
  assert.ok(s.includes('automations.daily_reminder.wa_tags'));
  assert.ok(s.includes('automations.daily_reminder.group.time'));
});
test('approved task owners and parish defaults', () => {
  const o = DEFAULT_CONFIG.automations.daily_reminder.owners;
  assert.deepEqual(o.rrr_unpaid, ['fabian']);
  assert.deepEqual(o.rrr_not_generated, ['divine']);
  assert.deepEqual(o.source_docs_finance, ['divine']);
  assert.deepEqual(o.source_docs_admin, ['divine']);
  const s = readFileSync(new URL('../src/js/app.js', import.meta.url), 'utf8');
  assert.match(s, /AUTOMATION_DAILY_REMINDER_PARISHES = \['602757','659840','597445','761516'\]/);
});
