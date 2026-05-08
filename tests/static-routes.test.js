import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('homepage KPSC portal button links directly to static portal page', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /<a href="\/kpsc\.html" class="hp-kpsc-btn">Open KPSC Meeting Portal/);
  assert.doesNotMatch(html, /<a href="\/kpsc" class="hp-kpsc-btn">Open KPSC Meeting Portal/);
});

test('Cloudflare redirects support KPSC bookmarks without intercepting direct portal link', async () => {
  const redirects = await readFile(new URL('../_redirects', import.meta.url), 'utf8');

  assert.match(redirects, /^\/kpsc \/kpsc\.html 200$/m);
  assert.match(redirects, /^\/kpsc\/ \/kpsc\.html 200$/m);
  assert.match(redirects, /^\/\* \/index\.html 200$/m);
});
