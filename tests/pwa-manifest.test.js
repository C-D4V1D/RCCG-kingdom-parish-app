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

for (const file of ['index.html', 'kpsc/index.html']) {
  test(`${file} shows an "update Chrome" screen on browsers too old to run the app`, async () => {
    const { Script, createContext } = await import('node:vm');
    const html = await readFile(new URL(file, ROOT), 'utf8');
    const check = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
      .find(code => code.includes('Old-browser check'));
    assert.ok(check, 'old-browser check is present');
    // It must run before the app bundle, or a parse error in the bundle comes first.
    assert.ok(html.indexOf('Old-browser check') < html.search(/<script src="\/?dist\/js\/(app|kpsc)\.js/));

    const run = (ua, modern) => {
      const body = { innerHTML: 'APP', style: {} };
      const ctx = createContext({
        navigator: { userAgent: ua }, document: { body }, window: {},
        // A browser that can't read ?. / ?? throws a SyntaxError here.
        Function: modern ? Function : function () { throw new SyntaxError('old'); },
      });
      new Script(check).runInContext(ctx);
      return body.innerHTML;
    };
    assert.equal(run('Mozilla/5.0 (Linux; Android 13) Chrome/130.0.0.0 Mobile', true), 'APP');
    const old = run('Mozilla/5.0 (Linux; Android 7.0) Chrome/70.0.3538.110 Mobile', false);
    assert.match(old, /Chrome 70/);
    assert.match(old, /play\.google\.com\/store\/apps\/details\?id=com\.android\.chrome/);
    assert.match(run('Mozilla/5.0 (Linux; Android 4.2.2) Chrome/60.0 Mobile', false), /too old to run the app\.<\/p>.*newer phone/s);
  });
}
