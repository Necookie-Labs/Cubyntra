/**
 * Cubyntra - Face readings as sync messages
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { CubeState, Face } from '../src/cube/types';
import { FACES, createSolvedCubeState } from '../src/cube/constants';
import { applyMoves, parseAlgorithm } from '../src/cube/transforms';
import { analyzeFaceContext } from '../src/vision/faceImageAnalyzer';
import { resolveCubeColors } from '../src/vision/resolveCubeColors';
import { StickerSample } from '../src/vision/types';
import { faceScannedFromSamples, samplesFromFaceScanned } from '../src/sync/faceSamples';
import { parseSyncMessage } from '../src/sync/validation';
import { contextFor, renderFace } from './helpers/syntheticCube';

const truth: CubeState = applyMoves(createSolvedCubeState(), parseAlgorithm("R U R' U' F2 D L' B R2 U'"));

describe('face readings over sync', () => {
  it('survive the trip phone -> message -> laptop and still resolve the exact cube', () => {
    const received = {} as Record<Face, StickerSample[]>;
    for (const face of FACES) {
      const image = renderFace(truth[face], { noise: 6, seed: face.charCodeAt(0) });
      const analysis = analyzeFaceContext(contextFor(image), image.width, image.height, face);
      const payload = faceScannedFromSamples(face, analysis.samples, analysis.previewColors, 5);

      // The message passes the server's validation unchanged.
      const parsed = parseSyncMessage({ type: 'face-scanned', payload, role: 'mobile', clientId: 'phone-test-1' });
      expect(parsed.ok).toBe(true);
      expect(parsed.ok && parsed.value.payload).toEqual(payload);

      received[face] = samplesFromFaceScanned(payload);
    }
    expect(resolveCubeColors(received).state).toEqual(truth);
  });

  it('carries only colors, confidences and integer tile means', () => {
    const image = renderFace(truth.F, { noise: 6, seed: 1 });
    const analysis = analyzeFaceContext(contextFor(image), image.width, image.height, 'F');
    const payload = faceScannedFromSamples('F', analysis.samples, analysis.previewColors);
    expect(Object.keys(payload).sort()).toEqual(['capturedAt', 'colors', 'confidences', 'face', 'tileRgb']);
    expect(payload.tileRgb.flat().every((v) => Number.isInteger(v) && v >= 0 && v <= 255)).toBe(true);
    expect(JSON.stringify(payload).length).toBeLessThan(1024);
  });
});
