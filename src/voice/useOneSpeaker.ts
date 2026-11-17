'use client';

/**
 * Cubyntra - useOneSpeaker (client hook, ADR-016)
 * Necookie Labs (c) 2026
 *
 * Whether this device may speak: always when it is not paired, otherwise only while it is the
 * device driving the solve (see `SpeakerArbiter`).
 */

import { useEffect, useState } from 'react';
import type { TutorSyncTarget } from '../sync/useTutorSync';
import { SpeakerArbiter } from './oneSpeaker';

export function useOneSpeaker(target: Pick<TutorSyncTarget, 'sessionId' | 'subscribe' | 'getClientId'>): boolean {
  const { sessionId, subscribe, getClientId } = target;
  const [state, setState] = useState<{ sessionId: string | null; speaker: boolean }>({ sessionId, speaker: true });

  useEffect(() => {
    if (!sessionId) return;
    const arbiter = new SpeakerArbiter(getClientId);
    return subscribe((event) => {
      arbiter.observe(event);
      const speaker = arbiter.isSpeaker();
      setState((s) => (s.sessionId === sessionId && s.speaker === speaker ? s : { sessionId, speaker }));
    });
  }, [sessionId, subscribe, getClientId]);

  if (!sessionId) return true;
  return state.sessionId === sessionId ? state.speaker : true;
}
