/**
 * Cubyntra - Coach Service (server only)
 * Necookie Labs (c) 2026
 *
 * Produces one coach reply as a sequence of stream events. In live mode it streams Claude
 * Haiku 5.5 (thinking off, effort low, at most 400 tokens, cached system prompt) and relays
 * text as it arrives, holding back the last partial word (and a trailing bare move letter) so
 * the move guardrail sees each token before the student does. Whenever the reply cannot be trusted (guardrail, refusal, truncation, an API
 * error) the student gets the built-in template instead. Mock mode (no key) and capped mode
 * (monthly cap reached) serve templates through the same events.
 */

import Anthropic from '@anthropic-ai/sdk';
import { allowedMoves, guardNames } from './facts';
import { checkReplyMoves, relayableLength } from './guard';
import {
  COACH_MAX_TOKENS,
  COACH_MODEL,
  SpendTracker,
  estimateCallCost,
  estimateCallUsage,
  getSpendTracker,
  type UsageCounts,
} from './spend';
import { COACH_SYSTEM_PROMPT } from './systemPrompt';
import { NOTICES, templateText } from './templates';
import { CoachFacts, CoachMode, CoachStatus, CoachStreamEvent, FallbackReason } from './types';

export interface CoachReplyOptions {
  signal?: AbortSignal;
  tracker?: SpendTracker;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY from the environment; never sent to the browser.
  client ??= new Anthropic();
  return client;
}

/** Test hook: drop the cached client. */
export function resetCoachClientForTests(): void {
  client = null;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function coachMode(tracker: SpendTracker = getSpendTracker()): CoachMode {
  if (!hasApiKey()) return 'mock';
  return tracker.isCapped() ? 'capped' : 'live';
}

export function coachStatus(tracker: SpendTracker = getSpendTracker()): CoachStatus {
  return {
    mode: coachMode(tracker),
    monthSpendUsd: Number(tracker.monthSpendUsd().toFixed(6)),
    capUsd: tracker.capUsd(),
    month: tracker.month,
  };
}

/**
 * The exact request sent to Claude. No sampling parameters: the API rejects them. Thinking is
 * off: Haiku 5.5 thinks adaptively by default, and thinking tokens would eat into the 400-token
 * reply budget (a cut-off reply falls back to the template). Disabled thinking is accepted on
 * Haiku 5.5 at effort high or below, and this request uses low.
 */
export function buildCoachRequest(facts: CoachFacts): Anthropic.MessageStreamParams {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: JSON.stringify(facts) }];
  return {
    model: COACH_MODEL,
    max_tokens: COACH_MAX_TOKENS,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: COACH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages,
  };
}

function fallbackReason(error: unknown): FallbackReason {
  if (error instanceof Anthropic.RateLimitError) return 'rate-limited';
  if (error instanceof Anthropic.APIConnectionError) return 'offline';
  return 'api-error';
}

function* templateReply(facts: CoachFacts, mode: CoachMode, reason: FallbackReason): Generator<CoachStreamEvent> {
  yield { type: 'delta', text: templateText(facts) };
  const notice = reason === 'mock' ? NOTICES.mock : reason === 'capped' ? NOTICES.capped : NOTICES.fallback;
  yield { type: 'done', source: 'template', mode, reason, notice };
}

function logUsage(usage: UsageCounts, cost: number, tag = 'coach'): void {
  console.info(
    `[${tag}] usage input=${usage.input_tokens} output=${usage.output_tokens} ` +
      `cache_read=${usage.cache_read_input_tokens ?? 0} cache_write=${usage.cache_creation_input_tokens ?? 0} ` +
      `cost=$${cost.toFixed(6)}`
  );
}

/** What `streamGuardedReply` needs to stream one Claude call through a guardrail. */
export interface GuardedStreamOptions {
  request: Anthropic.MessageStreamParams;
  /** Characters of input, for the worst-case estimate when no usage arrives. */
  inputChars: number;
  /** The cost reserved for this call (released and replaced by the real usage at the end). */
  estimate: number;
  /** True when the text so far may be shown (the move guardrail). */
  passes: (text: string) => boolean;
  /** The built-in text shown instead whenever the reply cannot be trusted. */
  fallbackText: () => string;
  /** Notice sent with a fallback in live mode. */
  fallbackNotice: string;
  tracker: SpendTracker;
  signal?: AbortSignal;
  /** Log prefix, e.g. `coach` or `coach-chat`. */
  tag?: string;
}

/**
 * Streams one Claude call (already reserved against the cap) as coach stream events. Text is
 * relayed as it arrives, holding back the last partial word (and a trailing bare move letter) so
 * `passes` sees each token before the student does. A reply that fails `passes`, is refused, cut
 * off, empty or errors becomes a `replace` with `fallbackText`. Usage is recorded from the
 * stream events, so an aborted or failed call is still counted.
 */
