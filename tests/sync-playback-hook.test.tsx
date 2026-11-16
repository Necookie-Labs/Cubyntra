// @vitest-environment jsdom
/**
 * Cubyntra - Laptop playback sync hook tests
 * Necookie Labs (c) 2026
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { usePlaybackSync } from '../src/sync/usePlaybackSync';
import { useCubyntraStore } from '../src/stores/useCubyntraStore';
import { PlaybackPayload, SyncEvent, SyncMessage } from '../src/sync/types';

const store = () => useCubyntraStore.getState();

let sent: SyncMessage[];
let listener: ((e: SyncEvent) => void) | null;
let seq: number;

const target = {
  sessionId: 'session-1',
  send: vi.fn(async (m: SyncMessage) => {
    sent.push(m);
    return { ok: true as const, seq: ++seq };
  }),
  subscribe: (l: (e: SyncEvent) => void) => {
    listener = l;
    return () => {
      listener = null;
    };
  },
  getClientId: () => 'laptop-client',
};

function fromPhone(payload: PlaybackPayload) {
  act(() =>
    listener!({ type: 'playback', payload, role: 'mobile', clientId: 'phone-client', seq: ++seq, at: 0 } as SyncEvent)
  );
}

const playbackSent = () => sent.filter((m) => m.type === 'playback').map((m) => m.payload);

beforeAll(async () => {
  store().resetAll();
  await store().loadMockScramble("R U R' U'");
});

beforeEach(() => {
  sent = [];
  listener = null;
  seq = 0;
  store().seekToMove(-1);
  store().setPlaybackSpeed(1);
});

afterEach(() => cleanup());

describe('usePlaybackSync', () => {
  it('publishes the scramble and the solution once', () => {
    renderHook(() => usePlaybackSync(target));
    expect(sent.map((m) => m.type)).toEqual(['cube-state', 'step']);
    const step = sent[1].payload as { method: string; algorithm: string; planId: string };
    expect(step.method).toBe('solver');
    expect(step.algorithm.split(' ')).toHaveLength(store().solution!.moves.length);
    act(() => store().setPlaybackSpeed(2));
    expect(sent.filter((m) => m.type === 'step')).toHaveLength(1);
  });

  it('reports local play, pause, speed and position', () => {
    renderHook(() => usePlaybackSync(target));
    act(() => store().setPlaying(true));
    act(() => {
      store().stepNext();
    });
    act(() => store().setPlaying(false));
    act(() => store().setPlaybackSpeed(0.5));
    act(() => store().seekToMove(2));
    expect(playbackSent()).toEqual([
      { action: 'play' },
      { action: 'index', index: 0 },
      { action: 'pause' },
      { action: 'speed', speed: 0.5 },
      { action: 'seek', index: 2 },
    ]);
  });

  it("applies the phone's commands without echoing them back", () => {
    renderHook(() => usePlaybackSync(target));
    fromPhone({ action: 'play' });
    expect(store().isPlaying).toBe(true);
    fromPhone({ action: 'pause' });
    expect(store().isPlaying).toBe(false);
    fromPhone({ action: 'seek', index: 1 });
    expect(store().currentMoveIndex).toBe(1);
    fromPhone({ action: 'speed', speed: 2 });
    expect(store().playbackSpeed).toBe(2);
    expect(playbackSent()).toEqual([]);
  });

  it('ignores a stale command', () => {
    renderHook(() => usePlaybackSync(target));
    seq = 10;
    fromPhone({ action: 'seek', index: 2 });
    act(() =>
      listener!({ type: 'playback', payload: { action: 'seek', index: 0 }, role: 'mobile', clientId: 'phone-client', seq: 5, at: 0 } as SyncEvent)
    );
    expect(store().currentMoveIndex).toBe(2);
  });

  it('does nothing without a pairing', () => {
    renderHook(() => usePlaybackSync({ ...target, sessionId: null }));
    act(() => store().setPlaying(true));
    act(() => store().setPlaying(false));
    expect(sent).toEqual([]);
  });
});
