import { describe, expect, it } from 'vitest';
import { applyMoves, formatAlgorithm, isCubeSolved, parseAlgorithm } from '../src/cube/transforms';
import { currentStageIn, runGuidedSolveIn } from '../src/tutor/engine';
import { lastCornersInPlace, solvedLastEdges } from '../src/tutor/helpers';
import { BEGINNER_METHOD } from '../src/tutor/methods/beginner';
import { CORNER_TRIGGER } from '../src/tutor/methods/orientCorners';
import { scrambledState } from './helpers/scrambles';
import { before, checkedPlan, firstTwoLayersSolved, followUntil, yellowTop } from './helpers/tutorSteps';

const CYCLE = "U R U' L' U R' U' L";
const rounds = (n: number) => Array(n).fill(CORNER_TRIGGER).join(' ');

describe("beginner's method: stage list", () => {
  it('lists the eight stages in teaching order with their grips', () => {
    expect(BEGINNER_METHOD.stages.map((s) => [s.id, s.top])).toEqual([
      ['daisy', 'yellow'],
      ['white-cross', 'yellow'],
      ['white-corners', 'white'],
      ['middle-edges', 'yellow'],
      ['yellow-cross', 'yellow'],
      ['yellow-edges', 'yellow'],
      ['yellow-corners-position', 'yellow'],
      ['yellow-corners-orient', 'yellow'],
    ]);
  });
});

describe("beginner's yellow corners: placing", () => {
  it('cycles three corners once when one is already in place', () => {
    const start = before(CYCLE);
    expect(currentStageIn(BEGINNER_METHOD, start)?.id).toBe('yellow-corners-position');
    expect(lastCornersInPlace(start)).toBe(1);
    const plan = checkedPlan(BEGINNER_METHOD, start);
    expect(plan.caseId).toBe('yellow-corners-one');
    expect(plan.setupMoves).toEqual([]);
    expect(formatAlgorithm(plan.algorithm)).toBe(CYCLE);
    expect(plan.facts.repeat?.times).toBe(1);
    expect(lastCornersInPlace(plan.expectedState)).toBe(4);
    expect(solvedLastEdges(plan.expectedState)).toBe(4);
  });

  it('cycles twice when the corners need to go the other way round', () => {
    const plan = checkedPlan(BEGINNER_METHOD, before(`${CYCLE} ${CYCLE}`));
    expect(plan.caseId).toBe('yellow-corners-one');
    expect(plan.facts.repeat?.times).toBe(2);
    expect(formatAlgorithm(plan.algorithm)).toBe(`${CYCLE} ${CYCLE}`);
    expect(lastCornersInPlace(plan.expectedState)).toBe(4);
  });

  it('turns the cube to hold the corner that is in place at the front-right', () => {
    const plan = checkedPlan(BEGINNER_METHOD, before(`y' ${CYCLE}`));
    expect(formatAlgorithm(plan.setupMoves)).toBe("y'");
    expect(lastCornersInPlace(plan.expectedState)).toBe(4);
  });

  it('does one round from anywhere when no corner is in place, then finishes', () => {
    const start = before(`${CYCLE} y ${CYCLE}`);
    expect(lastCornersInPlace(start)).toBe(0);
    const first = checkedPlan(BEGINNER_METHOD, start);
    expect(first.caseId).toBe('yellow-corners-none');
    expect(lastCornersInPlace(first.expectedState)).toBe(1);
    const second = checkedPlan(BEGINNER_METHOD, first.expectedState);
    expect(second.caseId).toBe('yellow-corners-one');
    expect(lastCornersInPlace(second.expectedState)).toBe(4);
  });
});

describe("beginner's yellow corners: twisting, through the engine", () => {
  const start = before(`${rounds(2)} U ${rounds(4)} U'`);

  it('stays in the last stage while the lower layers look scrambled', () => {
    expect(currentStageIn(BEGINNER_METHOD, start)?.id).toBe('yellow-corners-orient');
    const { steps, state } = followUntil(BEGINNER_METHOD, start, isCubeSolved, 4);
    expect(steps.map((s) => s.caseId)).toEqual([
      'yellow-corner-twist-2', 'yellow-corner-twist-4', 'yellow-corners-align',
    ]);
    expect(firstTwoLayersSolved(steps[0].expectedState)).toBe(false);
    expect(steps.every((s) => s.stage === 'yellow-corners-orient')).toBe(true);
    expect(steps.map((s) => s.progressAfter)).toEqual([7003, 7004, 8000]);
    expect(isCubeSolved(state)).toBe(true);
  });

  it('carries on correctly after a fresh scan stores the half-done cube with white on top', () => {
    const middle = checkedPlan(BEGINNER_METHOD, start).expectedState;
    const rescanned = applyMoves(middle, parseAlgorithm('z2 y'));
    expect(currentStageIn(BEGINNER_METHOD, rescanned)?.id).toBe('yellow-corners-orient');
    const result = runGuidedSolveIn(BEGINNER_METHOD, rescanned);
    expect(isCubeSolved(result.finalState)).toBe(true);
    expect(result.steps.map((s) => s.caseId)).toEqual(['yellow-corner-twist-4', 'yellow-corners-align']);
    // The first step turns the student back to yellow on top, facing the side they started from.
    expect(result.steps[0].setupMoves[0].kind).toBe('rotation');
    expect(result.steps[0].gripAfter).toEqual({ top: 'yellow', front: 'green' });
  });

  it('only needs the final turn when the top is a turn away', () => {
    const plan = checkedPlan(BEGINNER_METHOD, applyMoves(yellowTop, parseAlgorithm('U2')));
    expect(plan.stage).toBe('yellow-corners-orient');
    expect(plan.caseId).toBe('yellow-corners-align');
    expect(formatAlgorithm(plan.algorithm)).toBe('U2');
  });
});

describe("beginner's method: whole solves", () => {
  it('solves scrambles stage by stage, flipping twice and never going back a stage', () => {
    for (let n = 0; n < 40; n++) {
      const result = runGuidedSolveIn(BEGINNER_METHOD, scrambledState(46, n));
      expect(isCubeSolved(result.finalState)).toBe(true);
      const stages = result.steps.map((s) => s.stageIndex);
      expect([...stages].sort((a, b) => a - b)).toEqual(stages);
      for (const step of result.steps) {
        expect(step.gripAfter.top).toBe(step.stage === 'white-corners' ? 'white' : 'yellow');
      }
    }
  });
});
