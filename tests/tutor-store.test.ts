/**
 * Cubyntra - Tutor session store: resume, next step, checkpoint outcomes
 * Necookie Labs (c) 2026
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FACES, createSolvedCubeState } from '../src/cube/constants';
import { applyMoves, invertMove } from '../src/cube/transforms';
import { viewInGrip } from '../src/cube/grip';
import { planNextStep } from '../src/tutor';
import { observationOf } from '../src/tutor/checkpoint';
import type { StepPlan } from '../src/tutor/types';
import { defaultStudentProfile } from '../src/lib/studentProfile';
import { scrambledState } from './helpers/scrambles';
import { fakeStudentServer, type FakeStudentServer } from './helpers/fakeStudentServer';

const planMock = vi.hoisted(() => vi.fn());
vi.mock('@/solver/client', () => ({ planStepInWorker: planMock }));

const { useTutorStore, flushTutorSaves, resetPendingProfileOps } = await import('../src/stores/useTutorStore');

const store = () => useTutorStore.getState();
const scramble = scrambledState(5, 3);
let server: FakeStudentServer;
let saved: unknown[];

beforeEach(async () => {
  planMock.mockReset();
  planMock.mockImplementation(async (state, method, grip, stepIndex) => planNextStep(state, method, grip, stepIndex));
  server = fakeStudentServer();
  vi.stubGlobal('fetch', server.fetch);
  resetPendingProfileOps();
  useTutorStore.setState({ token: 'secret', profile: defaultStudentProfile(), profileStatus: 'ready' });
  store().abandonSolve();
  await flushTutorSaves();
  server.saved.length = 0;
  saved = server.saved;
});
afterEach(() => vi.unstubAllGlobals());

const allFaces = (plan: StepPlan, state = plan.expectedState) => FACES.map((f) => observationOf(state, f));

describe('useTutorStore', () => {
  it('starts a solve, plans the first step and saves it as the current solve', async () => {
    await store().startSolve(scramble, 'beginner');
    expect(store().phase).toBe('step');
    expect(store().plan?.stepIndex).toBe(0);
    await flushTutorSaves();
    const last = saved.at(-1) as { currentSolve: { method: string; stepIndex: number } };
    expect(last.currentSolve).toMatchObject({ method: 'beginner', stepIndex: 0 });
  });

  it('moves to the next step after a matching checkpoint', async () => {
    await store().startSolve(scramble, 'cfop');
    const first = store().plan!;
    store().beginCheckpoint();
    expect(store().phase).toBe('checking');
    for (const o of allFaces(first)) store().submitObservation(o);
    expect(store().phase).toBe('celebrate');
    expect(store().attempts.at(-1)).toEqual({ result: 'matched' });
    await store().advance();
    expect(store().phase).toBe('step');
    expect(store().stepIndex).toBe(1);
    expect(store().cube).toEqual(first.expectedState);
    expect(store().plan!.startState).toEqual(first.expectedState);
    expect(store().profile.stats.stepsCompleted).toBe(1);
  });

  it('asks again for an unclear face and names the wrong face', async () => {
    await store().startSolve(scramble, 'cfop');
    const plan = store().plan!;
    store().beginCheckpoint();
    const face = plan.checkpoint.facesToShow[0];
    store().submitObservation(observationOf(plan.expectedState, face, 0.1));
    expect(store().phase).toBe('checking');
    expect(store().checkpoint?.result.status).toBe('uncertain');

    const wrong = FACES.find((f) => plan.expectedState[f][4] !== plan.expectedState[face][4])!;
    store().submitObservation({ face, stickers: observationOf(plan.expectedState, wrong).stickers });
    expect(store().checkpoint?.result.status).toBe('wrong-face');
    expect(store().phase).toBe('checking');
  });

  it('records a mismatch with its diagnosis; replay keeps the attempt history', async () => {
    await store().startSolve(scramble, 'beginner');
    const plan = store().plan!;
    const moves = [...plan.setupMoves, ...plan.algorithm];
    // The first slip that changes a checked sticker.
    const slipped = moves
      .map((m, i) => (m.kind === 'rotation' ? null : moves.map((x, k) => (k === i ? invertMove(x) : x))))
      .filter((p) => p !== null)
      .map((performed) => viewInGrip(applyMoves(plan.startState, performed), plan.gripAfter).state)
      .find((state) => plan.checkpoint.stickers.some((r) => state[r.face][r.index] !== plan.expectedState[r.face][r.index]));
    expect(slipped).toBeDefined();
    store().beginCheckpoint();
    for (const o of allFaces(plan, slipped)) store().submitObservation(o);
    expect(store().phase).toBe('mismatch');
    expect(store().attempts.at(-1)?.result).toBe('mismatch');
    expect(store().checkpoint?.diagnosis?.likelyMistakes.length).toBeGreaterThan(0);
    store().replayStep();
    expect(store().phase).toBe('step');
    expect(store().attempts).toHaveLength(1);
  });

  it('follows a confident diagnosis into a corrective step or a fresh plan', async () => {
    let followed = 0;
    for (let seed = 1; seed < 8 && followed === 0; seed++) {
      await store().startSolve(scrambledState(seed, 3), 'beginner');
      const plan = store().plan!;
      const moves = [...plan.setupMoves, ...plan.algorithm];
      for (let i = 0; i < moves.length && followed === 0; i++) {
        if (moves[i].kind === 'rotation') continue;
        const performed = moves.map((m, k) => (k === i ? invertMove(m) : m));
        const actual = viewInGrip(applyMoves(plan.startState, performed), plan.gripAfter).state;
        store().replayStep();
        store().beginCheckpoint();
        for (const o of allFaces(plan, actual)) store().submitObservation(o);
        if (store().phase !== 'mismatch' || store().checkpoint?.recovery?.action !== 'resume') continue;
        store().continueFromDiagnosis();
        expect(store().cube).toEqual(actual);
        expect(store().plan?.startState).toEqual(actual);
        followed++;
      }
    }
    expect(followed).toBe(1);
  });

  it('plans again from a mid-solve rescan', async () => {
    await store().startSolve(scramble, 'cfop');
    const plan = store().plan!;
    await store().replanFromRescan(plan.expectedState);
    expect(store().phase).toBe('step');
    expect(store().plan!.startState).toEqual(viewInGrip(plan.expectedState, plan.gripAfter).state);
  });

  it('plans a mid-solve rescan in the worker', async () => {
    await store().startSolve(scramble, 'cfop');
    const plan = store().plan!;
    planMock.mockClear();
    await store().replanFromRescan(plan.expectedState);
    expect(planMock).toHaveBeenCalledTimes(1);
    expect(planMock.mock.calls[0][3]).toBe(plan.stepIndex);
  });

  it('counts a solve when the mid-solve rescan shows a solved cube', async () => {
    await store().startSolve(scramble, 'beginner');
    const before = store().profile.stats.solvesCompleted;
    store().requestRescan();
    expect(store().rescanRequested).toBe(true);
    await store().replanFromRescan(createSolvedCubeState());
    expect(store().phase).toBe('solved');
    expect(store().profile.stats.solvesCompleted).toBe(before + 1);
    expect(store().profile.currentSolve).toBeNull();
    expect(store().rescanRequested).toBe(false);
  });

  it('asks for a rescan only while a solve is open', async () => {
    store().requestRescan();
    expect(store().rescanRequested).toBe(false);
    await store().startSolve(scramble, 'beginner');
    store().requestRescan();
    expect(store().rescanRequested).toBe(true);
    await store().startSolve(scramble, 'cfop');
    expect(store().rescanRequested).toBe(false);
  });

  it('re-plans when the paired device reports a new grip', async () => {
    await store().startSolve(scramble, 'beginner');
    await store().setGrip({ top: 'yellow', front: 'blue' });
    expect(store().grip).toEqual({ top: 'yellow', front: 'blue' });
    expect(store().plan!.grip).toEqual({ top: 'yellow', front: 'blue' });
  });

  it('takes a checkpoint verdict from the paired device for the current step only', async () => {
    await store().startSolve(scramble, 'beginner');
    store().applyRemoteCheckpoint({ stepIndex: 5, result: 'matched' });
    expect(store().phase).toBe('step');
    store().applyRemoteCheckpoint({ stepIndex: 0, result: 'mismatch', mistakes: ['skipped-move'] });
    expect(store().attempts.at(-1)).toEqual({ result: 'mismatch', mistakes: ['skipped-move'] });
    store().applyRemoteCheckpoint({ stepIndex: 0, result: 'matched' });
    expect(store().phase).toBe('celebrate');
  });

  it('moves on when the student says it matches', async () => {
    await store().startSolve(scramble, 'beginner');
    store().beginCheckpoint();
    store().confirmByHand();
    expect(store().phase).toBe('celebrate');
    expect(store().checkpoint?.result.manual).toBe(true);
  });

  it('resumes an interrupted solve from the saved profile', async () => {
    await store().startSolve(scramble, 'cfop');
    store().confirmByHand();
    await store().advance();
    const profile = store().profile;
    // A fresh visit: the session is empty, the profile comes back from the server.
    useTutorStore.setState({ plan: null, phase: 'idle', cube: null, method: null, grip: null, stepIndex: 0 });
    useTutorStore.setState({ profile });
    expect(await store().resumeSolve()).toBe(true);
    expect(store().phase).toBe('step');
    expect(store().method).toBe('cfop');
    expect(store().stepIndex).toBe(1);
    expect(store().plan?.stepIndex).toBe(1);
  });

  it('has nothing to resume without a saved solve', async () => {
    expect(await store().resumeSolve()).toBe(false);
  });

  it('falls back to the main thread when the worker fails', async () => {
    planMock.mockRejectedValueOnce(new Error('worker crashed'));
    await store().startSolve(scramble, 'beginner');
    expect(store().phase).toBe('step');
  });

  it('shows an error when no plan exists for the cube', async () => {
    const broken = { ...scramble, U: [...scramble.U] } as typeof scramble;
    broken.U[0] = broken.U[0] === 'red' ? 'blue' : 'red';
    planMock.mockImplementation(async () => {
      const error = new Error('no plan');
      error.name = 'TutorPlanError';
      throw error;
    });
    await store().startSolve(broken, 'beginner');
    expect(store().phase).toBe('error');
    expect(store().errorMessage).toMatch(/scan the cube again/);
  });

  it('marks the solve finished and clears it from the profile', async () => {
    await store().startSolve(scramble, 'beginner');
    useTutorStore.setState({ stepIndex: 5 });
    planMock.mockResolvedValueOnce(null);
    await store().loadPlan();
    expect(store().phase).toBe('solved');
    expect(store().alreadySolved).toBe(false);
    expect(store().profile.currentSolve).toBeNull();
    expect(store().profile.stats.solvesCompleted).toBe(1);
  });

  it('does not count a cube that was solved before the first step', async () => {
    planMock.mockResolvedValueOnce(null);
    await store().startSolve(scramble, 'beginner');
    expect(store().phase).toBe('solved');
    expect(store().alreadySolved).toBe(true);
    expect(store().profile.currentSolve).toBeNull();
    expect(store().profile.stats.solvesCompleted).toBe(0);
  });

  it('keeps working without a token, marking the profile unsaved', async () => {
    useTutorStore.setState({ token: null });
    store().updateSettings({ stickerLetters: true });
    expect(store().profile.settings.stickerLetters).toBe(true);
    expect(store().profileStatus).toBe('unsaved');
  });
});
