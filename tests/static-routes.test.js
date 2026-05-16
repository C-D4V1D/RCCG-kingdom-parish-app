import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('homepage KPSC portal button links to real directory route', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /<a href="\/kpsc\/" class="hp-kpsc-btn">Open KPSC Meeting Portal/);
  assert.doesNotMatch(html, /<a href="\/kpsc\.html" class="hp-kpsc-btn">Open KPSC Meeting Portal/);
});

test('KPSC portal directory page uses root-relative assets', async () => {
  const html = await readFile(new URL('../kpsc/index.html', import.meta.url), 'utf8');

  assert.match(html, /<link rel="stylesheet" href="\/src\/css\/kpsc\.css" \/>/);
  assert.match(html, /<script src="\/src\/js\/kpsc\.js"><\/script>/);
  assert.match(html, /id="kpsc-account-select"/);
});

test('KPSC public minutes page uses root-relative assets', async () => {
  const html = await readFile(new URL('../kpsc/minutes/index.html', import.meta.url), 'utf8');

  assert.match(html, /<link rel="stylesheet" href="\/src\/css\/kpsc\.css" \/>/);
  assert.match(html, /<script src="\/src\/js\/kpsc-public-minutes\.js"><\/script>/);
});

test('Cloudflare redirects do not rewrite KPSC back to an .html file', async () => {
  const redirects = await readFile(new URL('../_redirects', import.meta.url), 'utf8');

  assert.doesNotMatch(redirects, /^\/kpsc\/?\s+\/kpsc\.html\s+200$/m);
  assert.match(redirects, /^\/\* \/index\.html 200$/m);
});
