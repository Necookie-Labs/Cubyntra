/**
 * Tutor jobs in the solver worker: the handlers answer like the tutor engine, plans survive the
 * structured clone of a worker boundary, and the client falls back to the main thread.
 */

import { describe, expect, it } from 'vitest';
import { createSolvedCubeState } from '../src/cube/constants';
import { applyMoves, parseAlgorithm } from '../src/cube/transforms';
import { dispatch } from '../src/solver/handlers';
import {
  SolverClient,
  type WorkerLike,
  guidedSolveInWorker,
  planStepInWorker,
  tutorProgressInWorker,
} from '../src/solver/client';
import type { WorkerRequest, WorkerResponse } from '../src/solver/protocol';
import { planNextStep, progress, runGuidedSolve } from '../src/tutor';
import type { MethodId } from '../src/tutor';
import { scrambledState } from './helpers/scrambles';

const METHOD_IDS: MethodId[] = ['beginner', 'cfop'];
const scrambled = scrambledState(4, 1);

/** Answers like the real worker: structured clone in, structured clone out. */
class CloningWorker implements WorkerLike {
  posted: WorkerRequest[] = [];
  private listeners: Record<string, Array<(e: never) => void>> = {};
  addEventListener(type: string, listener: (e: never) => void): void {
    (this.listeners[type] ??= []).push(listener);
  }
  postMessage(message: WorkerRequest): void {
    this.posted.push(message);
    void dispatch(structuredClone(message)).then((reply) => {
      for (const l of this.listeners.message ?? []) l({ data: structuredClone(reply) } as never);
    });
  }
  terminate(): void {}
}

