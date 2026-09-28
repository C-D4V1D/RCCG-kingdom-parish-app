// IT-admin side of the satellite parishes: satellite monthly quotas, the settings.satParishes list, and the
// Automations → Parishes cards (people, logins, invites, sealed portal password).
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

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

await import(new URL(`../src/js/app.js?satellite-admin-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;

test('satBuildQuotas keeps rows above zero, keeps overrides, leaves other parishes alone', () => {
  const existing = {
    '659840': [{ label: 'CSR', amount: 1500, overrides: { '2026-09': 0 } }, { label: 'Camp', amount: 2500 }],
    '111111': [{ label: 'CSR', amount: 999 }],
  };
  const out = App._satBuildQuotas(existing, [
    { code: '659840', amounts: ['2000', '', 0] },
    { code: '597445', amounts: ['100', '200', '-5'] },
  ], ['CSR', 'Camp', 'Building']);
  assert.deepEqual(out['659840'], [{ label: 'CSR', amount: 2000, overrides: { '2026-09': 0 } }]);
  assert.deepEqual(out['597445'], [{ label: 'CSR', amount: 100 }, { label: 'Camp', amount: 200 }]);
  assert.deepEqual(out['111111'], [{ label: 'CSR', amount: 999 }]);
  assert.deepEqual(existing['659840'][0].overrides, { '2026-09': 0 }, 'input not mutated');
  assert.deepEqual(App._satBuildQuotas(null, [{ code: '659840', amounts: [''] }], ['CSR']), { '659840': [] });
});

test('satBuildParishes: satellites only, deduped, extras kept, active defaults on', () => {
  const out = App._satBuildParishes([
    { code: '602757', name: 'Kingdom Parish' },
    { code: '659840', name: ' Sanctuary of Favour Parish ', active: false },
    { code: '659840', name: 'dup' },
    { code: '', name: 'blank' },
    { code: '597445', name: 'Good Shepherd Parish' },
  ], [{ code: '597445', name: 'old', active: false, extra: 1 }]);
  assert.deepEqual(out, [
    { code: '659840', name: 'Sanctuary of Favour Parish', active: false },
    { code: '597445', name: 'Good Shepherd Parish', extra: 1, active: true },
  ]);
  assert.deepEqual(App._satBuildParishes(undefined, undefined), []);
});

const config = () => ({
  people: [
    { key: 'david', name: 'David', telegram_chat_id: '1', email: 'd@x.org', can_upload: true },
    { key: 'p659840', name: 'Pastor Tunde', title: 'Pastor', called: 'Pastor Tunde', parish: '659840', app_user_id: 'u77', pays_rrr: true },
    { key: 'p111111', name: 'Orphan', parish: '111111' },
  ],
  parishes: [
    { code: '602757', name: 'Kingdom Parish', source_docs: true },
    { code: '659840', name: 'Sanctuary of Favour Parish' },
  ],
  routing: { rrr_generated: { david: { telegram: true, email: false }, p659840: { telegram: true, email: true } } },
});

test('parish people leave the Kingdom People list; people of a missing parish stay in it', () => {
  const s = App._automationsSplitPeople(config());
  assert.deepEqual(s.kingdom.map(p => p.key), ['david', 'p111111']);
  assert.deepEqual(s.byParish['659840'].map(p => p.key), ['p659840']);
});

test('new person keys: p<code>, then _2, _3', () => {
  assert.equal(App._automationsNewPersonKey('659840', new Set(['david'])), 'p659840');
  assert.equal(App._automationsNewPersonKey('659840', new Set(['p659840'])), 'p659840_2');
  assert.equal(App._automationsNewPersonKey('659840', new Set(['p659840', 'p659840_2'])), 'p659840_3');
  assert.match(App._automationsNewPersonKey('659840', new Set()), /^[a-z][a-z0-9_]{0,31}$/);
});

test('random PIN is 6 digits and invite code is 10 of a-z0-9', () => {
  for (let i = 0; i < 200; i++) {
    assert.match(App._automationsRandomPin(), /^[1-9]\d{5}$/);
    assert.match(App._automationsInviteCode(), /^[a-z0-9]{10}$/);
  }
});

test('the parish message ticks are all real message types', () => {
  const keys = App._AUTOMATION_MESSAGE_TYPES.map(m => m.key);
  assert.equal(App._AUTOMATION_SAT_ROUTING_TYPES.length, 9);
  for (const k of App._AUTOMATION_SAT_ROUTING_TYPES) assert.ok(keys.includes(k), k);
});

test('portal password is sealed with RSA-OAEP SHA-256 and only the box key can open it', async () => {
  const pair = await webcrypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
  const spki = Buffer.from(await webcrypto.subtle.exportKey('spki', pair.publicKey)).toString('base64');
  const sealed = await App._automationsSealPassword(spki, 'p@ss w0rd ₦');
  assert.match(sealed, /^[A-Za-z0-9+/]+=*$/);
  assert.ok(!sealed.includes('p@ss'));
  const plain = await webcrypto.subtle.decrypt({ name: 'RSA-OAEP' }, pair.privateKey, Buffer.from(sealed, 'base64'));
  assert.equal(new TextDecoder().decode(plain), 'p@ss w0rd ₦');
  await assert.rejects(() => App._automationsSealPassword('not a key', 'x'));
});

test('Automations page: satellite card holds its people, login and pick lists; Kingdom list is unchanged', () => {
  const html = App._renderAutomationsSettings(config(), false, { health: { box_public_key: null, satellite_links: {} } });
  const peopleBlock = html.split('id="atPeopleRows"')[1].split('id="atGuide"')[0];
  assert.match(peopleBlock, /data-person-key="david"/);
  assert.match(peopleBlock, /data-person-key="p111111"/);
  assert.ok(!peopleBlock.includes('p659840'));
  assert.match(html, /<summary>People \(2\)<\/summary>/);
  const parishBlock = html.split('id="atParishRows"')[1];
  assert.match(parishBlock, /at-par-person" data-person-key="p659840"/);
  assert.match(parishBlock, /Approves RRR/);
  assert.match(parishBlock, /Reset PIN/);                       // has a login
  assert.match(parishBlock, /Copy invite link/);                // no Telegram yet
  assert.match(parishBlock, /Available after the next box update/);
  assert.match(parishBlock, /data-field="copies"[\s\S]*?data-key="david" checked/);   // default copies
  assert.match(parishBlock, /<option value="box" selected>/);
  // Kingdom's own card has no satellite sections.
  const kingdomCard = parishBlock.split('data-orig-code="659840"')[0];
  assert.ok(!kingdomCard.includes('at-par-active'));
});

test('Automations page: box key enables the password field; a satellite link shows Connected', () => {
  const html = App._renderAutomationsSettings(config(), false, { health: { box_public_key: 'AAAA', satellite_links: { p659840: true } } });
  assert.ok(!/at-par-pw"[^>]*disabled/.test(html));
  assert.match(html, /Telegram connected ✓/);
});
