/**
 * Fixed-seed scramble suite for the tutor engine.
 *
 * `npm test` runs 1,000 scrambles per method. `npm run test:tutor-soak` runs the same suite with
 * 10,000 per method (TUTOR_SCRAMBLES=10000); its results are recorded in docs/tutor/METHODS.md.
 * CFOP runs twice: with the 2-look last layer (`cfop`) and with the full one (`cfop-full`).
 */

import { describe, expect, it } from 'vitest';
import { applyMoves, isCubeSolved } from '../src/cube/transforms';
import { MethodId, MethodOptions, caseIdsByStage, caseIdsOf, countTurns, getMethod, runGuidedSolve } from '../src/tutor';
import { scrambledState } from './helpers/scrambles';

const SCRAMBLES = Number(process.env.TUTOR_SCRAMBLES ?? 1000);
const SEED = 2026;
/** From this many scrambles on, even the rarest full last-layer case (1 in 216) must turn up. */
const SOAK_SIZE = 10_000;

interface Variant {
  label: string;
  method: MethodId;
  options: MethodOptions;
}

const BEGINNER: Variant = { label: 'beginner', method: 'beginner', options: {} };
const CFOP: Variant = { label: 'cfop', method: 'cfop', options: {} };
const CFOP_FULL: Variant = { label: 'cfop-full', method: 'cfop', options: { lastLayer: 'full' } };

interface Tally {
  total: number;
  max: number;
}

interface SuiteResult {
  turns: Tally;
  steps: Tally;
  perStage: Map<string, Tally>;
  /** Steps per stage in one solve. */
  stepsPerStage: Map<string, Tally>;
  caseCounts: Map<string, number>;
}

const add = (tally: Tally, value: number) => {
  tally.total += value;
  tally.max = Math.max(tally.max, value);
};

function runSuite({ label: variant, method, options }: Variant): SuiteResult {
  const stageIds = getMethod(method, options).stages.map((s) => s.id);
  const known = caseIdsByStage(method, options);
  const result: SuiteResult = {
    turns: { total: 0, max: 0 },
    steps: { total: 0, max: 0 },
    perStage: new Map(stageIds.map((id) => [id, { total: 0, max: 0 }])),
    stepsPerStage: new Map(stageIds.map((id) => [id, { total: 0, max: 0 }])),
    caseCounts: new Map(),
  };

  for (let n = 0; n < SCRAMBLES; n++) {
    const start = scrambledState(SEED, n);
    const solve = runGuidedSolve(start, method, undefined, options);
    const label = `${variant} scramble ${n}`;
    if (!isCubeSolved(solve.finalState)) throw new Error(`${label} did not finish solved`);

    const stageTurns = new Map<string, number>();
    const stageSteps = new Map<string, number>();
    let state = start;
    let lastProgress = -1;
    let lastStage = 0;
    for (const step of solve.steps) {
      // Every step starts where the last one ended, replays exactly, and moves forward.
      if (JSON.stringify(step.startState) !== JSON.stringify(state)) throw new Error(`${label}: step does not start from the previous state`);
      const moves = [...step.setupMoves, ...step.algorithm];
      state = applyMoves(state, moves);
      if (JSON.stringify(state) !== JSON.stringify(step.expectedState)) throw new Error(`${label}: step ${step.stepIndex} does not replay`);
      if (step.progressAfter <= step.progressBefore || step.progressBefore < lastProgress) throw new Error(`${label}: step ${step.stepIndex} does not advance`);
      if (step.stageIndex < lastStage) throw new Error(`${label}: step ${step.stepIndex} goes back a stage`);
      lastProgress = step.progressAfter;
      lastStage = step.stageIndex;

      stageTurns.set(step.stage, (stageTurns.get(step.stage) ?? 0) + countTurns(moves));
      stageSteps.set(step.stage, (stageSteps.get(step.stage) ?? 0) + 1);
      result.caseCounts.set(step.caseId, (result.caseCounts.get(step.caseId) ?? 0) + 1);
      if (!known[step.stage]?.includes(step.caseId)) throw new Error(`${label}: unknown case ${step.stage}/${step.caseId}`);
      if (step.options?.lastLayer !== options.lastLayer) throw new Error(`${label}: step ${step.stepIndex} lost the learner settings`);
    }

    add(result.turns, solve.turnCount);
    add(result.steps, solve.steps.length);
    for (const id of stageIds) add(result.perStage.get(id)!, stageTurns.get(id) ?? 0);
    for (const id of stageIds) add(result.stepsPerStage.get(id)!, stageSteps.get(id) ?? 0);
  }
  return result;
}

