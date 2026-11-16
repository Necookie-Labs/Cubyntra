'use client';

/**
 * Cubyntra - Laptop playback sync
 * Necookie Labs (c) 2026
 *
 * While a phone is paired, the laptop publishes the scrambled cube and the solution once, reports
 * its own play / pause / speed / position changes, and applies the phone's commands to the store
 * (ordered by sequence number, see `playbackSync.ts`). The laptop drives the animation; the phone
 * mirrors it and can control it.
 */

import { useEffect, useRef } from 'react';
import { formatAlgorithm } from '@/cube/transforms';
import { CubyntraStore, useCubyntraStore } from '@/stores/useCubyntraStore';
import { shouldApplyPlayback } from './playbackSync';
import { PostResult } from './syncClient';
import { PlaybackPayload, SyncEvent, SyncMessage } from './types';

export interface PlaybackSyncTarget {
  sessionId: string | null;
  send: (message: SyncMessage) => Promise<PostResult>;
  subscribe: (listener: (event: SyncEvent) => void) => () => void;
  getClientId: () => string;
}

/** Short stable id for a solution (FNV-1a of its notation). */
export function planIdFor(algorithm: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < algorithm.length; i++) {
    h ^= algorithm.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `solve-${(h >>> 0).toString(36)}`;
}

function applyRemote(payload: PlaybackPayload): void {
  const s = useCubyntraStore.getState();
  switch (payload.action) {
    case 'play':
      if (!s.isPlaying) s.setPlaying(true);
      break;
    case 'pause':
      if (s.isPlaying) s.setPlaying(false);
      break;
    case 'speed':
      if (payload.speed !== undefined && payload.speed !== s.playbackSpeed) s.setPlaybackSpeed(payload.speed);
      break;
    case 'seek':
      if (payload.index !== undefined && (payload.index !== s.currentMoveIndex || s.isPlaying)) s.seekToMove(payload.index);
      break;
    case 'index':
      if (payload.index !== undefined && payload.index !== s.currentMoveIndex) s.seekToMove(payload.index);
      break;
  }
}

export function usePlaybackSync(target: PlaybackSyncTarget): void {
  const { sessionId, send, subscribe, getClientId } = target;
  const applyingRemote = useRef(false);
  const lastSeq = useRef(0);

  // Outgoing: the solution once per pairing, then every local playback change.
  useEffect(() => {
    if (!sessionId) return;
    lastSeq.current = 0;
    let sentPlan: string | null = null;

    const publishSolution = (s: CubyntraStore) => {
      if (!s.solution?.success || s.solution.moves.length === 0) return;
      const algorithm = formatAlgorithm(s.solution.moves);
      const planId = planIdFor(algorithm);
      if (sentPlan === planId) return;
      sentPlan = planId;
      void send({ type: 'cube-state', payload: { state: s.originalScrambleState } });
      void send({ type: 'step', payload: { method: 'solver', stepIndex: 0, planId, algorithm, stepCount: 1 } });
    };
    const playback = (payload: PlaybackPayload) => void send({ type: 'playback', payload });

    publishSolution(useCubyntraStore.getState());
    return useCubyntraStore.subscribe((s, prev) => {
      publishSolution(s);
      if (applyingRemote.current || !s.solution || s.solution !== prev.solution) return;
      if (s.isPlaying !== prev.isPlaying) playback({ action: s.isPlaying ? 'play' : 'pause' });
      if (s.playbackSpeed !== prev.playbackSpeed) playback({ action: 'speed', speed: s.playbackSpeed });
      if (s.currentMoveIndex !== prev.currentMoveIndex) {
        playback({ action: s.isPlaying ? 'index' : 'seek', index: s.currentMoveIndex });
      }
    });
  }, [sessionId, send]);

  // Incoming: apply relayed playback commands in sequence order.
  useEffect(() => {
    if (!sessionId) return;
    return subscribe((event) => {
      if (event.type !== 'playback') return;
      const s = useCubyntraStore.getState();
      const apply = shouldApplyPlayback(event, {
        lastSeq: lastSeq.current,
        ownClientId: getClientId(),
        drives: true,
        locallyPlaying: s.isPlaying,
      });
      lastSeq.current = Math.max(lastSeq.current, event.seq);
      if (!apply || !s.solution) return;
      applyingRemote.current = true;
      try {
        applyRemote(event.payload);
      } finally {
        applyingRemote.current = false;
      }
    });
  }, [sessionId, subscribe, getClientId]);
}
