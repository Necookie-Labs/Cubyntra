import { describe, expect, it } from 'vitest';
import { GLARE_REJECT_FRACTION, readFaceFromContext } from '../src/vision/checkpointCapture';
import { buildStudentPalette } from '../src/vision/palette';
import { scrambledState } from './helpers/scrambles';
import { contextFor, renderCubeFace, scanSamples } from './helpers/syntheticCube';

describe('reading a checkpoint face', () => {
  const state = scrambledState(81, 3);
  const palette = buildStudentPalette(scanSamples(state, { lighting: { noise: 5 } }), { state });
  const light = { gain: 0.85, tint: [1.05, 1, 0.92] as [number, number, number], noise: 6, seed: 3 };

  it('reads the nine stickers of a face with the stored palette', () => {
    const image = renderCubeFace(state, 'R', { lighting: light });
    const reading = readFaceFromContext(contextFor(image), image.width, image.height, palette);
    expect(reading.usedPalette).toBe(true);
    expect(reading.samples).toHaveLength(9);
    expect(reading.stickers.map((s) => s.color)).toEqual(state.R);
    for (const sticker of reading.stickers) expect(sticker.confidence).toBeGreaterThanOrEqual(0.5);
    for (const fraction of reading.glare) expect(fraction).toBeLessThanOrEqual(GLARE_REJECT_FRACTION);
  });

  it('gives a tile hidden by glare no confidence and leaves the others alone', () => {
    const image = renderCubeFace(state, 'R', { lighting: light, glare: [0, 5] });
    const reading = readFaceFromContext(contextFor(image), image.width, image.height, palette);
    reading.stickers.forEach((sticker, i) => {
      if (i === 0 || i === 5) {
        expect(reading.glare[i]).toBeGreaterThan(GLARE_REJECT_FRACTION);
        expect(sticker.confidence).toBe(0);
      } else {
        expect(sticker.color).toBe(state.R[i]);
        expect(sticker.confidence).toBeGreaterThanOrEqual(0.5);
      }
    });
  });

  it('treats a white tile clipped by overexposure as not seen, never as a guess', () => {
    const face = (['U', 'R', 'F', 'D', 'L', 'B'] as const).find(
      (f) => state[f].includes('white') && state[f].some((c) => c !== 'white')
    )!;
    const image = renderCubeFace(state, face, { lighting: { gain: 1.3, noise: 3 } });
    const reading = readFaceFromContext(contextFor(image), image.width, image.height, palette);
    reading.stickers.forEach((sticker, i) => {
      if (state[face][i] === 'white') expect(sticker.confidence).toBe(0);
      else if (sticker.confidence >= 0.5) expect(sticker.color).toBe(state[face][i]);
    });
  });

  it('uses the static classifier when there is no palette', () => {
    const image = renderCubeFace(state, 'U', { lighting: { noise: 4 } });
    const reading = readFaceFromContext(contextFor(image), image.width, image.height);
    expect(reading.usedPalette).toBe(false);
    expect(reading.stickers.map((s) => s.color)).toEqual(state.U);
  });

  it('reads the centered square of a wider frame', () => {
    const image = renderCubeFace(state, 'F', { lighting: light });
    const wide = { width: image.width + 40, height: image.height, data: new Uint8ClampedArray((image.width + 40) * image.height * 4) };
    for (let y = 0; y < image.height; y++) {
      wide.data.set(image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4), (y * wide.width + 20) * 4);
    }
    const reading = readFaceFromContext(contextFor(wide), wide.width, wide.height, palette);
    expect(reading.stickers.map((s) => s.color)).toEqual(state.F);
  });
});