function report(method: string, r: SuiteResult): string {
  const avg = (t: Tally) => (t.total / SCRAMBLES).toFixed(1);
  const lines = [
    `${method}: ${SCRAMBLES} scrambles (seed ${SEED}) all solved`,
    `  turns: average ${avg(r.turns)}, maximum ${r.turns.max}; steps: average ${avg(r.steps)}, maximum ${r.steps.max}`,
    ...[...r.perStage].map(([id, t]) => `  ${id.padEnd(24)} average ${avg(t).padStart(5)}  maximum ${String(t.max).padStart(3)}`),
  ];
  return lines.join('\n');
}

describe(`tutor scramble suite (${SCRAMBLES} scrambles per method, seed ${SEED})`, () => {
  const results = new Map<string, SuiteResult>();
  const suite = (variant: Variant) => {
    if (!results.has(variant.label)) results.set(variant.label, runSuite(variant));
    return results.get(variant.label)!;
  };
  const timeout = 60_000 + SCRAMBLES * 60;
  const average = (t: Tally) => t.total / SCRAMBLES;

  for (const variant of [BEGINNER, CFOP, CFOP_FULL]) {
    it(`${variant.label}: every scramble solves, every step replays and advances`, { timeout }, () => {
      const r = suite(variant);
      console.info(report(variant.label, r));
      expect(r.turns.total).toBeGreaterThan(0);
    });
  }

  for (const variant of [BEGINNER, CFOP]) {
    it(`${variant.label}: every case in the tables is triggered, and no other`, { timeout }, () => {
      const r = suite(variant);
      const missing = caseIdsOf(variant.method).filter((id) => !r.caseCounts.has(id));
      expect(missing).toEqual([]);
      expect([...r.caseCounts.keys()].filter((id) => !caseIdsOf(variant.method).includes(id))).toEqual([]);
    });
  }

  it('cfop-full: only table cases are planned, and at soak size every one of them', { timeout }, () => {
    const r = suite(CFOP_FULL);
    const ids = caseIdsOf('cfop', CFOP_FULL.options);
    expect([...r.caseCounts.keys()].filter((id) => !ids.includes(id))).toEqual([]);
    // 1,000 random scrambles can miss a 1-in-216 case; tests/tutor-cfop-full-last-layer.test.ts
    // sets every one of the 57 + 21 cases up directly instead.
    const missing = ids.filter((id) => !r.caseCounts.has(id));
    console.info(`cfop-full: ${ids.length - missing.length} of ${ids.length} cases triggered`);
    if (SCRAMBLES >= SOAK_SIZE) expect(missing).toEqual([]);
    expect(missing.filter((id) => !id.startsWith('oll-') && !id.startsWith('pll-'))).toEqual([]);
  });

  it('cfop: the cross never takes more than 8 turns and solves stay short', { timeout }, () => {
    const r = suite(CFOP);
    expect(r.perStage.get('cross')!.max).toBeLessThanOrEqual(8);
    expect(r.perStage.get('auf')!.max).toBeLessThanOrEqual(1);
    expect(r.turns.total / SCRAMBLES).toBeLessThan(85);
    expect(r.turns.max).toBeLessThanOrEqual(130);
    expect(r.steps.max).toBeLessThanOrEqual(18);
  });

  it('cfop-full: same first two layers as 2-look, then one OLL, one PLL and one last turn at most', { timeout }, () => {
    const full = suite(CFOP_FULL);
    const twoLook = suite(CFOP);
    for (const stage of ['cross', 'f2l']) {
      expect(full.perStage.get(stage)).toEqual(twoLook.perStage.get(stage));
      expect(full.stepsPerStage.get(stage)).toEqual(twoLook.stepsPerStage.get(stage));
    }
    for (const stage of ['oll', 'pll', 'auf']) expect(full.stepsPerStage.get(stage)!.max).toBe(1);
    expect(full.perStage.get('auf')!.max).toBeLessThanOrEqual(1);
    // Fewer steps and fewer turns than four 2-look steps.
    expect(average(full.steps)).toBeLessThan(average(twoLook.steps) - 1);
    expect(average(full.turns)).toBeLessThan(average(twoLook.turns) - 5);
  });

  it("beginner: move counts stay within the method's known range", { timeout }, () => {
    const r = suite(BEGINNER);
    expect(r.turns.total / SCRAMBLES).toBeLessThan(175);
    expect(r.turns.max).toBeLessThanOrEqual(280);
    expect(r.steps.max).toBeLessThanOrEqual(40);
    // One half turn per petal, plus at most one line-up turn each.
    expect(r.perStage.get('white-cross')!.max).toBeLessThanOrEqual(8);
  });
});