describe('tutor worker jobs', () => {
  it.each(METHOD_IDS)('plans the same %s step as the engine, and the plan survives a structured clone', async (method) => {
    const grip = { top: 'yellow', front: 'red' } as const;
    const reply = await dispatch({ id: 1, type: 'tutor.plan', state: scrambled, method, grip, stepIndex: 3 });
    expect(reply).toMatchObject({ id: 1, type: 'tutor.plan', ok: true });
    const plan = (reply as Extract<WorkerResponse, { ok: true; type: 'tutor.plan' }>).result;
    const direct = planNextStep(scrambled, method, grip, 3);
    expect(plan).toEqual(direct);
    expect(plan?.stepIndex).toBe(3);
    expect(plan?.grip).toEqual(grip);
    // Plain data only: a clone is deep-equal (a class instance or function would not be).
    expect(structuredClone(plan)).toEqual(plan);
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  it('uses the stored grip and step 0 when they are left out', async () => {
    const reply = await dispatch({ id: 2, type: 'tutor.plan', state: scrambled, method: 'cfop' });
    const plan = (reply as Extract<WorkerResponse, { ok: true; type: 'tutor.plan' }>).result;
    expect(plan).toEqual(planNextStep(scrambled, 'cfop'));
    expect(plan?.grip).toEqual({ top: 'white', front: 'green' });
  });

  it('returns null for a solved cube', async () => {
    const reply = await dispatch({ id: 3, type: 'tutor.plan', state: createSolvedCubeState(), method: 'beginner' });
    expect(reply).toEqual({ id: 3, type: 'tutor.plan', ok: true, result: null });
  });

  it('reports progress', async () => {
    const reply = await dispatch({ id: 4, type: 'tutor.progress', state: scrambled, method: 'beginner' });
    expect(reply).toEqual({ id: 4, type: 'tutor.progress', ok: true, result: progress(scrambled, 'beginner') });
  });

  it('runs a guided solve whose steps chain to a solved cube', async () => {
    const reply = await dispatch({ id: 5, type: 'tutor.guidedSolve', state: scrambled, method: 'cfop' });
    const solve = (reply as Extract<WorkerResponse, { ok: true; type: 'tutor.guidedSolve' }>).result;
    expect(solve).toEqual(runGuidedSolve(scrambled, 'cfop'));
    expect(structuredClone(solve)).toEqual(solve);
  });

  it('passes the learner settings on to every tutor job', async () => {
    const options = { lastLayer: 'full' } as const;
    // The first two layers done: the two last-layer variants differ from here on.
    const state = runGuidedSolve(scrambled, 'cfop').steps.find((s) => !['cross', 'f2l'].includes(s.stage))!.startState;

    const planned = await dispatch({ id: 7, type: 'tutor.plan', state, method: 'cfop', stepIndex: 2, options });
    const plan = (planned as Extract<WorkerResponse, { ok: true; type: 'tutor.plan' }>).result;
    expect(plan).toEqual(planNextStep(state, 'cfop', undefined, 2, options));
    expect(plan?.options).toEqual(options);
    expect(['oll', 'pll']).toContain(plan?.stage);
    expect(structuredClone(plan)).toEqual(plan);

    const reported = await dispatch({ id: 8, type: 'tutor.progress', state, method: 'cfop', options });
    expect(reported).toEqual({ id: 8, type: 'tutor.progress', ok: true, result: progress(state, 'cfop', options) });

    const solved = await dispatch({ id: 9, type: 'tutor.guidedSolve', state, method: 'cfop', options });
    const solve = (solved as Extract<WorkerResponse, { ok: true; type: 'tutor.guidedSolve' }>).result;
    expect(solve).toEqual(runGuidedSolve(state, 'cfop', undefined, options));
    expect(solve.steps.every((s) => s.options?.lastLayer === 'full')).toBe(true);

    // Left out, or 2-look by name: the default plan, with no settings on it.
    const byName = await dispatch({ id: 10, type: 'tutor.plan', state, method: 'cfop', options: { lastLayer: '2-look' } });
    expect((byName as Extract<WorkerResponse, { ok: true; type: 'tutor.plan' }>).result).toEqual(planNextStep(state, 'cfop'));
  });

  it('turns an unknown setting into an error reply', async () => {
    const reply = await dispatch({
      id: 11,
      type: 'tutor.plan',
      state: scrambled,
      method: 'cfop',
      options: { lastLayer: 'zbll' as 'full' },
    });
    expect(reply).toMatchObject({ id: 11, type: 'tutor.plan', ok: false, error: expect.stringMatching(/last-layer/i) });
  });

  it('turns a plan error into an error reply', async () => {
    // Yellow cannot be on top with white in front: the grip is impossible.
    const reply = await dispatch({
      id: 6,
      type: 'tutor.plan',
      state: scrambled,
      method: 'beginner',
      grip: { top: 'yellow', front: 'white' },
    });
    expect(reply).toMatchObject({ id: 6, type: 'tutor.plan', ok: false, error: expect.stringMatching(/grip/i) });
  });
});

describe('tutor jobs through the client', () => {
  it('goes through a worker, cloning both ways', async () => {
    const worker = new CloningWorker();
    const client = new SolverClient({ createWorker: () => worker });
    const state = applyMoves(createSolvedCubeState(), parseAlgorithm("R U R' U'"));
    const [plan, prog] = await Promise.all([
      client.request('tutor.plan', { state, method: 'cfop' }),
      client.request('tutor.progress', { state, method: 'cfop' }),
    ]);
    expect(plan).toEqual(planNextStep(state, 'cfop'));
    expect(prog).toEqual(progress(state, 'cfop'));
    expect(worker.posted.map((m) => m.type)).toEqual(['tutor.plan', 'tutor.progress']);
  });

  it('falls back to the main thread where Worker is undefined', async () => {
    expect(typeof Worker).toBe('undefined');
    await expect(planStepInWorker(scrambled, 'beginner')).resolves.toEqual(planNextStep(scrambled, 'beginner'));
    await expect(tutorProgressInWorker(scrambled, 'beginner')).resolves.toEqual(progress(scrambled, 'beginner'));
    const options = { lastLayer: 'full' } as const;
    await expect(planStepInWorker(scrambled, 'cfop', undefined, 1, options)).resolves.toEqual(
      planNextStep(scrambled, 'cfop', undefined, 1, options)
    );
    await expect(tutorProgressInWorker(scrambled, 'cfop', options)).resolves.toEqual(progress(scrambled, 'cfop', options));
    await expect(guidedSolveInWorker(scrambled, 'cfop', undefined, options)).resolves.toEqual(
      runGuidedSolve(scrambled, 'cfop', undefined, options)
    );
  });
});
