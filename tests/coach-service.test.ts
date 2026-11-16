/**
 * Cubyntra - Coach Service Tests (mocked SDK, no network)
 * Necookie Labs (c) 2026
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { buildCoachRequest, coachMode, coachReply, coachStatus, resetCoachClientForTests } from '../src/coach/service';
import { COACH_SYSTEM_PROMPT } from '../src/coach/systemPrompt';
import { SpendTracker } from '../src/coach/spend';
import { templateText } from '../src/coach/templates';
import { CoachStreamEvent } from '../src/coach/types';
import { SAMPLE_FACTS } from './helpers/coachFacts';
import { FakeReply, fakeStream } from './helpers/fakeAnthropic';
import { useScratchDataDir } from './helpers/scratchData';

const streamMock = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>();
  class FakeAnthropic extends actual.default {
    constructor() {
      super({ apiKey: 'test-key' });
      (this as unknown as { messages: unknown }).messages = { stream: streamMock };
    }
  }
  return { ...actual, default: FakeAnthropic };
});

let scratch: ReturnType<typeof useScratchDataDir>;
let tracker: SpendTracker;

beforeEach(() => {
  scratch = useScratchDataDir();
  tracker = new SpendTracker(path.join(scratch.dir, 'coach-usage.json'));
  process.env.ANTHROPIC_API_KEY = 'test-key';
  delete process.env.COACH_MONTHLY_CAP_USD;
  resetCoachClientForTests();
  streamMock.mockReset();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  scratch.cleanup();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.COACH_MONTHLY_CAP_USD;
  vi.restoreAllMocks();
});

async function collect(reply?: FakeReply, facts = SAMPLE_FACTS): Promise<CoachStreamEvent[]> {
  if (reply) streamMock.mockReturnValue(fakeStream(reply));
  const events: CoachStreamEvent[] = [];
  for await (const e of coachReply(facts, { tracker })) events.push(e);
  return events;
}

/** What the student ends up seeing. */
function shown(events: CoachStreamEvent[]): string {
  let text = '';
  for (const e of events) {
    if (e.type === 'delta') text += e.text;
    if (e.type === 'replace') text = e.text;
  }
  return text;
}