export async function* streamGuardedReply(o: GuardedStreamOptions): AsyncGenerator<CoachStreamEvent> {
  const { request, inputChars, estimate, passes, fallbackText, tracker, signal } = o;
  const tag = o.tag ?? 'coach';
  const maxTokens = request.max_tokens;
  // Usage is taken from the stream as it arrives, so a call that is aborted or fails part-way
  // is still counted: `message_start` carries the input and cache counts, `message_delta` the
  // (cumulative) output count.
  let usage: UsageCounts | null = null;
  let outputCounted = false;
  // An HTTP error status means the API refused the call before any work: nothing was billed.
  let refusedByApi = false;
  let full = '';
  let sent = 0;
  let rejected: FallbackReason | null = null;

  try {
    const stream = getClient().messages.stream(request, { signal });
    for await (const event of stream) {
      if (event.type === 'message_start') {
        const u = event.message.usage;
        usage = {
          input_tokens: u.input_tokens,
          output_tokens: u.output_tokens,
          cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
        };
        continue;
      }
      if (event.type === 'message_delta') {
        const u = event.usage;
        const base: UsageCounts = usage ?? { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
        usage = {
          input_tokens: u.input_tokens ?? base.input_tokens,
          output_tokens: u.output_tokens,
          cache_creation_input_tokens: u.cache_creation_input_tokens ?? base.cache_creation_input_tokens,
          cache_read_input_tokens: u.cache_read_input_tokens ?? base.cache_read_input_tokens,
        };
        outputCounted = true;
        continue;
      }
      if (rejected || event.type !== 'content_block_delta' || event.delta.type !== 'text_delta') continue;
      full += event.delta.text;
      // Relay only complete tokens, holding back a bare letter that may start a run of moves.
      const cut = relayableLength(full);
      if (cut <= sent) continue;
      if (!passes(full.slice(0, cut))) {
        // Swap in the fallback now; keep reading so the call's usage can be recorded.
        rejected = 'guard';
        yield { type: 'replace', text: fallbackText(), reason: 'guard' };
        continue;
      }
      yield { type: 'delta', text: full.slice(sent, cut) };
      sent = cut;
    }
    const message = await stream.finalMessage();
    usage = message.usage;
    outputCounted = true;

    if (!rejected) {
      if (message.stop_reason === 'refusal') rejected = 'refusal';
      else if (message.stop_reason === 'max_tokens') rejected = 'max-tokens';
      else if (!full.trim()) rejected = 'empty';
      else if (!passes(full)) rejected = 'guard';
      if (rejected) {
        yield { type: 'replace', text: fallbackText(), reason: rejected };
      } else if (sent < full.length) {
        yield { type: 'delta', text: full.slice(sent) };
      }
    }
  } catch (error) {
    refusedByApi = error instanceof Anthropic.APIError && typeof error.status === 'number';
    if (error instanceof Anthropic.APIUserAbortError || signal?.aborted) return;
    rejected = fallbackReason(error);
    console.warn(`[${tag}] falling back to the built-in text (${rejected}): ${error instanceof Error ? error.name : 'error'}`);
    yield { type: 'replace', text: fallbackText(), reason: rejected };
  } finally {
    // Cut off before the output count arrived: count the full output budget (it may have been
    // generated). Nothing arrived at all: count the worst-case estimate, unless the API refused.
    let counted: UsageCounts | null = usage;
    if (counted && !outputCounted) counted = { ...counted, output_tokens: Math.max(counted.output_tokens, maxTokens) };
    if (!counted && !refusedByApi) counted = estimateCallUsage(inputChars, maxTokens);
    const cost = await tracker.settle(estimate, counted).catch((error: unknown) => {
      console.error(`[${tag}] Saving the usage failed:`, error);
      return 0;
    });
    if (counted) logUsage(counted, cost, tag);
  }

  yield rejected
    ? { type: 'done', source: 'template', mode: 'live', reason: rejected, notice: o.fallbackNotice }
    : { type: 'done', source: 'live', mode: 'live' };
}

/** One coach reply as stream events: deltas (or a replace), then exactly one `done`. */
export async function* coachReply(facts: CoachFacts, options: CoachReplyOptions = {}): AsyncGenerator<CoachStreamEvent> {
  const tracker = options.tracker ?? getSpendTracker();
  const mode = coachMode(tracker);
  if (mode !== 'live') {
    yield* templateReply(facts, mode, mode === 'mock' ? 'mock' : 'capped');
    return;
  }

  const request = buildCoachRequest(facts);
  const inputChars = COACH_SYSTEM_PROMPT.length + JSON.stringify(request.messages).length;
  const estimate = estimateCallCost(inputChars);
  if (!tracker.reserve(estimate)) {
    yield* templateReply(facts, 'capped', 'capped');
    return;
  }

  const allowed = allowedMoves(facts);
  const names = guardNames(facts);
  yield* streamGuardedReply({
    request,
    inputChars,
    estimate,
    passes: (text) => checkReplyMoves(text, allowed, names).ok,
    fallbackText: () => templateText(facts),
    fallbackNotice: NOTICES.fallback,
    tracker,
    signal: options.signal,
  });
}
