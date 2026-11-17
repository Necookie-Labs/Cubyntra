'use client';

/**
 * Cubyntra - Voice status (mode and month credits) from the laptop
 * Necookie Labs (c) 2026
 */

import { useCallback, useEffect, useState } from 'react';
import type { VoiceMode } from '../lib/studentProfile';
import type { VoiceStatus } from './types';

const APP_TOKEN_HEADER = 'x-cubyntra-token';

export type VoiceStatusState =
  | { kind: 'loading' }
  | { kind: 'ready'; status: VoiceStatus }
  /** No token on this device, or the laptop could not be reached. */
  | { kind: 'offline' };

/** Reads `/api/voice/status` for the student's chosen voice; `refresh` reads it again. */
export function useVoiceStatus(token: string | null, preference: VoiceMode): VoiceStatusState & { refresh: () => void } {
  const [round, setRound] = useState(0);
  const key = `${token}|${preference}|${round}`;
  const [state, setState] = useState<{ key: string; value: VoiceStatusState }>({ key, value: { kind: 'loading' } });

  useEffect(() => {
    if (!token) return;
    let live = true;
    fetch(`/api/voice/status?preference=${preference}`, { headers: { [APP_TOKEN_HEADER]: token }, cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const status = (await res.json()) as VoiceStatus;
        if (live) setState({ key, value: { kind: 'ready', status } });
      })
      .catch(() => {
        if (live) setState({ key, value: { kind: 'offline' } });
      });
    return () => {
      live = false;
    };
  }, [token, preference, key]);

  const refresh = useCallback(() => setRound((r) => r + 1), []);
  if (!token) return { kind: 'offline', refresh };
  // Keep showing the last answer while a refresh is on its way.
  return { ...(state.key === key || state.value.kind === 'ready' ? state.value : { kind: 'loading' as const }), refresh };
}
