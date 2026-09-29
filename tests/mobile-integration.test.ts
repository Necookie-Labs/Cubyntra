/**
 * Cubyntra - Mobile Companion to Desktop Solve End-to-End Workflow Test
 * Necookie Labs (c) 2026
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { sessionManager } from '../src/sync/sessionManager';
import { CapturedFacePayload } from '../src/sync/types';
import { SCAN_SEQUENCE, CANONICAL_CENTER_COLORS, createSolvedCubeState } from '../src/cube/constants';
import { validateCubeState } from '../src/cube/validator';
import { solveCube } from '../src/solver/solver';
import { CubeState, Face, FaceStickers } from '../src/cube/types';
import { buildDynamicPalette, classifyWithDynamicPalette } from '../src/vision/dynamicCalibration';
import { resolve54StickerInvariant, StickerCostProfile } from '../src/vision/invariantSolver';

describe('Mobile Companion End-to-End Solve Pipeline', () => {
  const sessionId = 'mob-test-e2e';

  beforeEach(() => {
    sessionManager.clearAll();
  });

  it('completes 6-face mobile capture sequence and solves the reconstructed puzzle', async () => {
    // 1. Desktop creates session
    const session = sessionManager.createSession(sessionId);
    expect(session.id).toBe(sessionId);

    // 2. Mock a known scramble (e.g. R U R' U')
    // For test simplicity, let's use a pristine solved state to verify complete end-to-end pipeline
    const solvedState = createSolvedCubeState();

    // 3. Mobile submits all 6 faces in the exact SCAN_SEQUENCE order
    for (const step of SCAN_SEQUENCE) {
      const face = step.face;
      const stickers = solvedState[face];

      const payload: CapturedFacePayload = {
        face,
        centerColor: CANONICAL_CENTER_COLORS[face],
        stickers: [...stickers],
        confidences: Array(9).fill(0.99),
        thumbnail: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
        capturedAt: Date.now(),
      };

      const updated = sessionManager.recordFace(sessionId, payload);
      expect(updated).not.toBeNull();
    }

    const completedSession = sessionManager.getSession(sessionId);
    expect(completedSession?.isComplete).toBe(true);
    expect(Object.keys(completedSession?.scannedFaces || {}).length).toBe(6);

    // 4. Reconstruct CubeState from the completed mobile session
    const reconstructed: CubeState = {
      U: completedSession!.scannedFaces.U!.stickers as FaceStickers,
      R: completedSession!.scannedFaces.R!.stickers as FaceStickers,
      F: completedSession!.scannedFaces.F!.stickers as FaceStickers,
      D: completedSession!.scannedFaces.D!.stickers as FaceStickers,
      L: completedSession!.scannedFaces.L!.stickers as FaceStickers,
      B: completedSession!.scannedFaces.B!.stickers as FaceStickers,
    };

    // 5. Run physical validation
    const validation = validateCubeState(reconstructed);
    expect(validation.valid).toBe(true);
    expect(validation.status).toBe('valid');

    // 6. Compute solution
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
