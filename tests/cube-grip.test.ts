/**
 * Cubyntra - Grip Model Tests
 */

import { describe, it, expect } from 'vitest';
import { COLORS, createSolvedCubeState } from '../src/cube/constants';
import { applyMoves, formatAlgorithm, parseAlgorithm, parseMove } from '../src/cube/transforms';
import type { CubeColor } from '../src/cube/types';
import {
  Grip,
  STANDARD_GRIP,
  gripCenters,
  gripOf,
  gripRotation,
  isValidGrip,
  translateAlgorithm,
  translateMove,
  viewInGrip,
} from '../src/cube/grip';

const ALL_GRIPS: Grip[] = COLORS.flatMap((top) =>
  COLORS.map((front) => ({ top, front })).filter(isValidGrip)
);

describe('grip model', () => {
  it('has 24 valid grips and rejects impossible ones', () => {
    expect(ALL_GRIPS).toHaveLength(24);
    expect(isValidGrip({ top: 'white', front: 'yellow' })).toBe(false);
    expect(isValidGrip({ top: 'red', front: 'red' })).toBe(false);
    expect(() => gripRotation(STANDARD_GRIP, { top: 'white', front: 'yellow' })).toThrow();
  });

  it('knows the full center layout for a grip', () => {
    expect(gripCenters(STANDARD_GRIP)).toEqual({
      U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue',
    });
    // Beginner's flip: yellow on top, green still in front puts orange on the right.
    expect(gripCenters({ top: 'yellow', front: 'green' })).toMatchObject({ R: 'orange', L: 'red', D: 'white' });
  });

  it('rotates between any two grips', () => {
    const solved = createSolvedCubeState();
    for (const from of ALL_GRIPS) {
      const held = viewInGrip(solved, from).state;
      expect(gripOf(held)).toEqual(from);
      for (const to of ALL_GRIPS) {
        const rotation = gripRotation(from, to);
        expect(rotation.every((m) => m.kind === 'rotation')).toBe(true);
        expect(rotation.length).toBeLessThanOrEqual(2);
        expect(gripOf(applyMoves(held, rotation))).toEqual(to);
      }
    }
    expect(gripRotation(STANDARD_GRIP, STANDARD_GRIP)).toEqual([]);
    expect(formatAlgorithm(gripRotation(STANDARD_GRIP, { top: 'white', front: 'red' }))).toBe('y');
    expect(formatAlgorithm(gripRotation(STANDARD_GRIP, { top: 'yellow', front: 'green' }))).toMatch(/^(z2|x2 y2)$/);
  });

  it('views a state as held in a grip without changing its pieces', () => {
    const scrambled = applyMoves(createSolvedCubeState(), parseAlgorithm("R U F' D2 L B'"));
    const { state, rotation } = viewInGrip(scrambled, { top: 'blue', front: 'orange' });
    expect(gripOf(state)).toEqual({ top: 'blue', front: 'orange' });
    expect(applyMoves(state, gripRotation({ top: 'blue', front: 'orange' }, STANDARD_GRIP))).toEqual(scrambled);
    expect(applyMoves(scrambled, rotation)).toEqual(state);
  });

  it('translates moves so the same layer turns in the new grip', () => {
    const flip: Grip = { top: 'yellow', front: 'green' };
    expect(translateMove(parseMove('R'), STANDARD_GRIP, flip).notation).toBe('L');
    expect(translateMove(parseMove("U'"), STANDARD_GRIP, flip).notation).toBe("D'");
    expect(translateMove(parseMove('F'), STANDARD_GRIP, flip).notation).toBe('F');

    const scrambled = applyMoves(createSolvedCubeState(), parseAlgorithm("R U2 F' L D B2"));
    const alg = parseAlgorithm("R U R' U' r M' E2 S y x'");
    for (const from of [STANDARD_GRIP, flip]) {
      const held = viewInGrip(scrambled, from).state;
      for (const to of ALL_GRIPS) {
        const translated = translateAlgorithm(alg, from, to);
        // Doing the moves then regripping equals regripping then doing the translated moves.
        expect(applyMoves(applyMoves(held, gripRotation(from, to)), translated)).toEqual(
          applyMoves(applyMoves(held, alg), gripRotation(from, to))
        );
      }
    }
  });

  it('refuses a grip the state cannot show', () => {
    // A misread with two green centers and no blue one cannot be held with blue on top.
    const state = createSolvedCubeState();
    state.B[4] = 'green' as CubeColor;
    expect(() => viewInGrip(state, { top: 'blue', front: 'red' })).toThrow();
  });
});
