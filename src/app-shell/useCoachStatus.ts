'use client';

/**
 * Cubyntra - Coach status (mode and month spend)
 * Necookie Labs (c) 2026
 */

import { useEffect, useState } from 'react';
import type { CoachStatus } from '@/coach/types';
import { APP_TOKEN_HEADER } from './appToken';

export type CoachStatusState =
  | { kind: 'loading' }
  | { kind: 'ready'; status: CoachStatus }
  /** No token on this device, or the laptop could not be reached. */
  | { kind: 'offline' };

export function useCoachStatus(token: string | null): CoachStatusState {
  const [state, setState] = useState<{ token: string | null; value: CoachStatusState }>({
    token,
    value: { kind: 'loading' },
  });

  useEffect(() => {
    if (!token) return;
    let live = true;
    fetch('/api/coach/status', { headers: { [APP_TOKEN_HEADER]: token }, cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const status = (await res.json()) as CoachStatus;
        if (live) setState({ token, value: { kind: 'ready', status } });
      })
      .catch(() => {
        if (live) setState({ token, value: { kind: 'offline' } });
      });
    return () => {
      live = false;
    };
  }, [token]);

  if (!token) return { kind: 'offline' };
  return state.token === token ? state.value : { kind: 'loading' };
}
