import { describe, expect, it } from 'vitest';
import { CubeState } from '../src/cube/types';
import { createSolvedCubeState } from '../src/cube/constants';
import { gripOf, viewInGrip } from '../src/cube/grip';
import { findEdge, isCrossSolved } from '../src/cube/pieces';
import { applyMoves, formatAlgorithm, isCubeSolved, parseAlgorithm } from '../src/cube/transforms';
import { crossDistance, solveCross } from '../src/tutor/crossSearch';
import {
  MAX_GUIDED_STEPS,
  currentStageIn,
  planNextStepIn,
  progressIn,
  runGuidedSolveIn,
} from '../src/tutor/engine';
import { MethodDefinition, StageDefinition, StepDraft, TutorPlanError } from '../src/tutor/types';

const solved = createSolvedCubeState();
const after = (notation: string) => applyMoves(solved, parseAlgorithm(notation));

const facts = { goal: 'goal', lookFor: 'look', why: 'why' };

function draft(setup: string, algorithm: string, extra: Partial<StepDraft> = {}): StepDraft {
  return {
    caseId: 'toy',
    caseName: 'Toy',
    setupMoves: parseAlgorithm(setup),
    algorithm: parseAlgorithm(algorithm),
    highlightPieces: [{ kind: 'edge', colors: ['white', 'red'] }],
    facts,
    ...extra,
  };
}

/** Stage 1: white cross on the bottom, done with yellow on top (forces a regrip). */
const crossStage: StageDefinition = {
  id: 'toy-cross',
  name: 'Toy cross',
  top: 'yellow',
  isComplete: (s) => isCrossSolved(s, 'white'),
  progress: (view) => 8 - crossDistance(view),
  plan: (view) => ({ ...draft('', ''), algorithm: solveCross(view) }),
  check: { prefer: ['D'] },
};

/** Stage 2: finish a cube whose yellow face is one turn off, done with white on top. */
const finishStage: StageDefinition = {
  id: 'toy-finish',
  name: 'Toy finish',
  top: 'white',
  isComplete: isCubeSolved,
  progress: () => 0,
  plan: () => draft('', "D'"),
  check: { prefer: ['F'] },
};

const toy: MethodDefinition = { id: 'cfop', name: 'Toy', stages: [crossStage, finishStage] };
const withStage = (stage: Partial<StageDefinition>): MethodDefinition => ({
  ...toy,
  stages: [{ ...crossStage, ...stage }, finishStage],
});

describe('tutor engine: stages and progress', () => {
  it('finds the current stage and reports ordered progress', () => {
    const start = after('D R');
    expect(currentStageIn(toy, start)?.id).toBe('toy-cross');
    expect(progressIn(toy, start)).toEqual({
      method: 'cfop', stageIndex: 0, stage: 'toy-cross', withinStage: 7, value: 7, done: false,
    });
    expect(progressIn(toy, after('D'))).toMatchObject({ stageIndex: 1, stage: 'toy-finish', value: 1000 });
    expect(progressIn(toy, solved)).toEqual({
      method: 'cfop', stageIndex: 2, stage: null, withinStage: 0, value: 2000, done: true,
    });
    expect(currentStageIn(toy, solved)).toBeNull();
    // A solved cube is solved however it is held.
    expect(progressIn(toy, after('x y')).done).toBe(true);
  });

  it('rejects a stage that reports progress outside 0..999', () => {
    expect(() => progressIn(withStage({ progress: () => 1000 }), after('R'))).toThrow(TutorPlanError);
    expect(() => progressIn(withStage({ progress: () => 0.5 }), after('R'))).toThrow(TutorPlanError);
  });
});

