/**
 * Cubyntra - Face readings as sync messages
 * Necookie Labs (c) 2026
 *
 * The phone reads a face itself and sends nine colors, nine confidences and the nine tile means.
 * The laptop turns those back into tile samples so its nine-per-color resolution
 * (`resolveCubeColors`) works exactly as for a webcam scan. No pixels are involved.
 */

import { CubeColor, Face } from '../cube/types';
import { rgbToHsv, rgbToLab } from '../vision/color';
import { StickerSample } from '../vision/types';
import { FaceScannedPayload, TileRgb } from './types';

const clampByte = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
const clampUnit = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Phone side: the message for one face read from its nine tile samples. */
export function faceScannedFromSamples(
  face: Face,
  samples: StickerSample[],
  colors: CubeColor[],
  capturedAt = Date.now()
): FaceScannedPayload {
  return {
    face,
    colors: colors.slice(0, 9),
    confidences: samples.map((s) => clampUnit(s.confidence)),
    tileRgb: samples.map((s): TileRgb => [clampByte(s.rgb.r), clampByte(s.rgb.g), clampByte(s.rgb.b)]),
    capturedAt,
  };
}

/** Laptop side: tile samples rebuilt from a face message. */
export function samplesFromFaceScanned(payload: FaceScannedPayload): StickerSample[] {
  return payload.tileRgb.map(([r, g, b], index) => {
    const rgb = { r, g, b };
    const predictedColor = payload.colors[index];
    const confidence = payload.confidences[index];
    return {
      row: Math.floor(index / 3),
      col: index % 3,
      index,
      rgb,
      hsv: rgbToHsv(rgb),
      lab: rgbToLab(rgb),
      predictedColor,
      confidence,
      colorScores: { white: 0, yellow: 0, green: 0, blue: 0, red: 0, orange: 0, [predictedColor]: confidence },
    };
  });
}
