/**
 * Cubyntra - Per-Student Color Palette
 * Necookie Labs (c) 2026
 *
 * The full scan measures all 54 stickers of the student's own cube and resolves their colors
 * (see resolveCubeColors). This module keeps what that scan learned: for each cube color, the
 * mean measured color and how much it varied. Checkpoint scans show only one or two faces, so
 * they cannot calibrate from six centers; they classify against this stored palette instead.
 *
 * A checkpoint is rarely lit exactly like the full scan. Before classifying a face, the nine
 * tiles are corrected with per-channel gains that map the observed center onto one palette
 * color; the center color whose correction makes the other eight tiles fit best is kept.
 */

import { CubeColor, CubeState, Face } from '../cube/types';
import { COLORS, FACES } from '../cube/constants';
import { classifyColor, colorDistanceDeltaE, rgbToLab } from './color';
import { LABColor, RGBColor } from './types';

export const PALETTE_VERSION = 1;

/** What the full scan learned about one cube color. */
export interface PaletteColor {
  /** Mean measured color, CIELAB. */
  lab: LABColor;
  /** Mean measured color, sRGB 0-255 (used to correct lighting). */
  rgb: RGBColor;
  /** Standard deviation along each CIELAB axis, never below `MIN_SPREAD`. */
  spread: LABColor;
  /** Number of stickers the mean is built from. */
  count: number;
}

/** Plain data: safe to store with `JSON.stringify` and read back with `parsePalette`. */
export interface StudentPalette {
  version: typeof PALETTE_VERSION;
  colors: Record<CubeColor, PaletteColor>;
}

/** One sticker classified for a checkpoint. */
export interface PaletteReading {
  color: CubeColor;
  /** 0..1: how well the tile fits `color` and how far it is from the runner-up. */
  confidence: number;
  /** Distance to `color` in spreads (1 = one standard deviation away). */
  distance: number;
  runnerUp: CubeColor;
}

/**
 * Floor for each spread. A clean scan gives nine nearly identical tiles per color; without a
 * floor the next photo's ordinary lighting change would look many deviations away.
 */
export const MIN_SPREAD: LABColor = { l: 6, a: 4, b: 4 };

/** A sticker further than this (delta-E) from its color's center tile is left out of the mean. */
const OUTLIER_DELTA_E = 30;

/** Up to this distance (in spreads) a tile counts as a full fit; the fit fades out after it. */
const FULL_FIT_DISTANCE = 4;
const NO_FIT_DISTANCE = 10;

/** Lighting correction: per-channel gains are kept inside these bounds. */
const MIN_GAIN = 0.5;
const MAX_GAIN = 2;
/** Keeps a gain finite and steady when a channel of the center is nearly black. */
const GAIN_OFFSET = 4;
/** Times the gains are re-fitted to all tiles that already sit near a palette color. */
const GAIN_REFINEMENTS = 2;
/** Cost of correcting, per squared log-gain: keeps the smallest correction among equal fits. */
const GAIN_PENALTY = 6;
/** One tile cannot add more than this to a correction's cost (glare, a finger). */
const TILE_COST_CAP = 6;

export interface PaletteScanSample {
  rgb: RGBColor;
}

function rotateClockwise<T>(tiles: readonly T[], turns: number): T[] {
  let out = [...tiles];
  for (let t = 0; t < turns; t++) {
    const p = out;
    out = [p[6], p[3], p[0], p[7], p[4], p[1], p[8], p[5], p[2]];
  }
  return out;
}

/**
 * Builds the palette from a full scan: the raw samples of each face and the resolved state.
 * `rotatedFaces` is what `resolveCubeColors` reports when it turned a photo to make the cube
 * valid; the samples are turned the same way so each one meets its resolved color.
 */
