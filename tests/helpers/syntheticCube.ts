/**
 * Cubyntra - Synthetic Cube Face Photos for Vision Tests
 *
 * Renders a tightly framed 3x3 face (black plastic seams, colored tiles) into an RGBA
 * buffer with controllable lighting, so the real sampling and ML code can be exercised
 * without a camera. Exposes the buffer through the one canvas method the vision code
 * uses, getImageData.
 */

import { CubeColor, CubeState, Face } from '../../src/cube/types';
import { FACES } from '../../src/cube/constants';
import { sampleGridFromContext } from '../../src/vision/sampling';
import { StickerSample } from '../../src/vision/types';

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

type Rgb = [number, number, number];

const SEAM_RGB: Rgb = [18, 18, 20];
const GLARE_RGB: Rgb = [255, 255, 255];

/** Renders nine tiles given their base RGB. Tiles listed in `glare` are blown out to white. */
function renderTiles(bases: Rgb[], lighting: Lighting, size: number, glare: readonly number[] = []): RgbaImage {
  const { tint = [1, 1, 1], gain = 1, noise = 0, seed = 7 } = lighting;
  const rand = rng(seed);
  const data = new Uint8ClampedArray(size * size * 4);
  const cell = size / 3;
  const seam = cell * 0.07;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const col = Math.min(2, Math.floor(x / cell));
      const row = Math.min(2, Math.floor(y / cell));
      const lx = x - col * cell;
      const ly = y - row * cell;
      const onSeam = lx < seam || ly < seam || lx > cell - seam || ly > cell - seam;
      const index = row * 3 + col;
      const clipped = !onSeam && glare.includes(index);
      const base = onSeam ? SEAM_RGB : clipped ? GLARE_RGB : bases[index];

      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        // A clipped sensor reads full white whatever the light's color.
        data[o + c] = clipped ? 255 : base[c] * tint[c] * gain + (rand() * 2 - 1) * noise;
      }
      data[o + 3] = 255;
    }
  }
  return { width: size, height: size, data };
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
  return renderTiles(
    stickers.map((color, index) => overrides[index] ?? PHOTOGRAPHED_RGB[color]),
    lighting,
    size
  );
}

/** Sticker plastics of a cube whose shades differ from the reference set (a faded, cheaper cube). */
export const FADED_PLASTICS: Record<CubeColor, [number, number, number]> = {
  white: [214, 214, 204],
  yellow: [214, 196, 62],
  green: [44, 150, 92],
  blue: [40, 84, 160],
  red: [176, 40, 48],
  orange: [222, 112, 40],
};

export interface CubeFaceOptions {
  lighting?: Lighting;
  /** This student's sticker shades; defaults to `PHOTOGRAPHED_RGB`. */
  plastics?: Record<CubeColor, [number, number, number]>;
  /** Tile indexes hidden by glare (rendered as clipped white). */
  glare?: readonly number[];
  size?: number;
}

/** Renders one face of a cube state, as the camera would see it from outside that face. */
export function renderCubeFace(state: CubeState, face: Face, options: CubeFaceOptions = {}): RgbaImage {
  const { lighting = {}, plastics = PHOTOGRAPHED_RGB, glare = [], size = 96 } = options;
  return renderTiles(
    state[face].map((color) => plastics[color]),
    lighting,
    size,
    glare
  );
}

/** Samples the nine tiles of a rendered face with the real sampling code. */
export function sampleImage(image: RgbaImage): StickerSample[] {
  return sampleGridFromContext(contextFor(image), { x: 0, y: 0, size: image.width });
}

/** The raw samples of a full six-face scan of `state`, all under one lighting. */
export function scanSamples(state: CubeState, options: CubeFaceOptions = {}): Record<Face, StickerSample[]> {
  const samples = {} as Record<Face, StickerSample[]>;
  FACES.forEach((face, i) => {
    const lighting = { ...options.lighting, seed: (options.lighting?.seed ?? 7) + i };
    samples[face] = sampleImage(renderCubeFace(state, face, { ...options, lighting }));
  });
  return samples;
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
