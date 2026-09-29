/**
 * Cubyntra - Global 54-Sticker Color Resolution
 * Necookie Labs (c) 2026
 *
 * Final sticker colors are decided once, over the whole cube, never tile by tile:
 *
 * 1. Calibrate: the six center tiles are mechanically fixed, so their observed colors
 *    define this cube's palette under this lighting.
 * 2. Assign: every tile's distance to each calibrated color becomes a cost, and a
 *    minimum-cost assignment is solved subject to the physical invariant of exactly nine
 *    tiles per color. A tile that reads halfway between red and orange is settled by
 *    where the remaining red and orange slots are, not by a coin flip.
 * 3. Repair orientation: if the result is not a physically valid cube, try turning each
 *    photo by quarter turns, since a face shot in the wrong orientation is the most
 *    common way a correct reading still produces an impossible cube.
 * 4. Flag: tiles whose reading was close, or that the assignment overrode, are marked
 *    for the user to check before solving.
 */

import { CubeColor, CubeState, Face, FaceStickers, ValidationResult } from '../cube/types';
import { CANONICAL_CENTER_COLORS, COLORS, FACES } from '../cube/constants';
import { rotateFaceClockwise } from '../cube/transforms';
import { validateCubeState } from '../cube/validator';
import { buildDynamicPalette, classifyWithDynamicPalette } from './dynamicCalibration';
import { resolve54StickerInvariant, StickerCostProfile } from './invariantSolver';
import { colorDistanceDeltaE, rgbToLab } from './color';
import { RGBColor, StickerSample } from './types';

/** A tile whose best and second-best colors are this close (delta-E) is worth a look. */
const LOW_MARGIN_DELTA_E = 8;

/**
 * Two centers closer than this are almost certainly the same plastic, i.e. one face was
 * photographed twice. Distinct cube colors are typically 12+ apart even red vs orange.
 */
const DUPLICATE_CENTER_DELTA_E = 7;

export interface StickerFlag {
  /** Best and second-best candidate colors were nearly tied. */
  lowMargin: boolean;
  /** The nine-per-color constraint chose a different color than the tile's nearest match. */
  overridden: boolean;
}

export type QuarterTurnsCW = 1 | 2 | 3;

export interface ResolvedCube {
  state: CubeState;
  flags: Record<Face, StickerFlag[]>;
  flaggedCount: number;
  /** Photos that were turned to make the cube physically valid, in clockwise quarter turns. */
  rotatedFaces: Partial<Record<Face, QuarterTurnsCW>>;
  /** Two faces whose centers look identical: one of them was photographed twice. */
  duplicateCenters: [Face, Face] | null;
  validation: ValidationResult;
}

export function resolveCubeColors(samplesByFace: Record<Face, StickerSample[]>): ResolvedCube {
  const centers = {} as Record<Face, RGBColor>;
  for (const face of FACES) centers[face] = samplesByFace[face][4].rgb;

  const palette = buildDynamicPalette(centers);

  // Cost of each tile against each calibrated color, in FACES order (54 profiles).
  const profiles: StickerCostProfile[] = [];
  const greedy: CubeColor[] = [];
  const margins: number[] = [];
  for (const face of FACES) {
    samplesByFace[face].forEach((sample, i) => {
      const { distances, predictedColor } = classifyWithDynamicPalette(sample.rgb, palette);
      const sorted = COLORS.map((c) => distances[c]).sort((a, b) => a - b);
      const isCenter = i === 4;
      profiles.push({
        index: profiles.length,
        isCenter,
        fixedColor: isCenter ? CANONICAL_CENTER_COLORS[face] : undefined,
        costs: distances,
      });
      greedy.push(isCenter ? CANONICAL_CENTER_COLORS[face] : predictedColor);
      margins.push(sorted[1] - sorted[0]);
    });
  }

  const assigned = resolve54StickerInvariant(profiles);

  const state = {} as CubeState;
  const flags = {} as Record<Face, StickerFlag[]>;
  FACES.forEach((face, f) => {
    const offset = f * 9;
    state[face] = assigned.slice(offset, offset + 9) as FaceStickers;
    flags[face] = Array.from({ length: 9 }, (_, i) =>
      i === 4
        ? { lowMargin: false, overridden: false }
        : {
            lowMargin: margins[offset + i] < LOW_MARGIN_DELTA_E,
            overridden: assigned[offset + i] !== greedy[offset + i],
          }
    );
  });

  const repaired = repairOrientation(state, flags);

  return {
    ...repaired,
    flaggedCount: FACES.reduce(
      (n, face) => n + repaired.flags[face].filter((fl) => fl.lowMargin || fl.overridden).length,
      0
    ),
    duplicateCenters: findDuplicateCenters(centers),
  };
}

