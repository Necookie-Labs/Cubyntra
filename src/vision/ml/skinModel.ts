/**
 * Cubyntra - Human Skin Chrominance Probability Model
 * Necookie Labs (c) 2026
 *
 * Implements statistical parametric skin detection in YCbCr and normalized r-g space
 * across diverse human skin phototypes (Fitzpatrick I - VI) to explicitly filter out
 * human faces, foreheads, hands, and skin tones from Rubik's cube scanning.
 */

import { RGBColor } from '../types';

export interface SkinProbabilityResult {
  isSkinLike: boolean;
  probability: number; // [0, 1]
  cb: number;
  cr: number;
}

/**
 * Converts sRGB [0-255] to standard ITU-R BT.601 YCbCr.
 */
export function rgbToYCbCr(rgb: RGBColor): { y: number; cb: number; cr: number } {
  const r = rgb.r;
  const g = rgb.g;
  const b = rgb.b;

  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
  const cr = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;

  return { y, cb, cr };
}

/**
 * Evaluates the probability [0, 1] that an RGB pixel belongs to the human skin distribution.
 * Uses a bivariate Gaussian distribution over the empirical YCbCr skin cluster,
 * penalized when saturation is unnaturally neon or when R <= G or R <= B.
 */
export function computePixelSkinProbability(rgb: RGBColor): SkinProbabilityResult {
  const { r, g, b } = rgb;

  // Immediate non-skin rejections
  // Real human skin always has R > G and R > B under typical broad-spectrum illuminants
  if (r <= g || r <= b || r < 35) {
    const { cb, cr } = rgbToYCbCr(rgb);
    return { isSkinLike: false, probability: 0, cb, cr };
  }

  const { cb, cr } = rgbToYCbCr(rgb);

  // Empirical skin distribution center in YCbCr: Cb_mean = 104, Cr_mean = 145
  // Standard deviations: sigma_cb = 14, sigma_cr = 12
  const dCb = (cb - 104) / 14;
  const dCr = (cr - 145) / 12;
  const mahalanobisDistSq = dCb * dCb + dCr * dCr;

  let prob = Math.exp(-0.5 * mahalanobisDistSq);

  // Additional RGB rule validation (Peer et al. / Kovac heuristics)
  const maxVal = Math.max(r, g, b);
  const minVal = Math.min(r, g, b);
  const delta = maxVal - minVal;

  // Saturation check (Rubik's red and orange are intensely saturated; skin is moderate)
  const sat = maxVal === 0 ? 0 : delta / maxVal;

  // Real skin saturation rarely exceeds 0.65; toy plastics usually exceed 0.70
  if (sat > 0.72) {
    prob *= Math.max(0, 1 - (sat - 0.72) / 0.18);
  }

  // Normalized chromaticity bounds: r = R/(R+G+B), g = G/(R+G+B)
  const sum = r + g + b;
  if (sum > 0) {
    const normR = r / sum;
    const normG = g / sum;

    // Skin cluster bounds in r-g space
    const inSkinRG =
      normR > 0.35 &&
      normR < 0.58 &&
      normG > 0.24 &&
      normG < 0.38 &&
      normR > normG;

    if (!inSkinRG) {
      prob *= 0.3;
    }
  }

  const isSkinLike = prob > 0.45;
  return {
    isSkinLike,
    probability: Math.round(prob * 1000) / 1000,
    cb: Math.round(cb * 10) / 10,
    cr: Math.round(cr * 10) / 10,
  };
}

/**
 * Computes the fraction of skin-like pixels within an image buffer or region.
 */
export function computeRegionSkinFraction(
  pixels: RGBColor[]
): {
  skinFraction: number;
  averageSkinProbability: number;
} {
  if (pixels.length === 0) {
    return { skinFraction: 0, averageSkinProbability: 0 };
  }

  let skinCount = 0;
  let totalProb = 0;

  for (let i = 0; i < pixels.length; i++) {
    const result = computePixelSkinProbability(pixels[i]);
    totalProb += result.probability;
    if (result.isSkinLike) {
      skinCount++;
    }
  }

  return {
    skinFraction: Math.round((skinCount / pixels.length) * 1000) / 1000,
    averageSkinProbability: Math.round((totalProb / pixels.length) * 1000) / 1000,
  };
}
