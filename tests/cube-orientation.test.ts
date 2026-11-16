/**
 * Cubyntra - Whole-Cube Orientation Tests
 *
 * Rotated states must normalize back to standard orientation, moves must carry across a
 * rotation, and the validator and solver must accept a cube held in any orientation.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createSolvedCubeState } from '../src/cube/constants';
import { applyMoves, isCubeSolved, parseAlgorithm, parseMove } from '../src/cube/transforms';
import {
  findRotation,
  centerColors,
  normalizeOrientation,
  translateMoveThroughRotation,
} from '../src/cube/orientation';
import { ORIENTATIONS } from '../src/cube/geometry';
import { validateCubeState } from '../src/cube/validator';
import { ensureSolverInitialized, solveCube } from '../src/solver/solver';

const SCRAMBLE = parseAlgorithm("R U2 F' L D B2 R' U F2 D' L2 B");

const ALL_MOVES = ['U', 'R', 'F', 'D', 'L', 'B', 'u', 'r', 'f', 'd', 'l', 'b', 'M', 'E', 'S', 'x', 'y', 'z']
  .flatMap((s) => [s, `${s}'`, `${s}2`]);

describe('normalizeOrientation', () => {
  it('leaves a standard state alone', () => {
    const scrambled = applyMoves(createSolvedCubeState(), SCRAMBLE);
    const result = normalizeOrientation(scrambled);
    expect(result?.rotation).toEqual([]);
    expect(result?.state).toEqual(scrambled);
  });

  it('undoes each of the 24 orientations with at most two rotations', () => {
    expect(ORIENTATIONS).toHaveLength(24);
    const scrambled = applyMoves(createSolvedCubeState(), SCRAMBLE);
    const seen = new Set<string>();
    for (const o of ORIENTATIONS) {
      const turned = applyMoves(scrambled, parseAlgorithm(o.rotation.join(' ')));
      seen.add(JSON.stringify(centerColors(turned)));
      const result = normalizeOrientation(turned);
      expect(result, o.rotation.join(' ')).not.toBeNull();
      expect(result!.rotation.length).toBeLessThanOrEqual(2);
      expect(result!.state).toEqual(scrambled);
    }
    expect(seen.size).toBe(24);
  });

  it('rejects mirrored or duplicated centers', () => {
    const mirrored = createSolvedCubeState();
    mirrored.U[4] = 'yellow';
    mirrored.D[4] = 'white';
    expect(normalizeOrientation(mirrored)).toBeNull();
    expect(findRotation(centerColors(mirrored), { U: 'white', F: 'green', R: 'red' })).toBeNull();
  });
});

describe('translateMoveThroughRotation', () => {
  it('turns the same layers on either side of a rotation, for every move', () => {
    const scrambled = applyMoves(createSolvedCubeState(), SCRAMBLE);
    for (const rot of ['x', "y'", 'z2', "x y", "z' y2"]) {
      const rotation = parseAlgorithm(rot);
      for (const token of ALL_MOVES) {
        const move = parseMove(token);
        const translated = translateMoveThroughRotation(move, rotation);
        expect(translated.kind, `${token} through ${rot}`).toBe(move.kind);
        expect(applyMoves(scrambled, [...rotation, translated]), `${token} through ${rot}`).toEqual(
          applyMoves(scrambled, [move, ...rotation])
        );
      }
    }
  });

  it('maps faces the way a student would expect', () => {
    // After y (front goes left), what was the right face is now in front.
    expect(translateMoveThroughRotation(parseMove('R'), parseAlgorithm('y')).notation).toBe('F');
    // After z2 the cube is upside down: M now follows R, so it reads as M'.
    expect(translateMoveThroughRotation(parseMove('M'), parseAlgorithm('z2')).notation).toBe("M'");
  });

  it('refuses a non-rotation as the frame change', () => {
    expect(() => translateMoveThroughRotation(parseMove('R'), parseAlgorithm('U'))).toThrow();
  });
});

describe('validator and solver in any orientation', () => {
  beforeAll(() => ensureSolverInitialized());

  it('treats a rotated solved cube as solved and valid', () => {
    const turned = applyMoves(createSolvedCubeState(), parseAlgorithm("x y'"));
    expect(isCubeSolved(turned)).toBe(true);
    expect(validateCubeState(turned).valid).toBe(true);
  });

  it('still rejects a mirrored center layout', () => {
    const mirrored = createSolvedCubeState();
    mirrored.U = Array(9).fill('yellow') as typeof mirrored.U;
    mirrored.D = Array(9).fill('white') as typeof mirrored.D;
    expect(isCubeSolved(mirrored)).toBe(false);
    const res = validateCubeState(mirrored);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'INVALID_CENTERS')).toBe(true);
  });

  it('solves a cube scrambled with slices and rotations, in the frame it is held', async () => {
    const state = applyMoves(createSolvedCubeState(), parseAlgorithm("R U M' y F E2 r' x S z'"));
    expect(validateCubeState(state).valid).toBe(true);
    const result = await solveCube(state);
    expect(result.success, result.error).toBe(true);
    expect(result.moves.every((m) => m.kind === 'face')).toBe(true);
    expect(isCubeSolved(applyMoves(state, result.moves))).toBe(true);
    expect(result.notation).toBe(result.moves.map((m) => m.notation).join(' '));
  });
});
