'use client';

/**
 * Cubyntra - useCoach (client hook)
 * Necookie Labs (c) 2026
 *
 * Asks `/api/coach` for a hint about the current step and streams the reply into state. Only
 * the compact facts JSON is sent (no images, no cube state). The request is aborted when the
 * component unmounts or the step changes, and the shown text is cleared for the new step.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatAlgorithm } from '../cube/transforms';
import type { Diagnosis, StepPlan } from '../tutor/types';
import { buildCoachFacts } from './facts';
import { createCoachEventParser } from './sse';
import type { AttemptRecord, CoachMode, FallbackReason, HintLevel } from './types';

/** Same header as `src/lib/localAuth.ts` (server only, so not imported here). */
export const APP_TOKEN_HEADER = 'x-cubyntra-token';

export type CoachRequestStatus = 'idle' | 'loading' | 'streaming' | 'done' | 'error';

export interface UseCoachOptions {
  /** The step being explained; null when there is none. */
  plan: StepPlan | null;
  /** App token from `/api/auth/token` (laptop) or the pairing QR (phone). */
  token: string | null;
  attempts?: readonly AttemptRecord[];
  /** The tutor's diagnosis of the last failed check; only a compact projection is sent. */
  diagnosis?: Diagnosis;
  /** Defaults to `/api/coach`. */
  endpoint?: string;
}

export interface UseCoachState {
  text: string;
  status: CoachRequestStatus;
  hintLevel: HintLevel | null;
  /** Where the shown text came from, once known. */
  source: 'live' | 'template' | null;
  mode: CoachMode | null;
  reason: FallbackReason | null;
  /** A notice to show with template text (mock mode, cap reached, fallback). */
  notice: string | null;
  error: string | null;
}

export interface UseCoachResult extends UseCoachState {
  requestHint: (level: HintLevel) => void;
  cancel: () => void;
}

const IDLE: UseCoachState = {
  text: '',
  status: 'idle',
  hintLevel: null,
  source: null,
  mode: null,
  reason: null,
  notice: null,
  error: null,
};

function stepKey(plan: StepPlan | null): string {
  if (!plan) return '';
  const moves = formatAlgorithm([...plan.setupMoves, ...plan.algorithm]);
  return [plan.method, plan.stage, plan.caseId, plan.stepIndex, moves].join('|');
}

function errorMessage(status: number): string {
  if (status === 401) return 'This device is not paired with the coach yet.';
  if (status === 429) return 'The coach needs a short break. Try again in a minute.';
  if (status === 400 || status === 413) return 'The coach could not read this step.';
  return 'The coach is offline right now.';
}

export function useCoach({ plan, token, attempts, diagnosis, endpoint = '/api/coach' }: UseCoachOptions): UseCoachResult {
  const key = stepKey(plan);
  const [state, setState] = useState<UseCoachState & { key: string }>({ ...IDLE, key });
  const controllerRef = useRef<AbortController | null>(null);

  // A new step starts with a clean slate (adjusting state during render, not in an effect).
  if (state.key !== key) setState({ ...IDLE, key });

  // Abort the running request when the step changes or the component unmounts.
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    },
    [key]
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState((s) => (s.status === 'loading' || s.status === 'streaming' ? { ...s, status: 'idle' } : s));
  }, []);

  const requestHint = useCallback(
    (level: HintLevel) => {
      if (!plan) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const forKey = stepKey(plan);
      // Only the latest request may change state, and only for the step it was made for.
      const isCurrent = () => controllerRef.current === controller && !controller.signal.aborted;
      const update = (patch: Partial<UseCoachState>) => {
        if (isCurrent()) setState((s) => (s.key === forKey ? { ...s, ...patch } : s));
      };

      setState({ ...IDLE, key: forKey, status: 'loading', hintLevel: level });
      if (!token) {
        update({ status: 'error', error: errorMessage(401) });
        return;
      }

      const facts = buildCoachFacts(plan, level, attempts ?? [], diagnosis);
      void (async () => {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', [APP_TOKEN_HEADER]: token },
            body: JSON.stringify({ facts }),
            signal: controller.signal,
          });
          if (!res.ok || !res.body) {
            update({ status: 'error', error: errorMessage(res.status) });
            return;
          }
          let text = '';
          const push = createCoachEventParser((event) => {
            if (event.type === 'delta') {
              text += event.text;
              update({ status: 'streaming', text });
            } else if (event.type === 'replace') {
              text = event.text;
              update({ status: 'streaming', text, reason: event.reason });
            } else {
              update({
                status: 'done',
                source: event.source,
                mode: event.mode,
                reason: event.reason ?? null,
                notice: event.notice ?? null,
              });
            }
          });
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            push(decoder.decode(value, { stream: true }));
          }
          // The stream ended without a `done` event: the connection dropped.
          if (isCurrent()) {
            setState((s) =>
              s.key === forKey && s.status !== 'done' ? { ...s, status: 'error', error: errorMessage(0) } : s
            );
          }
        } catch {
          update({ status: 'error', error: errorMessage(0) });
        }
      })();
    },
    [plan, token, attempts, diagnosis, endpoint]
  );

  const { text, status, hintLevel, source, mode, reason, notice, error } = state;
  return { text, status, hintLevel, source, mode, reason, notice, error, requestHint, cancel };
}
