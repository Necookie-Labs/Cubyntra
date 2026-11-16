/**
 * Cubyntra - ML Feature Extractor parity with the Python dataset pipeline
 *
 * The edge-gradient features must match `edge_grad_h` / `edge_grad_v` in
 * scripts/extract_dataset_features.py:
 *   min(1.0, abs(l0 - l1) / 255.0 + abs(l1 - l2) / 255.0)
 */

import { describe, it, expect } from 'vitest';
import { edgeGradient, extractCubeFeatures } from '../src/vision/ml/featureExtractor';
import type { StickerSample } from '../src/vision/types';
import type { CubeColor } from '../src/cube/types';

/** Line-for-line port of the Python expression, kept independent of the implementation. */
function pythonEdgeGrad(l0: number, l1: number, l2: number): number {
  return Math.min(1.0, Math.abs(l0 - l1) / 255.0 + Math.abs(l1 - l2) / 255.0);
}

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

function sample(index: number, r: number, g: number, b: number): StickerSample {
  const zero: Record<CubeColor, number> = { white: 0, yellow: 0, green: 0, blue: 0, red: 0, orange: 0 };
  return {
    row: Math.floor(index / 3),
    col: index % 3,
    index,
    rgb: { r, g, b },
    hsv: { h: 0, s: 50, v: 50 },
    lab: { l: 50, a: 0, b: 0 },
    predictedColor: 'red',
    confidence: 0.9,
    colorScores: { ...zero, red: 90 },
    isCubeColor: true,
  };
}

/** Minimal 2D context: every pixel is mid grey. */
function greyContext(): CanvasRenderingContext2D {
  return {
    getImageData(_x: number, _y: number, w: number, h: number) {
      return { data: new Uint8ClampedArray(w * h * 4).fill(128), width: w, height: h };
    },
  } as unknown as CanvasRenderingContext2D;
}

describe('edgeGradient', () => {
  it('scales both luminance differences to [0, 1] like the Python script', () => {
    const cases: [number, number, number][] = [
      [0, 0, 0],
      [100, 110, 100],
      [50, 80, 60],
      [200, 120, 40],
      [255, 0, 255],
      [12.5, 240.25, 99.75],
    ];
    for (const [a, b, c] of cases) {
      expect(edgeGradient(a, b, c)).toBeCloseTo(pythonEdgeGrad(a, b, c), 12);
    }
    // Small steps stay small instead of saturating at 1 (the old bug left the first term unscaled).
    expect(edgeGradient(100, 110, 100)).toBeCloseTo(20 / 255, 12);
    expect(edgeGradient(255, 0, 255)).toBe(1);
  });

  it('feeds the rows and columns of the cell luminances into the feature vector', () => {
    const rgb: [number, number, number][] = [
      [180, 30, 40], [200, 90, 50], [40, 150, 60],
      [30, 60, 170], [230, 230, 230], [210, 200, 40],
      [190, 40, 40], [60, 160, 70], [220, 220, 220],
    ];
    const samples = rgb.map(([r, g, b], i) => sample(i, r, g, b));
    const l = rgb.map(([r, g, b]) => lum(r, g, b));
    // The extractor rounds features to 3 decimals, as the Python script does.
    const f = extractCubeFeatures(greyContext(), { x: 0, y: 0, size: 150 }, samples);
    expect(f.edgeGradientHorizontal).toBeCloseTo(pythonEdgeGrad(l[0], l[1], l[2]), 3);
    expect(f.edgeGradientVertical).toBeCloseTo(pythonEdgeGrad(l[0], l[3], l[6]), 3);
    expect(f.edgeGradientHorizontal).toBeLessThan(1);
  });
});
