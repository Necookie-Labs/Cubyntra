// @vitest-environment jsdom
/**
 * Cubyntra - One speaker when paired (simulated sync messages)
 * Necookie Labs (c) 2026
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SyncEvent, SyncMessage } from '../src/sync/types';
import { SpeakerArbiter } from '../src/voice/oneSpeaker';
import { useOneSpeaker } from '../src/voice/useOneSpeaker';

const LAPTOP = 'laptop-client';
const PHONE = 'phone-client';
let seq = 0;

function event(clientId: string, message: SyncMessage): SyncEvent {
  return { ...message, clientId, role: clientId === LAPTOP ? 'desktop' : 'mobile', seq: ++seq, at: Date.now() } as SyncEvent;
}

const step = (clientId: string, planId: string) =>
  event(clientId, { type: 'step', payload: { method: 'beginner', stepIndex: 0, planId, algorithm: "R U R'" } });
const playback = (clientId: string, action: 'play' | 'pause' | 'seek' | 'index' | 'speed', index?: number) =>
  event(clientId, { type: 'playback', payload: { action, ...(index !== undefined ? { index } : {}) } });

/** Both devices see the same relayed messages in the same order. */
function pair() {
  const laptop = new SpeakerArbiter(() => LAPTOP);
  const phone = new SpeakerArbiter(() => PHONE);
  const relay = (e: SyncEvent) => {
    laptop.observe(e);
    phone.observe(e);
  };
  const speakers = () => ({ laptop: laptop.isSpeaker(), phone: phone.isSpeaker() });
  return { relay, speakers };
}

describe('SpeakerArbiter', () => {
  it('lets a device speak before any message', () => {
    expect(new SpeakerArbiter(() => LAPTOP).isSpeaker()).toBe(true);
  });

  it('gives the voice to the device that shows a new step, and silences the other', () => {
    const { relay, speakers } = pair();
    relay(step(LAPTOP, 'p1'));
    expect(speakers()).toEqual({ laptop: true, phone: false });
  });

  it('does not move the voice when the other device adopts the same step', () => {
    const { relay, speakers } = pair();
    relay(step(LAPTOP, 'p1'));
    relay(step(PHONE, 'p1')); // the phone re-sends the step it adopted
    expect(speakers()).toEqual({ laptop: true, phone: false });
  });

  it('moves the voice to the device whose playback command came last', () => {
    const { relay, speakers } = pair();
    relay(step(LAPTOP, 'p1'));
    relay(playback(PHONE, 'play'));
    expect(speakers()).toEqual({ laptop: false, phone: true });
    // Move reports from the laptop's animating twin do not take the voice back.
    relay(playback(LAPTOP, 'index', 0));
    relay(playback(LAPTOP, 'index', 1));
    expect(speakers()).toEqual({ laptop: false, phone: true });
    relay(playback(LAPTOP, 'seek', 0));
    expect(speakers()).toEqual({ laptop: true, phone: false });
  });

  it('moves the voice to the device that starts the next step', () => {
    const { relay, speakers } = pair();
    relay(step(LAPTOP, 'p1'));
    relay(step(PHONE, 'p2'));
    expect(speakers()).toEqual({ laptop: false, phone: true });
  });

  it('ignores other message types', () => {
    const { relay, speakers } = pair();
    relay(step(LAPTOP, 'p1'));
    relay(event(PHONE, { type: 'presence', payload: { visible: true, screen: 'solve' } }));
    relay(event(PHONE, { type: 'checkpoint-result', payload: { planId: 'p1', stepIndex: 0, result: 'matched' } }));
    relay(event(PHONE, { type: 'grip', payload: { top: 'yellow', front: 'green' } }));
    expect(speakers()).toEqual({ laptop: true, phone: false });
  });
});

describe('useOneSpeaker', () => {
  function fakeTarget(sessionId: string | null, clientId: string) {
    const listeners = new Set<(e: SyncEvent) => void>();
    return {
      target: {
        sessionId,
        getClientId: () => clientId,
        subscribe: (l: (e: SyncEvent) => void) => {
          listeners.add(l);
          return () => listeners.delete(l);
        },
      },
      emit: (e: SyncEvent) => act(() => listeners.forEach((l) => l(e))),
    };
  }

  it('speaks when not paired', () => {
    const { target } = fakeTarget(null, LAPTOP);
    expect(renderHook(() => useOneSpeaker(target)).result.current).toBe(true);
  });

  it('follows the device driving the solve', () => {
    const { target, emit } = fakeTarget('session-1', LAPTOP);
    const { result } = renderHook(() => useOneSpeaker(target));
    expect(result.current).toBe(true);
    emit(step(LAPTOP, 'p1'));
    expect(result.current).toBe(true);
    emit(playback(PHONE, 'play'));
    expect(result.current).toBe(false);
    emit(playback(LAPTOP, 'pause'));
    expect(result.current).toBe(true);
  });
});
