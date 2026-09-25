/**
 * Cubyntra - Solver Types & Results
 * Necookie Labs (c) 2026
 */

import { CubeMove } from '../cube/types';

export interface SolveResult {
  success: boolean;
  moves: CubeMove[];
  notation: string;
  moveCount: number;
  durationMs: number;
  error?: string;
}

export interface SolverOptions {
  maxDepth?: number;
  timeoutMs?: number;
}
