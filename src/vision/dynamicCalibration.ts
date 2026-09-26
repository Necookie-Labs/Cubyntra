/**
 * Cubyntra - Dynamic Center-Sticker Calibration Engine
 * Necookie Labs (c) 2026
 *
 * Calibrates color classification to the specific physical cube and ambient lighting
 * by using the mechanically fixed center stickers as the optical ground truth.
 */

import { CubeColor, Face } from '../cube/types';
import { CANONICAL_CENTER_COLORS, COLORS } from '../cube/constants';
import { RGBColor, LABColor } from './types';
import { rgbToLab, colorDistanceDeltaE, DATASET_REFERENCE_LAB } from './color';

export type DynamicCubePalette = Record<CubeColor, LABColor>;

/**
 * Extracts and compiles an adaptive CIELAB color palette from observed center stickers.
 */
export function buildDynamicPalette(
  observedCenters: Partial<Record<Face, RGBColor>>
): DynamicCubePalette {
  const palette: DynamicCubePalette = { ...DATASET_REFERENCE_LAB };

  for (const [face, rgb] of Object.entries(observedCenters) as [Face, RGBColor][]) {
    if (rgb) {
      const canonicalColor = CANONICAL_CENTER_COLORS[face];
      if (canonicalColor) {
        palette[canonicalColor] = rgbToLab(rgb);
      }
    }
  }

  return palette;
}

export interface DynamicClassificationResult {
  predictedColor: CubeColor;
  confidence: number;
  distances: Record<CubeColor, number>;
}

/**
 * Classifies an incoming pixel/sample using the dynamically calibrated palette.
 */
export function classifyWithDynamicPalette(
  rgbOrLab: RGBColor | LABColor,
  palette: DynamicCubePalette
): DynamicClassificationResult {
  const lab = 'l' in rgbOrLab ? rgbOrLab : rgbToLab(rgbOrLab);

  let bestColor: CubeColor = 'white';
  let minDistance = Infinity;
  const distances: Record<CubeColor, number> = {
    white: 0,
    yellow: 0,
    green: 0,
    blue: 0,
    red: 0,
    orange: 0,
  };

  for (const color of COLORS) {
    const dist = colorDistanceDeltaE(lab, palette[color]);
    distances[color] = Math.round(dist * 10) / 10;
    if (dist < minDistance) {
      minDistance = dist;
      bestColor = color;
    }
  }

  // Convert distance into confidence [0, 1]
  const confidence = Math.max(0, Math.min(1, Math.round((1 - minDistance / 60) * 100) / 100));

  return {
    predictedColor: bestColor,
    confidence,
    distances,
  };
}