export function buildStudentPalette(
  samplesByFace: Record<Face, readonly PaletteScanSample[]>,
  resolved: { state: CubeState; rotatedFaces?: Partial<Record<Face, number>> }
): StudentPalette {
  const groups = Object.fromEntries(COLORS.map((c) => [c, [] as RGBColor[]])) as Record<CubeColor, RGBColor[]>;
  const anchors = {} as Record<CubeColor, LABColor>;

  for (const face of FACES) {
    if (samplesByFace[face].length !== 9) {
      throw new Error(`Face ${face} needs 9 samples, got ${samplesByFace[face].length}`);
    }
    const samples = rotateClockwise(samplesByFace[face], resolved.rotatedFaces?.[face] ?? 0);
    anchors[resolved.state[face][4]] = rgbToLab(samples[4].rgb);
    samples.forEach((sample, i) => groups[resolved.state[face][i]].push(sample.rgb));
  }

  const colors = {} as Record<CubeColor, PaletteColor>;
  for (const color of COLORS) {
    const anchor = anchors[color];
    if (!anchor) throw new Error(`The scan has no ${color} center`);
    const kept = groups[color].filter((rgb) => colorDistanceDeltaE(rgbToLab(rgb), anchor) <= OUTLIER_DELTA_E);
    colors[color] = summarize(kept);
  }
  return { version: PALETTE_VERSION, colors };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function summarize(rgbs: RGBColor[]): PaletteColor {
  const n = rgbs.length;
  const labs = rgbs.map(rgbToLab);
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / n;
  const deviation = (values: number[], m: number) => Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
  const axis = (key: keyof LABColor) => {
    const values = labs.map((lab) => lab[key]);
    const m = mean(values);
    return { mean: round1(m), spread: round1(Math.max(MIN_SPREAD[key], deviation(values, m))) };
  };
  const l = axis('l');
  const a = axis('a');
  const b = axis('b');
  return {
    lab: { l: l.mean, a: a.mean, b: b.mean },
    rgb: {
      r: Math.round(mean(rgbs.map((c) => c.r))),
      g: Math.round(mean(rgbs.map((c) => c.g))),
      b: Math.round(mean(rgbs.map((c) => c.b))),
    },
    spread: { l: l.spread, a: a.spread, b: b.spread },
    count: n,
  };
}

export function serializePalette(palette: StudentPalette): string {
  return JSON.stringify(palette);
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Reads a stored palette (JSON text or the parsed value). Returns null for anything malformed. */
export function parsePalette(input: unknown): StudentPalette | null {
  let value = input;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!isRecord(value) || value.version !== PALETTE_VERSION || !isRecord(value.colors)) return null;

  const triple = (v: unknown, keys: readonly string[]): number[] | null => {
    if (!isRecord(v)) return null;
    const numbers = keys.map((k) => v[k]);
    return numbers.every(isNumber) ? (numbers as number[]) : null;
  };

  const colors = {} as Record<CubeColor, PaletteColor>;
  for (const color of COLORS) {
    const entry = value.colors[color];
    if (!isRecord(entry)) return null;
    const lab = triple(entry.lab, ['l', 'a', 'b']);
    const rgb = triple(entry.rgb, ['r', 'g', 'b']);
    const spread = triple(entry.spread, ['l', 'a', 'b']);
    const count = entry.count;
    if (!lab || !rgb || !spread || !isNumber(count) || count < 1) return null;
    if (spread.some((s) => s <= 0)) return null;
    colors[color] = {
      lab: { l: lab[0], a: lab[1], b: lab[2] },
      rgb: { r: rgb[0], g: rgb[1], b: rgb[2] },
      spread: { l: spread[0], a: spread[1], b: spread[2] },
      count,
    };
  }
  return { version: PALETTE_VERSION, colors };
}

/** Distance from a color to a palette entry, in spreads along each CIELAB axis. */
export function paletteDistance(lab: LABColor, entry: PaletteColor): number {
  const dl = (lab.l - entry.lab.l) / entry.spread.l;
  const da = (lab.a - entry.lab.a) / entry.spread.a;
  const db = (lab.b - entry.lab.b) / entry.spread.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

/** Classifies one measured color against the palette, with no lighting correction. */
export function classifyWithPalette(rgb: RGBColor, palette: StudentPalette): PaletteReading {
  const lab = rgbToLab(rgb);
  const ranked = COLORS.map((color) => ({ color, distance: paletteDistance(lab, palette.colors[color]) })).sort(
    (x, y) => x.distance - y.distance
  );
  const [best, second] = ranked;
  const margin = second.distance > 0 ? 1 - best.distance / second.distance : 0;
  const fit =
    best.distance <= FULL_FIT_DISTANCE
      ? 1
      : Math.max(0, 1 - (best.distance - FULL_FIT_DISTANCE) / (NO_FIT_DISTANCE - FULL_FIT_DISTANCE));
  return {
    color: best.color,
    confidence: Math.round(Math.max(0, Math.min(1, margin * fit)) * 100) / 100,
    distance: round1(best.distance),
    runnerUp: second.color,
  };
}

type Gains = [number, number, number];

const IDENTITY: Gains = [1, 1, 1];

const clampGain = (g: number) => Math.max(MIN_GAIN, Math.min(MAX_GAIN, g));

function applyGains(rgb: RGBColor, gains: Gains): RGBColor {
  return {
    r: Math.min(255, rgb.r * gains[0]),
    g: Math.min(255, rgb.g * gains[1]),
    b: Math.min(255, rgb.b * gains[2]),
  };
}

function gainsTo(target: RGBColor, observed: RGBColor): Gains {
  const gain = (t: number, o: number) => clampGain((t + GAIN_OFFSET) / (o + GAIN_OFFSET));
  return [gain(target.r, observed.r), gain(target.g, observed.g), gain(target.b, observed.b)];
}

/**
 * Least-squares gains taking each tile onto the palette color it was read as. Tiles that fit
 * nothing (glare, a finger) are left out; the center always counts, as `centerColor`.
 */
function refitGains(
  rgbs: readonly RGBColor[],
  readings: readonly PaletteReading[],
  centerColor: CubeColor,
  palette: StudentPalette
): Gains {
  const top = [0, 0, 0];
  const bottom = [0, 0, 0];
  rgbs.forEach((rgb, i) => {
    if (i !== 4 && readings[i].distance > TILE_COST_CAP) return;
    const target = palette.colors[i === 4 ? centerColor : readings[i].color].rgb;
    const observed = [rgb.r, rgb.g, rgb.b];
    [target.r, target.g, target.b].forEach((t, c) => {
      top[c] += (t + GAIN_OFFSET) * (observed[c] + GAIN_OFFSET);
      bottom[c] += (observed[c] + GAIN_OFFSET) ** 2;
    });
  });
  return [clampGain(top[0] / bottom[0]), clampGain(top[1] / bottom[1]), clampGain(top[2] / bottom[2])];
}

/**
 * Classifies the nine tiles of one face (row-major, index 4 = center) against the palette,
 * correcting for the lighting of this photo. Seven corrections are tried: none, and one per
 * cube color that maps the observed center onto that color, each then re-fitted to all the
 * tiles it explains. The one under which the other eight tiles sit closest to palette colors
 * wins, with a small cost for correcting at all.
 */
export function classifyFaceWithPalette(rgbs: readonly RGBColor[], palette: StudentPalette): PaletteReading[] {
  if (rgbs.length !== 9) throw new Error(`A face has 9 tiles, got ${rgbs.length}`);

  const read = (gains: Gains) => rgbs.map((rgb) => classifyWithPalette(applyGains(rgb, gains), palette));
  const attempt = (start: Gains, centerColor?: CubeColor) => {
    let gains = start;
    let readings = read(gains);
    if (centerColor) {
      for (let round = 0; round < GAIN_REFINEMENTS; round++) {
        gains = refitGains(rgbs, readings, centerColor, palette);
        readings = read(gains);
      }
    }
    const fit = readings.reduce((sum, r, i) => (i === 4 ? sum : sum + Math.min(r.distance, TILE_COST_CAP)), 0);
    const correction = gains.reduce((sum, g) => sum + Math.log(g) ** 2, 0);
    return { readings, cost: fit + GAIN_PENALTY * correction };
  };

  const plain = attempt(IDENTITY);
  const attempts = [
    plain,
    ...COLORS.map((color) => attempt(gainsTo(palette.colors[color].rgb, rgbs[4]), color)),
  ];
  let best = plain;
  for (const candidate of attempts) {
    if (candidate.cost < best.cost) best = candidate;
  }
  let bestOther = Infinity; // cheapest attempt that names a different center color than `best`
  for (const candidate of attempts) {
    if (candidate.readings[4].color !== best.readings[4].color) bestOther = Math.min(bestOther, candidate.cost);
  }

  // A corrected center sits on its color by construction, so its own distance says nothing.
  // Trust it by how much worse the rest of the face fits under any other center color, or by
  // the uncorrected reading when that agrees.
  const gap = Math.max(0, Math.min(1, (bestOther - best.cost) / 8));
  const agreed = plain.readings[4].color === best.readings[4].color ? plain.readings[4].confidence : 0;
  const readings = best.readings.map((r) => ({ ...r }));
  readings[4].confidence = Math.round(Math.max(gap, agreed) * 100) / 100;
  return readings;
}

/**
 * Classifies a face with the student's palette, or with the static classifier when no full
 * scan has stored one yet. Static readings the classifier rejects as non-cube get confidence 0.
 */
export function classifyFace(rgbs: readonly RGBColor[], palette?: StudentPalette | null): PaletteReading[] {
  if (palette) return classifyFaceWithPalette(rgbs, palette);
  return rgbs.map((rgb) => {
    const result = classifyColor(rgb);
    const runnerUp = COLORS.filter((c) => c !== result.color).sort((x, y) => result.scores[y] - result.scores[x])[0];
    return {
      color: result.color,
      confidence: result.isCubeColor ? result.confidence : 0,
      distance: round1(Math.max(0, 100 - result.scores[result.color]) / 10),
      runnerUp,
    };
  });
}
