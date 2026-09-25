/**
 * Cubyntra - Machine Learning Cube & Face Detector Tests
 * Necookie Labs (c) 2026
 */

import { describe, it, expect } from 'vitest';
import { computePixelSkinProbability, computeRegionSkinFraction } from '../src/vision/ml/skinModel';
import { featuresToVector } from '../src/vision/ml/featureExtractor';
import { evaluateCubePresence, runNeuralNetworkInference } from '../src/vision/ml/model';
import { CubeMLFeatures, CubeDetectionResult } from '../src/vision/ml/types';
import { TemporalStabilityBuffer } from '../src/vision/stability';
import { StickerSample, RGBColor } from '../src/vision/types';
import { CubeColor } from '../src/cube/types';

describe('Statistical Skin Chrominance Model', () => {
  it('correctly identifies diverse human skin tones across Fitzpatrick phototypes', () => {
    // Representative skin tones across diverse ethnicities (RGB under daylight)
    const skinTones: Array<{ name: string; rgb: RGBColor }> = [
      { name: 'Fitzpatrick I (Pale / Ivory)', rgb: { r: 240, g: 195, b: 175 } },
      { name: 'Fitzpatrick II (Fair / Peach)', rgb: { r: 225, g: 175, b: 145 } },
      { name: 'Fitzpatrick III (Medium / Golden)', rgb: { r: 205, g: 155, b: 120 } },
      { name: 'Fitzpatrick IV (Olive / Tan)', rgb: { r: 185, g: 135, b: 95 } },
      { name: 'Fitzpatrick V (Brown)', rgb: { r: 145, g: 95, b: 65 } },
      { name: 'Fitzpatrick VI (Dark Brown / Espresso)', rgb: { r: 95, g: 60, b: 42 } },
    ];

    for (const tone of skinTones) {
      const res = computePixelSkinProbability(tone.rgb);
      expect(res.probability, `Failed for ${tone.name}`).toBeGreaterThan(0.40);
      expect(res.isSkinLike, `Failed for ${tone.name}`).toBe(true);
    }
  });

  it('strictly rejects canonical Rubik\'s Cube sticker colors from skin classification', () => {
    const cubeColors: Array<{ name: string; rgb: RGBColor }> = [
      { name: 'White', rgb: { r: 245, g: 245, b: 245 } },
      { name: 'Yellow', rgb: { r: 255, g: 215, b: 0 } },
      { name: 'Green', rgb: { r: 0, g: 155, b: 72 } },
      { name: 'Blue', rgb: { r: 0, g: 70, b: 173 } },
      { name: 'Neon Red', rgb: { r: 210, g: 15, b: 45 } },
      { name: 'Neon Orange', rgb: { r: 255, g: 90, b: 0 } },
    ];

    for (const color of cubeColors) {
      const res = computePixelSkinProbability(color.rgb);
      // Rubik colors should have very low or zero skin probability
      expect(res.probability, `False positive skin on ${color.name}`).toBeLessThan(0.35);
    }
  });

  it('computes region skin fraction correctly on mixed buffers', () => {
    const skinPixel: RGBColor = { r: 220, g: 165, b: 135 };
    const bluePixel: RGBColor = { r: 0, g: 70, b: 180 };

    // 8 skin pixels and 2 blue pixels
    const mixed = [
      skinPixel, skinPixel, skinPixel, skinPixel,
      skinPixel, skinPixel, skinPixel, skinPixel,
      bluePixel, bluePixel,
    ];

    const result = computeRegionSkinFraction(mixed);
    expect(result.skinFraction).toBeGreaterThanOrEqual(0.80);
    expect(result.averageSkinProbability).toBeGreaterThan(0.40);
  });
});

function makeMockCubeFeatures(): CubeMLFeatures {
  return {
    skinFraction: 0.02,
    meanSaturation: 0.85,
    minSaturation: 0.70,
    intraCellVarianceMean: 0.08,
    intraCellVarianceMax: 0.12,
    gridSeamContrast: 0.75,
    meanColorConfidence: 0.92,
    minColorConfidence: 0.80,
    nonCubeColorPenalty: 0.0,
    cubePaletteDiversity: 0.50,
    luminanceUniformity: 0.85,
    edgeGradientHorizontal: 0.35,
    edgeGradientVertical: 0.35,
    skinLikelihoodCenter: 0.01,
    skinLikelihoodCorners: 0.01,
    skinLikelihoodEdges: 0.01,
    chromaPurity: 0.90,
    faceDetectorSignal: 0.0,
  };
}

function makeMockFaceFeatures(): CubeMLFeatures {
  return {
    skinFraction: 0.82,
    meanSaturation: 0.35,
    minSaturation: 0.22,
    intraCellVarianceMean: 0.45,
    intraCellVarianceMax: 0.65,
    gridSeamContrast: 0.08,
    meanColorConfidence: 0.42,
    minColorConfidence: 0.20,
    nonCubeColorPenalty: 0.65,
    cubePaletteDiversity: 0.25,
    luminanceUniformity: 0.45,
    edgeGradientHorizontal: 0.12,
    edgeGradientVertical: 0.12,
    skinLikelihoodCenter: 0.88,
    skinLikelihoodCorners: 0.78,
    skinLikelihoodEdges: 0.82,
    chromaPurity: 0.28,
    faceDetectorSignal: 1.0,
  };
}

