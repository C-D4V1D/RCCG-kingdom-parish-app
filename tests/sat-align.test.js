import test from 'node:test';
import assert from 'node:assert/strict';
import { planSatAlign, applyPlanToList, undoFromList } from '../functions/_lib/sat-align.js';
import { onRequest } from '../functions/api/[[route]].js';

const KING = [{ label: 'Regional Contribution', amount: 4500 }, { label: 'Open Heavens', amount: 8575 }, { label: 'RMF', amount: 200 }];

test('plan: a missing fixed quota is added at the portal amount; zero lines are ignored', () => {
  const p = planSatAlign([
    { item: 'Open Heavens', portal: 1400, app: null },
    { item: 'Coastline Worship Centre', portal: 0, app: null },
    { item: 'Insurance Fund (Min Tithe)', portal: 0, app: null },
  ], KING, [{ label: 'RMF', amount: 200 }]);
  assert.deepEqual(p.changes, [{ label: 'Open Heavens', amount: 1400, item: 'Open Heavens' }]);
  assert.equal(p.noops.length, 2); assert.equal(p.human.length, 0);
});

test('plan: anything else goes to a person', () => {
  const p = planSatAlign([
    { item: 'Mystery Levy', portal: 500, app: null },            // unknown line
    { item: 'RMF', portal: 300, app: 200 },                      // both sides differ
    { item: 'Regional Contribution', portal: 9000, app: null },  // above Kingdom's own: looks wrong
    { item: 'Open Heavens', portal: 1400, app: null },           // parish already has it but app shows nothing
    { item: 'Tithe', portal: 0, app: 80 },                       // app has more than the portal
  ], KING, [{ label: 'Open Heavens', amount: 1400 }]);
  assert.equal(p.changes.length, 0); assert.equal(p.human.length, 5);
  assert.match(p.human[0].reason, /not a known fixed quota/);
  assert.match(p.human[2].reason, /above Kingdom/);
});

test('plan: aligned lines (under 1 naira apart) change nothing', () => {
  const p = planSatAlign([{ item: 'RMF', portal: 200, app: 200.4 }], KING, []);
  assert.deepEqual(p, { changes: [], noops: [], human: [] });
});

test('apply then undo helpers: undo only takes back an untouched line', () => {
  const list = applyPlanToList([{ label: 'RMF', amount: 200 }], [{ label: 'Open Heavens', amount: 1400 }]);
  assert.equal(list.length, 2);
  let u = undoFromList(list, [{ label: 'Open Heavens', amount: 1400 }]);
  assert.deepEqual(u.list, [{ label: 'RMF', amount: 200 }]); assert.equal(u.removed.length, 1);
  u = undoFromList([{ label: 'Open Heavens', amount: 1500 }], [{ label: 'Open Heavens', amount: 1400 }]);
  assert.equal(u.removed.length, 0); assert.match(u.kept[0].reason, /changed/);
});

// ── endpoint, fake database ──
function makeDB(settings) {
  const audit = [];
  return {
    settings, audit,
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async first() { const v = settings.get(args[0]); return v === undefined ? null : { value: v }; },
        async all() {
          if (/FROM settings WHERE key IN/.test(sql)) {
            const keys = args;
            return { results: keys.filter(k => settings.has(k)).map(key => ({ key, value: settings.get(key) })) };
          }
          return { results: [] };
        },
        async run() {
          let m = /INSERT INTO settings \(key,value\) VALUES \('(\w+)',\?\)/.exec(sql);
          if (m) { settings.set(m[1], args[0]); return { meta: { changes: 1 } }; }
          if (/audit/i.test(sql)) audit.push(args);
          return { meta: { changes: 1 } };
        },
      };
      return st;
    },
  };
}
const call = async (DB, body, token = 'wt') => {
  const res = await onRequest({ request: new Request('https://example.com/api/internal/satellite-align', { method: 'POST', headers: { 'x-watchdog-token': token, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env: { DB, CLERK_WATCHDOG_TOKEN: 'wt', CRON_SECRET: 'cs' }, waitUntil() {} });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const base = () => new Map([
  ['quotaList', JSON.stringify(KING)],
  ['satParishes', JSON.stringify([{ code: '111111', name: 'Fake One Parish' }])],
  ['satQuotas', JSON.stringify({ 111111: [{ label: 'RMF', amount: 200 }] })],
]);
const LINES = [{ item: 'Open Heavens', portal: 1400, app: null }, { item: 'Odd Fund', portal: 0, app: null }];

test('endpoint: wrong or missing token is refused and nothing changes', async () => {
  const s = base(); const DB = makeDB(s);
  const r = await call(DB, { action: 'apply', parish: '111111', month: '2026-10', lines: LINES }, 'nope');
  assert.equal(r.status, 401); assert.equal(s.get('satQuotas'), base().get('satQuotas'));
});

test('endpoint: preview writes nothing; apply adds the line and logs it; a second apply changes nothing; undo restores', async () => {
  const s = base(); const DB = makeDB(s);
  const before = s.get('satQuotas');
  const pv = await call(DB, { action: 'preview', parish: '111111', month: '2026-10', lines: LINES });
  assert.equal(pv.json.applied, false); assert.deepEqual(pv.json.changes, [{ label: 'Open Heavens', amount: 1400, item: 'Open Heavens' }]);
  assert.equal(s.get('satQuotas'), before); assert.equal(s.has('satAlignLog'), false);

  const ap = await call(DB, { action: 'apply', parish: '111111', month: '2026-10', lines: LINES, by: 'divine' });
  assert.equal(ap.json.applied, true);
  assert.deepEqual(JSON.parse(s.get('satQuotas'))['111111'], [{ label: 'RMF', amount: 200 }, { label: 'Open Heavens', amount: 1400 }]);
  const log = JSON.parse(s.get('satAlignLog')); assert.equal(log.length, 1); assert.equal(log[0].by, 'divine'); assert.deepEqual(log[0].before, [{ label: 'RMF', amount: 200 }]);

  const again = await call(DB, { action: 'apply', parish: '111111', month: '2026-10', lines: LINES });
  assert.equal(again.json.applied, false); assert.equal(JSON.parse(s.get('satAlignLog')).length, 1);

  const un = await call(DB, { action: 'undo', parish: '111111', changeId: ap.json.changeId });
  assert.equal(un.json.ok, true);
  assert.deepEqual(JSON.parse(s.get('satQuotas'))['111111'], [{ label: 'RMF', amount: 200 }]);
  assert.equal(JSON.parse(s.get('satAlignLog'))[0].undone, true);
});

test('endpoint: unknown line or odd amount is reported for a person and not applied; other parishes untouched', async () => {
  const s = base(); const DB = makeDB(s);
  const r = await call(DB, { action: 'apply', parish: '111111', month: '2026-10', lines: [{ item: 'Mystery Levy', portal: 500, app: null }] });
  assert.equal(r.json.applied, false); assert.equal(r.json.needsPerson.length, 1);
  assert.equal(s.get('satQuotas'), base().get('satQuotas'));
  const bad = await call(DB, { action: 'apply', parish: '602757', month: '2026-10', lines: LINES });
  assert.equal(bad.status, 404);
});
