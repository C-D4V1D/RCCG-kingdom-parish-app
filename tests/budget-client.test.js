// Contract v3 (budget settings, automatic savings, "available for new spending") —
// covers the pure client-side helpers in src/js/app.js that don't need a live DB:
// getBudgetConfig defaults/clamping, the v2-plan backward-compat rule for
// saves/saveCap, and the settings-page "for info" text. The DOM stub follows
// tests/access-rules.test.js's pattern exactly (app.js reads `document`/`window`
// at load time even though these tests never touch the DOM).
import test from 'node:test';
import assert from 'node:assert/strict';

function makeElement() {
  return {
    style: {}, innerHTML: '', textContent: '', value: '', disabled: false, files: [],
    appendChild() {}, insertBefore() {}, remove() {}, addEventListener() {}, setAttribute() {},
    getAttribute() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
}
const documentStub = {
  readyState: 'complete', body: makeElement(),
  getElementById() { return null; }, createElement() { return makeElement(); }, addEventListener() {},
};
globalThis.document = documentStub;
globalThis.window = { document: documentStub, location: { pathname: '/' }, addEventListener() {} };
Object.defineProperty(globalThis, 'localStorage', { value: { getItem() { return null; }, setItem() {}, removeItem() {} }, configurable: true });
Object.defineProperty(globalThis, 'history', { value: { replaceState() {} }, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
globalThis.window.localStorage = globalThis.localStorage;
globalThis.window.history = globalThis.history;
globalThis.window.navigator = globalThis.navigator;

// budget-engine.js sets window.BudgetEngine as a side effect of import (mirroring the
// plain <script> load order in index.html: budget-engine.js before app.js) — app.js's
// getBudgetEngine() throws without it.
await import(new URL('../src/js/budget-engine.js', import.meta.url).href);
await import(new URL(`../src/js/app.js?budget-client-test=${Date.now()}`, import.meta.url).href);
const App = globalThis.window.App;

test('getBudgetConfig fills in defaults and clamps out-of-range numbers', () => {
  const cfg = App._getBudgetConfig({});
  assert.equal(cfg.safetyMode, 'auto');
  assert.equal(cfg.safetyPercent, 10);
  assert.equal(cfg.floatPercent, 100);
  assert.equal(cfg.lookbackPeriods, 12);
  assert.deepEqual(cfg.protectedKeys, ['rccg_proj', 'power', 'security']);
  assert.equal(cfg.autoCreate, true);

  const clamped = App._getBudgetConfig({
    budgetRules: { lookbackPeriods: 999, cushionFloorPercent: -5, oneOffMult: 0, enoughPercent: 10 },
  });
  assert.equal(clamped.lookbackPeriods, 24, 'lookbackPeriods clamps to its max (24)');
  assert.equal(clamped.cushionFloorPercent, 0, 'cushionFloorPercent clamps to its min (0)');
  assert.equal(clamped.oneOffMult, 1, 'oneOffMult clamps to its min (1)');
  assert.equal(clamped.enoughPercent, 50, 'enoughPercent clamps to its min (50)');
});

test('getBudgetConfig ignores a savingOverrides entry for rccg_proj (always auto)', () => {
  const cfg = App._getBudgetConfig({ budgetRules: { savingOverrides: { rccg_proj: 'never', sound: 'always' } } });
  assert.equal(cfg.savingOverrides.rccg_proj, undefined);
  assert.equal(cfg.savingOverrides.sound, 'always');
});

test('budgetLineSaves: v3 lines respect the explicit saves flag; v2 lines fall back to rccg_proj-only', () => {
  assert.equal(App._budgetLineSaves({ saves: true }, 'sound'), true);
  assert.equal(App._budgetLineSaves({ saves: false }, 'rccg_proj'), false);
  // No `saves` field at all (a pre-contract-v3 plan) — backward compat.
  assert.equal(App._budgetLineSaves({ amount: 30000 }, 'rccg_proj'), true);
  assert.equal(App._budgetLineSaves({ amount: 30000 }, 'sound'), false);
});

test('budgetLineCap: explicit saveCap wins; a v2 rccg_proj line falls back to 3x its budget', () => {
  assert.equal(App._budgetLineCap({ amount: 30000, saveCap: 50000 }, 'rccg_proj'), 50000);
  assert.equal(App._budgetLineCap({ amount: 30000 }, 'rccg_proj'), 90000, 'missing saves+saveCap on rccg_proj -> 3x budget');
  assert.equal(App._budgetLineCap({ amount: 30000 }, 'sound'), 30000, 'missing saves+saveCap elsewhere -> just the budget');
  assert.equal(App._budgetLineCap({ amount: 30000, saves: true }, 'sound'), 30000, 'saves present but no cap -> budget, no 3x fallback');
});

test('budgetSavingInfoText reflects the current plan line, or a dash when there is none', () => {
  assert.equal(App._budgetSavingInfoText(null), '—');
  assert.equal(App._budgetSavingInfoText({ saves: false }), 'Not saving — steady');
  assert.match(App._budgetSavingInfoText({ saves: true, saveReason: 'lumpy', saveCap: 21850 }), /Saving — lumpy, up to.*21,850/);
});

test('resetBudgetRules and openBudgetBreakdown are exposed on the public API', () => {
  assert.equal(typeof App.resetBudgetRules, 'function');
  assert.equal(typeof App.openBudgetBreakdown, 'function');
});
