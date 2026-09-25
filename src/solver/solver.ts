/**
 * Cubyntra - Deterministic Kociemba Two-Phase Cube Solver
 * Necookie Labs (c) 2026
 *
 * Provides high-performance, client-side solving without server dependencies.
 */

import { Cube, initSolver, solve as kociembaSolve, scramble as generateKociembaScramble } from 'rubik-solver';
import { CubeState } from '../cube/types';
import {
  cubeStateToFaceletString,
  parseAlgorithm,
  applyMoves,
  isCubeSolved,
} from '../cube/transforms';
import { validateCubeState } from '../cube/validator';
import { SolveResult } from './types';

let isInitialized = false;

/**
 * Ensures Kociemba coordinate and move tables are precomputed.
 * Safe to call multiple times (idempotent).
 */
export function ensureSolverInitialized(): void {
  if (!isInitialized) {
    try {
      initSolver();
      isInitialized = true;
    } catch {
      // Table precomputation fallback or already initialized
      isInitialized = true;
    }
  }
}

/**
 * Solves a CubeState using the Kociemba Two-Phase algorithm.
 *
 * Workflow:
 * 1. Validates the cube state mathematically.
 * 2. Checks if the cube is already solved.
 * 3. Converts CubeState to standard 54-facelet representation.
 * 4. Runs deterministic Two-Phase search.
 * 5. Parses output into structured CubeMove[].
 * 6. Strictly verifies that applying the solution results in a solved state.
 */
export async function solveCube(state: CubeState): Promise<SolveResult> {
  const startTime = performance.now();

  // 1. Strict validation gate
  const validation = validateCubeState(state);
  if (!validation.valid) {
    const errorMsg = validation.issues.map((i) => i.message).join('; ');
    return {
      success: false,
      moves: [],
      notation: '',
      moveCount: 0,
      durationMs: Math.round(performance.now() - startTime),
      error: `Cube state validation failed: ${errorMsg}`,
    };
  }

  // 2. Trivial check: already solved
  if (isCubeSolved(state)) {
    return {
      success: true,
      moves: [],
      notation: '',
      moveCount: 0,
      durationMs: Math.round(performance.now() - startTime),
    };
  }

  ensureSolverInitialized();

  try {
    const faceletStr = cubeStateToFaceletString(state);
    const cube = Cube.fromString(faceletStr);

    const rawSolution = kociembaSolve(cube);
    if (!rawSolution || typeof rawSolution !== 'string') {
      return {
        success: false,
        moves: [],
        notation: '',
        moveCount: 0,
        durationMs: Math.round(performance.now() - startTime),
        error: 'Solver was unable to find a valid solution sequence.',
      };
    }

    const trimmedSolution = rawSolution.trim();
    const moves = trimmedSolution ? parseAlgorithm(trimmedSolution) : [];

    // 6. Invariant verification: Verify that applying the moves yields solved state
    const simulatedState = applyMoves(state, moves);
    if (!isCubeSolved(simulatedState)) {
      return {
        success: false,
        moves: [],
        notation: trimmedSolution,
        moveCount: moves.length,
        durationMs: Math.round(performance.now() - startTime),
        error: 'Critical internal invariant check failed: Solution did not solve the cube.',
      };
    }

    return {
      success: true,
      moves,
      notation: trimmedSolution,
      moveCount: moves.length,
      durationMs: Math.round(performance.now() - startTime),
    };
  } catch (err) {
    return {
      success: false,
      moves: [],
      notation: '',
      moveCount: 0,
      durationMs: Math.round(performance.now() - startTime),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Generates a random legal scramble sequence.
 */
export function generateRandomScramble(): string {
  ensureSolverInitialized();
  return generateKociembaScramble();
}
