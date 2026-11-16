import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyMoves, isCubeSolved, parseAlgorithm } from '../src/cube/transforms';
import {
  CASE_IDS,
  METHODS,
  MethodId,
  TutorPlanError,
  caseIdsOf,
  countTurns,
  currentStage,
  getMethod,
  planNextStep,
  progress,
  runGuidedSolve,
} from '../src/tutor';
import { scrambledState } from './helpers/scrambles';
import { whiteTop } from './helpers/tutorSteps';

const METHOD_IDS: MethodId[] = ['beginner', 'cfop'];

describe('tutor public API', () => {
  it('offers both methods by id and rejects unknown ones', () => {
    expect(Object.keys(METHODS).sort()).toEqual(['beginner', 'cfop']);
    for (const id of METHOD_IDS) expect(getMethod(id).id).toBe(id);
    expect(() => getMethod('roux' as MethodId)).toThrow(TutorPlanError);
    expect(() => planNextStep(whiteTop, 'roux' as MethodId)).toThrow(TutorPlanError);
  });

  it('reports the stage and progress of a cube, and nothing left to do when solved', () => {
    const scrambled = scrambledState(51, 0);
    expect(currentStage(scrambled, 'beginner')?.id).toBe('daisy');
    expect(currentStage(scrambled, 'cfop')?.id).toBe('cross');
    expect(progress(scrambled, 'cfop')).toMatchObject({ stageIndex: 0, stage: 'cross', done: false });
    for (const id of METHOD_IDS) {
      expect(currentStage(whiteTop, id)).toBeNull();
      expect(planNextStep(whiteTop, id)).toBeNull();
      expect(progress(whiteTop, id)).toMatchObject({ done: true, stageIndex: getMethod(id).stages.length });
    }
  });

  it('plans one step at a time from the grip given', () => {
    const scrambled = scrambledState(51, 1);
    const plan = planNextStep(scrambled, 'cfop', { top: 'yellow', front: 'blue' }, 3)!;
    expect(plan).toMatchObject({ method: 'cfop', stage: 'cross', stageIndex: 0, stepIndex: 3 });
    expect(plan.grip).toEqual({ top: 'yellow', front: 'blue' });
    expect(plan.setupMoves).toEqual([]);
    expect(planNextStep(scrambled, 'cfop', { top: 'yellow', front: 'blue' }, 3)).toEqual(plan);
  });

  it('guides a scrambled cube to solved with either method', () => {
    for (const id of METHOD_IDS) {
      const start = scrambledState(51, 2);
      const result = runGuidedSolve(start, id);
      expect(isCubeSolved(result.finalState)).toBe(true);
      expect(applyMoves(start, result.moves)).toEqual(result.finalState);
      expect(result.turnCount).toBe(countTurns(result.moves));
      expect(result.steps.map((s) => s.stepIndex)).toEqual(result.steps.map((_, i) => i));
      const known = caseIdsOf(id);
      for (const step of result.steps) {
        expect(known).toContain(step.caseId);
        expect(CASE_IDS[id][step.stage]).toContain(step.caseId);
      }
    }
  });

  it('starts from the grip the student holds and ends in the grip the last step left', () => {
    const start = scrambledState(51, 3);
    const result = runGuidedSolve(start, 'cfop', { top: 'red', front: 'white' });
    expect(result.steps[0].grip).toEqual({ top: 'red', front: 'white' });
    expect(result.steps[0].setupMoves[0].kind).toBe('rotation');
    expect(isCubeSolved(result.finalState)).toBe(true);
    expect(result.finalState.U[4]).toBe('yellow');
  });

  it('lists case ids for exactly the stages each method has', () => {
    for (const id of METHOD_IDS) {
      expect(Object.keys(CASE_IDS[id])).toEqual(getMethod(id).stages.map((s) => s.id));
      const all = caseIdsOf(id);
      expect(new Set(all).size).toBe(all.length);
    }
    expect(caseIdsOf('cfop')).toHaveLength(1 + 43 + 3 + 7 + 2 + 4 + 3);
    expect(caseIdsOf('beginner')).toHaveLength(22);
  });
});

describe('tutor engine purity', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });

  it('imports nothing but the cube engine: no DOM, Three.js, React, solver or network', () => {
    const sources = files(join(__dirname, '..', 'src', 'tutor'));
    expect(sources.length).toBeGreaterThan(10);
    for (const path of sources) {
      const text = readFileSync(path, 'utf8');
      const imports = [...text.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const target of imports) {
        expect(target.startsWith('./') || target.startsWith('../'), `${path} imports ${target}`).toBe(true);
        expect(/\/(three|components|stores|vision|solver|app|lib)\//.test(target), `${path} imports ${target}`).toBe(false);
      }
      expect(/\b(document|window|navigator|fetch|localStorage)\s*[.(]/.test(text), path).toBe(false);
      expect(/Math\.random|Date\.now/.test(text), `${path} must be deterministic`).toBe(false);
    }
  });

  it('plans the same step for the same cube every time', () => {
    for (const id of METHOD_IDS) {
      const start = applyMoves(scrambledState(51, 4), parseAlgorithm('x'));
      expect(runGuidedSolve(start, id).moves).toEqual(runGuidedSolve(start, id).moves);
    }
  });
});
