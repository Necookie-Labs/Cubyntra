'use client';

/**
 * Cubyntra - Guided-solve sync target for a paired phone
 * Necookie Labs (c) 2026
 *
 * `useTutorSync` talks to "a target": something that can send state messages and hear the other
 * device's. On the laptop that is the pairing it owns (`useCompanion()`). On a phone that was
 * paired from the laptop's QR code or typed code, it is this hook: it opens the session's event
 * stream as the `mobile` device and posts as `mobile`, so a solve done on the phone sends its
 * step, grip, playback and checkpoint verdicts to the laptop, which mirrors them.
 *
 * On (re)connecting, the step the other device last showed (cube state, then step, then grip)
 * is replayed from the session snapshot as if it had just arrived, so a phone that opens /solve
 * late still joins the step on screen. Only state messages travel (ADR-015).
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { PairingCredentials } from './pairingLink';
import { newClientId, openSyncStream, postSyncMessage, type PostResult } from './syncClient';
import type { SyncEvent, SyncMessage } from './types';
import type { TutorSyncTarget } from './useTutorSync';

type Listener = (event: SyncEvent) => void;

/** The snapshot's step events in the order a live step arrives. */
export function snapshotStepEvents(snapshot: {
  cubeState: SyncEvent | null;
  step: SyncEvent | null;
  grip: SyncEvent | null;
}): SyncEvent[] {
  return [snapshot.cubeState, snapshot.step, snapshot.grip].filter((e): e is SyncEvent => e !== null);
}

/** A sync target for the phone, or an inactive one (`sessionId: null`) without credentials. */
export function useMobileTutorTarget(creds: PairingCredentials | null): TutorSyncTarget {
  const listeners = useRef(new Set<Listener>());
  const clientId = useRef<string | null>(null);
  const getClientId = useCallback(() => (clientId.current ??= newClientId()), []);

  useEffect(() => {
    if (!creds) return;
    const deliver = (event: SyncEvent) => {
      for (const listener of [...listeners.current]) listener(event);
    };
    const stream = openSyncStream({
      sessionId: creds.sessionId,
      secret: creds.secret,
      role: 'mobile',
      onEvent: (event) => {
        if (event.kind === 'snapshot') snapshotStepEvents(event.snapshot).forEach(deliver);
        else if (event.kind === 'message') deliver(event.event);
      },
    });
    return () => stream.close();
  }, [creds]);

  const send = useCallback(
    async (message: SyncMessage): Promise<PostResult> => {
      if (!creds) return { ok: false, status: 0 };
      return postSyncMessage(creds.sessionId, creds.secret, {
        ...message,
        role: 'mobile',
        clientId: getClientId(),
      } as SyncMessage & { role: 'mobile'; clientId: string });
    },
    [creds, getClientId]
  );

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const sessionId = creds?.sessionId ?? null;
  return useMemo(() => ({ sessionId, send, subscribe, getClientId }), [sessionId, send, subscribe, getClientId]);
}
