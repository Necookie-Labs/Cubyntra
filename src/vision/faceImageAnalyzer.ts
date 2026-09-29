/**
 * Cubyntra - Desktop Face Photo Analyzer
 * Necookie Labs (c) 2026
 *
 * Measures one face photo sent by the companion: samples the nine tiles, asks the ML
 * detector whether it is really a cube, and checks the center against the face the user
 * was asked to show. It deliberately does NOT commit to final sticker colors; those are
 * resolved later across all 54 stickers at once (see resolveCubeColors).
 */

import { CubeColor, Face } from '../cube/types';
import { CANONICAL_CENTER_COLORS, COLOR_TO_FACE, FACE_NAMES } from '../cube/constants';
import { sampleGridFromContext } from './sampling';
import { detectCubeInROISync } from './cubeDetector';
import { buildDynamicPalette, classifyWithDynamicPalette } from './dynamicCalibration';
import { RGBColor, StickerSample } from './types';
import { CubeDetectionResult } from './ml/types';

/**
 * How much closer (in delta-E) the center must be to another face's color before the
 * photo is rejected as the wrong face. Set high on purpose: a false rejection blocks the
 * user, whereas a subtle mix-up (red shown for orange) is caught later by comparing all
 * six centers against each other.
 */
const WRONG_FACE_MARGIN_DELTA_E = 15;

export interface FaceAnalysis {
  face: Face;
  /** Raw per-tile measurements (RGB and Lab), kept for global resolution. */
  samples: StickerSample[];
  detection: CubeDetectionResult;
  accepted: boolean;
  /** Plain-language fix when the photo needs retaking. */
  reason?: string;
  /** Provisional per-tile colors for immediate feedback; not the final answer. */
  previewColors: CubeColor[];
}

/**
 * Analyzes a face photo already drawn into a 2D context. The photo is expected to be the
 * phone's reticle crop, so the whole frame is the 3x3 grid.
 *
 * @param knownCenters center tiles of faces accepted so far, used to calibrate the palette
 */
export function analyzeFaceContext(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  face: Face,
  knownCenters: Partial<Record<Face, RGBColor>> = {}
): FaceAnalysis {
  const size = Math.min(width, height);
  const roi = { x: Math.round((width - size) / 2), y: Math.round((height - size) / 2), size };

  const samples = sampleGridFromContext(ctx, roi);
  const detection = detectCubeInROISync(ctx, roi, samples);

  // Calibrate against what we already know about this cube, plus this photo's own center.
  const palette = buildDynamicPalette({ ...knownCenters, [face]: samples[4].rgb });
  const previewColors = samples.map((s) => classifyWithDynamicPalette(s.rgb, palette).predictedColor);

  const base = { face, samples, detection, previewColors };

  if (!detection.isCube) {
    return {
      ...base,
      accepted: false,
      reason:
        detection.classification === 'face'
          ? 'Keep your hand out of the square and fill it with one face of the cube.'
          : 'Fill the square with one face of the cube.',
    };
  }

  const wrongFace = detectWrongFace(face, samples[4].rgb, knownCenters);
  if (wrongFace) {
    return {
      ...base,
      accepted: false,
      reason: `That looks like the ${FACE_NAMES[wrongFace]} face. Show the ${CANONICAL_CENTER_COLORS[face]}-center face.`,
    };
  }

  return { ...base, accepted: true };
}

/**
 * Returns the face the center tile actually belongs to when it is clearly not the expected
 * one. Judged against the uncalibrated palette plus other faces' observed centers, so this
 * photo cannot vouch for itself.
 */
function detectWrongFace(
  face: Face,
  centerRgb: RGBColor,
  knownCenters: Partial<Record<Face, RGBColor>>
): Face | null {
  const others = { ...knownCenters };
  delete others[face];
  const { distances } = classifyWithDynamicPalette(centerRgb, buildDynamicPalette(others));

  const expected = CANONICAL_CENTER_COLORS[face];
  let closest: CubeColor = expected;
  for (const color of Object.keys(distances) as CubeColor[]) {
    if (distances[color] < distances[closest]) closest = color;
  }

  return closest !== expected && distances[expected] - distances[closest] > WRONG_FACE_MARGIN_DELTA_E
    ? COLOR_TO_FACE[closest]
    : null;
}

/**
 * Browser entry point: decodes a JPEG data URL into an offscreen canvas and analyzes it.
 * Pixels stay in this tab; nothing here touches the network.
 */
export async function analyzeFaceImage(
  imageDataUrl: string,
  face: Face,
  knownCenters: Partial<Record<Face, RGBColor>> = {}
): Promise<FaceAnalysis> {
  const img = new Image();
  img.src = imageDataUrl;
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0);

  return analyzeFaceContext(ctx, canvas.width, canvas.height, face, knownCenters);
}
