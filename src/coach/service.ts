/**
 * Cubyntra - Coach Service (server only)
 * Necookie Labs (c) 2026
 *
 * Produces one coach reply as a sequence of stream events. In live mode it streams Claude
 * Haiku 5.5 (effort low, at most 400 tokens, cached system prompt) and relays text as it
 * arrives, holding back the last partial word so the move guardrail sees each token before the
 * student does. Whenever the reply cannot be trusted (guardrail, refusal, truncation, an API
 * error) the student gets the built-in template instead. Mock mode (no key) and capped mode
 * (monthly cap reached) serve templates through the same events.
 */

import Anthropic from '@anthropic-ai/sdk';
import { allowedMoves } from './facts';
import { checkReplyMoves } from './guard';
import { COACH_MAX_TOKENS, COACH_MODEL, SpendTracker, estimateCallCost, getSpendTracker } from './spend';
import { COACH_SYSTEM_PROMPT } from './systemPrompt';
import { CASE_NOTES, NOTICES, templateText } from './templates';
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

/** The exact request sent to Claude. No sampling parameters: the API rejects them. */
export function buildCoachRequest(facts: CoachFacts): Anthropic.MessageStreamParams {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: JSON.stringify(facts) }];
  return {
    model: COACH_MODEL,
    max_tokens: COACH_MAX_TOKENS,
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: COACH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages,
  };
}

function guardNames(facts: CoachFacts): string[] {
  return [facts.caseName, facts.stageName, CASE_NOTES[facts.caseId]?.name ?? ''];
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

function logUsage(usage: Anthropic.Usage, cost: number): void {
  console.info(
    `[coach] usage input=${usage.input_tokens} output=${usage.output_tokens} ` +
      `cache_read=${usage.cache_read_input_tokens ?? 0} cache_write=${usage.cache_creation_input_tokens ?? 0} ` +
      `cost=$${cost.toFixed(6)}`
  );
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
  const estimate = estimateCallCost(COACH_SYSTEM_PROMPT.length + JSON.stringify(request.messages).length);
  if (!tracker.reserve(estimate)) {
    yield* templateReply(facts, 'capped', 'capped');
    return;
  }

  const allowed = allowedMoves(facts);
  const names = guardNames(facts);
  let usage: Anthropic.Usage | null = null;
  let full = '';
  let sent = 0;
  let rejected: FallbackReason | null = null;

  try {
    const stream = getClient().messages.stream(request, { signal: options.signal });
    for await (const event of stream) {
      if (rejected || event.type !== 'content_block_delta' || event.delta.type !== 'text_delta') continue;
      full += event.delta.text;
      // Relay up to the last whitespace: a token is complete once a space follows it.
      const cut = Math.max(full.lastIndexOf(' '), full.lastIndexOf('\n')) + 1;
      if (cut <= sent) continue;
      if (!checkReplyMoves(full.slice(0, cut), allowed, names).ok) {
        // Swap in the template now; keep reading so the call's usage can be recorded.
        rejected = 'guard';
        yield { type: 'replace', text: templateText(facts), reason: 'guard' };
        continue;
      }
      yield { type: 'delta', text: full.slice(sent, cut) };
      sent = cut;
    }
    const message = await stream.finalMessage();
    usage = message.usage;

    if (!rejected) {
      if (message.stop_reason === 'refusal') rejected = 'refusal';
      else if (message.stop_reason === 'max_tokens') rejected = 'max-tokens';
      else if (!full.trim()) rejected = 'empty';
      else if (!checkReplyMoves(full, allowed, names).ok) rejected = 'guard';
      if (rejected) {
        yield { type: 'replace', text: templateText(facts), reason: rejected };
      } else if (sent < full.length) {
        yield { type: 'delta', text: full.slice(sent) };
      }
    }
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError || options.signal?.aborted) return;
    rejected = fallbackReason(error);
    console.warn(`[coach] falling back to the template (${rejected}): ${error instanceof Error ? error.name : 'error'}`);
    yield { type: 'replace', text: templateText(facts), reason: rejected };
  } finally {
    const cost = tracker.settle(estimate, usage);
    if (usage) logUsage(usage, cost);
  }

  yield rejected
    ? { type: 'done', source: 'template', mode: 'live', reason: rejected, notice: NOTICES.fallback }
    : { type: 'done', source: 'live', mode: 'live' };
}