describe('Neural Network Inference & Feature Processing', () => {

  it('converts features to an 18-element vector', () => {
    const features = makeMockCubeFeatures();
    const vec = featuresToVector(features);
    expect(vec).toHaveLength(18);
    expect(vec[0]).toBe(features.skinFraction);
    expect(vec[5]).toBe(features.gridSeamContrast);
  });

  it('runs neural network inference producing valid probability distribution', () => {
    const features = makeMockCubeFeatures();
    const vec = featuresToVector(features);
    const [pNonCube, pCube] = runNeuralNetworkInference(vec);

    expect(pNonCube).toBeGreaterThanOrEqual(0);
    expect(pCube).toBeGreaterThanOrEqual(0);
    expect(Math.abs(pNonCube + pCube - 1.0)).toBeLessThan(1e-4);
  });

  it('verifies a genuine Rubik\'s Cube with high confidence', () => {
    const cubeFeatures = makeMockCubeFeatures();
    const result = evaluateCubePresence(cubeFeatures);

    expect(result.isCube).toBe(true);
    expect(result.classification).toBe('cube');
    expect(result.cubeConfidence).toBeGreaterThanOrEqual(0.70);
    expect(result.faceConfidence).toBeLessThan(0.30);
  });

  it('strictly rejects human face features with clear diagnostic reason', () => {
    const faceFeatures = makeMockFaceFeatures();
    const result = evaluateCubePresence(faceFeatures);

    expect(result.isCube).toBe(false);
    expect(result.classification).toBe('face');
    expect(result.faceConfidence).toBeGreaterThanOrEqual(0.80);
    expect(result.cubeConfidence).toBeLessThan(0.20);
    expect(result.reason.toLowerCase()).toContain('face');
  });

  it('rejects blank background / room wall features as non-cube', () => {
    const bgFeatures: CubeMLFeatures = {
      skinFraction: 0.05,
      meanSaturation: 0.12,
      minSaturation: 0.05,
      intraCellVarianceMean: 0.10,
      intraCellVarianceMax: 0.15,
      gridSeamContrast: 0.05,
      meanColorConfidence: 0.30,
      minColorConfidence: 0.15,
      nonCubeColorPenalty: 0.80,
      cubePaletteDiversity: 0.16,
      luminanceUniformity: 0.60,
      edgeGradientHorizontal: 0.05,
      edgeGradientVertical: 0.05,
      skinLikelihoodCenter: 0.05,
      skinLikelihoodCorners: 0.05,
      skinLikelihoodEdges: 0.05,
      chromaPurity: 0.10,
      faceDetectorSignal: 0.0,
    };

    const result = evaluateCubePresence(bgFeatures);
    expect(result.isCube).toBe(false);
    expect(result.classification).toBe('background');
  });
});

describe('Stability Buffer Gating via ML Detection', () => {
  function makeMockStickers(color = 'orange'): StickerSample[] {
    return Array.from({ length: 9 }, (_, index) => ({
      row: Math.floor(index / 3),
      col: index % 3,
      index,
      rgb: { r: 230, g: 110, b: 20 },
      hsv: { h: 25, s: 90, v: 90 },
      lab: { l: 65, a: 45, b: 65 },
      predictedColor: color as CubeColor,
      confidence: 0.95,
      colorScores: { white: 0, yellow: 0, green: 0, blue: 0, red: 20, orange: 95 },
    }));
  }

  it('blocks stability progress when ML detector identifies a human face', () => {
    const buffer = new TemporalStabilityBuffer({ requiredStableFrames: 5 });
    const stickers = makeMockStickers('orange');

    const fakeFaceDetection: CubeDetectionResult = {
      isCube: false,
      cubeConfidence: 0.05,
      faceConfidence: 0.95,
      classification: 'face',
      reason: 'Human skin tones detected',
      features: makeMockFaceFeatures(),
    };

    // Simulate 10 consecutive frames with static face
    let result;
    for (let i = 0; i < 10; i++) {
      result = buffer.processFrame(stickers, 'L', fakeFaceDetection);
    }

    // Must be completely blocked: 0% stability progress, not stable!
    expect(result?.isStable).toBe(false);
    expect(result?.stabilityProgress).toBe(0);
    expect(result?.stableFramesCount).toBe(0);
  });

  it('allows stability progress when ML detector confirms a Rubik\'s Cube', () => {
    const buffer = new TemporalStabilityBuffer({ requiredStableFrames: 5, minAverageConfidence: 0.8 });
    const stickers = makeMockStickers('orange');

    const validCubeDetection: CubeDetectionResult = {
      isCube: true,
      cubeConfidence: 0.98,
      faceConfidence: 0.02,
      classification: 'cube',
      reason: 'Rubik\'s Cube verified by ML model',
      features: makeMockCubeFeatures(),
    };

    let result;
    for (let i = 0; i < 5; i++) {
      result = buffer.processFrame(stickers, 'L', validCubeDetection);
    }

    // Progresses normally to lock
    expect(result?.isStable).toBe(true);
    expect(result?.stabilityProgress).toBe(1.0);
  });
});
