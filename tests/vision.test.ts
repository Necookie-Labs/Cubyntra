/**
 * Cubyntra - Computer Vision & Color Classification Tests
 * Necookie Labs (c) 2026
 */

import { describe, it, expect } from 'vitest';
import { rgbToHsv, rgbToLab, classifyColor, isAuthenticRubikColor } from '../src/vision/color';
import { aggregateTrimmedMean, calculateROIBounds } from '../src/vision/sampling';
import { TemporalStabilityBuffer } from '../src/vision/stability';
import { getSolvedMockScan, getScrambledMockScan } from '../src/vision/mock';
import { RGBColor, StickerSample } from '../src/vision/types';
import { CubeColor } from '../src/cube/types';
import { validateCubeState } from '../src/cube/validator';

describe('Color Space Conversions & Robust Classification', () => {
  it('converts pure primary RGB values to accurate HSV coordinates', () => {
    // Pure Red
    const redHsv = rgbToHsv({ r: 255, g: 0, b: 0 });
    expect(redHsv.h).toBe(0);
    expect(redHsv.s).toBe(100);
    expect(redHsv.v).toBe(100);

    // Pure Green
    const greenHsv = rgbToHsv({ r: 0, g: 255, b: 0 });
    expect(greenHsv.h).toBe(120);
    expect(greenHsv.s).toBe(100);
    expect(greenHsv.v).toBe(100);

    // Pure Blue
    const blueHsv = rgbToHsv({ r: 0, g: 0, b: 255 });
    expect(blueHsv.h).toBe(240);
    expect(blueHsv.s).toBe(100);
    expect(blueHsv.v).toBe(100);

    // Pure White
    const whiteHsv = rgbToHsv({ r: 255, g: 255, b: 255 });
    expect(whiteHsv.s).toBe(0);
    expect(whiteHsv.v).toBe(100);

    // Pure Yellow
    const yellowHsv = rgbToHsv({ r: 255, g: 255, b: 0 });
    expect(yellowHsv.h).toBe(60);
    expect(yellowHsv.s).toBe(100);
  });

  it('converts sRGB to CIELAB coordinates accurately', () => {
    const whiteLab = rgbToLab({ r: 255, g: 255, b: 255 });
    expect(whiteLab.l).toBeGreaterThan(99);
    expect(Math.abs(whiteLab.a)).toBeLessThan(2);
    expect(Math.abs(whiteLab.b)).toBeLessThan(2);

    const blackLab = rgbToLab({ r: 0, g: 0, b: 0 });
    expect(blackLab.l).toBe(0);
  });

  it('classifies canonical Rubik colors accurately with high confidence', () => {
    // Authentic Rubik's cube sticker RGB values
    const palette: Record<string, RGBColor> = {
      white: { r: 245, g: 245, b: 245 },
      yellow: { r: 250, g: 215, b: 0 },
      green: { r: 0, g: 155, b: 72 },
      blue: { r: 0, g: 70, b: 173 },
      red: { r: 183, g: 18, b: 52 },
      orange: { r: 255, g: 88, b: 0 },
    };

    for (const [expectedColor, rgb] of Object.entries(palette)) {
      const result = classifyColor(rgb);
      expect(result.color).toBe(expectedColor);
      expect(result.confidence).toBeGreaterThanOrEqual(0.65);
    }
  });

  it('resists warm ambient illumination shift without misclassifying white or yellow', () => {
    // Warm incandescent shift: red boosted, blue dampened
    const warmWhite: RGBColor = { r: 240, g: 228, b: 200 };
    expect(classifyColor(warmWhite).color).toBe('white');

    const warmYellow: RGBColor = { r: 245, g: 195, b: 20 };
    expect(classifyColor(warmYellow).color).toBe('yellow');
  });

  it('resists cool ambient illumination shift without misclassifying blue or green', () => {
    // Cool fluorescent/shadow shift
    const coolGreen: RGBColor = { r: 15, g: 140, b: 85 };
    expect(classifyColor(coolGreen).color).toBe('green');

    const coolBlue: RGBColor = { r: 10, g: 60, b: 180 };
    expect(classifyColor(coolBlue).color).toBe('blue');
  });

  it('strictly rejects human skin tones across Fitzpatrick phototypes from cube classification', () => {
    const skinSamples: Array<{ name: string; rgb: RGBColor }> = [
      { name: 'Fitzpatrick I (Pale)', rgb: { r: 242, g: 198, b: 178 } },
      { name: 'Fitzpatrick II (Fair)', rgb: { r: 228, g: 178, b: 148 } },
      { name: 'Fitzpatrick III (Medium)', rgb: { r: 208, g: 158, b: 122 } },
      { name: 'Fitzpatrick IV (Olive/Tan)', rgb: { r: 188, g: 138, b: 98 } },
      { name: 'Fitzpatrick V (Brown)', rgb: { r: 148, g: 98, b: 68 } },
      { name: 'Fitzpatrick VI (Dark)', rgb: { r: 98, g: 62, b: 44 } },
    ];

    for (const skin of skinSamples) {
      const result = classifyColor(skin.rgb);
      expect(result.isCubeColor, `Failed rejection on ${skin.name}`).toBe(false);
      expect(result.confidence, `Confidence not 0 on ${skin.name}`).toBe(0);
      expect(result.rejectionReason?.toLowerCase()).toContain('skin');

      const auth = isAuthenticRubikColor(skin.rgb);
      expect(auth.isCubeColor).toBe(false);
    }
  });

  it('rejects desaturated background walls, dark shadows, and clothing', () => {
    // Gray painted wall
    const grayWall = classifyColor({ r: 140, g: 140, b: 140 });
    expect(grayWall.isCubeColor).toBe(false);
    expect(grayWall.confidence).toBe(0);

    // Deep shadow / dark boundary gap
    const darkShadow = classifyColor({ r: 20, g: 20, b: 20 });
    expect(darkShadow.isCubeColor).toBe(false);
    expect(darkShadow.confidence).toBe(0);

    // Muted khaki / beige desk wood
    const woodDesk = classifyColor({ r: 160, g: 145, b: 120 });
    expect(woodDesk.isCubeColor).toBe(false);
    expect(woodDesk.confidence).toBe(0);

    // Denim cloth
    const denimBlue = classifyColor({ r: 70, g: 85, b: 110 });
    expect(denimBlue.isCubeColor).toBe(false);
    expect(denimBlue.confidence).toBe(0);
  });
});

