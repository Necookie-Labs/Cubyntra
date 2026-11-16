import { describe, expect, it } from 'vitest';
import { isCrossSolved } from '../src/cube/pieces';
import { applyMoves, formatAlgorithm, parseAlgorithm } from '../src/cube/transforms';
import { crossDistance } from '../src/tutor/crossSearch';
import { currentStageIn } from '../src/tutor/engine';
import { CFOP_METHOD } from '../src/tutor/methods/cfop';
import { scrambledState } from './helpers/scrambles';
import { before, checkedPlan, whiteTop } from './helpers/tutorSteps';

describe('CFOP cross', () => {
  it('solves a hand-made cross in the fewest turns, in one step', () => {
    const start = before("F' R'"); // two turns away
    expect(currentStageIn(CFOP_METHOD, start)?.id).toBe('cross');
    const plan = checkedPlan(CFOP_METHOD, start);
    expect(plan.stage).toBe('cross');
    expect(plan.caseId).toBe('cross');
    expect(plan.caseName).toBe('Cross in 2 turns');
    expect(plan.setupMoves).toEqual([]);
    expect(formatAlgorithm(plan.algorithm)).toBe("F' R'");
    expect(isCrossSolved(plan.expectedState, 'white')).toBe(true);
    // Only the white edges that are out of place are highlighted.
    expect(plan.highlightPieces).toHaveLength(2);
    expect(plan.highlightPieces.every((p) => p.kind === 'edge' && p.colors[0] === 'white')).toBe(true);
  });

  it('names a one-turn cross in the singular', () => {
    expect(checkedPlan(CFOP_METHOD, before('R2')).caseName).toBe('Cross in 1 turn');
  });

  it('flips a cube stored with white on top so the cross is built on the bottom', () => {
    const start = applyMoves(whiteTop, parseAlgorithm('F R'));
    const plan = checkedPlan(CFOP_METHOD, start);
    expect(plan.grip).toEqual({ top: 'white', front: 'green' });
    expect(formatAlgorithm(plan.setupMoves)).toBe('z2');
    expect(plan.gripAfter).toEqual({ top: 'yellow', front: 'green' });
    expect(plan.expectedState.D[4]).toBe('white');
    expect(isCrossSolved(plan.expectedState, 'white')).toBe(true);
  });

  it('never needs more than 8 turns on 200 scrambles, and always the proven minimum', () => {
    for (let n = 0; n < 200; n++) {
      const start = applyMoves(scrambledState(21, n), parseAlgorithm('z2'));
      const plan = checkedPlan(CFOP_METHOD, start);
      expect(plan.stage).toBe('cross');
      expect(plan.algorithm.length).toBe(crossDistance(start));
      expect(plan.algorithm.length).toBeLessThanOrEqual(8);
      expect(isCrossSolved(plan.expectedState, 'white')).toBe(true);
    }
  });
});
