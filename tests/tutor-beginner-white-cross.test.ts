import { describe, expect, it } from 'vitest';
import { CubeState } from '../src/cube/types';
import { isCrossSolved, isPieceSolved } from '../src/cube/pieces';
import { applyMoves, formatAlgorithm, parseAlgorithm } from '../src/cube/transforms';
import { currentStageIn } from '../src/tutor/engine';
import { BEGINNER_METHOD } from '../src/tutor/methods/beginner';
import { scrambledState } from './helpers/scrambles';
import { checkedPlan, followUntil, yellowTop } from './helpers/tutorSteps';

const daisy = applyMoves(yellowTop, parseAlgorithm('F2 R2 B2 L2'));
const crossDone = (s: CubeState) => isCrossSolved(s, 'white');

describe("beginner's white cross from the daisy", () => {
  it('sends a petal that is already above its side straight down', () => {
    expect(currentStageIn(BEGINNER_METHOD, daisy)?.id).toBe('white-cross');
    const plan = checkedPlan(BEGINNER_METHOD, daisy);
    expect(plan.caseId).toBe('white-cross-petal');
    expect(plan.setupMoves).toEqual([]);
    expect(plan.algorithm).toHaveLength(1);
    expect(plan.algorithm[0].quarterTurns).toBe(2);
    const [white, side] = plan.highlightPieces[0].colors;
    expect(white).toBe('white');
    expect(isPieceSolved(plan.expectedState, ['white', side])).toBe(true);
    expect(plan.targetSlot).toEqual(plan.highlightPieces[0]);
    expect(plan.facts.lookFor).toContain(side);
  });

  it('turns the top to match the side color first', () => {
    const start = applyMoves(daisy, parseAlgorithm('U'));
    const { steps, state } = followUntil(BEGINNER_METHOD, start, crossDone, 4);
    expect(steps).toHaveLength(4);
    expect(formatAlgorithm(steps[0].setupMoves)).toBe("U'");
    // One turn of the top lined all four up, so the rest go straight down.
    for (const step of steps.slice(1)) expect(step.setupMoves).toEqual([]);
    expect(crossDone(state)).toBe(true);
    // Each petal is one point of progress.
    expect(steps.slice(0, 3).map((s) => s.progressAfter - s.progressBefore)).toEqual([1, 1, 1]);
  });

  it('places one petal per step and leaves earlier ones alone on 100 scrambles', () => {
    for (let n = 0; n < 100; n++) {
      const start = applyMoves(scrambledState(43, n), parseAlgorithm('z2'));
      const afterDaisy = followUntil(BEGINNER_METHOD, start, (s) => currentStageIn(BEGINNER_METHOD, s)?.id !== 'daisy', 4);
      const { steps } = followUntil(BEGINNER_METHOD, afterDaisy.state, crossDone, 4);
      for (const step of steps) {
        expect(step.stage).toBe('white-cross');
        expect(step.setupMoves.length).toBeLessThanOrEqual(1);
        expect(step.algorithm).toHaveLength(1);
      }
    }
  });
});
