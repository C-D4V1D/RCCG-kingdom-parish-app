// Dark mode: the dark palette covers every colour variable, text stays readable on its background, the saved choice
// is applied before first paint, and the Light / Dark / Auto switch stores and applies the choice.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../src/css/styles.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const appSrc = fs.readFileSync(new URL('../src/js/app.js', import.meta.url), 'utf8');

const vars = block => Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
const lightBlock = css.slice(css.indexOf(':root{'), css.indexOf('}', css.indexOf(':root{')));
const darkExplicit = css.slice(css.indexOf(':root[data-theme="dark"]{'), css.indexOf('}', css.indexOf(':root[data-theme="dark"]{')));
const mediaStart = css.indexOf('@media (prefers-color-scheme: dark){');
const darkAuto = css.slice(css.indexOf(':root:not([data-theme="light"]){', mediaStart), css.indexOf('}', css.indexOf(':root:not([data-theme="light"]){', mediaStart)));
const light = vars(lightBlock), darkA = vars(darkExplicit), darkB = vars(darkAuto);

test('the dark palette redefines every colour variable of the light one, in both the chosen and the automatic case', () => {
  const nonColour = new Set(['--r', '--rl', '--rx', '--sidebar-w']);
  const colourVars = Object.keys(light).filter(v => !nonColour.has(v));
  assert.ok(colourVars.length > 20);
  for (const v of colourVars) {
    assert.ok(v in darkA, `${v} missing from the Dark choice`);
    assert.ok(v in darkB, `${v} missing from the automatic dark mode`);
  }
  assert.deepEqual(darkA, darkB, 'Dark and automatic dark must be the same palette');
});

function lum(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('dark colours are readable: ordinary text 4.5:1, muted text 4.5:1, coloured text on cards and tinted boxes 4.5:1', () => {
  const d = darkA;
  const pairs = [
    ['--text', '--bg'], ['--text', '--card'], ['--text', '--surface'], ['--text', '--surface-2'], ['--text2', '--card'], ['--text3', '--card'], ['--text3', '--bg'],
    ['--primary-text', '--card'], ['--danger', '--card'], ['--success', '--card'], ['--info', '--card'], ['--amber', '--card'], ['--amber-text', '--card'], ['--purple', '--card'],
    ['--danger', '--danger-light'], ['--success', '--success-light'], ['--info', '--info-light'], ['--amber-text', '--amber-light'], ['--primary-mid', '--primary-light'],
  ];
  for (const [fg, bg] of pairs) assert.ok(ratio(d[fg], d[bg]) >= 4.5, `${fg} on ${bg} is ${ratio(d[fg], d[bg]).toFixed(2)}:1`);
  // white text on solid buttons
  assert.ok(ratio('#ffffff', d['--primary']) >= 4.5, 'white on the primary button');
  for (const hex of ['#b3433b', '#a8690f']) assert.ok(ratio('#ffffff', hex) >= 4.4, 'white on ' + hex);
});

test('the saved choice is applied before anything paints (script sits before the stylesheet)', () => {
  const script = html.indexOf("localStorage.getItem('rccgTheme')");
  const sheet = html.indexOf('dist/css/styles.css');
  assert.ok(script > 0 && sheet > 0 && script < sheet);
  assert.match(html, /data-theme-pref="auto"[^>]*onclick="App.setTheme\('auto'\)"/);
  assert.match(html, /data-theme-pref="light"[^>]*onclick="App.setTheme\('light'\)"/);
  assert.match(html, /data-theme-pref="dark"[^>]*onclick="App.setTheme\('dark'\)"/);
});

test('text in the brand green uses the text variable (dark mode lightens it), solid green stays for backgrounds', () => {
  assert.doesNotMatch(css.slice(0, css.indexOf('/* ═══ DARK MODE')), /(^|[^-\w])color:\s*var\(--primary\)/);
  assert.doesNotMatch(appSrc, /(^|[^-\w])color:\s*var\(--primary\)(?![-\w])/);
  assert.equal(light['--primary-text'], '#0F6E56');          // light mode looks exactly as before
});

// ── the switch itself, on the real app code ──
const store = {};
const rootAttrs = {};
const metaAttrs = { content: '#0F6E56' };
const pressed = {};
function el() { return { style: {}, innerHTML: '', textContent: '', value: '', files: [], dataset: {}, appendChild() {}, insertBefore() {}, remove() {}, addEventListener() {}, setAttribute() {}, getAttribute() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } }; }
const buttons = ['auto', 'light', 'dark'].map(p => ({ getAttribute: k => (k === 'data-theme-pref' ? p : null), setAttribute: (k, v) => { if (k === 'aria-pressed') pressed[p] = v; } }));
const documentStub = {
  readyState: 'complete', body: el(),
  documentElement: { setAttribute: (k, v) => { rootAttrs[k] = v; }, removeAttribute: k => { delete rootAttrs[k]; } },
  getElementById: () => null, createElement: () => el(),
  querySelector: sel => (sel === 'meta[name="theme-color"]' ? { setAttribute: (k, v) => { metaAttrs[k] = v; } } : null),
  querySelectorAll: sel => (sel === '[data-theme-pref]' ? buttons : []), addEventListener() {}
};
const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
let phoneDark = false;
globalThis.document = documentStub;
globalThis.window = { document: documentStub, location: { pathname: '/' }, addEventListener() {}, localStorage: ls, matchMedia: () => ({ matches: phoneDark, addEventListener() {} }) };
Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
Object.defineProperty(globalThis, 'history', { value: { replaceState() {}, pushState() {} }, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
globalThis.window.history = globalThis.history;
globalThis.window.navigator = globalThis.navigator;
console.error = () => {};
await import('../src/js/app.js?dark-mode=' + Date.now());
const App = globalThis.window.App;

test('Dark and Light are remembered and applied; Auto clears the choice and follows the phone', () => {
  App.setTheme('dark');
  assert.equal(store.rccgTheme, 'dark');
  assert.equal(rootAttrs['data-theme'], 'dark');
  assert.equal(metaAttrs.content, '#121613');
  assert.equal(pressed.dark, 'true');
  assert.equal(pressed.light, 'false');
  App.setTheme('light');
  assert.equal(rootAttrs['data-theme'], 'light');
  assert.equal(metaAttrs.content, '#0F6E56');
  phoneDark = true;
  App.setTheme('auto');
  assert.equal('rccgTheme' in store, false);
  assert.equal('data-theme' in rootAttrs, false);       // the phone decides through the CSS
  assert.equal(metaAttrs.content, '#121613');           // phone is dark, so the browser bar is dark
  assert.equal(pressed.auto, 'true');
  phoneDark = false;
  App.setTheme('auto');
  assert.equal(metaAttrs.content, '#0F6E56');
});

test('a nonsense value is treated as Auto and a blocked storage does not break the switch', () => {
  App.setTheme('purple');
  assert.equal('data-theme' in rootAttrs, false);
  assert.equal(App._getThemePref(), 'auto');
  const keep = ls.getItem;
  ls.getItem = () => { throw new Error('blocked'); };
  assert.equal(App._getThemePref(), 'auto');
  ls.getItem = keep;
});
