import { describe, expect, it } from 'vitest';
import { CubeState } from '../src/cube/types';
import { formatAlgorithm } from '../src/cube/transforms';
import { currentStageIn } from '../src/tutor/engine';
import { orientedLastEdges, solvedLastEdges } from '../src/tutor/helpers';
import { BEGINNER_METHOD } from '../src/tutor/methods/beginner';
import { before, checkedPlan, firstTwoLayersSolved, followUntil } from './helpers/tutorSteps';

const SWAP = "R U R' U R U2 R' U";
const CYCLE = "U R U' L' U R' U' L";
const edgesDone = (s: CubeState) => solvedLastEdges(s) === 4;

describe("beginner's yellow edges", () => {
  it('fixes two neighbouring edges with one round', () => {
    const start = before(SWAP);
    expect(currentStageIn(BEGINNER_METHOD, start)?.id).toBe('yellow-edges');
    const plan = checkedPlan(BEGINNER_METHOD, start);
    expect(plan.caseId).toBe('yellow-edges-adjacent');
    expect(plan.setupMoves).toEqual([]);
    expect(formatAlgorithm(plan.algorithm)).toBe(SWAP);
    expect(edgesDone(plan.expectedState)).toBe(true);
    expect(orientedLastEdges(plan.expectedState)).toBe(4);
    expect(firstTwoLayersSolved(plan.expectedState)).toBe(true);
  });

  it('turns the top to hold the matching pair at the back and the right', () => {
    const plan = checkedPlan(BEGINNER_METHOD, before(`U' ${SWAP}`));
    expect(plan.caseId).toBe('yellow-edges-adjacent');
    expect(formatAlgorithm(plan.setupMoves)).toBe("U'");
  });

  it('needs two rounds when the matching edges are across from each other', () => {
    // Two rounds from different sides leave a swap of opposite edges.
    const start = before(`${SWAP} U2 ${SWAP}`);
    const { steps, state } = followUntil(BEGINNER_METHOD, start, edgesDone, 4);
    expect(steps[0].caseId).toBe('yellow-edges-opposite');
    expect(steps[1].caseId).toBe('yellow-edges-adjacent');
    expect(steps.slice(2).every((s) => s.caseId === 'yellow-edges-align')).toBe(true);
    expect(edgesDone(state)).toBe(true);
  });

  it('lines the edges up with one turn of the top when only that is left', () => {
    // Corners are out of place, so this is not yet the last stage; the edges are a turn away.
    const start = before(`${CYCLE} U`);
    expect(currentStageIn(BEGINNER_METHOD, start)?.id).toBe('yellow-edges');
    const plan = checkedPlan(BEGINNER_METHOD, start);
    expect(plan.caseId).toBe('yellow-edges-align');
    expect(formatAlgorithm(plan.algorithm)).toBe('U');
    expect(edgesDone(plan.expectedState)).toBe(true);
  });
});
