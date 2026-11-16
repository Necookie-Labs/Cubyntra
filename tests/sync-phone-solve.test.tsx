// @vitest-environment jsdom
/**
 * Cubyntra - Solving on the paired phone: the phone joins the laptop's step, and its grip and
 * checkpoint verdicts reach the laptop (simulated sync messages)
 * Necookie Labs (c) 2026
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { planNextStep } from '@/tutor';
import { defaultStudentProfile } from '@/lib/studentProfile';
import type { SessionSnapshot, StreamEvent, SyncEvent, SyncMessage } from '@/sync/types';
import { remoteStepFor, stepAlgorithm, stepMessages, stepPlanId, tutorActionFor } from '@/sync/tutorSync';
import { viewInGrip } from '@/cube/grip';
import { scrambledState } from './helpers/scrambles';

const client = vi.hoisted(() => ({
  posted: [] as unknown[],
  onEvent: null as null | ((e: StreamEvent) => void),
  closed: 0,
}));
vi.mock('@/sync/syncClient', () => ({
  newClientId: () => 'phone',
  openSyncStream: (options: { role: string; onEvent: (e: StreamEvent) => void }) => {
    client.onEvent = options.onEvent;
    return { close: () => client.closed++ };
  },
  postSyncMessage: vi.fn(async (_id: string, _secret: string, message: unknown) => {
    client.posted.push(message);
    return { ok: true, seq: 1 };
  }),
}));
vi.mock('@/solver/client', () => ({
  planStepInWorker: vi.fn(async (state, method, grip, stepIndex) => planNextStep(state, method, grip, stepIndex)),
}));

const { useTutorStore } = await import('@/stores/useTutorStore');
const { useTutorSync } = await import('@/sync/useTutorSync');
const { useMobileTutorTarget, snapshotStepEvents } = await import('@/sync/useMobileTutorTarget');

const creds = { sessionId: 's1', secret: 'k'.repeat(32), token: 't' };
/** The step the laptop is on: step 2 of a CFOP solve. */
const laptopPlan = planNextStep(scrambledState(11, 4), 'cfop', { top: 'yellow', front: 'green' }, 2)!;

let seq = 0;
const fromLaptop = (message: SyncMessage): SyncEvent =>
  ({ ...message, role: 'desktop', clientId: 'laptop', seq: ++seq, at: 0 }) as SyncEvent;

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });

const posted = () => client.posted as Array<SyncMessage & { role: string; clientId: string }>;

