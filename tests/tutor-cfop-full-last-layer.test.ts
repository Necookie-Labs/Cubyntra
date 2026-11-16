import { describe, expect, it } from 'vitest';
import { CubeState, Move } from '../src/cube/types';
import { applyMoves, formatAlgorithm, invertAlgorithm, isCubeSolved, parseAlgorithm } from '../src/cube/transforms';
import { OLL_CASES } from '../src/tutor/cases/oll';
import { PLL_CASES } from '../src/tutor/cases/pll';
import { currentStageIn, runGuidedSolveIn } from '../src/tutor/engine';
import { CFOP_FULL_METHOD, CFOP_METHOD } from '../src/tutor/methods/cfop';
import {
  TOP_TURNS,
  YELLOW_TOP,
  describePll,
  firstTwoLayersSolved,
  ollPattern,
  topIsYellow,
} from './helpers/lastLayerFull';
import { seededRandom } from './helpers/scrambles';
import { checkedPlan, whiteTop } from './helpers/tutorSteps';

const stageOf = (state: CubeState) => currentStageIn(CFOP_FULL_METHOD, state)?.id;
const undo = (algorithm: string) => invertAlgorithm(parseAlgorithm(algorithm));

/** Only a turn of the top, or nothing: full-last-layer steps never regrip. */
function expectTopTurnOnly(setup: Move[], label: string) {
  expect(setup.length, label).toBeLessThanOrEqual(1);
  for (const move of setup) expect(move.kind === 'face' && move.face === 'U', label).toBe(true);
}

