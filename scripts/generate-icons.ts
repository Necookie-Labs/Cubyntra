/**
 * Cubyntra - App icon generator
 * Necookie Labs (c) 2026
 *
 * Draws the app icon, a flat voxel cube in the twin's default view (white top, green front, red
 * right, one flat tone per face), on the mint ground, and writes PNGs to public/icons/. No
 * canvas or image library: pixels are rasterized here (4x4 supersampling for clean edges) and
 * encoded with node:zlib. Colors come from src/lib/tokens.ts.
 *
 *   npx tsx scripts/generate-icons.ts
 *
 * The PNGs are committed; run this again only when the icon or the tokens change.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { APP_CHROME_HEX, STICKER_CORE_HEX, STICKER_HEX } from '../src/lib/tokens';

type RGB = [number, number, number];

const hex = (value: string): RGB => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as RGB;
const shade = (c: RGB, k: number): RGB => c.map((v) => Math.round(v * k)) as RGB;

const GROUND = hex(APP_CHROME_HEX.light.ground);
const CORE = hex(STICKER_CORE_HEX);

/** Same idea as the twin's light rig: top lightest, front a step darker, side darker again. */
const FACES: Array<{ color: RGB; tone: number }> = [
  { color: hex(STICKER_HEX.white), tone: 1 },
  { color: hex(STICKER_HEX.green), tone: 0.86 },
  { color: hex(STICKER_HEX.red), tone: 0.72 },
];

/** Share of a cell taken by the dark gap around each sticker. */
const GAP = 0.09;

interface Parallelogram {
  origin: [number, number];
  e1: [number, number];
  e2: [number, number];
}

/** The three visible faces of an isometric cube centred at (cx, cy) with edge `s`. */
function cubeFaces(cx: number, cy: number, s: number): Parallelogram[] {
  const dx = s * Math.cos(Math.PI / 6);
  const dy = s / 2;
  return [
    // Top: from the back corner, along the two upper edges.
    { origin: [cx, cy - s], e1: [dx, dy], e2: [-dx, dy] },
    // Front-left: from the left corner, right-down to the centre, then down.
    { origin: [cx - dx, cy - dy], e1: [dx, dy], e2: [0, s] },
    // Right: from the centre, right-up, then down.
    { origin: [cx, cy], e1: [dx, -dy], e2: [0, s] },
  ];
}

/** Color at a point, or null outside the cube. */
function sample(x: number, y: number, faces: Parallelogram[]): RGB | null {
  for (let f = 0; f < faces.length; f++) {
    const { origin, e1, e2 } = faces[f];
    const px = x - origin[0];
    const py = y - origin[1];
    const det = e1[0] * e2[1] - e1[1] * e2[0];
    const u = (px * e2[1] - py * e2[0]) / det;
    const v = (e1[0] * py - e1[1] * px) / det;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    const cu = (u * 3) % 1;
    const cv = (v * 3) % 1;
    const inGap = cu < GAP || cu > 1 - GAP || cv < GAP || cv > 1 - GAP;
    return inGap ? CORE : shade(FACES[f].color, FACES[f].tone);
  }
  return null;
}

/** RGB pixels of one icon. `scale` is the cube's height as a share of the icon. */
export function renderIcon(size: number, scale: number): Uint8Array {
  const s = (size * scale) / 2;
  const faces = cubeFaces(size / 2, size / 2, s);
  const out = new Uint8Array(size * size * 3);
  const n = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const c = sample(x + (sx + 0.5) / n, y + (sy + 0.5) / n, faces) ?? GROUND;
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const i = (y * size + x) * 3;
      out[i] = Math.round(r / (n * n));
      out[i + 1] = Math.round(g / (n * n));
      out[i + 2] = Math.round(b / (n * n));
    }
  }
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An 8-bit RGB PNG (color type 2). */
export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (width * 3 + 1)] = 0; // filter: none
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(rows, y * (width * 3 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ]);
}

/** Every icon the manifest and the layout reference. Maskable icons keep the cube in the safe zone. */
export const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 0.7 },
  { file: 'icon-512.png', size: 512, scale: 0.7 },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.5 },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.66 },
] as const;

function main(): void {
  const dir = path.join(process.cwd(), 'public', 'icons');
  fs.mkdirSync(dir, { recursive: true });
  for (const icon of ICONS) {
    const png = encodePng(icon.size, icon.size, renderIcon(icon.size, icon.scale));
    fs.writeFileSync(path.join(dir, icon.file), png);
    console.log(`public/icons/${icon.file}  ${icon.size}x${icon.size}  ${png.length} bytes`);
  }
}

if (process.argv[1] && /generate-icons/.test(process.argv[1])) main();