beforeEach(() => {
  client.posted.length = 0;
  client.onEvent = null;
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  useTutorStore.setState({ token: null, profile: defaultStudentProfile(), profileStatus: 'unsaved' });
  useTutorStore.getState().abandonSolve();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('remoteStepFor', () => {
  const cube = laptopPlan.startState;
  const step = fromLaptop(stepMessages(laptopPlan)[1]);

  it('joins a guided-solve step from the other device, with the cube sent before it', () => {
    expect(remoteStepFor(step, 'phone', cube)).toEqual({
      state: cube,
      method: 'cfop',
      stepIndex: 2,
      planId: stepPlanId(laptopPlan),
      algorithm: stepAlgorithm(laptopPlan),
    });
  });

  it('ignores its own steps, solver playback and steps without a cube', () => {
    expect(remoteStepFor(step, 'laptop', cube)).toBeNull();
    expect(remoteStepFor(step, 'phone', null)).toBeNull();
    const solver = fromLaptop({ type: 'step', payload: { method: 'solver', stepIndex: 0, planId: 'p' } });
    expect(remoteStepFor(solver, 'phone', cube)).toBeNull();
    expect(remoteStepFor(fromLaptop({ type: 'grip', payload: laptopPlan.grip }), 'phone', cube)).toBeNull();
  });

  it('replays a snapshot step in the order a live step arrives', () => {
    const [c, s, g] = stepMessages(laptopPlan).map(fromLaptop);
    expect(snapshotStepEvents({ cubeState: c, step: s, grip: g })).toEqual([c, s, g]);
    expect(snapshotStepEvents({ cubeState: null, step: s, grip: null })).toEqual([s]);
  });
});

describe('a solve on the paired phone', () => {
  const mount = () =>
    renderHook(() => {
      const target = useMobileTutorTarget(creds);
      useTutorSync(target, null);
      return target;
    });

  it('posts as the mobile device and is inactive without a pairing', async () => {
    const none = renderHook(() => useMobileTutorTarget(null));
    expect(none.result.current.sessionId).toBeNull();
    expect(await none.result.current.send({ type: 'presence', payload: { visible: true } })).toEqual({ ok: false, status: 0 });

    const { result } = renderHook(() => useMobileTutorTarget(creds));
    expect(result.current.sessionId).toBe('s1');
    await result.current.send({ type: 'grip', payload: { top: 'yellow', front: 'red' } });
    expect(posted().at(-1)).toMatchObject({ type: 'grip', role: 'mobile', clientId: 'phone' });
  });

  it("joins the laptop's step from the stream and plans exactly the laptop's step", async () => {
    mount();
    act(() => {
      for (const m of stepMessages(laptopPlan)) client.onEvent?.({ kind: 'message', event: fromLaptop(m) });
    });
    await flush();
    const phonePlan = useTutorStore.getState().plan!;
    expect(phonePlan).toEqual(laptopPlan);
    expect(stepPlanId(phonePlan)).toBe(stepPlanId(laptopPlan));
    // The phone announces the step it is on, with its grip, as the mobile device.
    const grip = posted().find((m) => m.type === 'grip');
    expect(grip).toMatchObject({ role: 'mobile', payload: laptopPlan.grip });
  });

  it('joins from the session snapshot when it connects late', async () => {
    mount();
    const [c, s, g] = stepMessages(laptopPlan).map(fromLaptop);
    const snapshot = { cubeState: c, step: s, grip: g } as unknown as SessionSnapshot;
    act(() => client.onEvent?.({ kind: 'snapshot', snapshot }));
    await flush();
    expect(useTutorStore.getState().plan).toEqual(laptopPlan);
  });

  it("sends the phone's checkpoint verdict, which the laptop accepts for its step", async () => {
    mount();
    act(() => {
      for (const m of stepMessages(laptopPlan)) client.onEvent?.({ kind: 'message', event: fromLaptop(m) });
    });
    await flush();
    act(() => useTutorStore.getState().confirmByHand());
    const verdict = posted().find((m) => m.type === 'checkpoint-result')!;
    expect(verdict).toMatchObject({
      role: 'mobile',
      payload: { planId: stepPlanId(laptopPlan), stepIndex: 2, result: 'matched' },
    });
    // What the laptop does with it (it runs tutorActionFor with its own plan).
    const relayed = { ...verdict, seq: ++seq, at: 0 } as SyncEvent;
    expect(tutorActionFor(relayed, 'laptop', laptopPlan)).toEqual({ kind: 'checkpoint', payload: verdict.payload });
  });

  it('sends a grip change made on the phone, which the laptop applies', async () => {
    mount();
    act(() => {
      for (const m of stepMessages(laptopPlan)) client.onEvent?.({ kind: 'message', event: fromLaptop(m) });
    });
    await flush();
    posted().length = 0;
    await act(async () => {
      await useTutorStore.getState().setGrip({ top: 'yellow', front: 'red' });
    });
    await flush();
    // The phone re-planned this step in the new grip and announces that plan.
    const regripped = planNextStep(viewInGrip(laptopPlan.startState, { top: 'yellow', front: 'red' }).state, 'cfop', { top: 'yellow', front: 'red' }, 2)!;
    const step = posted().find((m) => m.type === 'step')!;
    expect(step).toMatchObject({ role: 'mobile', payload: { stepIndex: 2, planId: stepPlanId(regripped) } });
    const grip = posted().find((m) => m.type === 'grip')!;
    expect(grip).toMatchObject({
      role: 'mobile',
      payload: { top: 'yellow', front: 'red', stepIndex: 2, planId: stepPlanId(regripped) },
    });
    // The laptop takes the grip only for a plan it has; otherwise it adopts the step message
    // (see sync-tutor), so a stale grip can never re-plan the wrong step.
    const relayed = { ...grip, seq: ++seq, at: 0 } as SyncEvent;
    const sameId = stepPlanId(regripped) === stepPlanId(laptopPlan);
    expect(tutorActionFor(relayed, 'laptop', laptopPlan)).toEqual(
      sameId ? { kind: 'grip', grip: { top: 'yellow', front: 'red' } } : null
    );
    expect(tutorActionFor(relayed, 'laptop', regripped)).toEqual({ kind: 'grip', grip: { top: 'yellow', front: 'red' } });
  });

  it('does not replace a solve already open on the phone', async () => {
    await act(async () => {
      await useTutorStore.getState().startSolve(scrambledState(3, 3), 'beginner');
    });
    const mine = useTutorStore.getState().plan!;
    mount();
    act(() => {
      for (const m of stepMessages(laptopPlan)) client.onEvent?.({ kind: 'message', event: fromLaptop(m) });
    });
    await flush();
    const now = useTutorStore.getState();
    expect(now.method).toBe('beginner');
    expect(now.plan?.stepIndex).toBe(mine.stepIndex);
    expect(now.plan?.method).toBe('beginner');
  });
});
