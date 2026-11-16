'use client';

/**
 * Cubyntra - Guided-solve sync hook (the device running /solve)
 * Necookie Labs (c) 2026
 *
 * While a phone is paired: publishes each step, the grip and every playback change of the twin,
 * reports checkpoint verdicts reached here, and applies the other device's playback commands
 * (in sequence order, last writer wins), grip changes and checkpoint verdicts. See tutorSync.ts.
 */

import { useEffect, useRef } from 'react';
import type { PlaybackController, PlaybackSnapshot } from '@/three/playback';
import { useTutorStore } from '@/stores/useTutorStore';
import { shouldApplyPlayback } from './playbackSync';
import type { PostResult } from './syncClient';
import type { SyncEvent, SyncMessage } from './types';
import {
  applyPlaybackToTwin,
  playbackMessages,
  stepMessages,
  stepPlanId,
  tutorActionFor,
} from './tutorSync';

export interface TutorSyncTarget {
  sessionId: string | null;
  send: (message: SyncMessage) => Promise<PostResult>;
  subscribe: (listener: (event: SyncEvent) => void) => () => void;
  getClientId: () => string;
}

export function useTutorSync(target: TutorSyncTarget, playback: PlaybackController | null): void {
  const { sessionId, send, subscribe, getClientId } = target;
  const plan = useTutorStore((s) => s.plan);
  const applyingRemote = useRef(false);
  const lastSeq = useRef(0);

  // The step on screen, its start state and grip.
  useEffect(() => {
    if (!sessionId || !plan) return;
    for (const message of stepMessages(plan)) void send(message);
  }, [sessionId, plan, send]);

  // Local playback changes.
  useEffect(() => {
    if (!sessionId || !playback) return;
    let prev: PlaybackSnapshot | null = playback.getSnapshot();
    return playback.subscribe((next) => {
      const messages = applyingRemote.current ? [] : playbackMessages(prev, next);
      prev = next;
      for (const payload of messages) void send({ type: 'playback', payload });
    });
  }, [sessionId, playback, send]);

  // Checkpoint verdicts reached on this device.
  useEffect(() => {
    if (!sessionId) return;
    return useTutorStore.subscribe((s, before) => {
      if (applyingRemote.current || !s.plan || s.attempts.length <= before.attempts.length) return;
      const last = s.attempts[s.attempts.length - 1];
      void send({
        type: 'checkpoint-result',
        payload: {
          planId: stepPlanId(s.plan),
          stepIndex: s.plan.stepIndex,
          result: last.result,
          ...(last.mistakes?.length ? { mistakes: last.mistakes } : {}),
        },
      });
    });
  }, [sessionId, send]);

  // The other device: playback commands, grip, checkpoint verdicts.
  useEffect(() => {
    if (!sessionId) return;
    lastSeq.current = 0;
    return subscribe((event) => {
      const store = useTutorStore.getState();
      if (event.type === 'playback') {
        if (!playback) return;
        const apply = shouldApplyPlayback(event, {
          lastSeq: lastSeq.current,
          ownClientId: getClientId(),
          drives: true,
          locallyPlaying: playback.getSnapshot().playing,
        });
        lastSeq.current = Math.max(lastSeq.current, event.seq);
        if (!apply || event.clientId === getClientId()) return;
        applyingRemote.current = true;
        try {
          applyPlaybackToTwin(playback, event.payload);
        } finally {
          applyingRemote.current = false;
        }
        return;
      }
      const action = tutorActionFor(event, getClientId(), store.plan);
      if (!action) return;
      applyingRemote.current = true;
      try {
        if (action.kind === 'grip') void store.setGrip(action.grip);
        else store.applyRemoteCheckpoint(action.payload);
      } finally {
        applyingRemote.current = false;
      }
    });
  }, [sessionId, subscribe, getClientId, playback]);
}
