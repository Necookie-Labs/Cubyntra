/**
 * Cubyntra - Photo-to-State Accuracy Tests
 * Necookie Labs (c) 2026
 *
 * Renders all six faces of a known scramble as synthetic photos, each under different
 * lighting, pushes them through the real desktop pipeline, and requires the exact
 * scrambled state back.
 */

import { describe, it, expect } from 'vitest';
import { CubeState, Face } from '../src/cube/types';
import { FACES, createSolvedCubeState } from '../src/cube/constants';
import { applyMoves, parseAlgorithm, rotateFaceClockwise } from '../src/cube/transforms';
import { analyzeFaceContext } from '../src/vision/faceImageAnalyzer';
import { resolveCubeColors } from '../src/vision/resolveCubeColors';
import { RGBColor, StickerSample } from '../src/vision/types';
import { buildDynamicPalette, classifyWithDynamicPalette } from '../src/vision/dynamicCalibration';
import { Lighting, PHOTOGRAPHED_RGB, contextFor, mixRgb, renderFace } from './helpers/syntheticCube';

const SCRAMBLE = "R U R' U' F2 D L' B R2 U2 F' L D' B2";

// Each face is shot under different light, as happens when a user turns the cube under a lamp.
const LIGHTING: Record<Face, Lighting> = {
  U: { noise: 8, seed: 1 },
  R: { tint: [1.05, 1.0, 0.88], noise: 8, seed: 2 },
  F: { gain: 0.8, noise: 8, seed: 3 },
  D: { tint: [0.95, 1.0, 1.06], noise: 8, seed: 4 },
  L: { gain: 1.08, noise: 8, seed: 5 },
  B: { tint: [1.03, 1.0, 0.94], gain: 0.9, noise: 8, seed: 6 },
};

type Overrides = Partial<Record<Face, Partial<Record<number, [number, number, number]>>>>;

/** Photographs every face of `truth` and runs the per-face analyzer in scan order. */
function photographAndAnalyze(
  truth: CubeState,
  { overrides = {}, shoot = (f: Face) => truth[f] }: { overrides?: Overrides; shoot?: (f: Face) => CubeState[Face] } = {}
): Record<Face, StickerSample[]> {
  const known: Partial<Record<Face, RGBColor>> = {};
  const samples = {} as Record<Face, StickerSample[]>;
  for (const face of FACES) {
    const image = renderFace(shoot(face), LIGHTING[face], overrides[face]);
    const analysis = analyzeFaceContext(contextFor(image), image.width, image.height, face, known);
    expect(analysis.accepted, `${face}: ${analysis.reason}`).toBe(true);
    known[face] = analysis.samples[4].rgb;
    samples[face] = analysis.samples;
  }
  return samples;
}

function lit(rgb: readonly number[], lighting: Lighting): RGBColor {
  const [r, g, b] = rgb.map((v, i) => v * (lighting.tint?.[i] ?? 1) * (lighting.gain ?? 1));
  return { r, g, b };
}

/**
 * The red/orange mix that the calibrated palette finds equidistant from both, when shot
 * under `face`'s lighting. Halfway in RGB is not halfway in Lab, so this is searched
 * with the same palette the resolver builds.
 */
function coinFlipRedOrange(face: Face): [number, number, number] {
  const palette = buildDynamicPalette({
    R: lit(PHOTOGRAPHED_RGB.red, LIGHTING.R),
    L: lit(PHOTOGRAPHED_RGB.orange, LIGHTING.L),
  });
  let best: [number, number, number] = PHOTOGRAPHED_RGB.red;
  let bestMargin = Infinity;
  for (let t = 0; t <= 1; t += 0.005) {
    const mix = mixRgb(PHOTOGRAPHED_RGB.red, PHOTOGRAPHED_RGB.orange, t);
    const { distances } = classifyWithDynamicPalette(lit(mix, LIGHTING[face]), palette);
    const margin = Math.abs(distances.red - distances.orange);
    if (margin < bestMargin) {
      bestMargin = margin;
      best = mix;
    }
  }
  return best;
}

describe('resolveCubeColors', () => {
  const truth = applyMoves(createSolvedCubeState(), parseAlgorithm(SCRAMBLE));

  it('recovers a scrambled cube exactly from six differently lit photos', () => {
    const resolved = resolveCubeColors(photographAndAnalyze(truth));
    expect(resolved.state).toEqual(truth);
    expect(resolved.validation.valid).toBe(true);
    expect(resolved.rotatedFaces).toEqual({});
    expect(resolved.duplicateCenters).toBeNull();
  });

  it('settles a tile the palette cannot tell apart by the nine-per-color rule, and flags it', () => {
    const face = FACES.find((f) => truth[f].some((c, i) => c === 'red' && i !== 4))!;
    const index = truth[face].findIndex((c, i) => c === 'red' && i !== 4);
    const ambiguous = coinFlipRedOrange(face);

    const resolved = resolveCubeColors(photographAndAnalyze(truth, { overrides: { [face]: { [index]: ambiguous } } }));

    // The reading alone is a coin flip; the count of remaining red and orange slots decides it.
    expect(resolved.state).toEqual(truth);
    expect(resolved.flags[face][index].lowMargin).toBe(true);
    expect(resolved.flaggedCount).toBeGreaterThan(0);
  });

  it('turns back a face that was photographed rotated', () => {
    // The user holds the bottom face with the wrong edge on top: the photo is a quarter turn off.
    const resolved = resolveCubeColors(
      photographAndAnalyze(truth, { shoot: (f) => (f === 'D' ? rotateFaceClockwise(truth.D) : truth[f]) })
    );

    expect(resolved.state).toEqual(truth);
    expect(resolved.validation.valid).toBe(true);
    expect(resolved.rotatedFaces).toEqual({ D: 3 });
  });

  it('reports two faces that were photographed as the same face', () => {
    // Shooting the Left face again when asked for the Right face: two orange centers.
    const samples = photographAndAnalyze(truth);
    samples.R = samples.L;
    const resolved = resolveCubeColors(samples);
    expect(resolved.duplicateCenters).toEqual(['R', 'L']);
    expect(resolved.validation.valid).toBe(false);
  });

  it('never returns an impossible color count', () => {
    const resolved = resolveCubeColors(photographAndAnalyze(truth));
    const counts: Record<string, number> = {};
    for (const face of FACES) for (const c of resolved.state[face]) counts[c] = (counts[c] ?? 0) + 1;
    expect(Object.values(counts)).toEqual([9, 9, 9, 9, 9, 9]);
  });
});
