// @vitest-environment jsdom
/**
 * Cubyntra - Guided-solve sync: step, grip, playback and checkpoint verdicts between devices
 * Necookie Labs (c) 2026
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { planNextStep } from '@/tutor';
import type { PlaybackSnapshot } from '@/three/playback';
import { defaultStudentProfile } from '@/lib/studentProfile';
import type { SyncEvent, SyncMessage } from '@/sync/types';
import {
  applyPlaybackToTwin,
  playbackMessages,
  stepMessages,
  stepPlanId,
  tutorActionFor,
  type TwinPlayback,
} from '@/sync/tutorSync';
import { scrambledState } from './helpers/scrambles';
import { stateAfter } from './helpers/mistakes';
import { invertMove } from '@/cube/transforms';
import { resumeFrom } from '@/tutor/recovery';

vi.mock('@/solver/client', () => ({
  planStepInWorker: vi.fn(async (state, method, grip, stepIndex) => planNextStep(state, method, grip, stepIndex)),
}));
const { useTutorStore } = await import('@/stores/useTutorStore');
const { useTutorSync } = await import('@/sync/useTutorSync');

const plan = planNextStep(scrambledState(5, 3), 'beginner')!;

function snapshot(patch: Partial<PlaybackSnapshot>): PlaybackSnapshot {
  return {
    moves: plan.algorithm,
    index: 0,
    total: plan.algorithm.length,
    activeIndex: null,
    direction: null,
    playing: false,
    speed: 1,
    loop: false,
    state: plan.startState,
    ...patch,
  };
}

function fakeTwin(initial: Partial<PlaybackSnapshot> = {}) {
  let snap = snapshot(initial);
  const listeners = new Set<(s: PlaybackSnapshot) => void>();
  const emit = (patch: Partial<PlaybackSnapshot>) => {
    snap = { ...snap, ...patch };
    for (const l of listeners) l(snap);
  };
  const twin = {
    getSnapshot: () => snap,
    play: vi.fn(async () => emit({ playing: true })),
    pause: vi.fn(() => emit({ playing: false })),
    seek: vi.fn(async (index: number) => emit({ index, playing: false })),
    setSpeed: vi.fn((speed: 1 | 0.5) => emit({ speed })),
    subscribe: (l: (s: PlaybackSnapshot) => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  return { twin, emit };
}

let seq = 0;
const event = (message: SyncMessage, clientId = 'phone'): SyncEvent =>
  ({ ...message, role: 'mobile', clientId, seq: ++seq, at: 0 }) as SyncEvent;

describe('tutor sync helpers', () => {
  it('publishes the step, its start cube and the grip', () => {
    const [cube, step, grip] = stepMessages(plan);
    expect(cube).toEqual({ type: 'cube-state', payload: { state: plan.startState } });
    expect(step.type).toBe('step');
    expect(step.payload).toMatchObject({ method: 'beginner', stepIndex: plan.stepIndex, planId: stepPlanId(plan) });
    expect(grip).toEqual({ type: 'grip', payload: { ...plan.grip, planId: stepPlanId(plan), stepIndex: plan.stepIndex } });
  });

  it('names the solve in the step message when it is known', () => {
    const [, step] = stepMessages(plan, '2026-11-17T10:00:00.000Z');
    expect(step.payload).toMatchObject({ solveStartedAt: '2026-11-17T10:00:00.000Z' });
  });

  it('turns twin changes into playback messages, with -1 meaning before the first move', () => {
    const a = snapshot({ index: 0 });
    expect(playbackMessages(a, { ...a, playing: true })).toEqual([{ action: 'play' }]);
    expect(playbackMessages(a, { ...a, index: 2 })).toEqual([{ action: 'seek', index: 1 }]);
    expect(playbackMessages(a, { ...a, playing: true, index: 1 })).toEqual([{ action: 'play' }, { action: 'index', index: 0 }]);
    expect(playbackMessages(a, { ...a, speed: 0.5 })).toEqual([{ action: 'speed', speed: 0.5 }]);
    expect(playbackMessages(a, { ...a, moves: [] })).toEqual([]);
  });

  it('applies relayed playback to the twin', () => {
    const { twin } = fakeTwin();
    applyPlaybackToTwin(twin as TwinPlayback, { action: 'play' });
    expect(twin.play).toHaveBeenCalled();
    applyPlaybackToTwin(twin as TwinPlayback, { action: 'seek', index: 2 });
    expect(twin.seek).toHaveBeenCalledWith(3);
    applyPlaybackToTwin(twin as TwinPlayback, { action: 'speed', speed: 2 });
    expect(twin.setSpeed).not.toHaveBeenCalled();
  });

  it('accepts a grip and a verdict from the other device only for the step on screen', () => {
    const here = { planId: stepPlanId(plan), stepIndex: plan.stepIndex };
    const grip = (extra: object) => event({ type: 'grip', payload: { top: 'yellow', front: 'red', ...extra } });
    expect(tutorActionFor(grip(here), 'laptop', plan)).toEqual({ kind: 'grip', grip: { top: 'yellow', front: 'red' } });
    expect(tutorActionFor(event({ type: 'grip', payload: { top: 'yellow', front: 'red', ...here } }, 'laptop'), 'laptop', plan)).toBeNull();
    // A grip that does not say which step, or names another step or plan, is ignored.
    expect(tutorActionFor(grip({}), 'laptop', plan)).toBeNull();
    expect(tutorActionFor(grip({ ...here, stepIndex: plan.stepIndex + 1 }), 'laptop', plan)).toBeNull();
    expect(tutorActionFor(grip({ ...here, planId: 'step-older' }), 'laptop', plan)).toBeNull();
    const verdict = { planId: stepPlanId(plan), stepIndex: plan.stepIndex, result: 'matched' as const };
    expect(tutorActionFor(event({ type: 'checkpoint-result', payload: verdict }), 'laptop', plan)?.kind).toBe('checkpoint');
    expect(
      tutorActionFor(event({ type: 'checkpoint-result', payload: { ...verdict, planId: 'step-other' } }), 'laptop', plan)
    ).toBeNull();
  });
});

const settle = () =>
  act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });

describe('useTutorSync', () => {
  let listeners: Array<(e: SyncEvent) => void>;
  let sent: SyncMessage[];
  const target = () => ({
    sessionId: 's1',
    send: vi.fn(async (m: SyncMessage) => {
      sent.push(m);
      return { ok: true as const, seq: 1 };
    }),
    subscribe: (l: (e: SyncEvent) => void) => {
      listeners.push(l);
      return () => {
        listeners = listeners.filter((x) => x !== l);
      };
    },
    getClientId: () => 'laptop',
  });

  beforeEach(async () => {
    listeners = [];
    sent = [];
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
    useTutorStore.setState({ token: null, profile: defaultStudentProfile(), profileStatus: 'unsaved' });
    await useTutorStore.getState().startSolve(scrambledState(5, 3), 'beginner');
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("mirrors the laptop's step and twin playback, and applies the phone's commands", async () => {
    const { twin, emit } = fakeTwin();
    const t = target();
    renderHook(() => useTutorSync(t, twin as never));
    await settle();
    expect(sent.map((m) => m.type)).toEqual(['cube-state', 'step', 'grip']);

    act(() => emit({ playing: true }));
    expect(sent.at(-1)).toEqual({ type: 'playback', payload: { action: 'play' } });

    sent.length = 0;
    act(() => listeners.forEach((l) => l(event({ type: 'playback', payload: { action: 'pause' } }))));
    expect(twin.pause).toHaveBeenCalled();
    expect(sent).toEqual([]); // a remote command is not echoed back
  });

  it('applies a relayed grip and checkpoint verdict to the tutor session', async () => {
    const t = target();
    renderHook(() => useTutorSync(t, null));
    const current = useTutorStore.getState().plan!;
    const here = { planId: stepPlanId(current), stepIndex: current.stepIndex };
    await act(async () => {
      listeners.forEach((l) => l(event({ type: 'grip', payload: { top: 'yellow', front: 'blue', ...here } })));
      for (let i = 0; i < 20; i++) await Promise.resolve();
    });
    expect(useTutorStore.getState().grip).toEqual({ top: 'yellow', front: 'blue' });

    const now = useTutorStore.getState().plan!;
    expect(now).not.toBe(current);
    act(() =>
      listeners.forEach((l) =>
        l(event({ type: 'checkpoint-result', payload: { planId: stepPlanId(now), stepIndex: now.stepIndex, result: 'matched' } }))
      )
    );
    expect(useTutorStore.getState().phase).toBe('celebrate');
    expect(sent.filter((m) => m.type === 'checkpoint-result')).toEqual([]);
  });

  /** Delivers the other device's messages in the given order. */
  const deliver = async (messages: SyncMessage[]) => {
    for (const m of messages) act(() => listeners.forEach((l) => l(event(m))));
    await settle();
  };

  it('ignores a late grip from a step this device has already left', async () => {
    renderHook(() => useTutorSync(target(), null));
    const first = useTutorStore.getState().plan!;
    act(() => useTutorStore.getState().confirmByHand());
    await act(async () => {
      await useTutorStore.getState().advance();
    });
    const second = useTutorStore.getState().plan!;
    expect(second.stepIndex).toBe(first.stepIndex + 1);
    const late = { top: 'yellow' as const, front: 'blue' as const, planId: stepPlanId(first), stepIndex: first.stepIndex };
    await deliver([{ type: 'grip', payload: late }]);
    expect(useTutorStore.getState().plan).toBe(second);
    expect(useTutorStore.getState().grip).toEqual(second.grip);
  });

  it("adopts the other device's corrective step, whatever order its messages arrive in", async () => {
    renderHook(() => useTutorSync(target(), null));
    const original = useTutorStore.getState().plan!;
    // The phone saw a slip (the last move turned the wrong way) and made a corrective step.
    const list = [...original.setupMoves, ...original.algorithm];
    const performedMoves = [...list.slice(0, -1), invertMove(list[list.length - 1])];
    const resume = resumeFrom(original, { performedMoves, resultingState: stateAfter(original, performedMoves) });
    expect(resume.kind).toBe('corrective');
    const corrective = resume.plan!;
    const [cube, step, grip] = stepMessages(corrective);

    // The grip arrives first: it names a plan this device does not have yet, so it is ignored.
    await deliver([grip]);
    expect(useTutorStore.getState().plan).toBe(original);
    await deliver([cube, step]);
    const now = useTutorStore.getState();
    expect(stepPlanId(now.plan!)).toBe(stepPlanId(corrective));
    expect(now.plan).toEqual(corrective);
    expect(now.cube).toEqual(corrective.startState);
    expect(now.phase).toBe('step');
    // The same messages again change nothing.
    await deliver([cube, step, grip]);
    expect(useTutorStore.getState().plan).toBe(now.plan);
  });

  it("adopts the other device's next step instead of staying behind", async () => {
    renderHook(() => useTutorSync(target(), null));
    const first = useTutorStore.getState().plan!;
    const next = planNextStep(first.expectedState, 'beginner', first.gripAfter, first.stepIndex + 1)!;
    await deliver(stepMessages(next));
    const now = useTutorStore.getState();
    expect(now.stepIndex).toBe(first.stepIndex + 1);
    expect(stepPlanId(now.plan!)).toBe(stepPlanId(next));
  });

  it('ignores a step older than the one on screen', async () => {
    renderHook(() => useTutorSync(target(), null));
    const first = useTutorStore.getState().plan!;
    act(() => useTutorStore.getState().confirmByHand());
    await act(async () => {
      await useTutorStore.getState().advance();
    });
    const second = useTutorStore.getState().plan!;
    await deliver(stepMessages(first));
    expect(useTutorStore.getState().plan).toBe(second);
  });

  it('keeps its own plan when the step sent cannot be rebuilt with the same id', async () => {
    renderHook(() => useTutorSync(target(), null));
    const mine = useTutorStore.getState().plan!;
    const [cube, step] = stepMessages(mine);
    const forged = { ...step, payload: { ...(step.payload as object), planId: 'step-unknown', algorithm: "R U R' U'" } } as SyncMessage;
    await deliver([cube, forged]);
    expect(useTutorStore.getState().plan).toBe(mine);
  });

  it('reports a verdict reached on this device', () => {
    const t = target();
    renderHook(() => useTutorSync(t, null));
    act(() => useTutorStore.getState().confirmByHand());
    const plan = useTutorStore.getState().plan!;
    expect(sent.at(-1)).toEqual({
      type: 'checkpoint-result',
      payload: { planId: stepPlanId(plan), stepIndex: plan.stepIndex, result: 'matched' },
    });
  });
});
