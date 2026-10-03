// Automations settings audit (2026-10-03): controls nothing reads are not shown; their saved values stay in the config.
import test from 'node:test';
import assert from 'node:assert/strict';

function makeElement() {
  return {
    style: {}, innerHTML: '', textContent: '', value: '', disabled: false, files: [], id: '', className: '',
    appendChild() {}, insertBefore() {}, remove() {}, addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }, focus() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
}
const documentStub = {
  readyState: 'complete', body: makeElement(),
  getElementById() { return null; }, createElement: makeElement, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
};
globalThis.document = documentStub;
globalThis.window = { document: documentStub, location: { pathname: '/' }, addEventListener() {} };
Object.defineProperty(globalThis, 'localStorage', { value: { getItem() { return null; }, setItem() {}, removeItem() {} }, configurable: true });
Object.defineProperty(globalThis, 'history', { value: { replaceState() {} }, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });

await import(new URL(`../src/js/app.js?automations-settings-audit-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;

const config = () => ({
  people: [{ key: 'p1', name: 'Person One', telegram_chat_id: null, email: null },
           { key: 'p2', name: 'Parish Person', parish: '111111', telegram_chat_id: null, email: null }],
  parishes: [{ code: '602757', name: 'Kingdom Parish', source_docs: true, attendance: true, remittance: true, statement: true },
             { code: '111111', name: 'Test Parish', source_docs: true, attendance: false, remittance: false, statement: false, handler: 'box' }],
  routing: { upload_fyi: { p1: { telegram: true, email: false } } },
  automations: {}, remittance: { handler: 'box', lines: {} },
});

test('parish cards show only the Source documents switch', () => {
  const html = App._renderAutomationsSettings(config(), false, { health: { satellite_links: {} } });
  const parishes = html.split('id="atParishRows"')[1];
  assert.match(parishes, /data-flag="source_docs" checked/);
  for (const f of ['attendance', 'remittance', 'statement']) assert.ok(!parishes.includes(`data-flag="${f}"`), f);
  assert.match(parishes, /upload bot offers this parish/);
  assert.match(parishes, /Who files this parish's remittance and attendance/);
  assert.ok(!parishes.includes('5 or more days late'));
});

test('upload confirmation / notice have no routing ticks (the bot always sends them)', () => {
  const html = App._renderAutomationsSettings(config(), false, { health: {} });
  assert.ok(!html.includes('class="at-route" data-mt="upload_confirmation"'));
  assert.ok(!html.includes('class="at-route" data-mt="upload_fyi"'));
  assert.match(html, /class="at-route" data-mt="memo_forwarded"/);
  // still listed in the Message guide
  assert.match(html, /id="at-guide-upload_fyi"/);
});

test('relabelled controls', () => {
  const html = App._renderAutomationsSettings(config(), false, { health: {} });
  assert.ok(!html.includes('Clerk AI (current)'));
  assert.ok(!html.includes('Max size for admins'));
  assert.match(html, /Largest file for the Admin source document/);
  assert.ok(!html.includes('(Pays the RRR, Full status)'));
});

// Follow-ups (2026-10-03, followticks-20261003).
const cfg2 = () => ({
  people: [{ key: 'david', name: 'D', called: 'Called-D', telegram_chat_id: '1', email: null, full_status: true, buttons: true },
           { key: 'divine', name: 'V', called: 'Called-V', app_role: 'accountant', telegram_chat_id: '2', email: null, full_status: false, buttons: true },
           { key: 'p2', name: 'Parish Person', parish: '111111', telegram_chat_id: null, email: null }],
  parishes: [{ code: '602757', name: 'Kingdom Parish', source_docs: true },
             { code: '111111', name: 'Test Parish', source_docs: true, handler: 'box' }],
  routing: { weekly_attendance_reminder: { david: { telegram: true, email: false }, divine: { telegram: true, email: false } },
             attendance_filed: { p2: { telegram: true, email: true } } },
  automations: {}, remittance: { handler: 'box', lines: {} },
});

test('parish portal login keeps its choice and says it is not used yet', () => {
  const html = App._renderAutomationsSettings(cfg2(), false, { health: {} });
  assert.match(html, /Not used yet: the box signs in with the Area account/);
});

test('parish people only see the message rows the box reads for them', () => {
  const html = App._renderAutomationsSettings(cfg2(), false, { health: {} });
  const sat = html.split('data-person-key="p2"')[1].split('</table>')[0];
  for (const t of ['remittance_check', 'rrr_generated', 'month_close', 'collection_reminder']) assert.match(sat, new RegExp(`data-mt="${t}"`));
  for (const t of ['attendance_filed', 'attendance_error', 'weekly_attendance_reminder', 'memo_forwarded']) assert.ok(!sat.includes(`data-mt="${t}"`), t);
});

test('weekly Sunday-records message shows what the box does today until saved with follow_ticks', () => {
  const eff = App._automationsEffectiveConfig(cfg2());
  assert.equal(eff.routing.weekly_attendance_reminder.david.telegram, false);
  assert.equal(eff.routing.weekly_attendance_reminder.divine.telegram, true);
  const saved = cfg2(); saved.automations = { weekly_attendance_reminder: { follow_ticks: true } };
  assert.equal(App._automationsEffectiveConfig(saved).routing.weekly_attendance_reminder.david.telegram, true);
});

test('help text names come from People "Called in messages"', () => {
  const c = cfg2();
  assert.equal(App._automationsHelpText('{tg:weekly_attendance_reminder}', c), 'Called-D and Called-V');
  assert.equal(App._automationsHelpText('{role:accountant} / {role:admin} / {person:divine}', c), 'Called-V / Called-D / Called-V');
  const html = App._renderAutomationsSettings(c, false, { health: {} });
  assert.ok(!/\{(tg|email|to|first|role|who|person):[a-z_]+\}/.test(html));
  assert.ok(!/Bro\. (David|Divine|Fabian)/.test(html));
});

test('Kingdom people get Admin (full status) and Generate RRR / Refresh buttons ticks', () => {
  const html = App._renderAutomationsSettings(cfg2(), false, { health: {} });
  assert.match(html, /class="at-p-admin" checked/);
  assert.match(html, /Admin \(full status\)/);
  assert.match(html, /Generate RRR \/ Refresh buttons/);
});

test('every Save changes bar has an autosave status next to it', () => {
  const html = App._renderAutomationsSettings(config(), false, { health: {} });
  const bars = html.split('App.saveAutomationsConfig(this)').length - 1;
  const statuses = html.split('class="at-save-status"').length - 1;
  assert.ok(bars > 0);
  assert.equal(statuses, bars);
  assert.match(html, /Changes save automatically/);
});
