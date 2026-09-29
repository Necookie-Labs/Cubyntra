/**
 * Cubyntra - Synthetic Cube Face Photos for Vision Tests
 *
 * Renders a tightly framed 3x3 face (black plastic seams, colored tiles) into an RGBA
 * buffer with controllable lighting, so the real sampling and ML code can be exercised
 * without a camera. Exposes the buffer through the one canvas method the vision code
 * uses, getImageData.
 */

import { CubeColor } from '../../src/cube/types';

/** Approximate sRGB of each sticker plastic as photographed under neutral light. */
export const PHOTOGRAPHED_RGB: Record<CubeColor, [number, number, number]> = {
  white: [226, 228, 222],
  yellow: [232, 204, 38],
  green: [18, 152, 74],
  blue: [22, 72, 176],
  red: [188, 24, 42],
  orange: [238, 98, 22],
};

export interface Lighting {
  /** Per-channel multiplier modelling color temperature, e.g. warm = [1.06, 1, 0.84]. */
  tint?: [number, number, number];
  /** Overall brightness multiplier. */
  gain?: number;
  /** Uniform per-pixel noise amplitude, in 0-255 units. */
  noise?: number;
  seed?: number;
}

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Renders one face. `overrides` replaces a sticker's base RGB, e.g. to place a tile
 * exactly between two colors.
 */
export function renderFace(
  stickers: CubeColor[],
  lighting: Lighting = {},
  overrides: Partial<Record<number, [number, number, number]>> = {},
  size = 512
): RgbaImage {
  const { tint = [1, 1, 1], gain = 1, noise = 0, seed = 7 } = lighting;
  const rand = rng(seed);
  const data = new Uint8ClampedArray(size * size * 4);
  const cell = size / 3;
  const seam = cell * 0.07;
  const SEAM_RGB: [number, number, number] = [18, 18, 20];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const col = Math.min(2, Math.floor(x / cell));
      const row = Math.min(2, Math.floor(y / cell));
      const lx = x - col * cell;
      const ly = y - row * cell;
      const onSeam = lx < seam || ly < seam || lx > cell - seam || ly > cell - seam;
      const index = row * 3 + col;
      const base = onSeam ? SEAM_RGB : overrides[index] ?? PHOTOGRAPHED_RGB[stickers[index]];

      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        data[o + c] = base[c] * tint[c] * gain + (rand() * 2 - 1) * noise;
      }
      data[o + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

/** Minimal CanvasRenderingContext2D stand-in backed by an RGBA buffer. */
export function contextFor(image: RgbaImage): CanvasRenderingContext2D {
  const getImageData = (sx: number, sy: number, sw: number, sh: number) => {
    const out = new Uint8ClampedArray(sw * sh * 4);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const ix = Math.min(image.width - 1, Math.max(0, sx + x));
        const iy = Math.min(image.height - 1, Math.max(0, sy + y));
        const src = (iy * image.width + ix) * 4;
        const dst = (y * sw + x) * 4;
        out[dst] = image.data[src];
        out[dst + 1] = image.data[src + 1];
        out[dst + 2] = image.data[src + 2];
        out[dst + 3] = image.data[src + 3];
      }
    }
    return { data: out, width: sw, height: sh, colorSpace: 'srgb' } as ImageData;
  };
  return { getImageData } as unknown as CanvasRenderingContext2D;
}

export function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t = 0.5
): [number, number, number] {
  return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as [number, number, number];
}
