/**
 * Fixed-seed scramble suite for the tutor engine.
 *
 * `npm test` runs 1,000 scrambles per method. `npm run test:tutor-soak` runs the same suite with
 * 10,000 per method (TUTOR_SCRAMBLES=10000); its results are recorded in docs/tutor/METHODS.md.
 */

import { describe, expect, it } from 'vitest';
import { applyMoves, isCubeSolved } from '../src/cube/transforms';
import { CASE_IDS, MethodId, caseIdsOf, countTurns, getMethod, runGuidedSolve } from '../src/tutor';
import { scrambledState } from './helpers/scrambles';

const SCRAMBLES = Number(process.env.TUTOR_SCRAMBLES ?? 1000);
const SEED = 2026;

interface Tally {
  total: number;
  max: number;
}

interface SuiteResult {
  turns: Tally;
  steps: Tally;
  perStage: Map<string, Tally>;
  caseCounts: Map<string, number>;
}

const add = (tally: Tally, value: number) => {
  tally.total += value;
  tally.max = Math.max(tally.max, value);
};

function runSuite(method: MethodId): SuiteResult {
  const stageIds = getMethod(method).stages.map((s) => s.id);
  const result: SuiteResult = {
    turns: { total: 0, max: 0 },
    steps: { total: 0, max: 0 },
    perStage: new Map(stageIds.map((id) => [id, { total: 0, max: 0 }])),
    caseCounts: new Map(),
  };

  for (let n = 0; n < SCRAMBLES; n++) {
    const start = scrambledState(SEED, n);
    const solve = runGuidedSolve(start, method);
    const label = `${method} scramble ${n}`;
    if (!isCubeSolved(solve.finalState)) throw new Error(`${label} did not finish solved`);

    const stageTurns = new Map<string, number>();
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
      result.caseCounts.set(step.caseId, (result.caseCounts.get(step.caseId) ?? 0) + 1);
      if (!CASE_IDS[method][step.stage]?.includes(step.caseId)) throw new Error(`${label}: unknown case ${step.stage}/${step.caseId}`);
    }

    add(result.turns, solve.turnCount);
    add(result.steps, solve.steps.length);
    for (const id of stageIds) add(result.perStage.get(id)!, stageTurns.get(id) ?? 0);
  }
  return result;
}

function report(method: MethodId, r: SuiteResult): string {
  const avg = (t: Tally) => (t.total / SCRAMBLES).toFixed(1);
  const lines = [
    `${method}: ${SCRAMBLES} scrambles (seed ${SEED}) all solved`,
    `  turns: average ${avg(r.turns)}, maximum ${r.turns.max}; steps: average ${avg(r.steps)}, maximum ${r.steps.max}`,
    ...[...r.perStage].map(([id, t]) => `  ${id.padEnd(24)} average ${avg(t).padStart(5)}  maximum ${String(t.max).padStart(3)}`),
  ];
  return lines.join('\n');
}

describe(`tutor scramble suite (${SCRAMBLES} scrambles per method, seed ${SEED})`, () => {
  const results = new Map<MethodId, SuiteResult>();
  const suite = (method: MethodId) => {
    if (!results.has(method)) results.set(method, runSuite(method));
    return results.get(method)!;
  };
  const timeout = 60_000 + SCRAMBLES * 60;

  for (const method of ['beginner', 'cfop'] as const) {
    it(`${method}: every scramble solves, every step replays and advances`, { timeout }, () => {
      const r = suite(method);
      console.info(report(method, r));
      expect(r.turns.total).toBeGreaterThan(0);
    });

    it(`${method}: every case in the tables is triggered, and no other`, { timeout }, () => {
      const r = suite(method);
      const missing = caseIdsOf(method).filter((id) => !r.caseCounts.has(id));
      expect(missing).toEqual([]);
      expect([...r.caseCounts.keys()].filter((id) => !caseIdsOf(method).includes(id))).toEqual([]);
    });
  }

  it('cfop: the cross never takes more than 8 turns and solves stay short', { timeout }, () => {
    const r = suite('cfop');
    expect(r.perStage.get('cross')!.max).toBeLessThanOrEqual(8);
    expect(r.perStage.get('auf')!.max).toBeLessThanOrEqual(1);
    expect(r.turns.total / SCRAMBLES).toBeLessThan(85);
    expect(r.turns.max).toBeLessThanOrEqual(130);
    expect(r.steps.max).toBeLessThanOrEqual(18);
  });

  it("beginner: move counts stay within the method's known range", { timeout }, () => {
    const r = suite('beginner');
    expect(r.turns.total / SCRAMBLES).toBeLessThan(175);
    expect(r.turns.max).toBeLessThanOrEqual(280);
    expect(r.steps.max).toBeLessThanOrEqual(40);
    // One half turn per petal, plus at most one line-up turn each.
    expect(r.perStage.get('white-cross')!.max).toBeLessThanOrEqual(8);
  });
});
