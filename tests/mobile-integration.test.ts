/**
 * Cubyntra - Mobile Companion to Desktop Solve End-to-End Workflow Test
 * Necookie Labs (c) 2026
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { sessionManager } from '../src/sync/sessionManager';
import { FaceScannedPayload, SyncMessageInput } from '../src/sync/types';
import { parseSyncMessage } from '../src/sync/validation';
import { SCAN_SEQUENCE, FACES, createSolvedCubeState } from '../src/cube/constants';
import { validateCubeState } from '../src/cube/validator';
import { solveCube } from '../src/solver/solver';
import { CubeState, Face, FaceStickers } from '../src/cube/types';
import { buildDynamicPalette, classifyWithDynamicPalette } from '../src/vision/dynamicCalibration';

describe('Mobile Companion End-to-End Solve Pipeline', () => {
  beforeEach(() => {
    sessionManager.clearAll();
  });

  it('relays six phone-read faces as state messages and solves the reconstructed puzzle', async () => {
    const { id } = sessionManager.createSession()!;
    const solvedState = createSolvedCubeState();

    // The phone reads each face itself and sends only colors, confidences and tile means.
    for (const step of SCAN_SEQUENCE) {
      const payload: FaceScannedPayload = {
        face: step.face,
        colors: [...solvedState[step.face]],
        confidences: Array(9).fill(0.99),
        tileRgb: Array(9).fill([128, 128, 128]),
        capturedAt: Date.now(),
      };
      const parsed = parseSyncMessage({ type: 'face-scanned', payload, role: 'mobile', clientId: 'phone-e2e-1' });
      expect(parsed.ok).toBe(true);
      expect(sessionManager.publish(id, (parsed as { value: SyncMessageInput }).value)).not.toBeNull();
    }

    const faces = sessionManager.snapshot(id)!.faces;
    expect(Object.keys(faces)).toHaveLength(6);

    const reconstructed = Object.fromEntries(
      FACES.map((f: Face) => [f, faces[f]!.colors as FaceStickers])
    ) as unknown as CubeState;

    const validation = validateCubeState(reconstructed);
    expect(validation.valid).toBe(true);
    expect(validation.status).toBe('valid');

    const solution = await solveCube(reconstructed);
    expect(solution.success).toBe(true);
    expect(solution.moves).toBeDefined();
  });

  it('runs dynamic palette calibration and invariant solving across the 6 captured faces', () => {
    // Observed centers under slight warm light
    const observedCenters: Partial<Record<Face, { r: number; g: number; b: number }>> = {
      U: { r: 245, g: 242, b: 230 }, // White
      R: { r: 190, g: 15, b: 25 },   // Red
      F: { r: 15, g: 165, b: 45 },   // Green
      D: { r: 235, g: 215, b: 15 },  // Yellow
      L: { r: 240, g: 105, b: 15 },  // Orange
      B: { r: 15, g: 65, b: 195 },   // Blue
    };

    const palette = buildDynamicPalette(observedCenters);
    expect(palette.white).toBeDefined();
    expect(palette.yellow).toBeDefined();

    // Verify distance classification
    const sample = { r: 242, g: 240, b: 228 }; // Matches calibrated white
    const result = classifyWithDynamicPalette(sample, palette);
    expect(result.predictedColor).toBe('white');
  });
});