describe('Sampling & Trimmed Pixel Aggregation', () => {
  it('correctly eliminates specular glare outliers via trimmed mean', () => {
    // 8 red pixels (r=180, g=20, b=30) contaminated by 2 bright specular white reflections (r=255, g=255, b=255)
    const pixels: RGBColor[] = [
      { r: 180, g: 20, b: 30 },
      { r: 182, g: 22, b: 28 },
      { r: 178, g: 19, b: 32 },
      { r: 181, g: 21, b: 29 },
      { r: 255, g: 255, b: 255 }, // Glare outlier
      { r: 179, g: 20, b: 31 },
      { r: 255, g: 255, b: 255 }, // Glare outlier
      { r: 183, g: 23, b: 30 },
      { r: 180, g: 20, b: 30 },
      { r: 181, g: 21, b: 31 },
    ];

    const aggregated = aggregateTrimmedMean(pixels, 0.20);
    // Should be close to 180, NOT contaminated by the 255 glare
    expect(aggregated.r).toBeLessThan(190);
    expect(aggregated.g).toBeLessThan(25);
    expect(aggregated.b).toBeLessThan(35);
  });

  it('calculates centered square ROI bounds given video frame dimensions', () => {
    const roi = calculateROIBounds(1280, 720, 0.70);
    // 720 * 0.70 = 504 size
    expect(roi.size).toBe(504);
    expect(roi.x).toBe(Math.round((1280 - 504) / 2));
    expect(roi.y).toBe(Math.round((720 - 504) / 2));
  });
});

describe('Temporal Stability Buffer', () => {
  function makeMockStickers(color = 'white'): StickerSample[] {
    return Array.from({ length: 9 }, (_, index) => ({
      row: Math.floor(index / 3),
      col: index % 3,
      index,
      rgb: { r: 240, g: 240, b: 240 },
      hsv: { h: 0, s: 0, v: 95 },
      lab: { l: 95, a: 0, b: 0 },
      predictedColor: color as CubeColor,
      confidence: 0.95,
      colorScores: { white: 100, yellow: 0, green: 0, blue: 0, red: 0, orange: 0 },
    }));
  }

  it('progresses to stable lock after consecutive matching frames', () => {
    const buffer = new TemporalStabilityBuffer({ requiredStableFrames: 5, minAverageConfidence: 0.8 });
    const mockStickers = makeMockStickers('white');

    let result;
    for (let i = 0; i < 5; i++) {
      result = buffer.processFrame(mockStickers, 'U');
    }

    expect(result?.isStable).toBe(true);
    expect(result?.stabilityProgress).toBe(1.0);
  });

  it('decays stability when frame classifications fluctuate', () => {
    const buffer = new TemporalStabilityBuffer({ requiredStableFrames: 6 });
    const whiteStickers = makeMockStickers('white');
    const yellowStickers = makeMockStickers('yellow');

    buffer.processFrame(whiteStickers, 'U');
    buffer.processFrame(whiteStickers, 'U');
    buffer.processFrame(whiteStickers, 'U');

    // Sudden change
    const disrupted = buffer.processFrame(yellowStickers, 'U');
    expect(disrupted.isStable).toBe(false);
    expect(disrupted.stabilityProgress).toBeLessThan(0.5);
  });

  it('blocks stability progress when any cell fails isCubeColor check', () => {
    const buffer = new TemporalStabilityBuffer({ requiredStableFrames: 5 });
    const mockStickers = makeMockStickers('white');

    // Contaminate one cell with non-cube color (e.g. human skin or wall)
    mockStickers[4].isCubeColor = false;
    mockStickers[4].confidence = 0;

    let result;
    for (let i = 0; i < 6; i++) {
      result = buffer.processFrame(mockStickers, 'U');
    }

    expect(result?.isStable).toBe(false);
    expect(result?.stabilityProgress).toBe(0);
    expect(result?.stableFramesCount).toBe(0);
  });
});

describe('Mock Scan Generators', () => {
  it('generates a complete solved 6-face scan that satisfies mathematical validation', () => {
    const mockScan = getSolvedMockScan();
    expect(Object.keys(mockScan)).toHaveLength(6);

    const reconstructedState = {
      U: mockScan.U.stickers,
      R: mockScan.R.stickers,
      F: mockScan.F.stickers,
      D: mockScan.D.stickers,
      L: mockScan.L.stickers,
      B: mockScan.B.stickers,
    };

    const validation = validateCubeState(reconstructedState);
    expect(validation.valid).toBe(true);
  });

  it('generates a scrambled scan from an algorithm and satisfies validation', () => {
    const { scannedFaces } = getScrambledMockScan("R U R' U'");
    const reconstructedState = {
      U: scannedFaces.U.stickers,
      R: scannedFaces.R.stickers,
      F: scannedFaces.F.stickers,
      D: scannedFaces.D.stickers,
      L: scannedFaces.L.stickers,
      B: scannedFaces.B.stickers,
    };

    const validation = validateCubeState(reconstructedState);
    expect(validation.valid).toBe(true);
  });
});
