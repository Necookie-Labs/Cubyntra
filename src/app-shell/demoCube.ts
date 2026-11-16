/**
 * Cubyntra - Demo Cube
 * Necookie Labs (c) 2026
 *
 * A scrambled cube for trying the tutor without scanning (no camera, or just curious).
 */

import type { CubeState } from '@/cube/types';
import { createSolvedCubeState } from '@/cube/constants';
import { applyMoves, parseAlgorithm } from '@/cube/transforms';

export const DEMO_SCRAMBLES: readonly string[] = [
  "R U2 F' L D2 B R' U F2 D' L2 B2 U R2 F2 D",
  "F2 U' L2 B D R2 U' B2 L F' D2 R U2 F L' D'",
  "L' B2 D F' U2 R D' L2 F U B2 R' D2 L U' F2",
];

/** One of the demo scrambles, applied to a solved cube (white on top, green in front). */
export function demoCube(random: () => number = Math.random): CubeState {
  const scramble = DEMO_SCRAMBLES[Math.floor(random() * DEMO_SCRAMBLES.length) % DEMO_SCRAMBLES.length];
  return applyMoves(createSolvedCubeState(), parseAlgorithm(scramble));
}
