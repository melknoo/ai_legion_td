// Draws the app icons (PWA manifest, home screen) as 16x16 pixel art, scaled up without
// smoothing: a gold "L" on an FF6-blue window. Run: node tools/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.join(import.meta.dirname, '../client/public/icons');
const N = 16;
const BG = [0x0b, 0x0b, 0x18];
const BORDER = [0xe8, 0xe8, 0xf0];
const BLUE_TOP = [0x38, 0x58, 0xc8];
const BLUE_BOTTOM = [0x18, 0x2c, 0x78];
const GOLD = [0xff, 0xd0, 0x60];
const GOLD_LIGHT = [0xff, 0xf4, 0xb0];
const GOLD_SHADE = [0xa0, 0x60, 0x10];

const L = new Set();
for (let y = 3; y <= 11; y++) for (let x = 5; x <= 6; x++) L.add(`${x},${y}`);
for (let y = 10; y <= 11; y++) for (let x = 5; x <= 10; x++) L.add(`${x},${y}`);

const blue = (y) => BLUE_TOP.map((c, i) => Math.round(c + ((BLUE_BOTTOM[i] - c) * y) / (N - 1)));

/** `framed`: window with a border on a dark tile; otherwise full bleed (maskable). */
function pixel(x, y, framed) {
  if (L.has(`${x},${y}`)) return x === 5 && y === 3 ? GOLD_LIGHT : GOLD;
  if (L.has(`${x - 1},${y - 1}`)) return GOLD_SHADE;
  if (!framed) return blue(y);
  const edge = (v) => v === 1 || v === N - 2;
  if (x < 1 || y < 1 || x > N - 2 || y > N - 2 || (edge(x) && edge(y))) return BG;
  if (edge(x) || edge(y)) return BORDER;
  return blue(y);
}

function png(size, framed) {
  const k = size / N;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const c = pixel(Math.floor(x / k), Math.floor(y / k), framed);
      c.forEach((v, i) => (raw[y * (size * 3 + 1) + 1 + x * 3 + i] = v));
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon-192.png'), png(192, true));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), png(512, true));
fs.writeFileSync(path.join(OUT, 'icon-maskable-512.png'), png(512, false));
console.log(`icons written to ${OUT}`);