describe('tutor engine: planning', () => {
  it('returns null for a solved cube', () => {
    expect(planNextStepIn(toy, solved)).toBeNull();
    expect(planNextStepIn(toy, after('z2 y'))).toBeNull();
  });

  it('regrips with one rotation, keeps the front, and replays the plan', () => {
    const start = after('D R');
    const plan = planNextStepIn(toy, start)!;
    expect(plan.method).toBe('cfop');
    expect(plan.stage).toBe('toy-cross');
    expect(plan.stageName).toBe('Toy cross');
    expect([plan.stageIndex, plan.stepIndex]).toEqual([0, 0]);
    expect(plan.grip).toEqual({ top: 'white', front: 'green' });
    expect(plan.gripAfter).toEqual({ top: 'yellow', front: 'green' });
    expect(formatAlgorithm(plan.setupMoves)).toBe('z2');
    expect(plan.algorithm).toHaveLength(1);
    expect(plan.startState).toEqual(start);
    expect(plan.expectedState).toEqual(applyMoves(start, [...plan.setupMoves, ...plan.algorithm]));
    expect(gripOf(plan.expectedState)).toEqual(plan.gripAfter);
    expect(isCrossSolved(plan.expectedState, 'white')).toBe(true);
    expect([plan.progressBefore, plan.progressAfter]).toEqual([7, 1000]);
  });

  it('plans from the grip the student holds, whatever orientation the state is stored in', () => {
    const start = after('D R');
    const grip = { top: 'yellow', front: 'red' } as const;
    const plan = planNextStepIn(toy, start, grip, 5)!;
    expect(plan.stepIndex).toBe(5);
    expect(plan.grip).toEqual(grip);
    expect(plan.startState).toEqual(viewInGrip(start, grip).state);
    expect(plan.setupMoves).toEqual([]); // yellow is already on top in that grip
    expect(plan.gripAfter).toEqual(grip);
    expect(() => planNextStepIn(toy, start, { top: 'white', front: 'yellow' })).toThrow(TutorPlanError);
  });

  it('is deterministic', () => {
    const start = after("R U F' L2 D B");
    expect(planNextStepIn(toy, start)).toEqual(planNextStepIn(toy, start));
  });

  it('folds a regrip and a planner rotation into the shortest regrip', () => {
    const start = after('z2 D R'); // yellow already on top
    const extra = (setup: string) =>
      withStage({
        plan: (view) => {
          const moves = parseAlgorithm(setup);
          return { ...draft('', ''), setupMoves: moves, algorithm: solveCross(applyMoves(view, moves)) };
        },
      });
    expect(formatAlgorithm(planNextStepIn(extra('y y'), start)!.setupMoves)).toBe('y2');
    expect(formatAlgorithm(planNextStepIn(extra("y y'"), start)!.setupMoves)).toBe('');
    expect(formatAlgorithm(planNextStepIn(extra('y U'), start)!.setupMoves)).toBe('y U');

    // From white on top the flip and a turn combine into at most two rotations.
    const flipped = planNextStepIn(extra('y'), after('D R'))!;
    expect(flipped.setupMoves.length).toBeLessThanOrEqual(2);
    // With yellow on top and green in front, orange is on the right; y brings it to the front.
    expect(flipped.gripAfter).toEqual({ top: 'yellow', front: 'orange' });
    expect(isCrossSolved(flipped.expectedState, 'white')).toBe(true);
  });

  it('throws when a plan does not advance the stage', () => {
    const stuck = withStage({ plan: () => draft('', 'U') });
    expect(() => planNextStepIn(stuck, after('z2 D R'))).toThrow(/does not advance/);
    const backwards = withStage({ plan: () => draft('', 'F L') });
    expect(() => planNextStepIn(backwards, after('z2 D R'))).toThrow(TutorPlanError);
  });

  it('throws when a plan turns no layer', () => {
    expect(() => planNextStepIn(withStage({ plan: () => draft('y', '') }), after('D R'))).toThrow(/turns nothing/);
  });
});

describe('tutor engine: checkpoint', () => {
  const changedOrPlaced = (plan: NonNullable<ReturnType<typeof planNextStepIn>>) => {
    const carried: CubeState = viewInGrip(plan.startState, plan.gripAfter).state;
    for (const s of plan.checkpoint.stickers) {
      expect(plan.checkpoint.facesToShow).toContain(s.face);
      const changed = carried[s.face][s.index] !== plan.expectedState[s.face][s.index];
      const placed = ['white', 'red'].includes(plan.expectedState[s.face][s.index]);
      expect(changed || placed).toBe(true);
    }
  };

  it('shows at most two faces and lists only stickers the step changed or placed', () => {
    const plan = planNextStepIn(toy, after('z2 D R'))!;
    expect(plan.checkpoint.facesToShow.length).toBeGreaterThanOrEqual(1);
    expect(plan.checkpoint.facesToShow.length).toBeLessThanOrEqual(2);
    expect(plan.checkpoint.stickers.length).toBeGreaterThan(0);
    changedOrPlaced(plan);
    // With yellow on top and green in front, red is on the left: the turn that fixes the cross
    // is on L, and the placed white-red edge ends on D and L.
    expect(plan.checkpoint.facesToShow).toEqual(['D', 'L']);
    for (const placed of findEdge(plan.expectedState, ['white', 'red']).stickers) {
      expect(plan.checkpoint.stickers).toContainEqual(placed);
    }
  });

  it('compares in the grip after the step, so a regrip alone changes nothing', () => {
    const plan = planNextStepIn(toy, after('D R'))!; // z2 then one turn
    changedOrPlaced(plan);
    const listed = plan.checkpoint.stickers.length;
    expect(listed).toBeLessThanOrEqual(18);
  });
});

describe('tutor engine: guided solve', () => {
  it('follows plans to a solved cube and counts turns without regrips', () => {
    const result = runGuidedSolveIn(toy, after('D R'));
    expect(isCubeSolved(result.finalState)).toBe(true);
    expect(result.steps.map((s) => s.stage)).toEqual(['toy-cross', 'toy-finish']);
    expect(result.steps.map((s) => s.stepIndex)).toEqual([0, 1]);
    expect(result.turnCount).toBe(2);
    expect(result.moves.length).toBe(4); // two turns and two flips
    expect(applyMoves(after('D R'), result.moves)).toEqual(result.finalState);
    // Each step starts where the previous one ended, in the grip it ended in.
    expect(result.steps[1].startState).toEqual(result.steps[0].expectedState);
    expect(result.steps[1].grip).toEqual(result.steps[0].gripAfter);
    expect(runGuidedSolveIn(toy, solved).steps).toEqual([]);
  });

  it('stops a planner that never finishes', () => {
    let ticks = 0;
    const endless: MethodDefinition = {
      ...toy,
      stages: [{ ...finishStage, isComplete: () => false, progress: () => ticks++, plan: () => draft('', 'U') }],
    };
    expect(() => runGuidedSolveIn(endless, after('R'))).toThrow(new RegExp(`passed ${MAX_GUIDED_STEPS} steps`));
  });
});
