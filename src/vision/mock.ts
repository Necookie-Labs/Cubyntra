/**
 * Cubyntra - Synthetic Scan Fixtures & Mock Generators
 * Necookie Labs (c) 2026
 */

import { Face, FaceStickers, ScannedFace, CubeState } from '../cube/types';
import { FACES, createSolvedCubeState } from '../cube/constants';
import { applyMoves, parseAlgorithm } from '../cube/transforms';

/**
 * Creates a complete 6-face ScannedFace record from any valid CubeState.
 * Useful for deterministic testing, offline development, and demonstration modes.
 */
export function createMockScannedFaces(state: CubeState): Record<Face, ScannedFace> {
  const result: Partial<Record<Face, ScannedFace>> = {};

  for (const face of FACES) {
    const stickers = [...state[face]] as FaceStickers;
    result[face] = {
      face,
      centerColor: stickers[4],
      stickers,
      confidences: Array(9).fill(0.98),
      capturedAt: Date.now(),
    };
  }

  return result as Record<Face, ScannedFace>;
}

/**
 * Generates mock scan data for a solved cube.
 */
export function getSolvedMockScan(): Record<Face, ScannedFace> {
  return createMockScannedFaces(createSolvedCubeState());
}

/**
 * Generates mock scan data for a known scramble algorithm.
 */
export function getScrambledMockScan(scramble = "R U R' U' R' F R2 U' R' U' R U R' F'"): {
  state: CubeState;
  scannedFaces: Record<Face, ScannedFace>;
} {
  const solved = createSolvedCubeState();
  const moves = parseAlgorithm(scramble);
  const scrambledState = applyMoves(solved, moves);

  return {
    state: scrambledState,
    scannedFaces: createMockScannedFaces(scrambledState),
  };
}
