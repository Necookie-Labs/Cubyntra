/**
 * Cubyntra - Checkpoint Face Reading
 * Necookie Labs (c) 2026
 *
 * Reads one face shown for a checkpoint: the same nine-tile sampling as the full scan, then
 * classification against the student's palette. A tile hidden by glare gets confidence 0 so
 * the checkpoint asks to see the face again instead of guessing. Pixels stay in this tab.
 */

import { measureGlare } from './captureQuality';
import { classifyFace, PaletteReading, StudentPalette } from './palette';
import { sampleGridFromContext } from './sampling';
import { StickerSample } from './types';

/** Above this share of clipped pixels a tile's measured color cannot be trusted. */
export const GLARE_REJECT_FRACTION = 0.2;

export interface FaceReading {
  /** Nine classified tiles, row-major; `color` and `confidence` are what the checkpoint needs. */
  stickers: PaletteReading[];
  samples: StickerSample[];
  /** Share of clipped pixels in each tile. */
  glare: number[];
  /** False when no palette was stored and the static classifier was used. */
  usedPalette: boolean;
}

/**
 * Reads a face already drawn into a 2D context. The photo is expected to be the reticle crop,
 * so the centered square of the frame is the 3x3 grid.
 */
export function readFaceFromContext(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette?: StudentPalette | null
): FaceReading {
  const size = Math.min(width, height);
  const roi = { x: Math.round((width - size) / 2), y: Math.round((height - size) / 2), size };

  const samples = sampleGridFromContext(ctx, roi);
  const glare = measureGlare(ctx, roi);
  const stickers = classifyFace(
    samples.map((s) => s.rgb),
    palette
  ).map((reading, i) => (glare[i] > GLARE_REJECT_FRACTION ? { ...reading, confidence: 0 } : reading));

  return { stickers, samples, glare, usedPalette: Boolean(palette) };
}
