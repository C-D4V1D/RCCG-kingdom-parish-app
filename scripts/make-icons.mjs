// Generates the PWA icon set for the Finance Portal (/icons) and KPSC (/kpsc/icons).
// Run with: node scripts/make-icons.mjs   (only needed when the icon design changes)
//
// "any" icons keep the round badge. "maskable" icons fill the whole square with the
// background colour and keep the cross inside the central safe zone, so Android
// launchers (circle, squircle, rounded square, teardrop) can crop them without
// cutting the cross or leaving black/white corners.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CROSS = `
  <rect x="223" y="82" width="66" height="290" rx="6" fill="white"/>
  <rect x="140" y="165" width="232" height="66" rx="6" fill="white"/>`;

const roundSvg = bg => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <circle cx="256" cy="256" r="256" fill="${bg}"/>${CROSS}
</svg>`;

// Cross scaled to 80% around the centre: it stays well inside the 80% safe-zone circle.
const maskableSvg = bg => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${bg}"/>
  <g transform="translate(256 256) scale(0.8) translate(-256 -227)">${CROSS}</g>
</svg>`;

const APPS = [
  { dir: 'icons', bg: '#085041' },
  { dir: 'kpsc/icons', bg: '#1e3a5f' },
];

for (const { dir, bg } of APPS) {
  const out = join(ROOT, dir);
  await mkdir(out, { recursive: true });
  for (const size of [96, 144, 192, 512]) {
    await sharp(Buffer.from(roundSvg(bg))).resize(size, size).png().toFile(join(out, `icon-${size}.png`));
  }
  for (const size of [192, 512]) {
    await sharp(Buffer.from(maskableSvg(bg))).resize(size, size).png().toFile(join(out, `icon-maskable-${size}.png`));
  }
  // iPhone home-screen icon: iOS rounds the corners itself and paints transparent
  // pixels black, so it uses the full-square design too.
  await sharp(Buffer.from(maskableSvg(bg))).resize(180, 180).flatten({ background: bg }).png().toFile(join(out, 'icon-180.png'));
  console.log(`  ${dir}: icons written`);
}
