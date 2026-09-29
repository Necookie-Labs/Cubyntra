/**
 * Cubyntra - Live Capture Quality Tests
 * Necookie Labs (c) 2026
 */

import { describe, it, expect } from 'vitest';
import { assessCaptureQuality, measureGlare } from '../src/vision/captureQuality';
import { sampleGridFromContext } from '../src/vision/sampling';
import { detectCubeInROISync } from '../src/vision/cubeDetector';
import { CubeColor, Face } from '../src/cube/types';
import { contextFor, renderFace, Lighting, RgbaImage } from './helpers/syntheticCube';

const FRONT: CubeColor[] = ['red', 'blue', 'white', 'yellow', 'green', 'orange', 'green', 'white', 'blue'];

function frame(image: RgbaImage) {
  const ctx = contextFor(image);
  const roi = { x: 0, y: 0, size: image.width };
  const samples = sampleGridFromContext(ctx, roi);
  return { samples, detection: detectCubeInROISync(ctx, roi, samples), glareByTile: measureGlare(ctx, roi) };
}

function assess(image: RgbaImage, expectedFace: Face, previous?: RgbaImage) {
  const now = frame(image);
  return assessCaptureQuality({
    ...now,
    expectedFace,
    previousSamples: previous ? frame(previous).samples : undefined,
  });
}

/** Paints a hard white reflection over the middle of one tile. */
function withGlare(image: RgbaImage, tile: number): RgbaImage {
  const data = new Uint8ClampedArray(image.data);
  const cell = image.width / 3;
  const cx = (tile % 3) * cell + cell / 2;
  const cy = Math.floor(tile / 3) * cell + cell / 2;
  for (let y = Math.round(cy - cell * 0.2); y < cy + cell * 0.2; y++) {
    for (let x = Math.round(cx - cell * 0.2); x < cx + cell * 0.2; x++) {
      const o = (y * image.width + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = 255;
    }
  }
  return { ...image, data };
}

describe('assessCaptureQuality', () => {
  it('is ready for a clean, still, well-lit photo of the right face', () => {
    const image = renderFace(FRONT, { noise: 5 });
    const q = assess(image, 'F', renderFace(FRONT, { noise: 5, seed: 11 }));
    expect(q.ready).toBe(true);
    expect(q.topHint).toBeNull();
  });

  it('names the face being shown when it is the wrong one', () => {
    const blueCenter = [...FRONT];
    blueCenter[4] = 'blue';
    const image = renderFace(blueCenter, { noise: 5 });
    const q = assess(image, 'F', image);
    expect(q.ready).toBe(false);
    expect(q.topHint).toBe("That's the back face. Show the green center.");
  });

  it('asks for more light in a dark room', () => {
    const dim: Lighting = { gain: 0.22, noise: 2 };
    const image = renderFace(FRONT, dim);
    const q = assess(image, 'F', image);
    expect(q.checks.find((c) => c.id === 'exposure')?.ok).toBe(false);
  });

  it('points at the row with a reflection', () => {
    const image = withGlare(renderFace(FRONT, { noise: 5 }), 7);
    const q = assess(image, 'F', image);
    expect(q.checks.find((c) => c.id === 'glare')?.hint).toBe('Glare on the bottom row. Tilt the cube slightly.');
  });

  it('does not mistake a bright white tile for glare', () => {
    const whites: CubeColor[] = ['white', 'white', 'white', 'white', 'green', 'white', 'white', 'white', 'white'];
    const image = renderFace(whites, { gain: 1.08, noise: 4 });
    expect(assess(image, 'F', image).checks.find((c) => c.id === 'glare')?.ok).toBe(true);
  });

  it('waits for the cube to be held still', () => {
    const moved = renderFace(['blue', 'red', 'green', 'white', 'green', 'yellow', 'orange', 'blue', 'red'], { noise: 5 });
    const q = assess(renderFace(FRONT, { noise: 5 }), 'F', moved);
    expect(q.checks.find((c) => c.id === 'steady')?.ok).toBe(false);
    expect(q.topHint).toBe('Hold still.');
  });

  it('reports framing before anything else', () => {
    const size = 512;
    const data = new Uint8ClampedArray(size * size * 4).fill(40);
    const image = { width: size, height: size, data };
    const q = assess(image, 'F', image);
    expect(q.topHint).toBe('Fill the square with one face of the cube.');
  });
});
