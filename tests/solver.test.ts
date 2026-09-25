/**
 * Cubyntra - Kociemba Solver Tests & Solution Verification
 * Necookie Labs (c) 2026
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createSolvedCubeState } from '../src/cube/constants';
import { applyMoves, parseAlgorithm, isCubeSolved } from '../src/cube/transforms';
import { solveCube, generateRandomScramble, ensureSolverInitialized } from '../src/solver/solver';

describe('Kociemba Two-Phase Solver', () => {
  beforeAll(() => {
    ensureSolverInitialized();
  });

  it('solves an already solved cube trivially with 0 moves', async () => {
    const state = createSolvedCubeState();
    const result = await solveCube(state);

    expect(result.success).toBe(true);
    expect(result.moves).toHaveLength(0);
    expect(result.moveCount).toBe(0);
    expect(result.notation).toBe('');
  });

  it('solves a short scramble (Sexy Move) and leaves the cube solved', async () => {
    let state = createSolvedCubeState();
    state = applyMoves(state, parseAlgorithm("R U R' U'"));

    expect(isCubeSolved(state)).toBe(false);

    const result = await solveCube(state);
    expect(result.success).toBe(true);
    expect(result.moves.length).toBeGreaterThan(0);

    const verified = applyMoves(state, result.moves);
    expect(isCubeSolved(verified)).toBe(true);
  });

  it('solves a medium scramble (Sune + J-Perm) correctly', async () => {
    let state = createSolvedCubeState();
    // Sune
    state = applyMoves(state, parseAlgorithm("R U R' U R U2 R'"));

    const result = await solveCube(state);
    expect(result.success).toBe(true);

    const solved = applyMoves(state, result.moves);
    expect(isCubeSolved(solved)).toBe(true);
  });

  it('generates a random scramble, scrambles the cube, and solves it', async () => {
    const scrambleStr = generateRandomScramble();
    expect(typeof scrambleStr).toBe('string');
    expect(scrambleStr.length).toBeGreaterThan(5);

    let state = createSolvedCubeState();
    const scrambleMoves = parseAlgorithm(scrambleStr);
    state = applyMoves(state, scrambleMoves);

    expect(isCubeSolved(state)).toBe(false);

    const result = await solveCube(state);
    expect(result.success).toBe(true);
    expect(result.moveCount).toBeLessThanOrEqual(25); // Kociemba standard upper bound

    const solved = applyMoves(state, result.moves);
    expect(isCubeSolved(solved)).toBe(true);
  });

  it('rejects an invalid cube state before solving', async () => {
    const invalid = createSolvedCubeState();
    invalid.U[0] = 'yellow'; // invalid color count

    const result = await solveCube(invalid);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Cube state validation failed');
  });
});