describe('coach request shape', () => {
  it('uses Haiku 5.5 with thinking off at low effort, a cached system prompt and no sampling params', async () => {
    await collect({ chunks: ['Find the corner. '] });
    expect(streamMock).toHaveBeenCalledTimes(1);
    const [params, options] = streamMock.mock.calls[0];
    expect(params).toEqual(buildCoachRequest(SAMPLE_FACTS));
    expect(params.model).toBe('claude-haiku-5-5');
    expect(params.max_tokens).toBe(400);
    expect(params.output_config).toEqual({ effort: 'low' });
    // Thinking off so the 400-token budget is all reply; allowed on Haiku 5.5 at effort <= high.
    expect(params.thinking).toEqual({ type: 'disabled' });
    expect(params.system).toEqual([
      { type: 'text', text: COACH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ]);
    expect(params.messages).toEqual([{ role: 'user', content: JSON.stringify(SAMPLE_FACTS) }]);
    for (const key of ['temperature', 'top_p', 'top_k']) expect(params).not.toHaveProperty(key);
    expect(options).toHaveProperty('signal');
  });
});

describe('live replies', () => {
  it('relays text as it streams and records the spend', async () => {
    const events = await collect({ chunks: ['Look for ', 'the corner ', 'with yellow on the front.'] });
    expect(events.filter((e) => e.type === 'delta').length).toBeGreaterThan(1);
    expect(shown(events)).toBe('Look for the corner with yellow on the front.');
    expect(events.at(-1)).toEqual({ type: 'done', source: 'live', mode: 'live' });
    const saved = JSON.parse(fs.readFileSync(path.join(scratch.dir, 'coach-usage.json'), 'utf8'));
    const month = Object.values(saved.months)[0] as { requests: number; cacheReadTokens: number };
    expect(month.requests).toBe(1);
    expect(month.cacheReadTokens).toBe(4500);
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('cache_read=4500'));
  });

  it('passes a reply that quotes the plan moves', async () => {
    const events = await collect({ chunks: ["Hold yellow on top. Do U, then R U R' ", "U R U2 R'."] });
    expect(shown(events)).toBe("Hold yellow on top. Do U, then R U R' U R U2 R'.");
    expect(events.at(-1)).toMatchObject({ source: 'live' });
  });

  it('swaps in the template when the reply invents a move, before the move is shown', async () => {
    const events = await collect({ chunks: ["Do R U R' ", "F' to ", 'finish.'] });
    const shownBeforeReplace = events
      .slice(0, events.findIndex((e) => e.type === 'replace'))
      .map((e) => (e.type === 'delta' ? e.text : ''))
      .join('');
    expect(shownBeforeReplace).not.toContain("F'");
    expect(events).toContainEqual({ type: 'replace', text: templateText(SAMPLE_FACTS), reason: 'guard' });
    expect(shown(events)).toBe(templateText(SAMPLE_FACTS));
    expect(events.at(-1)).toMatchObject({ type: 'done', source: 'template', reason: 'guard' });
    // The call still cost money, so it is still recorded.
    expect(tracker.monthUsage().requests).toBe(1);
  });

  it('holds back a lone letter until the next word shows it starts a run of moves', async () => {
    const events = await collect({ chunks: ['Look at the F ', "R U R' now."] });
    const firstReplace = events.findIndex((e) => e.type === 'replace');
    expect(firstReplace).toBeGreaterThan(-1);
    const shownBefore = events.slice(0, firstReplace).map((e) => (e.type === 'delta' ? e.text : '')).join('');
    expect(shownBefore).toBe('Look at the ');
    expect(events.at(-1)).toMatchObject({ source: 'template', reason: 'guard' });
  });

  it('lets a lone capital in prose through once the next word arrives', async () => {
    const events = await collect({ chunks: ['Look at the F ', 'face, then plan B.'] });
    expect(shown(events)).toBe('Look at the F face, then plan B.');
    expect(events.at(-1)).toEqual({ type: 'done', source: 'live', mode: 'live' });
  });

  it('checks the last word too', async () => {
    const events = await collect({ chunks: ['Finish with B2'] });
    expect(events.at(-1)).toMatchObject({ source: 'template', reason: 'guard' });
  });

  it.each([
    ['refusal', 'refusal'],
    ['max_tokens', 'max-tokens'],
  ] as const)('falls back to the template on stop_reason %s', async (stopReason, reason) => {
    const events = await collect({ chunks: ['Some partial text '], stopReason });
    expect(shown(events)).toBe(templateText(SAMPLE_FACTS));
    expect(events.at(-1)).toMatchObject({ type: 'done', source: 'template', mode: 'live', reason });
  });

  it('falls back to the template on an empty reply', async () => {
    const events = await collect({ chunks: ['  '] });
    expect(events.at(-1)).toMatchObject({ source: 'template', reason: 'empty' });
  });

  it.each([
    ['rate limit', new Anthropic.RateLimitError(429, undefined, 'slow down', new Headers()), 'rate-limited'],
    ['server error', new Anthropic.InternalServerError(500, undefined, 'oops', new Headers()), 'api-error'],
    ['network', new Anthropic.APIConnectionError({ message: 'offline' }), 'offline'],
  ])('falls back to the template on a %s error', async (_label, error, reason) => {
    const events = await collect({ chunks: ['Look '], error });
    expect(shown(events)).toBe(templateText(SAMPLE_FACTS));
    expect(events.at(-1)).toMatchObject({ source: 'template', reason });
    expect(tracker.monthUsage().requests).toBe(0);
  });

  it('stops quietly when the student leaves', async () => {
    const events = await collect({ chunks: ['Look '], error: new Anthropic.APIUserAbortError() });
    expect(events.find((e) => e.type === 'replace' || e.type === 'done')).toBeUndefined();
  });
});

describe('modes', () => {
  it('serves templates in mock mode without calling Claude', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(coachMode(tracker)).toBe('mock');
    const events = await collect();
    expect(streamMock).not.toHaveBeenCalled();
    expect(shown(events)).toBe(templateText(SAMPLE_FACTS));
    expect(events.at(-1)).toMatchObject({ type: 'done', source: 'template', mode: 'mock', reason: 'mock' });
    expect(coachStatus(tracker)).toMatchObject({ mode: 'mock', monthSpendUsd: 0, capUsd: 10 });
  });

  it('cuts off at the monthly cap', async () => {
    process.env.COACH_MONTHLY_CAP_USD = '0.0001';
    await tracker.record({ input_tokens: 0, output_tokens: 400, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
    expect(coachMode(tracker)).toBe('capped');
    const events = await collect({ chunks: ['never sent'] });
    expect(streamMock).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ source: 'template', mode: 'capped', reason: 'capped' });
    expect((events.at(-1) as { notice: string }).notice).toContain('monthly limit');
  });

  it('refuses a call whose worst case would pass the cap', async () => {
    process.env.COACH_MONTHLY_CAP_USD = '0.0005';
    expect(coachMode(tracker)).toBe('live');
    const events = await collect({ chunks: ['never sent'] });
    expect(streamMock).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ source: 'template', mode: 'capped' });
  });
});
