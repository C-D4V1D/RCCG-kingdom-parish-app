#!/usr/bin/env node
/**
 * Generates Admin Portal PWA icon PNGs using only Node.js built-ins (no npm packages).
 * Mirrors scripts/generate-icons.mjs for consistency.
 * Run: node scripts/generate-admin-icons.mjs
 */
import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'icons');

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[i] = c;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcVal = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcVal]);
}

function makePNG(size, drawPixel) {
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const rowLen = 1 + size * 4;
  const raw = Buffer.alloc(rowLen * size);

  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = drawPixel(x, y, size);
      const off = y * rowLen + 1 + x * 4;
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b; raw[off + 3] = a;
    }
  }

  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Dark-green circle (#085041) with white Latin cross — matches the admin
// portal hero's cross-in-circle motif.
function drawAdminIcon(x, y, size) {
  const half = size / 2;
  const dx = x - half + 0.5;
  const dy = y - half + 0.5;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist >= half) return [0, 0, 0, 0];

  const vHalfW = size * 0.065;
  const hHalfH = size * 0.065;
  const vTop   = -half * 0.68;
  const vBot   =  half * 0.45;
  const hBarY  = -half * 0.23;
  const hSpan  =  half * 0.45;

  const inVert  = Math.abs(dx) < vHalfW && dy > vTop && dy < vBot;
  const inHoriz = Math.abs(dy - hBarY) < hHalfH && Math.abs(dx) < hSpan;

  if (inVert || inHoriz) return [255, 255, 255, 255];
  return [8, 80, 65, 255]; // #085041 dark green
}

mkdirSync(outDir, { recursive: true });

for (const size of [180, 192, 512]) {
  const filename = size === 180 ? 'icon-180.png' : `icon-${size}.png`;
  const png = makePNG(size, drawAdminIcon);
  writeFileSync(join(outDir, filename), png);
  console.log(`  ${filename}  (${png.length} bytes)`);
}
console.log('Admin icons generated successfully.');
