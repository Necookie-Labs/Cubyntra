import { describe, expect, it } from 'vitest';
import { CubeState } from '../src/cube/types';
import { findEdge, isCrossSolved, isPieceSolved } from '../src/cube/pieces';
import { applyMoves, formatAlgorithm, parseAlgorithm } from '../src/cube/transforms';
import { currentStageIn } from '../src/tutor/engine';
import { BEGINNER_METHOD } from '../src/tutor/methods/beginner';
import { scrambledState } from './helpers/scrambles';
import { checkedPlan, followUntil, whiteTop, yellowTop } from './helpers/tutorSteps';

/** All four white edges around the yellow center, each above its own side. */
const daisy = applyMoves(yellowTop, parseAlgorithm('F2 R2 B2 L2'));
const petals = (s: CubeState) => [1, 3, 5, 7].filter((i) => s.U[i] === 'white').length;
/** Done when every white edge is a petal or already home on the white face. */
const daisyDone = (s: CubeState) =>
  (['green', 'red', 'blue', 'orange'] as const).every((side) => {
    const white = findEdge(s, ['white', side]).stickers[0];
    return s[white.face][4] === 'yellow' || isPieceSolved(s, ['white', side]);
  });

describe("beginner's daisy", () => {
  it('starts every scrambled cube with the daisy, yellow on top', () => {
    expect(BEGINNER_METHOD.stages[0]).toMatchObject({ id: 'daisy', top: 'yellow' });
    expect(currentStageIn(BEGINNER_METHOD, scrambledState(41, 0))?.id).toBe('daisy');
  });

  it('brings a white edge up from the middle layer with one turn', () => {
    const start = applyMoves(daisy, parseAlgorithm('R')); // one petal knocked into the middle
    expect(petals(start)).toBe(3);
    const plan = checkedPlan(BEGINNER_METHOD, start);
    expect(plan.stage).toBe('daisy');
    expect(plan.caseId).toBe('daisy-middle');
    expect(plan.setupMoves).toEqual([]);
    // One more turn of the same side either way works; the planner takes the first in its fixed
    // order, which carries the edge on down to its home under the orange center.
    expect(formatAlgorithm(plan.algorithm)).toBe('R');
    expect(petals(plan.expectedState)).toBe(3);
    expect(isPieceSolved(plan.expectedState, ['white', 'orange'])).toBe(true);
    expect(daisyDone(plan.expectedState)).toBe(true);
    expect(plan.highlightPieces).toEqual([{ kind: 'edge', colors: ['white', 'orange'] }]);
    expect(plan.targetSlot).toEqual({ kind: 'center', colors: ['yellow'] });
  });

  it('counts a white edge that is already home, and fixes one that is on the bottom but not home', () => {
    // Bottom layer a quarter turn off: every white edge faces down under the wrong side.
    const start = applyMoves(yellowTop, parseAlgorithm('D'));
    const plan = checkedPlan(BEGINNER_METHOD, start);
    expect(plan.caseId).toBe('daisy-bottom-down');
    expect(formatAlgorithm(plan.algorithm)).toBe("D'");
    expect(isCrossSolved(plan.expectedState, 'white')).toBe(true);
  });

  it('flips to yellow on top when the cube is stored with white on top', () => {
    const start = applyMoves(whiteTop, parseAlgorithm('R U F'));
    const plan = checkedPlan(BEGINNER_METHOD, start);
    expect(formatAlgorithm(plan.setupMoves.slice(0, 1))).toBe('z2');
    expect(plan.gripAfter).toEqual({ top: 'yellow', front: 'green' });
  });

  it('adds at least one petal per step and needs at most four steps on 150 scrambles', () => {
    const seen = new Set<string>();
    for (let n = 0; n < 150; n++) {
      const start = applyMoves(scrambledState(42, n), parseAlgorithm('z2'));
      const { steps } = followUntil(BEGINNER_METHOD, start, daisyDone, 4);
      for (const step of steps) {
        seen.add(step.caseId);
        // Line-up turns only ever turn the top; the petal itself needs few turns.
        expect(step.setupMoves.every((m) => m.kind === 'face' && m.face === 'U')).toBe(true);
        expect(step.algorithm.length).toBeLessThanOrEqual(5);
        expect(step.highlightPieces.length).toBeGreaterThanOrEqual(1);
      }
    }
    expect([...seen].sort()).toEqual(['daisy-bottom-down', 'daisy-bottom-side', 'daisy-middle', 'daisy-top']);
  });
});
