/**
 * Cubyntra - Trainer sets and drills: every case of every set sets up, replays and checks
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { applyMoves, formatAlgorithm, isCubeSolved, parseAlgorithm } from '../src/cube/transforms';
import { planNextStep } from '../src/tutor';
import { allCaseIds } from '../src/tutor/caseIds';
import { caseNote } from '../src/coach/caseNotes';
import { buildCoachFacts } from '../src/coach/facts';
import { verifyCheckpoint, observationOf } from '../src/tutor/checkpoint';
import { TRAINER_SETS, trainerCaseIds, trainerSet } from '../src/learn/trainerSets';
import { buildDrill, drillMoves, randomAuf } from '../src/learn/drill';

describe('trainer sets', () => {
  it('has the five sets with the expected case counts', () => {
    expect(TRAINER_SETS.map((s) => [s.id, s.cases.length])).toEqual([
      ['beginner', 7],
      ['f2l', 41],
      ['last-layer-2look', 16],
      ['oll', 57],
      ['pll', 21],
    ]);
  });

  it('uses only real tutor case ids, each once per set, with coach notes', () => {
    const known = new Set(allCaseIds());
    for (const set of TRAINER_SETS) {
      const ids = set.cases.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        expect(known.has(id), id).toBe(true);
        expect(caseNote(id), id).toBeDefined();
      }
    }
  });

  it('lists groups in table order and filters by group', () => {
    expect(trainerSet('last-layer-2look').groups).toEqual(['OLL: yellow cross', 'OLL: yellow top', 'PLL: corners', 'PLL: edges']);
    expect(trainerCaseIds('last-layer-2look', 'PLL: corners')).toEqual(['pll-corners-t', 'pll-corners-y']);
    expect(trainerCaseIds('pll').length).toBe(21);
    expect(trainerCaseIds('oll', 'Dot')).toEqual(['oll-01', 'oll-02', 'oll-03', 'oll-04', 'oll-17', 'oll-18', 'oll-19', 'oll-20']);
  });
});

describe('drills', () => {
  for (const set of TRAINER_SETS) {
    it(`sets up every ${set.name} case from every top turn and ends solved`, () => {
      for (const c of set.cases) {
        for (const auf of c.auf ? [0, 1, 2, 3] : [0]) {
          const { plan } = buildDrill(c, auf);
          expect(plan.caseId).toBe(c.id);
          expect(plan.stage).toBe(c.stage);
          expect(plan.grip).toEqual({ top: c.top, front: 'green' });
          expect(isCubeSolved(plan.startState), `${c.id} starts solved`).toBe(false);
          expect(isCubeSolved(plan.expectedState)).toBe(true);
          expect(applyMoves(plan.startState, [...plan.setupMoves, ...plan.algorithm])).toEqual(plan.expectedState);
          expect(plan.checkpoint.facesToShow.length).toBeGreaterThan(0);
          if (c.lastLayer === 'full') expect(plan.options).toEqual({ lastLayer: 'full' });
          else expect(plan.options).toBeUndefined();
        }
      }
    });
  }

  it('is the case the tutor engine itself would plan from that cube (CFOP sets)', () => {
    for (const id of ['f2l', 'last-layer-2look', 'oll', 'pll'] as const) {
      for (const c of trainerSet(id).cases) {
        const { plan } = buildDrill(c, 0);
        const engine = planNextStep(plan.startState, 'cfop', plan.grip, 0, c.lastLayer === 'full' ? { lastLayer: 'full' } : {});
        expect(engine?.caseId, c.id).toBe(c.id);
      }
    }
  });

  it('starts with the top turn undone, folded into the algorithm when it starts with a top turn', () => {
    const alg = parseAlgorithm("R U R'");
    expect(formatAlgorithm(drillMoves(alg, 1).setupMoves)).toBe("U'");
    expect(formatAlgorithm(drillMoves(alg, 0).setupMoves)).toBe('');
    const middle = parseAlgorithm("U R U' R' U' F' U F");
    expect(drillMoves(middle, 1)).toEqual({ setupMoves: [], algorithm: middle.slice(1) });
    expect(formatAlgorithm(drillMoves(middle, 2).algorithm)).toBe("U' R U' R' U' F' U F");
  });

  it('only turns the top at random for cases that allow it', () => {
    const f2l = trainerSet('f2l').cases[0];
    const corner = trainerSet('beginner').cases.find((c) => c.id === 'white-corner-below')!;
    expect([0, 0.3, 0.6, 0.99].map((r) => randomAuf(f2l, () => r))).toEqual([0, 1, 2, 3]);
    expect(randomAuf(corner, () => 0.99)).toBe(0);
    expect(buildDrill(corner, 3).auf).toBe(0);
  });

  it('passes its own checkpoint when the student does the moves, and fails it otherwise', () => {
    const c = trainerSet('pll').cases.find((x) => x.id === 'pll-t')!;
    const { plan } = buildDrill(c, 2);
    const shown = plan.checkpoint.facesToShow.map((f) => observationOf(plan.expectedState, f));
    expect(verifyCheckpoint(plan, shown).status).toBe('match');
    const untouched = plan.checkpoint.facesToShow.map((f) => observationOf(plan.startState, f));
    expect(verifyCheckpoint(plan, untouched).status).toBe('mismatch');
  });

  it('gives the coach facts it accepts', () => {
    const c = trainerSet('oll').cases[20];
    const facts = buildCoachFacts(buildDrill(c, 1).plan, 3);
    expect(facts.caseId).toBe(c.id);
    expect(facts.stage).toBe('oll');
    expect(facts.algorithm.length).toBeGreaterThan(0);
  });
});
