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
