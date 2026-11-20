/**
 * Cubyntra - "Ask the coach" service (server only)
 * Necookie Labs (c) 2026
 *
 * One chat answer as coach stream events (`delta` / `replace` / `done`, the same contract as
 * `/api/coach`). Live mode streams Claude Haiku 5.5 (thinking off, effort low, at most 500
 * tokens) with two system blocks: the cached coach prompt, then the byte-stable chat rules. The
 * chat guardrail (`checkChatAnswer`) checks the text before the student sees it, and anything
 * that cannot be trusted becomes the built-in answer. Mock mode (no key) and capped mode (the
 * shared monthly cap) answer from the step's facts and case notes. Spend is shared with hints.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { CHAT_NOTICES, CHAT_RULES, chatMessages, chatRelayableLength, chatTemplate, checkChatAnswer, type ChatRequest } from './chat';
import { coachMode, streamGuardedReply, type CoachReplyOptions } from './service';
import { CHAT_MAX_TOKENS, COACH_MODEL, estimateCallCost, getSpendTracker } from './spend';
import { COACH_SYSTEM_PROMPT } from './systemPrompt';
import type { CoachMode, CoachStreamEvent, FallbackReason } from './types';

/** The exact chat request sent to Claude (no sampling parameters; thinking off at effort low). */
export function buildChatRequest(request: ChatRequest): Anthropic.MessageStreamParams {
  return {
    model: COACH_MODEL,
    max_tokens: CHAT_MAX_TOKENS,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: [
      { type: 'text', text: COACH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: CHAT_RULES },
    ],
    messages: chatMessages(request),
  };
}

function* builtInAnswer(request: ChatRequest, mode: CoachMode, reason: FallbackReason): Generator<CoachStreamEvent> {
  yield { type: 'delta', text: chatTemplate(request.facts, request.question) };
  const notice = reason === 'mock' ? CHAT_NOTICES.mock : reason === 'capped' ? CHAT_NOTICES.capped : CHAT_NOTICES.fallback;
  yield { type: 'done', source: 'template', mode, reason, notice };
}

/** One chat answer as stream events: deltas (or a replace), then exactly one `done`. */
export async function* coachChatReply(request: ChatRequest, options: CoachReplyOptions = {}): AsyncGenerator<CoachStreamEvent> {
  const tracker = options.tracker ?? getSpendTracker();
  const mode = coachMode(tracker);
  if (mode !== 'live') {
    yield* builtInAnswer(request, mode, mode === 'mock' ? 'mock' : 'capped');
    return;
  }

  const params = buildChatRequest(request);
  const inputChars = COACH_SYSTEM_PROMPT.length + CHAT_RULES.length + JSON.stringify(params.messages).length;
  const estimate = estimateCallCost(inputChars, COACH_MODEL, CHAT_MAX_TOKENS);
  if (!tracker.reserve(estimate)) {
    yield* builtInAnswer(request, 'capped', 'capped');
    return;
  }

  yield* streamGuardedReply({
    request: params,
    inputChars,
    estimate,
    passes: (text) => checkChatAnswer(text, request.facts).ok,
    relayable: (text) => chatRelayableLength(text, request.facts),
    fallbackText: () => chatTemplate(request.facts, request.question),
    fallbackNotice: CHAT_NOTICES.fallback,
    tracker,
    signal: options.signal,
    tag: 'coach-chat',
  });
}
