/**
 * Cubyntra - Tutor store: the learning features (last-layer setting, stage records, streak days,
 * trainer answers, timer history, joining a paired device's step)
 * Necookie Labs (c) 2026
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FACES, createSolvedCubeState } from '../src/cube/constants';
import { applyMoves, parseAlgorithm } from '../src/cube/transforms';
import { planNextStep } from '../src/tutor';
import { observationOf } from '../src/tutor/checkpoint';
import type { StepPlan } from '../src/tutor/types';
import { defaultStudentProfile, type StudentProfile } from '../src/lib/studentProfile';
import { localDay } from '../src/learn/mastery';
import { MAX_TIMER_HISTORY, type TimerSolve } from '../src/learn/types';
import { scrambledState } from './helpers/scrambles';
import { fakeStudentServer, type FakeStudentServer } from './helpers/fakeStudentServer';

const planMock = vi.hoisted(() => vi.fn());
vi.mock('@/solver/client', () => ({ planStepInWorker: planMock }));

const { useTutorStore, flushTutorSaves, methodOptionsFor, resetPendingProfileOps } = await import('../src/stores/useTutorStore');

const store = () => useTutorStore.getState();
const scramble = scrambledState(9, 1);
let server: FakeStudentServer;
let saved: StudentProfile[];

beforeEach(async () => {
  planMock.mockReset();
  planMock.mockImplementation(async (state, method, grip, stepIndex, options) =>
    planNextStep(state, method, grip, stepIndex, options)
  );
  server = fakeStudentServer();
  vi.stubGlobal('fetch', server.fetch);
  resetPendingProfileOps();
  useTutorStore.setState({ token: 'secret', profile: defaultStudentProfile(), profileStatus: 'ready' });
  store().abandonSolve();
  await flushTutorSaves();
  saved = server.saved;
});
afterEach(() => vi.unstubAllGlobals());

const pass = (plan: StepPlan) => {
  store().beginCheckpoint();
  for (const f of FACES) store().submitObservation(observationOf(plan.expectedState, f));
};

describe('last-layer setting', () => {
  it('only selects the full variant for CFOP', () => {
    expect(methodOptionsFor('cfop', { lastLayer: 'full' })).toEqual({ lastLayer: 'full' });
    expect(methodOptionsFor('cfop', { lastLayer: '2-look' })).toBeUndefined();
    expect(methodOptionsFor('beginner', { lastLayer: 'full' })).toBeUndefined();
  });

  it('passes lastLayer full to the worker for CFOP plans', async () => {
    store().updateSettings({ lastLayer: 'full' });
    await store().startSolve(scramble, 'cfop');
    expect(planMock.mock.calls.at(-1)?.[4]).toEqual({ lastLayer: 'full' });
    expect(store().plan?.options).toEqual({ lastLayer: 'full' });
  });

  it('leaves the worker call as before for 2-look and for the beginner method', async () => {
    await store().startSolve(scramble, 'cfop');
    expect(planMock.mock.calls.at(-1)).toHaveLength(4);
    store().updateSettings({ lastLayer: 'full' });
    await store().startSolve(scramble, 'beginner');
    expect(planMock.mock.calls.at(-1)).toHaveLength(4);
  });
});

describe('stage records', () => {
  it('records the highest hint of a finished stage and starts the next stage at zero', async () => {
    await store().startSolve(scramble, 'cfop');
    const cross = store().plan!;
    expect(cross.stage).toBe('cross');
    store().noteHint(2);
    store().noteHint(1);
    expect(store().stageHint).toBe(2);
    pass(cross);
    await store().advance();
    expect(store().profile.stats.stages).toEqual({ 'cfop/cross': [2] });
    expect(store().stageHint).toBe(0);
    await flushTutorSaves();
    expect(saved.at(-1)?.stats.stages).toEqual({ 'cfop/cross': [2] });
  });

  it('keeps the hint across steps of one stage and saves it with the solve', async () => {
    await store().startSolve(scramble, 'cfop');
    pass(store().plan!);
    await store().advance(); // cross done; now F2L, which takes several steps
    const f2l = store().plan!;
    expect(f2l.stage).toBe('f2l');
    store().noteHint(3);
    pass(f2l);
    await store().advance();
    expect(store().plan!.stage).toBe('f2l');
    expect(store().stageHint).toBe(3);
    expect(store().profile.currentSolve?.stageHint).toBe(3);
    expect(store().profile.stats.stages['cfop/f2l']).toBeUndefined();
  });

  it('marks today as active when a solve finishes', async () => {
    await store().startSolve(applyMoves(createSolvedCubeState(), parseAlgorithm('U')), 'cfop');
    const last = store().plan!;
    pass(last);
    await store().advance();
    expect(store().phase).toBe('solved');
    expect(store().profile.stats.activeDays).toEqual([localDay(new Date())]);
    expect(store().profile.stats.solvesCompleted).toBe(1);
  });
});

describe('trainer and timer', () => {
  it('answers a trainer case into its Leitner card and marks the day', () => {
    store().answerTrainerCase('oll-21', false);
    store().answerTrainerCase('oll-21', true);
    const { trainer, stats } = store().profile;
    expect(trainer.turn).toBe(2);
    expect(trainer.cards['oll-21']).toMatchObject({ box: 2, seen: 2, missed: 1 });
    expect(stats.activeDays).toEqual([localDay(new Date())]);
    store().setTrainerSet('pll');
    expect(store().profile.trainer.set).toBe('pll');
  });

  it('keeps at most the newest timer solves and edits the newest one', () => {
    const solve = (ms: number): TimerSolve => ({ ms, penalty: 'none', at: '2026-11-17T10:00:00.000Z', scramble: 'R U' });
    for (let i = 0; i < MAX_TIMER_HISTORY + 5; i++) store().addTimerSolve(solve(1000 + i));
    const history = store().profile.timer.history;
    expect(history).toHaveLength(MAX_TIMER_HISTORY);
    expect(history[0].ms).toBe(1005);
    store().setLastTimerPenalty('+2');
    expect(store().profile.timer.history.at(-1)?.penalty).toBe('+2');
    store().deleteLastTimerSolve();
    expect(store().profile.timer.history.at(-1)?.ms).toBe(1000 + MAX_TIMER_HISTORY + 3);
  });
});

describe('following the paired device', () => {
  it('plans the very step the other device shows when no solve is open here', async () => {
    const other = planNextStep(scramble, 'cfop', { top: 'yellow', front: 'red' }, 4)!;
    await store().followRemoteStep({ state: other.startState, method: 'cfop', stepIndex: 4 });
    expect(store().phase).toBe('step');
    expect(store().plan).toEqual(other);
  });

  it("saves the step as the other device's solve, so neither overwrites the other", async () => {
    const other = planNextStep(scramble, 'cfop', { top: 'yellow', front: 'red' }, 4)!;
    // Later than any solve this file opens or closes, whatever today's date is.
    const startedAt = new Date(Date.now() + 3_600_000).toISOString();
    await store().followRemoteStep({ state: other.startState, method: 'cfop', stepIndex: 4, solveStartedAt: startedAt });
    await flushTutorSaves();
    expect(store().solveStartedAt).toBe(startedAt);
    expect(server.profile().currentSolve).toMatchObject({ startedAt, stepIndex: 4 });
  });

  it('does not replace a solve already open', async () => {
    await store().startSolve(scramble, 'beginner');
    const mine = store().plan;
    await store().followRemoteStep({ state: scramble, method: 'cfop', stepIndex: 2 });
    expect(store().plan).toBe(mine);
  });
});
