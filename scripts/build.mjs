#!/usr/bin/env node
/**
 * Minifies the JS and CSS assets served to browsers.
 *
 * Sources stay in src/{js,css}/ for editing, testing and debugging.
 * Build output lives in dist/{js,css}/ and is what the HTML files actually
 * reference. dist/ is committed to git so Cloudflare Pages can serve it
 * without any build step on their side.
 *
 * Run:  npm run build
 *
 * To keep CI deterministic, terser and csso are pinned via package-lock.json
 * — the build-output.test.js sanity check re-minifies and compares.
 */
import { minify as terserMinify } from 'terser';
import { minify as cssoMinify } from 'csso';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const JS_FILES = [
  'src/js/app.js',
  'src/js/kpsc.js',
  'src/js/kpsc-public-minutes.js',
];

const CSS_FILES = [
  'src/css/styles.css',
  'src/css/kpsc.css',
];

// Terser options — keep deterministic, no source maps for now (can add later).
// `mangle: true` rewrites local identifiers; `compress: true` removes dead code
// and inlines simple expressions. Top-level mangling is OFF because app.js
// exposes `App` and helpers as globals the HTML references via inline handlers.
const TERSER_OPTS = {
  compress: { passes: 2 },
  mangle: true,
  format: { comments: false },
};

export async function minifyJS(src) {
  const result = await terserMinify(src, TERSER_OPTS);
  if (result.error) throw result.error;
  return result.code;
}

export function minifyCSS(src) {
  return cssoMinify(src, { restructure: true }).css;
}

async function buildJS(rel) {
  const src = await readFile(join(ROOT, rel), 'utf8');
  const out = await minifyJS(src);
  const dest = rel.replace(/^src\//, 'dist/');
  await mkdir(join(ROOT, dirname(dest)), { recursive: true });
  await writeFile(join(ROOT, dest), out);
  return { src: src.length, out: out.length, dest };
}

async function buildCSS(rel) {
  const src = await readFile(join(ROOT, rel), 'utf8');
  const out = minifyCSS(src);
  const dest = rel.replace(/^src\//, 'dist/');
  await mkdir(join(ROOT, dirname(dest)), { recursive: true });
  await writeFile(join(ROOT, dest), out);
  return { src: src.length, out: out.length, dest };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = [
    ...(await Promise.all(JS_FILES.map(buildJS))),
    ...(await Promise.all(CSS_FILES.map(buildCSS))),
  ];
  for (const { src, out, dest } of results) {
    const pct = ((1 - out / src) * 100).toFixed(1);
    console.log(`  ${dest.padEnd(34)}  ${(src / 1024).toFixed(1).padStart(6)} KB  →  ${(out / 1024).toFixed(1).padStart(6)} KB  (${pct}% smaller)`);
  }
  // Generate version.json for auto-update detection
  const appJsBuilt = await readFile(join(ROOT, 'dist/js/app.js'), 'utf8');
  const versionHash = createHash('md5').update(appJsBuilt).digest('hex').slice(0, 10);
  await writeFile(join(ROOT, 'version.json'), JSON.stringify({ v: versionHash, t: Date.now() }));
  console.log(`  version.json                        hash: ${versionHash}`);

  // Update cache-busting param in index.html
  const indexHtml = await readFile(join(ROOT, 'index.html'), 'utf8');
  const updatedHtml = indexHtml.replace(/app\.js\?v=[a-z0-9]+/i, `app.js?v=${versionHash}`);
  if (updatedHtml !== indexHtml) {
    await writeFile(join(ROOT, 'index.html'), updatedHtml);
    console.log(`  index.html                          cache-bust: ?v=${versionHash}`);
  }

  console.log('Build complete.');
}
