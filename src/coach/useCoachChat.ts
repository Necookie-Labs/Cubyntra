'use client';

/**
 * Cubyntra - useCoachChat (client hook)
 * Necookie Labs (c) 2026
 *
 * "Ask the coach": a short conversation about the step on screen, streamed from
 * `/api/coach/chat`. The body is words only: the step's compact facts JSON, the question and the
 * earlier turns (newest eight, each cut to 1,200 characters). No images, audio or cube state.
 *
 * History lives in memory for one step. When the step changes the conversation is cleared and
 * `stepChanged` is set (the chat says "New step, new conversation") until the next question.
 * Asking again stops the answer still streaming; `stop` keeps what was shown so far.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatAlgorithm } from '../cube/transforms';
import type { Diagnosis, StepPlan } from '../tutor/types';
import { MAX_CHAT_QUESTION, MAX_CHAT_TURNS, MAX_CHAT_TURN_TEXT, type ChatRole, type ChatTurn } from './chat';
import { buildCoachFacts } from './facts';
import { createCoachEventParser } from './sse';
import type { AttemptRecord, CoachMode, CoachFacts } from './types';
import { APP_TOKEN_HEADER } from './useCoach';

export interface ChatMessage {
  id: number;
  role: ChatRole;
  text: string;
  /** Coach answers only: streaming, finished, stopped by the student, or failed. */
  status: 'streaming' | 'done' | 'stopped' | 'error';
  source?: 'live' | 'template';
  mode?: CoachMode;
  notice?: string;
}

export interface UseCoachChatOptions {
  plan: StepPlan | null;
  token: string | null;
  attempts?: readonly AttemptRecord[];
  diagnosis?: Diagnosis;
  /** Defaults to `/api/coach/chat`. */
  endpoint?: string;
}

export interface UseCoachChatResult {
  messages: ChatMessage[];
  /** An answer is on its way. */
  busy: boolean;
  error: string | null;
  /** The step changed since the last question (the old conversation was cleared). */
  stepChanged: boolean;
  /** The facts the answers are about (hint level 3: with the move words). */
  facts: CoachFacts | null;
  ask: (question: string) => void;
  stop: () => void;
  clear: () => void;
}

interface State {
  key: string;
  messages: ChatMessage[];
  error: string | null;
  stepChanged: boolean;
}

function stepKey(plan: StepPlan | null): string {
  if (!plan) return '';
  return [plan.method, plan.stage, plan.caseId, plan.stepIndex, formatAlgorithm([...plan.setupMoves, ...plan.algorithm])].join('|');
}

function errorMessage(status: number): string {
  if (status === 401) return 'This device is not paired with the coach yet.';
  if (status === 429) return 'That is a lot of questions! Wait a minute, then ask again.';
  if (status === 400 || status === 413) return 'The coach could not read that question. Try asking it in a shorter way.';
  return 'The coach cannot be reached right now. The step notes still work.';
}

/** The earlier turns sent with a question: finished text only, newest eight, each cut short. */
export function chatHistory(messages: readonly ChatMessage[]): ChatTurn[] {
  return messages
    .filter((m) => m.text.trim() && (m.role === 'student' || m.status === 'done' || m.status === 'stopped'))
    .map((m) => ({ role: m.role, text: m.text.trim().slice(0, MAX_CHAT_TURN_TEXT) }))
    .slice(-MAX_CHAT_TURNS);
}

let nextId = 1;

export function useCoachChat({ plan, token, attempts, diagnosis, endpoint = '/api/coach/chat' }: UseCoachChatOptions): UseCoachChatResult {
  const key = stepKey(plan);
  const [state, setState] = useState<State>({ key, messages: [], error: null, stepChanged: false });
  const controllerRef = useRef<AbortController | null>(null);

  // A new step starts a new conversation (adjusting state during render, not in an effect).
  if (state.key !== key) setState({ key, messages: [], error: null, stepChanged: state.messages.length > 0 || state.stepChanged });

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    },
    [key]
  );

  const facts = plan ? buildCoachFacts(plan, 3, attempts ?? [], diagnosis) : null;
  const factsRef = useRef(facts);
  const messagesRef = useRef(state.messages);
  useEffect(() => {
    factsRef.current = facts;
    messagesRef.current = state.messages;
  });

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState((s) => ({
      ...s,
      messages: s.messages.map((m) => (m.status === 'streaming' ? { ...m, status: m.text ? 'stopped' : 'error', text: m.text } : m)),
    }));
  }, []);

  const clear = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState((s) => ({ ...s, messages: [], error: null, stepChanged: false }));
  }, []);

  const ask = useCallback(
    (raw: string) => {
      const question = raw.trim().slice(0, MAX_CHAT_QUESTION);
      const stepFacts = factsRef.current;
      if (!question || !stepFacts) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const forKey = key;
      const answerId = nextId++;
      const settle = (m: ChatMessage): ChatMessage =>
        m.status === 'streaming' ? { ...m, status: m.text ? 'stopped' : 'error' } : m;
      const history: ChatTurn[] = chatHistory(messagesRef.current.map(settle));

      setState((s) => {
        // An answer still streaming is cut short where it was.
        const settled = s.messages.map(settle);
        return {
          ...s,
          error: null,
          stepChanged: false,
          messages: [
            ...settled,
            { id: nextId++, role: 'student', text: question, status: 'done' },
            { id: answerId, role: 'coach', text: '', status: 'streaming' },
          ],
        };
      });

      const isCurrent = () => controllerRef.current === controller && !controller.signal.aborted;
      const patch = (p: Partial<ChatMessage>, error?: string) => {
        if (!isCurrent()) return;
        setState((s) =>
          s.key !== forKey
            ? s
            : {
                ...s,
                ...(error !== undefined ? { error } : {}),
                messages: s.messages.map((m) => (m.id === answerId ? { ...m, ...p } : m)),
              }
        );
      };
      const fail = (message: string) => patch({ status: 'error' }, message);

      if (!token) {
        fail(errorMessage(401));
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        fail('You are offline. The step notes still work; ask again when you are back online.');
        return;
      }

      void (async () => {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', [APP_TOKEN_HEADER]: token },
            body: JSON.stringify({ facts: stepFacts, question, history }),
            signal: controller.signal,
          });
          if (!res.ok || !res.body) {
            fail(errorMessage(res.status));
            return;
          }
          let text = '';
          let finished = false;
          const push = createCoachEventParser((event) => {
            if (event.type === 'delta') {
              text += event.text;
              patch({ text });
            } else if (event.type === 'replace') {
              text = event.text;
              patch({ text });
            } else {
              finished = true;
              patch({ status: 'done', source: event.source, mode: event.mode, ...(event.notice ? { notice: event.notice } : {}) });
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
          if (!finished) fail(errorMessage(0));
        } catch {
          fail(errorMessage(0));
        } finally {
          if (controllerRef.current === controller) controllerRef.current = null;
        }
      })();
    },
    [key, token, endpoint]
  );

  const busy = state.messages.some((m) => m.status === 'streaming');
  return { messages: state.messages, busy, error: state.error, stepChanged: state.stepChanged, facts, ask, stop, clear };
}
