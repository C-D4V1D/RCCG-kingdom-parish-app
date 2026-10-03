import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url);

async function pngSize(path) {
  const buf = await readFile(new URL(`.${path}`, ROOT));
  assert.equal(buf.toString('ascii', 1, 4), 'PNG', `${path} is not a PNG`);
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
}

for (const [file, id] of [['manifest.json', '/'], ['kpsc/manifest.json', '/kpsc/']]) {
  test(`${file} is installable on all Android launchers`, async () => {
    const m = JSON.parse(await readFile(new URL(file, ROOT), 'utf8'));

    // A fixed id keeps the installed app the same app across manifest changes.
    assert.equal(m.id, id);
    assert.equal(m.start_url, id);
    assert.equal(m.scope, id);
    assert.equal(m.display, 'standalone');
    // A portrait-only lock breaks tablets, foldables and landscape-default devices.
    assert.ok(!m.orientation || m.orientation === 'any', 'no orientation lock');

    const png = m.icons.filter(i => i.type === 'image/png');
    for (const icon of png) {
      assert.equal(await pngSize(icon.src), icon.sizes, `${icon.src} size matches the manifest`);
      assert.ok(icon.purpose === 'any' || icon.purpose === 'maskable', `${icon.src} has one purpose`);
    }
    const sizes = purpose => png.filter(i => i.purpose === purpose).map(i => i.sizes);
    assert.ok(sizes('any').includes('192x192') && sizes('any').includes('512x512'));
    assert.ok(sizes('maskable').includes('192x192') && sizes('maskable').includes('512x512'));
    // The round "any" icon has transparent corners, so it must not double as the maskable one.
    const anySrc = new Set(png.filter(i => i.purpose === 'any').map(i => i.src));
    for (const icon of png.filter(i => i.purpose === 'maskable')) assert.ok(!anySrc.has(icon.src));
  });
}

for (const file of ['install/index.html', 'kpsc/install/index.html']) {
  test(`${file} inline scripts parse (a syntax error leaves the install page stuck)`, async () => {
    const { Script } = await import('node:vm');
    const html = await readFile(new URL(file, ROOT), 'utf8');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert.ok(scripts.length > 0);
    for (const code of scripts) assert.doesNotThrow(() => new Script(code));
  });
}