describe('CFOP full last layer: OLL and PLL in one look each', () => {
  it('lists the stages in order and shares cross and F2L with the 2-look method', () => {
    expect(CFOP_FULL_METHOD.stages.map((s) => s.id)).toEqual(['cross', 'f2l', 'oll', 'pll', 'auf']);
    expect(CFOP_FULL_METHOD.id).toBe('cfop');
    expect(CFOP_FULL_METHOD.stages.every((s) => s.top === 'yellow')).toBe(true);
    for (const id of ['cross', 'f2l', 'auf']) {
      expect(CFOP_FULL_METHOD.stages.find((s) => s.id === id)).toBe(CFOP_METHOD.stages.find((s) => s.id === id));
    }
  });

  it('recognises each of the 57 OLL cases from every side, whatever order the top pieces are in', () => {
    const random = seededRandom(57);
    const seen = new Set<string>();
    for (const c of OLL_CASES) {
      for (const turn of TOP_TURNS) {
        // Top pieces in the order some PLL case leaves them, the case itself, then a turn of the top.
        const arrangement = PLL_CASES[Math.floor(random() * PLL_CASES.length)];
        const start = applyMoves(YELLOW_TOP, [
          ...undo(arrangement.algorithm),
          ...TOP_TURNS[Math.floor(random() * 4)],
          ...undo(c.algorithm),
          ...turn,
        ]);
        const label = `${c.id} after ${formatAlgorithm(turn) || 'no turn'} on ${arrangement.id}`;
        expect(stageOf(start), label).toBe('oll');

        const plan = checkedPlan(CFOP_FULL_METHOD, start);
        expect(plan.caseId, label).toBe(c.id);
        expect(plan.caseName, label).toBe(c.name);
        expect(plan.stage, label).toBe('oll');
        expect(formatAlgorithm(plan.algorithm), label).toBe(c.algorithm);
        expect(plan.facts.lookFor, label).toBe(c.recognition);
        expectTopTurnOnly(plan.setupMoves, label);
        // After the line-up turn the student sees exactly the pattern the case describes.
        expect(ollPattern(applyMoves(plan.startState, plan.setupMoves)), label).toBe(c.pattern);
        expect(topIsYellow(plan.expectedState), label).toBe(true);
        expect(firstTwoLayersSolved(plan.expectedState), label).toBe(true);
        expect(['pll', 'auf', undefined], label).toContain(stageOf(plan.expectedState));
        seen.add(plan.caseId);
      }
    }
    expect(seen.size).toBe(57);
  });

  it('recognises each of the 21 PLL cases from every side and with the top turned any way', () => {
    const seen = new Set<string>();
    for (const c of PLL_CASES) {
      const look = describePll(applyMoves(YELLOW_TOP, undo(c.algorithm)));
      for (const before of TOP_TURNS) {
        for (const after of TOP_TURNS) {
          const start = applyMoves(YELLOW_TOP, [...before, ...undo(c.algorithm), ...after]);
          const label = `${c.id} between ${formatAlgorithm(before) || 'no turn'} and ${formatAlgorithm(after) || 'no turn'}`;
          expect(stageOf(start), label).toBe('pll');

          const plan = checkedPlan(CFOP_FULL_METHOD, start);
          expect(plan.caseId, label).toBe(c.id);
          expect(plan.caseName, label).toBe(c.name);
          expect(plan.stage, label).toBe('pll');
          expect(formatAlgorithm(plan.algorithm), label).toBe(c.algorithm);
          expect(plan.facts.lookFor, label).toBe(c.recognition);
          expectTopTurnOnly(plan.setupMoves, label);
          // After the line-up turn the sides show what the recognition text says.
          expect(describePll(applyMoves(plan.startState, plan.setupMoves)), label).toBe(look);
          expect(['auf', undefined], label).toContain(stageOf(plan.expectedState));
          seen.add(plan.caseId);
        }
      }
    }
    expect(seen.size).toBe(21);
  });

  it('finishes every OLL case on every arrangement of the top in at most three steps', () => {
    const random = seededRandom(21);
    for (const oll of OLL_CASES) {
      for (const arrangement of PLL_CASES) {
        const start = applyMoves(YELLOW_TOP, [
          ...undo(arrangement.algorithm),
          ...TOP_TURNS[Math.floor(random() * 4)],
          ...undo(oll.algorithm),
          ...TOP_TURNS[Math.floor(random() * 4)],
        ]);
        const solve = runGuidedSolveIn(CFOP_FULL_METHOD, start);
        const label = `${oll.id} on ${arrangement.id}`;
        expect(isCubeSolved(solve.finalState), label).toBe(true);
        expect(solve.steps[0].caseId, label).toBe(oll.id);
        // The OLL algorithm moves top pieces around too, so any PLL case (or none) may follow.
        const stages = solve.steps.map((s) => s.stage).join(' ');
        expect(['oll', 'oll auf', 'oll pll', 'oll pll auf'], label).toContain(stages);
      }
    }
  });

  it('skips a look that is already done', () => {
    const tPerm = PLL_CASES.find((c) => c.id === 'pll-t')!;
    const onlyPll = runGuidedSolveIn(CFOP_FULL_METHOD, applyMoves(YELLOW_TOP, [...TOP_TURNS[1], ...undo(tPerm.algorithm)]));
    expect(onlyPll.steps.map((s) => s.caseId)).toEqual(['pll-t', "auf-u'"]);
    expect(isCubeSolved(onlyPll.finalState)).toBe(true);

    const onlyTurn = runGuidedSolveIn(CFOP_FULL_METHOD, applyMoves(YELLOW_TOP, TOP_TURNS[3]));
    expect(onlyTurn.steps.map((s) => s.caseId)).toEqual(['auf-u']);
  });

  it('takes one step where the 2-look method takes two', () => {
    // OLL 33 has two yellow edges and two yellow corners; the E perm moves only corners.
    const start = applyMoves(YELLOW_TOP, [...undo(PLL_CASES[2].algorithm), ...undo(OLL_CASES[32].algorithm)]);
    const full = runGuidedSolveIn(CFOP_FULL_METHOD, start);
    const twoLook = runGuidedSolveIn(CFOP_METHOD, start);
    expect(full.steps.map((s) => s.caseId)).toEqual(['oll-33', 'pll-e']);
    expect(twoLook.steps.map((s) => s.stage).slice(0, 2)).toEqual(['oll-edges', 'oll-corners']);
    expect(full.steps.length).toBeLessThan(twoLook.steps.length);
    expect(isCubeSolved(twoLook.finalState)).toBe(true);
  });

  it('solves a scrambled cube from the first step to the last', () => {
    const start = applyMoves(whiteTop, parseAlgorithm("R U2 F' L D2 B R' U F2 L' D B2 U' R2 F"));
    const result = runGuidedSolveIn(CFOP_FULL_METHOD, start);
    expect(isCubeSolved(result.finalState)).toBe(true);
    const stages = result.steps.map((s) => s.stageIndex);
    expect([...stages].sort((a, b) => a - b)).toEqual(stages);
    const lastLayer = result.steps.filter((s) => !['cross', 'f2l'].includes(s.stage)).map((s) => s.stage);
    expect(lastLayer.length).toBeLessThanOrEqual(3);
    expect(lastLayer.every((id) => ['oll', 'pll', 'auf'].includes(id))).toBe(true);
    // The same cross and pairs as the 2-look method.
    const twoLook = runGuidedSolveIn(CFOP_METHOD, start);
    const firstTwoLayers = (steps: typeof result.steps) =>
      steps.filter((s) => ['cross', 'f2l'].includes(s.stage)).map((s) => [s.caseId, formatAlgorithm(s.algorithm)]);
    expect(firstTwoLayers(result.steps)).toEqual(firstTwoLayers(twoLook.steps));
  });
});
