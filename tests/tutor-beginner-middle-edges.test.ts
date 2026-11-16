import { describe, expect, it } from 'vitest';
import { findEdge, isLayerSolved } from '../src/cube/pieces';
import { applyMoves, formatAlgorithm, parseAlgorithm } from '../src/cube/transforms';
import { currentStageIn } from '../src/tutor/engine';
import { BEGINNER_METHOD } from '../src/tutor/methods/beginner';
import { scrambledState } from './helpers/scrambles';
import { before, checkedPlan, firstTwoLayersSolved, followUntil } from './helpers/tutorSteps';

const RIGHT = "U R U' R' U' F' U F";
const LEFT = "U' L' U L U F U' F'";

describe("beginner's middle layer (after the flip, yellow on top)", () => {
  it('drops an edge to the right or to the left', () => {
    for (const [algorithm, caseId, colors] of [
      [RIGHT, 'middle-edge-right', ['green', 'orange']],
      [LEFT, 'middle-edge-left', ['green', 'red']],
    ] as const) {
      const start = before(algorithm);
      expect(currentStageIn(BEGINNER_METHOD, start)?.id).toBe('middle-edges');
      const plan = checkedPlan(BEGINNER_METHOD, start);
      expect(plan.caseId).toBe(caseId);
      expect(plan.setupMoves).toEqual([]);
      expect(formatAlgorithm(plan.algorithm)).toBe(algorithm);
      expect([...plan.highlightPieces[0].colors].sort()).toEqual([...colors].sort());
      expect(firstTwoLayersSolved(plan.expectedState)).toBe(true);
    }
  });

  it('turns the cube and the top to line the edge up with its center', () => {
    const plan = checkedPlan(BEGINNER_METHOD, before(`y U2 ${RIGHT}`));
    expect(plan.caseId).toBe('middle-edge-right');
    expect(formatAlgorithm(plan.setupMoves)).toBe('y U2');
    expect(firstTwoLayersSolved(plan.expectedState)).toBe(true);
  });

  it('pushes out an edge that is flipped in its own slot, then puts it back', () => {
    const start = before(`${RIGHT} U2 ${RIGHT}`);
    expect(firstTwoLayersSolved(start)).toBe(false);
    const first = checkedPlan(BEGINNER_METHOD, start);
    expect(first.caseId).toBe('middle-edge-extract');
    const [a, b] = first.highlightPieces[0].colors;
    expect(findEdge(first.startState, [a, b]).slot.startsWith('U')).toBe(false);
    expect(findEdge(first.expectedState, [a, b]).slot.startsWith('U')).toBe(true);
    const { steps, state } = followUntil(BEGINNER_METHOD, first.expectedState, firstTwoLayersSolved, 2);
    expect(steps).toHaveLength(1);
    expect(firstTwoLayersSolved(state)).toBe(true);
  });

  it('flips white to the bottom before the first edge, and never again', () => {
    for (let n = 0; n < 40; n++) {
      const corners = followUntil(BEGINNER_METHOD, scrambledState(45, n), (s) => isLayerSolved(s, 'white'), 16);
      const { steps } = followUntil(BEGINNER_METHOD, corners.state, firstTwoLayersSolved, 8);
      if (steps.length === 0) continue; // the middle layer happened to be solved already
      expect(steps[0].grip.top).toBe('white');
      expect(steps[0].setupMoves[0].kind).toBe('rotation');
      for (const step of steps) {
        expect(step.stage).toBe('middle-edges');
        expect(step.gripAfter.top).toBe('yellow');
        expect(isLayerSolved(step.expectedState, 'white')).toBe(true);
      }
      for (const step of steps.slice(1)) expect(step.grip.top).toBe('yellow');
    }
  });

  it('treats a cube stored with white on top the same way', () => {
    const start = applyMoves(before(RIGHT), parseAlgorithm('z2'));
    const plan = checkedPlan(BEGINNER_METHOD, start);
    expect(formatAlgorithm(plan.setupMoves)).toBe('z2');
    expect(formatAlgorithm(plan.algorithm)).toBe(RIGHT);
  });
});
