/**
 * Cubyntra - 3x3 Sticker Sampling & Pixel Aggregation
 * Necookie Labs (c) 2026
 */

import { Face } from '../cube/types';
import { CANONICAL_CENTER_COLORS } from '../cube/constants';
import { classifyColor } from './color';
import { CalibrationProfile, RGBColor, ROIBounds, StickerSample } from './types';

export interface SamplingOptions {
  sampleRatio?: number; // Fraction of cell dimension sampled in center (0.3 - 0.6)
  outlierTrimRatio?: number; // Fraction of extreme pixels discarded (0.1 - 0.2)
  calibration?: CalibrationProfile;
}

/**
 * Calculates a centered square Region of Interest (ROI) within arbitrary frame dimensions.
 */
export function calculateROIBounds(
  frameWidth: number,
  frameHeight: number,
  fractionOfMinDimension = 0.70
): ROIBounds {
  const minDim = Math.min(frameWidth, frameHeight);
  const size = Math.round(minDim * fractionOfMinDimension);
  const x = Math.round((frameWidth - size) / 2);
  const y = Math.round((frameHeight - size) / 2);

  return { x, y, size };
}

/**
 * Aggregates an array of pixel RGB values using a trimmed mean to eliminate glare/shadow spikes.
 */
export function aggregateTrimmedMean(
  pixels: RGBColor[],
  trimRatio = 0.15
): RGBColor {
  if (pixels.length === 0) {
    return { r: 128, g: 128, b: 128 };
  }

  const trimCount = Math.floor(pixels.length * trimRatio);
  const validLength = pixels.length - 2 * trimCount;

  if (validLength <= 0) {
    // Fallback simple average if too few pixels
    let sumR = 0, sumG = 0, sumB = 0;
    for (const p of pixels) {
      sumR += p.r;
      sumG += p.g;
      sumB += p.b;
    }
    return {
      r: Math.round(sumR / pixels.length),
      g: Math.round(sumG / pixels.length),
      b: Math.round(sumB / pixels.length),
    };
  }

  const rSorted = pixels.map((p) => p.r).sort((a, b) => a - b);
  const gSorted = pixels.map((p) => p.g).sort((a, b) => a - b);
  const bSorted = pixels.map((p) => p.b).sort((a, b) => a - b);

  let sumR = 0, sumG = 0, sumB = 0;
  for (let i = trimCount; i < pixels.length - trimCount; i++) {
    sumR += rSorted[i];
    sumG += gSorted[i];
    sumB += bSorted[i];
  }

  return {
    r: Math.round(sumR / validLength),
    g: Math.round(sumG / validLength),
    b: Math.round(sumB / validLength),
  };
}

/**
 * Samples all 9 sticker regions from an HTML Canvas 2D rendering context.
 */
export function sampleGridFromContext(
  ctx: CanvasRenderingContext2D,
  roi: ROIBounds,
  options: SamplingOptions = {}
): StickerSample[] {
  const { sampleRatio = 0.40, outlierTrimRatio = 0.15, calibration } = options;
  const cellSize = roi.size / 3;
  const sampleDimension = Math.max(4, Math.round(cellSize * sampleRatio));

  const samples: StickerSample[] = [];

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const index = row * 3 + col;

      // Cell boundaries
      const cellCenterX = roi.x + col * cellSize + cellSize / 2;
      const cellCenterY = roi.y + row * cellSize + cellSize / 2;

      // Sample region coordinates centered inside cell
      const sampleX = Math.round(cellCenterX - sampleDimension / 2);
      const sampleY = Math.round(cellCenterY - sampleDimension / 2);

      // Read pixel buffer
      const imgData = ctx.getImageData(sampleX, sampleY, sampleDimension, sampleDimension);
      const data = imgData.data;

      const pixels: RGBColor[] = [];
      for (let i = 0; i < data.length; i += 4) {
        pixels.push({
          r: data[i],
          g: data[i + 1],
          b: data[i + 2],
        });
      }

      // Robust trimmed aggregation
      const aggregatedRgb = aggregateTrimmedMean(pixels, outlierTrimRatio);
      const classification = classifyColor(aggregatedRgb, calibration);

      samples.push({
        row,
        col,
        index,
        rgb: aggregatedRgb,
        hsv: classification.hsv,
        lab: classification.lab,
        predictedColor: classification.color,
        confidence: classification.confidence,
        colorScores: classification.scores,
      });
    }
  }

  return samples;
}

/**
 * Calibrates reference profile from observed center sticker of a face.
 */
export function updateCalibrationFromCenter(
  profile: CalibrationProfile,
  face: Face,
  centerRgb: RGBColor
): CalibrationProfile {
  const nextCenters = { ...profile.referenceCenters, [face]: centerRgb };
  const expectedCenterColor = CANONICAL_CENTER_COLORS[face];

  let ambientWhite = profile.ambientWhitePoint;
  if (expectedCenterColor === 'white') {
    ambientWhite = centerRgb;
  }

  return {
    ...profile,
    referenceCenters: nextCenters,
    ambientWhitePoint: ambientWhite,
  };
}
