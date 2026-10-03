// Automations -> Telegram bot section: app-side defaults (an unsaved config shows the right values) and normalising.
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

await import(new URL(`../src/js/app.js?automations-telegram-bot-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;
const { DEFAULT_CONFIG } = await import('../workers/clerk-watchdog/config.js');

const config = (tb) => ({
  people: [{ key: 'p1', name: 'Person One', telegram_chat_id: null, email: null }], parishes: [], routing: {},
  automations: tb === undefined ? {} : { telegram_bot: tb }, remittance: { handler: 'clerk_ai', lines: {} },
});
const section = (html) => html.split('id="atTelegramBot"')[1].split('</details>')[0];
const selected = (html, path) => {
  const sel = html.split(`data-path="${path}"`)[1].split('</select>')[0];
  return sel.match(/<option value="([^"]+)" selected>/)?.[1];
};

test('app-side Telegram bot defaults equal the Worker defaults', () => {
  assert.deepEqual(App._AUTOMATION_TELEGRAM_BOT_DEFAULTS, DEFAULT_CONFIG.automations.telegram_bot);
  assert.deepEqual(App._automationsTelegramBot(undefined), DEFAULT_CONFIG.automations.telegram_bot);
});

test('an unsaved config shows the default menu, with Help fixed', () => {
  const html = section(App._renderAutomationsSettings(config(), true, {}));
  const d = DEFAULT_CONFIG.automations.telegram_bot;
  for (const [k, v] of Object.entries(d.menu)) if (k !== 'help') assert.equal(selected(html, `automations.telegram_bot.menu.${k}`), v, k);
  assert.ok(!html.includes('menu.help"'), 'Help is fixed text, not a field');
  assert.match(html, /Always on for everyone/);
  assert.equal(selected(html, 'automations.telegram_bot.month_portal_check'), 'button');
  assert.match(html, /data-path="automations.telegram_bot.previous_months"[^>]*value="6"/);
  assert.match(html, /data-path="automations.telegram_bot.reply_unknown" data-kind="bool" checked/);
  assert.match(html, /data-path="automations.telegram_bot.unknown_contact"[^>]*maxlength="80" value="the parish IT administrator"/);
  const statementSelect = html.split('menu.statement"')[1].split('</select>')[0];
  assert.ok(!statementSelect.includes('value="everyone"'), 'restricted commands do not offer Everyone');
});

test('saved values show, and everything is normalised to valid values', () => {
  const html = section(App._renderAutomationsSettings(config({ menu: { statement: 'admin', system: 'everyone', month: 'off' }, previous_months: 9, month_portal_check: 'always', reply_unknown: false, unknown_contact: 'Bro. X' }), false, {}));
  assert.equal(selected(html, 'automations.telegram_bot.menu.statement'), 'admin');
  assert.equal(selected(html, 'automations.telegram_bot.menu.system'), 'kingdom');   // 'everyone' treated as 'kingdom'
  assert.equal(selected(html, 'automations.telegram_bot.menu.month'), 'off');
  assert.equal(selected(html, 'automations.telegram_bot.month_portal_check'), 'always');
  assert.ok(!/reply_unknown" data-kind="bool" checked/.test(html));
  const n = App._automationsTelegramBot({ menu: { help: 'off', balance: 'bogus' }, previous_months: 40, month_portal_check: 'x', unknown_contact: '   ' });
  assert.equal(n.menu.help, 'everyone');
  assert.equal(n.menu.balance, 'kingdom');
  assert.equal(n.previous_months, 6);
  assert.equal(n.month_portal_check, 'button');
  assert.equal(n.unknown_contact, 'the parish IT administrator');
  assert.equal(App._automationsTelegramBot({ unknown_contact: 'y'.repeat(120) }).unknown_contact.length, 80);
});
