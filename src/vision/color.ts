/**
 * Cubyntra - Color Conversion & Perceptual Classification Pipeline
 * Necookie Labs (c) 2026
 */

import { CubeColor } from '../cube/types';
import { CalibrationProfile, HSVColor, LABColor, RGBColor } from './types';

/**
 * Converts sRGB [0-255] to HSV color space.
 * H in [0, 360), S in [0, 100], V in [0, 100].
 */
export function rgbToHsv(rgb: RGBColor): HSVColor {
  const r = Math.max(0, Math.min(255, rgb.r)) / 255;
  const g = Math.max(0, Math.min(255, rgb.g)) / 255;
  const b = Math.max(0, Math.min(255, rgb.b)) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
  }

  if (h < 0) {
    h += 360;
  }

  const s = max === 0 ? 0 : (delta / max) * 100;
  const v = max * 100;

  return {
    h: Math.round(h * 10) / 10,
    s: Math.round(s * 10) / 10,
    v: Math.round(v * 10) / 10,
  };
}

/**
 * Converts sRGB [0-255] to CIELAB under D65 standard illuminant.
 */
export function rgbToLab(rgb: RGBColor): LABColor {
  const rLin = gammaExpand(rgb.r / 255);
  const gLin = gammaExpand(rgb.g / 255);
  const bLin = gammaExpand(rgb.b / 255);

  // sRGB to XYZ (D65)
  const x = (rLin * 0.4124564 + gLin * 0.3575761 + bLin * 0.1804375) / 0.95047;
  const y = (rLin * 0.2126729 + gLin * 0.7151522 + bLin * 0.0721750) / 1.00000;
  const z = (rLin * 0.0193339 + gLin * 0.1191920 + bLin * 0.9503041) / 1.08883;

  const fx = fLab(x);
  const fy = fLab(y);
  const fz = fLab(z);

  const l = Math.max(0, 116 * fy - 16);
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);

  return {
    l: Math.round(l * 10) / 10,
    a: Math.round(a * 10) / 10,
    b: Math.round(b * 10) / 10,
  };
}

function gammaExpand(c: number): number {
  return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
}

function fLab(t: number): number {
  return t > 0.00885645 ? Math.cbrt(t) : 7.787037 * t + 16 / 116;
}

/**
 * Computes Delta E (CIE76 Euclidean distance in CIELAB space).
 */
export function colorDistanceDeltaE(lab1: LABColor, lab2: LABColor): number {
  const dl = lab1.l - lab2.l;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

// Canonical CIELAB reference centroids for standard Rubik's Cube plastics
const REFERENCE_LAB: Record<CubeColor, LABColor> = {
  white: { l: 92, a: 0, b: 2 },
  yellow: { l: 85, a: -8, b: 85 },
  green: { l: 56, a: -55, b: 35 },
  blue: { l: 32, a: 15, b: -60 },
  red: { l: 45, a: 65, b: 45 },
  orange: { l: 62, a: 50, b: 65 },
};

/**
 * Classifies an RGB pixel sample into one of the 6 standard Rubik's cube colors.
 * Combines HSV geometric bounds with CIELAB perceptual distance for maximum lighting tolerance.
 */
export function classifyColor(
  rgb: RGBColor,
  calibration?: CalibrationProfile
): {
  color: CubeColor;
  confidence: number;
  scores: Record<CubeColor, number>;
  hsv: HSVColor;
  lab: LABColor;
} {
  const hsv = rgbToHsv(rgb);
  const lab = rgbToLab(rgb);

  const scores: Record<CubeColor, number> = {
    white: 0,
    yellow: 0,
    green: 0,
    blue: 0,
    red: 0,
    orange: 0,
  };

  // Base distance score from LAB centroids (lower deltaE -> higher similarity)
  const colors: CubeColor[] = ['white', 'yellow', 'green', 'blue', 'red', 'orange'];
  for (const c of colors) {
    const targetLab = calibration?.referenceCenters?.[
      c === 'white' ? 'U' : c === 'red' ? 'R' : c === 'green' ? 'F' : c === 'yellow' ? 'D' : c === 'orange' ? 'L' : 'B'
    ] ? rgbToLab(calibration.referenceCenters[
      c === 'white' ? 'U' : c === 'red' ? 'R' : c === 'green' ? 'F' : c === 'yellow' ? 'D' : c === 'orange' ? 'L' : 'B'
    ]!) : REFERENCE_LAB[c];

    const dE = colorDistanceDeltaE(lab, targetLab);
    // Convert distance to score in [0, 100]
    scores[c] = Math.max(0, 100 - dE * 1.1);
  }

  // HSV Rule Boosts & Penalties:
  // 1. White: Strongly penalized if saturation is high; boosted if saturation is low and brightness is decent
  if (hsv.s < 22 && hsv.v > 45) {
    scores.white += 45;
  } else if (hsv.s < 30 && hsv.v > 70) {
    scores.white += 30;
  } else if (hsv.s > 45) {
    scores.white = Math.max(0, scores.white - 50);
  }

  // 2. Yellow: Hue typically 45-75, high S and high V
  if (hsv.h >= 42 && hsv.h <= 75 && hsv.s >= 35 && hsv.v >= 45) {
    scores.yellow += 40;
  }

  // 3. Green: Hue 80-165
  if (hsv.h >= 80 && hsv.h <= 168 && hsv.s >= 28) {
    scores.green += 40;
  }

  // 4. Blue: Hue 175-265
  if (hsv.h >= 175 && hsv.h <= 265 && hsv.s >= 30) {
    scores.blue += 40;
  }

  // 5. Orange: Hue 12-42, high saturation
  if (hsv.h >= 12 && hsv.h < 42 && hsv.s >= 40) {
    scores.orange += 35;
  }

  // 6. Red: Hue wrap-around [0, 12) or [340, 360]
  if ((hsv.h < 12 || hsv.h >= 340) && hsv.s >= 40) {
    scores.red += 40;
  }

  // Rank candidate scores
  const sorted = colors
    .map((c) => ({ color: c, score: scores[c] }))
    .sort((a, b) => b.score - a.score);

  const best = sorted[0];
  const runnerUp = sorted[1];

  // Confidence margin between best and second best candidate
  const scoreSpread = Math.max(0, best.score - runnerUp.score);
  // Normalize to 0.0 - 1.0 confidence
  const confidence = Math.min(1.0, Math.max(0.2, scoreSpread / 45));

  return {
    color: best.color,
    confidence: Math.round(confidence * 100) / 100,
    scores,
    hsv,
    lab,
  };
}
