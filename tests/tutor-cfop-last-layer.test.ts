import { describe, expect, it } from 'vitest';
import { applyMoves, formatAlgorithm, isCubeSolved, parseAlgorithm } from '../src/cube/transforms';
import { LastLayerCase, OLL_CORNER_CASES, OLL_EDGE_CASES } from '../src/tutor/cases/oll2look';
import { PLL_CORNER_CASES, PLL_EDGE_CASES } from '../src/tutor/cases/pll2look';
import { currentStageIn, runGuidedSolveIn } from '../src/tutor/engine';
import { CFOP_METHOD } from '../src/tutor/methods/cfop';
import { before, checkedPlan, firstTwoLayersSolved, whiteTop, yellowTop } from './helpers/tutorSteps';

const TABLES: [string, readonly LastLayerCase[]][] = [
  ['oll-edges', OLL_EDGE_CASES],
  ['oll-corners', OLL_CORNER_CASES],
  ['pll-corners', PLL_CORNER_CASES],
  ['pll-edges', PLL_EDGE_CASES],
];

/** Cases that look the same after a quarter turn of the top, so no line-up turn is needed. */
const SAME_FROM_EVERY_SIDE = ['oll-edges-dot', 'pll-corners-y', 'pll-edges-h'];

describe('CFOP last layer: 2-look OLL and PLL', () => {
  it('lists the stages in order', () => {
    expect(CFOP_METHOD.stages.map((s) => s.id)).toEqual([
      'cross', 'f2l', 'oll-edges', 'oll-corners', 'pll-corners', 'pll-edges', 'auf',
    ]);
    expect(CFOP_METHOD.stages.every((s) => s.top === 'yellow')).toBe(true);
  });

  it('recognises every table case set up by undoing its algorithm', () => {
    for (const [stage, cases] of TABLES) {
      for (const c of cases) {
        const start = before(c.algorithm);
        expect(currentStageIn(CFOP_METHOD, start)?.id, c.id).toBe(stage);
        const plan = checkedPlan(CFOP_METHOD, start);
        expect(plan.caseId, c.id).toBe(c.id);
        expect(plan.caseName).toBe(c.name);
        expect(plan.setupMoves).toEqual([]);
        expect(formatAlgorithm(plan.algorithm)).toBe(c.algorithm);
        expect(plan.facts.lookFor).toBe(c.recognition);
        expect(firstTwoLayersSolved(plan.expectedState)).toBe(true);
        expect(plan.stageIndex).toBeLessThan(currentStageIndex(plan.expectedState));
      }
    }
  });

  it('lines the top up first when the case is a turn away', () => {
    for (const [, cases] of TABLES) {
      for (const c of cases) {
        const plan = checkedPlan(CFOP_METHOD, before(`U ${c.algorithm}`));
        expect(plan.caseId, c.id).toBe(c.id);
        expect(formatAlgorithm(plan.setupMoves), c.id).toBe(SAME_FROM_EVERY_SIDE.includes(c.id) ? '' : 'U');
        expect(formatAlgorithm(plan.algorithm)).toBe(c.algorithm);
      }
    }
  });

  it('finishes with one turn of the top, in the shortest direction', () => {
    for (const [turn, undo] of [['U', "U'"], ['U2', 'U2'], ["U'", 'U']]) {
      const start = applyMoves(yellowTop, parseAlgorithm(turn));
      expect(currentStageIn(CFOP_METHOD, start)?.id).toBe('auf');
      const plan = checkedPlan(CFOP_METHOD, start);
      expect(plan.caseId).toBe(`auf-${undo.toLowerCase()}`);
      expect(formatAlgorithm(plan.algorithm)).toBe(undo);
      expect(isCubeSolved(plan.expectedState)).toBe(true);
    }
  });

  it('walks all four looks and the final turn in order', () => {
    const sune = "R U R' U R U2 R'";
    const tPerm = "R U R' U' R' F R2 U' R' U' R U R' F'";
    const uaPerm = "R U' R U R U R U' R' U' R2";
    const start = before(`F R U R' U' F' U ${sune} ${tPerm} U2 ${uaPerm} U`);
    const result = runGuidedSolveIn(CFOP_METHOD, start);
    expect(isCubeSolved(result.finalState)).toBe(true);
    expect(result.steps.map((s) => s.stage)).toEqual(['oll-edges', 'oll-corners', 'pll-corners', 'pll-edges', 'auf']);
    expect(result.steps.map((s) => s.caseId)).toEqual([
      'oll-edges-line', 'oll-corners-sune', 'pll-corners-t', 'pll-edges-ua', 'auf-u',
    ]);
  });

  it('skips looks that are already done', () => {
    const start = before("R U' R U R U R U' R' U' R2"); // only the edges are out of order
    const result = runGuidedSolveIn(CFOP_METHOD, start);
    expect(result.steps.map((s) => s.stage)).toEqual(['pll-edges']);
    expect(isCubeSolved(result.finalState)).toBe(true);
  });

  it('solves a cube stored with white on top from the first step to the last', () => {
    const start = applyMoves(whiteTop, parseAlgorithm("R U2 F' L D2 B R' U F2 L' D B2 U' R2 F"));
    const result = runGuidedSolveIn(CFOP_METHOD, start);
    expect(isCubeSolved(result.finalState)).toBe(true);
    expect(formatAlgorithm(result.steps[0].setupMoves)).toBe('z2');
    // After the flip the student never turns the cube over again.
    for (const step of result.steps) {
      expect(step.gripAfter.top).toBe('yellow');
      expect(step.setupMoves.every((m) => m.kind !== 'rotation' || m.notation.startsWith('y') || step.stepIndex === 0)).toBe(true);
    }
    const stages = result.steps.map((s) => s.stageIndex);
    expect([...stages].sort((a, b) => a - b)).toEqual(stages);
  });
});

function currentStageIndex(state: Parameters<typeof currentStageIn>[1]): number {
  const stage = currentStageIn(CFOP_METHOD, state);
  return stage ? CFOP_METHOD.stages.indexOf(stage) : CFOP_METHOD.stages.length;
}
