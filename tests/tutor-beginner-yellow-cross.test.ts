import { describe, expect, it } from 'vitest';
import { CubeState } from '../src/cube/types';
import { formatAlgorithm } from '../src/cube/transforms';
import { currentStageIn } from '../src/tutor/engine';
import { orientedLastEdges } from '../src/tutor/helpers';
import { BEGINNER_METHOD } from '../src/tutor/methods/beginner';
import { before, checkedPlan, firstTwoLayersSolved, followUntil } from './helpers/tutorSteps';

const CROSS = "F R U R' U' F'";
const crossMade = (s: CubeState) => orientedLastEdges(s) === 4;

describe("beginner's yellow cross", () => {
  it('turns a line into the cross with one round', () => {
    const start = before(CROSS);
    expect(currentStageIn(BEGINNER_METHOD, start)?.id).toBe('yellow-cross');
    const plan = checkedPlan(BEGINNER_METHOD, start);
    expect(plan.caseId).toBe('yellow-cross-line');
    expect(plan.setupMoves).toEqual([]);
    expect(formatAlgorithm(plan.algorithm)).toBe(CROSS);
    expect(crossMade(plan.expectedState)).toBe(true);
    expect(firstTwoLayersSolved(plan.expectedState)).toBe(true);
    expect(plan.highlightPieces).toHaveLength(4);
  });

  it('turns the top first when the line points at the student', () => {
    const plan = checkedPlan(BEGINNER_METHOD, before(`U ${CROSS}`));
    expect(plan.caseId).toBe('yellow-cross-line');
    expect(formatAlgorithm(plan.setupMoves)).toBe('U');
    expect(crossMade(plan.expectedState)).toBe(true);
  });

  it('goes dot, L, line, cross', () => {
    // Undoing the dot algorithm of the OLL table leaves no yellow edge on top.
    const start = before("F R U R' U' F' f R U R' U' f'");
    expect(orientedLastEdges(start)).toBe(0);
    const { steps, state } = followUntil(BEGINNER_METHOD, start, crossMade, 3);
    expect(steps.map((s) => s.caseId)).toEqual(['yellow-cross-dot', 'yellow-cross-l', 'yellow-cross-line']);
    expect(steps.every((s) => formatAlgorithm(s.algorithm) === CROSS)).toBe(true);
    expect(steps.map((s) => orientedLastEdges(s.expectedState))).toEqual([2, 2, 4]);
    expect(firstTwoLayersSolved(state)).toBe(true);
  });
});
