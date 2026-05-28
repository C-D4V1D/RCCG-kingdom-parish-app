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

  assert.match(html, /<link rel="stylesheet" href="\/dist\/css\/kpsc\.css(\?v=\d+)?" \/>/);
  assert.match(html, /<script src="\/dist\/js\/kpsc\.js(\?v=\d+)?"><\/script>/);
  assert.match(html, /id="kpsc-account-select"/);
});

test('KPSC public minutes page uses root-relative assets', async () => {
  const html = await readFile(new URL('../kpsc/minutes/index.html', import.meta.url), 'utf8');

  assert.match(html, /<link rel="stylesheet" href="\/dist\/css\/kpsc\.css" \/>/);
  assert.match(html, /<script src="\/dist\/js\/kpsc-public-minutes\.js"><\/script>/);
});

test('Cloudflare redirects do not rewrite KPSC back to an .html file', async () => {
  const redirects = await readFile(new URL('../_redirects', import.meta.url), 'utf8');

  assert.doesNotMatch(redirects, /^\/kpsc\/?\s+\/kpsc\.html\s+200$/m);
  assert.match(redirects, /^\/\* \/index\.html 200$/m);
});

test('cache headers force fresh HTML, manifest, and service worker after deploys', async () => {
  const headers = await readFile(new URL('../_headers', import.meta.url), 'utf8');

  assert.match(headers, /^\/\s*\n\s*Cache-Control: no-cache, no-store, must-revalidate$/m);
  assert.match(headers, /^\/kpsc\/index\.html\s*\n\s*Cache-Control: no-cache, no-store, must-revalidate$/m);
  assert.match(headers, /^\/kpsc\/manifest\.json\s*\n\s*Cache-Control: no-cache, no-store, must-revalidate$/m);
  assert.match(headers, /^\/kpsc\/sw\.js\s*\n\s*Cache-Control: no-cache, no-store, must-revalidate$/m);
});

test('KPSC service worker prefers network for app shell updates', async () => {
  const sw = await readFile(new URL('../kpsc/sw.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../kpsc/index.html', import.meta.url), 'utf8');

  assert.match(sw, /const CACHE = 'kpsc-v\d+';/);
  assert.match(sw, /const SHELL = \[/);
  assert.match(sw, /'\/kpsc\/index\.html'/);
  assert.match(sw, /'\/kpsc\/manifest\.json'/);
  assert.match(sw, /'\/dist\/css\/kpsc\.css'/);
  assert.match(sw, /'\/dist\/js\/kpsc\.js'/);
  assert.match(sw, /networkFirst\(request, '\/kpsc\/index\.html'\)/);
  assert.match(sw, /if \(isAppShellAsset\(url\.pathname\)\)/);
  assert.match(html, /updateViaCache: 'none'/);
});
