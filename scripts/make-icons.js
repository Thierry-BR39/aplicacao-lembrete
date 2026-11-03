'use strict';

/**
 * Gera os ícones do aplicativo (assets/icon.png, icon.ico e tray.png) sem
 * dependências externas: desenha um post-it laranja e grava PNG/ICO.
 *   npm run icons
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT = path.join(__dirname, '..', 'assets');
const ORANGE = [255, 106, 0];
const FOLD = [196, 78, 0];
const INK = [17, 17, 17];

function insideRoundedRect(u, v, margin, radius) {
  const lo = margin;
  const hi = 1 - margin;
  if (u < lo || u > hi || v < lo || v > hi) return false;
  const cx = Math.min(Math.max(u, lo + radius), hi - radius);
  const cy = Math.min(Math.max(v, lo + radius), hi - radius);
  return (u - cx) ** 2 + (v - cy) ** 2 <= radius ** 2;
}

function sample(u, v) {
  if (!insideRoundedRect(u, v, 0.06, 0.2)) return null;
  // canto dobrado, inferior direito
  if (u + v > 1.58 && u > 0.62 && v > 0.62) return u + v > 1.72 ? [0, 0, 0, 0] : FOLD;
  for (const y of [0.34, 0.5, 0.66]) {
    const end = y === 0.66 ? 0.55 : 0.74;
    if (v >= y - 0.04 && v <= y + 0.04 && u >= 0.26 && u <= end) return INK;
  }
  return ORANGE;
}

function render(size) {
  const ss = 3;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const c = sample((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
          if (c && c.length === 3) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
        }
      }
      const i = (y * size + x) * 4;
      if (a > 0) {
        px[i] = Math.round(r / a); px[i + 1] = Math.round(g / a); px[i + 2] = Math.round(b / a);
        px[i + 3] = Math.round((a / (ss * ss)) * 255);
      }
    }
  }
  return px;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const raw = render(size);
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    rows[y * (size * 4 + 1)] = 0;
    raw.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function ico(sizes) {
  const images = sizes.map((s) => ({ s, data: png(s) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ s, data }) => {
    const e = Buffer.alloc(16);
    e[0] = s >= 256 ? 0 : s; e[1] = s >= 256 ? 0 : s;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon.png'), png(256));
fs.writeFileSync(path.join(OUT, 'tray.png'), png(32));
fs.writeFileSync(path.join(OUT, 'icon.ico'), ico([16, 32, 48, 64, 128, 256]));
console.log('Ícones gerados em', OUT);
