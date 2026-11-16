import { describe, expect, it } from 'vitest';
import { createSolvedCubeState } from '../src/cube/constants';
import { isCrossSolved } from '../src/cube/pieces';
import { applyMoves, parseAlgorithm } from '../src/cube/transforms';
import { crossDistance, maxCrossDistance, solveCross } from '../src/tutor/crossSearch';
import { scrambledState } from './helpers/scrambles';

describe('cross search', () => {
  it('reports 0 for a solved cross and solves short hand-made cases optimally', () => {
    const solved = createSolvedCubeState();
    expect(crossDistance(solved)).toBe(0);
    expect(solveCross(solved)).toEqual([]);
    const oneOff = applyMoves(solved, parseAlgorithm('F'));
    expect(crossDistance(oneOff)).toBe(1);
    expect(solveCross(oneOff).map((m) => m.notation)).toEqual(["F'"]);
    expect(crossDistance(applyMoves(solved, parseAlgorithm("R U F'")))).toBe(2);
  });

  it('never needs more than 8 turns', () => {
    expect(maxCrossDistance()).toBe(8);
  });

  it('solves the bottom cross of 300 scrambles in exactly the reported distance', () => {
    for (let n = 0; n < 300; n++) {
      const state = scrambledState(11, n);
      const moves = solveCross(state);
      expect(moves.length).toBe(crossDistance(state));
      expect(moves.length).toBeLessThanOrEqual(8);
      expect(isCrossSolved(applyMoves(state, moves), state.D[4])).toBe(true);
    }
  });
});
