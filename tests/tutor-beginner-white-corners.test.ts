import { describe, expect, it } from 'vitest';
import { CubeState } from '../src/cube/types';
import { findCorner, isCrossSolved, isLayerSolved } from '../src/cube/pieces';
import { applyMoves, formatAlgorithm, parseAlgorithm } from '../src/cube/transforms';
import { currentStageIn } from '../src/tutor/engine';
import { BEGINNER_METHOD } from '../src/tutor/methods/beginner';
import { CORNER_TRIGGER } from '../src/tutor/methods/orientCorners';
import { scrambledState } from './helpers/scrambles';
import { before, checkedPlan, followUntil, whiteTop } from './helpers/tutorSteps';

const rounds = (n: number) => Array(n).fill(CORNER_TRIGGER).join(' ');
const layerDone = (s: CubeState) => isLayerSolved(s, 'white');

describe("beginner's white corners (white on top)", () => {
  it('is done with white on top', () => {
    expect(BEGINNER_METHOD.stages[2]).toMatchObject({ id: 'white-corners', top: 'white' });
  });

  it('lifts a corner from below its home with 1, 3 or 5 rounds, one for each way it can face', () => {
    for (const times of [1, 3, 5]) {
      const start = before(rounds(times), whiteTop);
      expect(currentStageIn(BEGINNER_METHOD, start)?.id).toBe('white-corners');
      const plan = checkedPlan(BEGINNER_METHOD, start);
      expect(plan.caseId).toBe('white-corner-below');
      expect(plan.setupMoves).toEqual([]);
      expect(formatAlgorithm(plan.algorithm)).toBe(rounds(times));
      expect(plan.facts.repeat?.times).toBe(times);
      expect(plan.highlightPieces).toEqual([{ kind: 'corner', colors: ['white', 'green', 'red'] }]);
      expect(plan.targetSlot).toEqual(plan.highlightPieces[0]);
      expect(layerDone(plan.expectedState)).toBe(true);
    }
  });

  it('turns the bottom and the cube to bring the corner under its home', () => {
    const start = before(`y D2 ${rounds(1)}`, whiteTop);
    const plan = checkedPlan(BEGINNER_METHOD, start);
    expect(plan.caseId).toBe('white-corner-below');
    expect(formatAlgorithm(plan.setupMoves)).toBe('y D2');
    expect(formatAlgorithm(plan.algorithm)).toBe(rounds(1));
    expect(layerDone(plan.expectedState)).toBe(true);
  });

  it('twists a corner that is home but turned the wrong way with 2 or 4 rounds', () => {
    for (const times of [2, 4]) {
      const plan = checkedPlan(BEGINNER_METHOD, before(rounds(times), whiteTop));
      expect(plan.caseId).toBe('white-corner-twisted');
      expect(plan.facts.repeat?.times).toBe(times);
      expect(layerDone(plan.expectedState)).toBe(true);
    }
  });

  it('takes a corner out of the wrong home first', () => {
    // A three-corner cycle on top: three white corners sit between the wrong centers.
    const start = applyMoves(whiteTop, parseAlgorithm("U R U' L' U R' U' L"));
    expect(isCrossSolved(start, 'white')).toBe(true);
    const plan = checkedPlan(BEGINNER_METHOD, start);
    expect(plan.caseId).toBe('white-corner-wrong-slot');
    expect(plan.facts.repeat?.times).toBe(1);
    expect(plan.targetSlot).toBeUndefined();
    const [a, b, c] = plan.highlightPieces[0].colors;
    expect(findCorner(plan.startState, [a, b, c]).slot.startsWith('U')).toBe(true);
    expect(findCorner(plan.expectedState, [a, b, c]).slot.startsWith('D')).toBe(true);

    const { steps, state } = followUntil(BEGINNER_METHOD, plan.expectedState, layerDone, 8);
    expect(layerDone(state)).toBe(true);
    expect(steps.every((s) => s.stage === 'white-corners')).toBe(true);
  });

  it('flips the finished cross to the top before the first corner', () => {
    // Held with yellow on top, as the cross stage leaves it.
    const start = applyMoves(before(rounds(1), whiteTop), parseAlgorithm('z2'));
    const plan = checkedPlan(BEGINNER_METHOD, start);
    expect(plan.grip.top).toBe('yellow');
    expect(plan.setupMoves[0].kind).toBe('rotation');
    expect(plan.gripAfter.top).toBe('white');
    expect(layerDone(plan.expectedState)).toBe(true);
  });

  it('keeps the cross and finishes the white layer on 100 scrambles', () => {
    const seen = new Set<string>();
    for (let n = 0; n < 100; n++) {
      const start = scrambledState(44, n);
      const cross = followUntil(BEGINNER_METHOD, start, (s) => isCrossSolved(s, 'white'), 8);
      const { steps } = followUntil(BEGINNER_METHOD, cross.state, layerDone, 8);
      for (const step of steps) {
        expect(step.stage).toBe('white-corners');
        expect(step.gripAfter.top).toBe('white');
        expect(isCrossSolved(step.expectedState, 'white')).toBe(true);
        seen.add(step.caseId);
      }
    }
    expect([...seen].sort()).toEqual(['white-corner-below', 'white-corner-twisted', 'white-corner-wrong-slot']);
  });
});