function findDuplicateCenters(centers: Record<Face, RGBColor>): [Face, Face] | null {
  let closest: [Face, Face] | null = null;
  let closestDistance = Infinity;
  for (let a = 0; a < FACES.length; a++) {
    for (let b = a + 1; b < FACES.length; b++) {
      const d = colorDistanceDeltaE(rgbToLab(centers[FACES[a]]), rgbToLab(centers[FACES[b]]));
      if (d < closestDistance) {
        closestDistance = d;
        closest = [FACES[a], FACES[b]];
      }
    }
  }
  return closestDistance < DUPLICATE_CENTER_DELTA_E ? closest : null;
}

function rotateStickers<T>(face: T[], turns: number): T[] {
  let out = face;
  for (let t = 0; t < turns; t++) out = rotateFaceClockwise(out as unknown as FaceStickers) as unknown as T[];
  return out;
}

/**
 * Orientation candidates ordered so the fewest photos are turned, preferring the top and
 * bottom faces (whose scan instructions are the easiest to follow in the wrong direction).
 */
function rotationCandidates(): number[][] {
  const combos: number[][] = [];
  for (let n = 0; n < 4 ** FACES.length; n++) {
    combos.push(FACES.map((_, f) => Math.floor(n / 4 ** f) % 4));
  }
  const rotated = (c: number[]) => c.filter((t) => t !== 0).length;
  const sidesRotated = (c: number[]) => FACES.filter((face, f) => c[f] !== 0 && face !== 'U' && face !== 'D').length;
  return combos.sort((a, b) => rotated(a) - rotated(b) || sidesRotated(a) - sidesRotated(b));
}

let cachedCandidates: number[][] | null = null;

function repairOrientation(
  state: CubeState,
  flags: Record<Face, StickerFlag[]>
): Pick<ResolvedCube, 'state' | 'flags' | 'rotatedFaces' | 'validation'> {
  const validation = validateCubeState(state);
  if (validation.valid) return { state, flags, rotatedFaces: {}, validation };

  cachedCandidates ??= rotationCandidates();
  for (const turns of cachedCandidates) {
    if (turns.every((t) => t === 0)) continue;

    const candidate = {} as CubeState;
    FACES.forEach((face, f) => {
      candidate[face] = rotateStickers(state[face], turns[f]) as FaceStickers;
    });

    const result = validateCubeState(candidate);
    if (!result.valid) continue;

    const rotatedFaces: Partial<Record<Face, QuarterTurnsCW>> = {};
    const rotatedFlags = {} as Record<Face, StickerFlag[]>;
    FACES.forEach((face, f) => {
      if (turns[f] !== 0) rotatedFaces[face] = turns[f] as QuarterTurnsCW;
      rotatedFlags[face] = rotateStickers(flags[face], turns[f]);
    });
    return { state: candidate, flags: rotatedFlags, rotatedFaces, validation: result };
  }

  // No orientation makes it valid: a tile is misread. Leave it to the review screen.
  return { state, flags, rotatedFaces: {}, validation };
}
