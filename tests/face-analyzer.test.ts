/**
 * Cubyntra - Desktop Face Photo Analyzer Tests
 * Necookie Labs (c) 2026
 */

import { describe, it, expect } from 'vitest';
import { analyzeFaceContext } from '../src/vision/faceImageAnalyzer';
import { CubeColor } from '../src/cube/types';
import { renderFace, contextFor, RgbaImage } from './helpers/syntheticCube';

const MIXED: CubeColor[] = ['orange', 'red', 'yellow', 'white', 'red', 'blue', 'green', 'red', 'orange'];

function analyze(image: RgbaImage, face: Parameters<typeof analyzeFaceContext>[3]) {
  return analyzeFaceContext(contextFor(image), image.width, image.height, face);
}

describe('analyzeFaceContext', () => {
  it('accepts a clean face photo and reads every tile', () => {
    const result = analyze(renderFace(MIXED, { noise: 6 }), 'R');
    expect(result.accepted).toBe(true);
    expect(result.detection.classification).toBe('cube');
    expect(result.previewColors).toEqual(MIXED);
    expect(result.samples).toHaveLength(9);
  });

  it('separates red from orange on a face that alternates them', () => {
    const stickers: CubeColor[] = ['red', 'orange', 'red', 'orange', 'red', 'orange', 'red', 'orange', 'red'];
    expect(analyze(renderFace(stickers, { noise: 6 }), 'R').previewColors).toEqual(stickers);
  });

  it.each([
    ['warm lamp', { tint: [1.06, 1.0, 0.84] as [number, number, number], noise: 8 }],
    ['cool daylight', { tint: [0.92, 1.0, 1.1] as [number, number, number], noise: 8 }],
    ['dim room', { gain: 0.62, noise: 5 }],
  ])('still accepts the photo under a %s', (_label, lighting) => {
    expect(analyze(renderFace(MIXED, lighting), 'R').accepted).toBe(true);
  });

  it('asks for a retake when the wrong face is shown', () => {
    const blueFace: CubeColor[] = Array(9).fill('blue');
    const result = analyze(renderFace(blueFace, { noise: 6 }), 'R');
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('That looks like the Back face. Show the red-center face.');
  });

  it('does not reject a face whose center matches, whatever the other tiles are', () => {
    // Eight blue tiles around a red center is a legal scrambled Right face.
    const stickers: CubeColor[] = ['blue', 'blue', 'blue', 'blue', 'red', 'blue', 'blue', 'blue', 'blue'];
    expect(analyze(renderFace(stickers, { noise: 6 }), 'R').accepted).toBe(true);
  });

  it('rejects a photo with no cube in it', () => {
    const size = 512;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 224;
      data[i + 1] = 172;
      data[i + 2] = 140;
      data[i + 3] = 255;
    }
    const result = analyze({ width: size, height: size, data }, 'U');
    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/square/);
  });
});
