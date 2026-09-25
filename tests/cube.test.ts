/**
 * Cubyntra - Mathematical Cube Invariants & Validation Tests
 * Necookie Labs (c) 2026
 */

import { describe, it, expect } from 'vitest';
import { createSolvedCubeState } from '../src/cube/constants';
import {
  applyMove,
  applyMoves,
  parseMove,
  parseAlgorithm,
  invertMove,
  invertAlgorithm,
  isCubeSolved,
  cubeStateToFaceletString,
  faceletStringToCubeState,
} from '../src/cube/transforms';
import { validateCubeState } from '../src/cube/validator';
import { Face } from '../src/cube/types';

describe('Cube Domain & Mathematical Invariants', () => {
  it('creates a canonical solved cube that passes validation and isCubeSolved', () => {
    const solved = createSolvedCubeState();
    expect(isCubeSolved(solved)).toBe(true);

    const validation = validateCubeState(solved);
    expect(validation.valid).toBe(true);
    expect(validation.issues).toHaveLength(0);
  });

  it('verifies 4x clockwise face turn invariant (A^4 = I)', () => {
    const faces: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

    for (const face of faces) {
      let state = createSolvedCubeState();
      const move = parseMove(face);

      for (let i = 0; i < 4; i++) {
        state = applyMove(state, move);
      }

      expect(isCubeSolved(state)).toBe(true);
      expect(validateCubeState(state).valid).toBe(true);
    }
  });

  it('verifies move followed by its inverse returns to identity (A A^-1 = I)', () => {
    const moves = ['U', 'U\'', 'U2', 'R', 'R\'', 'R2', 'F', 'F\'', 'F2', 'D', 'D\'', 'D2', 'L', 'L\'', 'L2', 'B', 'B\'', 'B2'];

    for (const notation of moves) {
      const state = createSolvedCubeState();
      const move = parseMove(notation);
      const inv = invertMove(move);

      const afterMove = applyMove(state, move);
      expect(isCubeSolved(afterMove)).toBe(notation === 'U' || notation.startsWith('U2') ? false : false); // scrambled

      const restored = applyMove(afterMove, inv);
      expect(isCubeSolved(restored)).toBe(true);
    }
  });

  it('verifies double turn twice returns to identity (A2 A2 = I)', () => {
    const doubleMoves = ['U2', 'R2', 'F2', 'D2', 'L2', 'B2'];

    for (const notation of doubleMoves) {
      const state = createSolvedCubeState();
      const move = parseMove(notation);

      const once = applyMove(state, move);
      const twice = applyMove(once, move);

      expect(isCubeSolved(twice)).toBe(true);
    }
  });

  it('verifies Sexy Move order 6 invariant ((R U R\' U\')^6 = I)', () => {
    let state = createSolvedCubeState();
    const sexyMove = parseAlgorithm("R U R' U'");

    for (let i = 0; i < 6; i++) {
      state = applyMoves(state, sexyMove);
    }

    expect(isCubeSolved(state)).toBe(true);
  });

  it('verifies algorithm inversion (Alg * Alg^-1 = I)', () => {
    const state = createSolvedCubeState();
    // T-Permutation
    const tPerm = parseAlgorithm("R U R' U' R' F R2 U' R' U' R U R' F'");
    const invTPerm = invertAlgorithm(tPerm);

    const scrambled = applyMoves(state, tPerm);
    expect(isCubeSolved(scrambled)).toBe(false);
    expect(validateCubeState(scrambled).valid).toBe(true); // T-perm is a legal state

    const restored = applyMoves(scrambled, invTPerm);
    expect(isCubeSolved(restored)).toBe(true);
  });

  it('round-trips CubeState to Facelet string and back', () => {
    const original = createSolvedCubeState();
    const faceletStr = cubeStateToFaceletString(original);
    expect(faceletStr).toHaveLength(54);
    expect(faceletStr).toBe(
      'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'
    );

    const reconstructed = faceletStringToCubeState(faceletStr);
    expect(isCubeSolved(reconstructed)).toBe(true);
    expect(reconstructed).toEqual(original);
  });

  it('parses moves and handles invalid notations gracefully', () => {
    expect(parseMove('R')).toEqual({
      face: 'R',
      quarterTurns: 1,
      notation: 'R',
      description: 'R 90° Clockwise',
    });
    expect(parseMove("F'")).toEqual({
      face: 'F',
      quarterTurns: -1,
      notation: "F'",
      description: 'F 90° Counter-Clockwise',
    });
    expect(parseMove('D2')).toEqual({
      face: 'D',
      quarterTurns: 2,
      notation: 'D2',
      description: 'D 180° Half Turn',
    });

    expect(() => parseMove('X')).toThrow();
    expect(() => parseMove('R3')).toThrow();
    expect(() => parseMove('')).toThrow();
  });
});

describe('Cube State Validator & Parity Invariants', () => {
  it('detects and rejects invalid sticker color counts', () => {
    const invalid = createSolvedCubeState();
    invalid.U[0] = 'yellow'; // 10 yellows, 8 whites

    const res = validateCubeState(invalid);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'INVALID_COLOR_COUNT')).toBe(true);
  });

  it('detects and rejects non-canonical centers', () => {
    const invalid = createSolvedCubeState();
    invalid.U[4] = 'yellow'; // U center changed
    invalid.D[4] = 'white';

    const res = validateCubeState(invalid);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'INVALID_CENTERS')).toBe(true);
  });

  it('detects and rejects impossible opposing colors on a corner piece', () => {
    const invalid = createSolvedCubeState();
    // Force UFR corner to have white and yellow on the same piece (impossible opposites)
    invalid.U[8] = 'yellow';
    invalid.F[2] = 'white'; // Keep color counts balanced and test opposing colors on one corner

    const res = validateCubeState(invalid);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'INVALID_CORNER_COLORS')).toBe(true);
  });

  it('detects and rejects an isolated twisted corner (twist parity)', () => {
    const state = createSolvedCubeState();
    // Twist UFR corner (U8, F2, R0) clockwise: U8=R0, F2=U8, R0=F2
    const u8 = state.U[8];
    const f2 = state.F[2];
    const r0 = state.R[0];

    state.U[8] = r0;
    state.F[2] = u8;
    state.R[0] = f2;

    const res = validateCubeState(state);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'CORNER_TWIST_PARITY')).toBe(true);
  });

  it('detects and rejects an isolated flipped edge (edge flip parity)', () => {
    const state = createSolvedCubeState();
    // Flip UF edge (U7, F1)
    const u7 = state.U[7];
    const f1 = state.F[1];
    state.U[7] = f1;
    state.F[1] = u7;

    const res = validateCubeState(state);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'EDGE_FLIP_PARITY')).toBe(true);
  });

  it('validates a sequence of 25 legal moves as valid', () => {
    let state = createSolvedCubeState();
    const scramble = parseAlgorithm("B2 U2 F' L2 R2 B' D2 B' R2 U2 B' R D' B' R' B2 D' L' F U2");
    state = applyMoves(state, scramble);

    const res = validateCubeState(state);
    expect(res.valid).toBe(true);
    expect(res.issues).toHaveLength(0);
  });
});
