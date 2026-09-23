// Verifies dist/ is in sync with src/ — catches the "forgot to run npm run build"
// case in CI. Uses the exact same pinned terser/csso versions as scripts/build.mjs
// (package-lock.json keeps versions deterministic), so the in-memory minified
// output should byte-match what's committed to dist/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { minifyJS, minifyCSS } from '../scripts/build.mjs';

const JS_FILES = [
  ['src/js/budget-engine.js',        'dist/js/budget-engine.js'],
  ['src/js/app.js',                  'dist/js/app.js'],
  ['src/js/kpsc.js',                 'dist/js/kpsc.js'],
  ['src/js/kpsc-public-minutes.js',  'dist/js/kpsc-public-minutes.js'],
];

const CSS_FILES = [
  ['src/css/styles.css', 'dist/css/styles.css'],
  ['src/css/kpsc.css',   'dist/css/kpsc.css'],
];

for (const [src, dest] of JS_FILES) {
  test(`${dest} is up-to-date with ${src}`, async () => {
    const sourceCode = await readFile(new URL('../' + src, import.meta.url), 'utf8');
    const committed = await readFile(new URL('../' + dest, import.meta.url), 'utf8');
    const expected = await minifyJS(sourceCode);
    assert.equal(
      committed,
      expected,
      `${dest} is stale. Run "npm run build" and commit the result.`
    );
  });
}

for (const [src, dest] of CSS_FILES) {
  test(`${dest} is up-to-date with ${src}`, async () => {
    const sourceCode = await readFile(new URL('../' + src, import.meta.url), 'utf8');
    const committed = await readFile(new URL('../' + dest, import.meta.url), 'utf8');
    const expected = minifyCSS(sourceCode);
    assert.equal(
      committed,
      expected,
      `${dest} is stale. Run "npm run build" and commit the result.`
    );
  });
}
