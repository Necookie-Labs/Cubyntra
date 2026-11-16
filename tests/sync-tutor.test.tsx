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
    expect(grip).toEqual({ type: 'grip', payload: plan.grip });
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

  it('accepts a grip from the other device, and a verdict only for the step on screen', () => {
    expect(tutorActionFor(event({ type: 'grip', payload: { top: 'yellow', front: 'red' } }), 'laptop', plan)).toEqual({
      kind: 'grip',
      grip: { top: 'yellow', front: 'red' },
    });
    expect(tutorActionFor(event({ type: 'grip', payload: { top: 'yellow', front: 'red' } }, 'laptop'), 'laptop', plan)).toBeNull();
    const verdict = { planId: stepPlanId(plan), stepIndex: plan.stepIndex, result: 'matched' as const };
    expect(tutorActionFor(event({ type: 'checkpoint-result', payload: verdict }), 'laptop', plan)?.kind).toBe('checkpoint');
    expect(
      tutorActionFor(event({ type: 'checkpoint-result', payload: { ...verdict, planId: 'step-other' } }), 'laptop', plan)
    ).toBeNull();
  });
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
    await act(async () => {
      listeners.forEach((l) => l(event({ type: 'grip', payload: { top: 'yellow', front: 'blue' } })));
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
