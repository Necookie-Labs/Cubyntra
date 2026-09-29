/**
 * Cubyntra - Reticle to Camera Frame Mapping Tests
 * Necookie Labs (c) 2026
 */

import { describe, it, expect } from 'vitest';
import { calculateROIBounds, mapElementRectToVideo } from '../src/vision/sampling';

// A 390x844 portrait phone viewport with a centered 312 px reticle.
const SCREEN = { left: 0, top: 0, width: 390, height: 844 };
const RETICLE = { left: 39, top: 266, width: 312, height: 312 };

/** Crops are whole pixels, so an odd-sized crop's center can sit half a pixel off. */
function expectWithinPixel(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
}

describe('mapElementRectToVideo', () => {
  it('maps a centered reticle onto the center of a portrait stream', () => {
    const roi = mapElementRectToVideo(RETICLE, SCREEN, 1080, 1920);
    // object-cover scale = max(390/1080, 844/1920) = 844/1920
    const size = 312 / (844 / 1920);
    expect(roi.size).toBe(Math.round(size));
    expectWithinPixel(roi.x + roi.size / 2, 540);
    expectWithinPixel(roi.y + roi.size / 2, 960);
  });

  it('matches what the user framed when a landscape stream fills a portrait screen', () => {
    // Only a 499 px wide slice of the 1920 px frame is visible, so the reticle covers ~399 px.
    const roi = mapElementRectToVideo(RETICLE, SCREEN, 1920, 1080);
    expect(roi.size).toBe(Math.round(312 / (844 / 1080)));
    expectWithinPixel(roi.x + roi.size / 2, 960);

    // The fixed-fraction crop this replaces was 1.76x too wide: its 3x3 grid spanned far more
    // than the cube, so edge cells sampled the background instead of stickers.
    const legacy = calculateROIBounds(1920, 1080, 0.65);
    expect(legacy.size / roi.size).toBeGreaterThan(1.7);
  });

  it('follows an off-center reticle', () => {
    const roi = mapElementRectToVideo({ ...RETICLE, top: 100 }, SCREEN, 1080, 1920);
    expectWithinPixel(roi.y + roi.size / 2, (100 + 156) / (844 / 1920));
  });

  it('stays inside the frame when the reticle overhangs an edge', () => {
    const roi = mapElementRectToVideo({ left: -80, top: -80, width: 312, height: 312 }, SCREEN, 1080, 1920);
    expect(roi.x).toBe(0);
    expect(roi.y).toBe(0);
    expect(roi.size).toBeLessThanOrEqual(1080);
  });
});
