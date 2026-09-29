/**
 * Cubyntra - Live Capture Quality Checks
 * Necookie Labs (c) 2026
 *
 * Judges a live camera frame before a face photo is taken, so the phone can tell the user
 * exactly what to fix and fire the shutter by itself once everything holds. Every check
 * is a pure function of the sampled frame.
 */

import { CubeColor, Face } from '../cube/types';
import { CANONICAL_CENTER_COLORS, COLOR_TO_FACE } from '../cube/constants';
import { colorDistanceDeltaE } from './color';
import { ROIBounds, StickerSample } from './types';
import { CubeDetectionResult } from './ml/types';

export type QualityCheckId = 'framing' | 'face' | 'exposure' | 'glare' | 'steady';

export interface QualityCheck {
  id: QualityCheckId;
  ok: boolean;
  /** What the user should do, when not ok. */
  hint?: string;
}

export interface CaptureQuality {
  checks: QualityCheck[];
  ready: boolean;
  /** The single most important fix, in priority order, or null when ready. */
  topHint: string | null;
}

/** A pixel this bright in every channel is clipped: a reflection, not sticker color. */
const CLIPPED = 252;
/** Share of a tile's pixels that must be clipped before it counts as glare. */
const GLARE_FRACTION = 0.08;
/** Mean Lab lightness below this is too dark to separate red from orange reliably. */
const MIN_MEAN_LIGHTNESS = 28;
/** Mean per-tile color change between frames (delta-E) under which the cube counts as still. */
const STEADY_DELTA_E = 6;
/** How sure the phone must be that the center is another face before saying so. */
const WRONG_FACE_CONFIDENCE = 0.6;

const FACE_WORD: Record<Face, string> = {
  U: 'top',
  D: 'bottom',
  F: 'front',
  B: 'back',
  R: 'right',
  L: 'left',
};

const ROW_WORD = ['top row', 'middle row', 'bottom row'];

/**
 * Share of clipped pixels in the central patch of each of the nine tiles, read from the
 * same region the photo will be cropped to.
 */
export function measureGlare(ctx: CanvasRenderingContext2D, roi: ROIBounds, patchRatio = 0.5): number[] {
  const cell = roi.size / 3;
  const patch = Math.max(4, Math.round(cell * patchRatio));
  const fractions: number[] = [];

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x = Math.round(roi.x + col * cell + (cell - patch) / 2);
      const y = Math.round(roi.y + row * cell + (cell - patch) / 2);
      const { data } = ctx.getImageData(x, y, patch, patch);
      let clipped = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] >= CLIPPED && data[i + 1] >= CLIPPED && data[i + 2] >= CLIPPED) clipped++;
      }
      fractions.push(clipped / (data.length / 4));
    }
  }
  return fractions;
}

export interface CaptureQualityInput {
  samples: StickerSample[];
  detection: CubeDetectionResult;
  expectedFace: Face;
  glareByTile: number[];
  /** Samples from the previous live frame, to judge whether the cube is being held still. */
  previousSamples?: StickerSample[] | null;
}

export function assessCaptureQuality({
  samples,
  detection,
  expectedFace,
  glareByTile,
  previousSamples,
}: CaptureQualityInput): CaptureQuality {
  const expectedColor = CANONICAL_CENTER_COLORS[expectedFace];

  // 1. Framing: is there a cube filling the square at all?
  const framing: QualityCheck = detection.isCube
    ? { id: 'framing', ok: true }
    : {
        id: 'framing',
        ok: false,
        hint:
          detection.classification === 'face'
            ? 'Keep your fingers out of the square.'
            : 'Fill the square with one face of the cube.',
      };

  // 2. Right face: the center tile never moves, so it identifies the face.
  const center = samples[4];
  const seenColor: CubeColor = center.predictedColor;
  const wrongFace =
    framing.ok && seenColor !== expectedColor && center.confidence >= WRONG_FACE_CONFIDENCE;
  const face: QualityCheck = wrongFace
    ? {
        id: 'face',
        ok: false,
        hint: `That's the ${FACE_WORD[COLOR_TO_FACE[seenColor]]} face. Show the ${expectedColor} center.`,
      }
    : { id: 'face', ok: true };

  // 3. Exposure: too dark and warm colors collapse together.
  const meanL = samples.reduce((sum, s) => sum + s.lab.l, 0) / samples.length;
  const exposure: QualityCheck =
    meanL < MIN_MEAN_LIGHTNESS
      ? { id: 'exposure', ok: false, hint: 'Too dark. Turn on the flash or move into brighter light.' }
      : { id: 'exposure', ok: true };

  // 4. Glare: a reflection hides a tile's real color.
  const glareTile = glareByTile.findIndex((f) => f > GLARE_FRACTION);
  const glare: QualityCheck =
    glareTile === -1
      ? { id: 'glare', ok: true }
      : {
          id: 'glare',
          ok: false,
          hint: `Glare on the ${ROW_WORD[Math.floor(glareTile / 3)]}. Tilt the cube slightly.`,
        };

  // 5. Steady: colors barely changed since the last frame.
  let steady: QualityCheck = { id: 'steady', ok: true };
  if (previousSamples && previousSamples.length === samples.length) {
    const drift =
      samples.reduce((sum, s, i) => sum + colorDistanceDeltaE(s.lab, previousSamples[i].lab), 0) / samples.length;
    if (drift > STEADY_DELTA_E) steady = { id: 'steady', ok: false, hint: 'Hold still.' };
  } else {
    steady = { id: 'steady', ok: false, hint: 'Hold still.' };
  }

  const checks = [framing, face, exposure, glare, steady];
  const failing = checks.find((c) => !c.ok);
  return { checks, ready: !failing, topHint: failing?.hint ?? null };
}
