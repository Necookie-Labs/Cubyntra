/**
 * Cubyntra - "Ask the coach": body parsing, messages, chat rules, built-in answers and the
 * streamed service (mocked SDK, no network)
 * Necookie Labs (c) 2026
 */

import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_NOTICES,
  CHAT_RULES,
  MAX_CHAT_TURNS,
  chatMessages,
  chatTemplate,
  chatUserMessage,
  checkChatAnswer,
  movesInQuestion,
  parseChatRequest,
  questionKind,
  suggestedQuestions,
  type ChatTurn,
} from '../src/coach/chat';
import { buildChatRequest, coachChatReply } from '../src/coach/chatService';
import { resetCoachClientForTests } from '../src/coach/service';
import { SpendTracker } from '../src/coach/spend';
import { COACH_SYSTEM_PROMPT } from '../src/coach/systemPrompt';
import type { CoachStreamEvent } from '../src/coach/types';
import { SAMPLE_FACTS } from './helpers/coachFacts';
import { fakeStream, type FakeReply } from './helpers/fakeAnthropic';
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

const body = (patch: Record<string, unknown> = {}) => ({ facts: SAMPLE_FACTS, question: 'Why does this work?', history: [], ...patch });

describe('parseChatRequest', () => {
  it('accepts facts, a question and history, recomputing the derived fields', () => {
    const parsed = parseChatRequest(body({ facts: { ...SAMPLE_FACTS, caseTip: 'Do F D F.', moveWords: ['F = nonsense'] } }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.question).toBe('Why does this work?');
    expect(parsed.value.facts.caseTip).not.toBe('Do F D F.');
    expect(parsed.value.facts.moveWords).toBeUndefined(); // hint level 2 has none
  });

  it('keeps only the newest eight turns', () => {
    const history: ChatTurn[] = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'coach' : 'student', text: `turn ${i}` }));
    const parsed = parseChatRequest(body({ history }));
    expect(parsed.ok && parsed.value.history).toHaveLength(MAX_CHAT_TURNS);
    expect(parsed.ok && parsed.value.history[0].text).toBe('turn 4');
  });

  it.each([
    ['no question', { question: undefined }],
    ['an empty question', { question: '   ' }],
    ['a question over 400 characters', { question: 'a'.repeat(401) }],
    ['a question with an image', { question: `look data:image/png;base64,${'A'.repeat(200)}` }],
    ['a question with encoded audio', { question: 'Q'.repeat(300) }],
    ['a turn over 1,200 characters', { history: [{ role: 'student', text: 'a'.repeat(1201) }] }],
    ['a turn with an unknown role', { history: [{ role: 'system', text: 'hi' }] }],
    ['a turn with an extra field', { history: [{ role: 'student', text: 'hi', audio: 'x' }] }],
    ['history that is not a list', { history: 'hi' }],
    ['an audio field', { audio: 'UklGR' }],
    ['an image field', { image: 'x' }],
    ['bad facts', { facts: { ...SAMPLE_FACTS, algorithm: 'Q Q' } }],
  ])('refuses %s', (_name, patch) => {
    expect(parseChatRequest(body(patch)).ok).toBe(false);
  });
});

describe('chat messages', () => {
  it('puts history as earlier turns and the question with the facts last', () => {
    const history: ChatTurn[] = [
      { role: 'student', text: 'Hi' },
      { role: 'coach', text: 'Hello!' },
    ];
    const messages = chatMessages({ facts: SAMPLE_FACTS, question: 'Why?', history });
    expect(messages).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: chatUserMessage(SAMPLE_FACTS, 'Why?') },
    ]);
    expect(chatUserMessage(SAMPLE_FACTS, 'Why?')).toContain(JSON.stringify(SAMPLE_FACTS));
  });

  it('always starts with the student and alternates', () => {
    const history: ChatTurn[] = [
      { role: 'coach', text: 'Orphan' },
      { role: 'student', text: 'A' },
      { role: 'student', text: 'B' },
    ];
    const messages = chatMessages({ facts: SAMPLE_FACTS, question: 'C', history });
    expect(messages.map((m) => m.role)).toEqual(['user']);
    expect(messages[0].content).toMatch(/^A\n\nB\n\nStep facts:/);
  });

  it('uses Haiku 5.5, low effort, thinking off, 500 tokens and the cached prompt then the chat rules', () => {
    const params = buildChatRequest({ facts: SAMPLE_FACTS, question: 'Why?', history: [] });
    expect(params).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 500, thinking: { type: 'disabled' }, output_config: { effort: 'low' } });
    expect(params.system).toEqual([
      { type: 'text', text: COACH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: CHAT_RULES },
    ]);
    for (const key of ['temperature', 'top_p', 'top_k']) expect(params).not.toHaveProperty(key);
  });

  it('keeps the chat rules byte-stable and short', () => {
    expect(CHAT_RULES).not.toMatch(/\d{4}-\d{2}-\d{2}|\$\{/);
    expect(CHAT_RULES.length).toBeLessThan(2000);
    for (const rule of ['THIS step', 'ages 10', 'notation', 'Never invent moves', 'off-topic', 'not sure']) expect(CHAT_RULES).toContain(rule);
    expect(CHAT_RULES).toBe(CHAT_RULES.trim());
  });
});

describe('built-in answers', () => {
  it.each([
    ['Why does this work?', 'why'],
    ['How do I spot this case?', 'recognise'],
    ["What does R' mean?", 'notation'],
    ['what does R prime mean', 'notation'],
    ['What is notation?', 'notation'],
    ['What if I mess up?', 'mistake'],
    ['I did it wrong', 'mistake'],
    ['Do you like pizza?', 'generic'],
  ])('%s is a %s question', (question, kind) => {
    expect(questionKind(question)).toBe(kind);
  });

  it('reads moves from a question', () => {
    expect(movesInQuestion("What does R' mean?")).toEqual(["R'"]);
    expect(movesInQuestion('what does U2 and R prime mean')).toEqual(['U2', "R'"]);
    expect(movesInQuestion('What is x?')).toEqual(['x']);
    expect(movesInQuestion('What is this?')).toEqual([]);
  });

  it('answers from the facts and case notes for each kind', () => {
    expect(chatTemplate(SAMPLE_FACTS, 'Why does this work?')).toContain(SAMPLE_FACTS.why);
    expect(chatTemplate(SAMPLE_FACTS, 'How do I spot this case?')).toContain(SAMPLE_FACTS.lookFor);
    expect(chatTemplate(SAMPLE_FACTS, "What does R' mean?")).toContain("R' means turn the right side");
    expect(chatTemplate(SAMPLE_FACTS, 'What does D2 mean?')).toContain('D2 means');
    expect(chatTemplate(SAMPLE_FACTS, 'What is notation?')).toContain('R is the right side');
    expect(chatTemplate(SAMPLE_FACTS, 'What if I mess up?')).toContain('show the cube to the camera');
    expect(chatTemplate(SAMPLE_FACTS, 'Tell me a joke')).toContain(SAMPLE_FACTS.goal);
  });

  it('always passes the chat guardrail', () => {
    const questions = ['Why?', 'How do I spot it?', "What does F' mean?", 'What do D2, x and M mean?', 'What is notation?', 'Oops I messed up', 'Hello'];
    for (const q of questions) expect(checkChatAnswer(chatTemplate(SAMPLE_FACTS, q), SAMPLE_FACTS).ok).toBe(true);
  });

  it('suggests questions with a move of the step', () => {
    expect(suggestedQuestions(SAMPLE_FACTS)).toEqual([
      'Why does this work?',
      'How do I spot this case?',
      "What does R' mean?",
      'What if I mess up?',
    ]);
    expect(suggestedQuestions({ setupMoves: '', algorithm: 'R U2' })[2]).toBe('What does U2 mean?');
  });
});

describe('coachChatReply', () => {
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

  const request = { facts: SAMPLE_FACTS, question: "What does R' mean?", history: [] as ChatTurn[] };
  async function collect(reply?: FakeReply, req = request) {
    if (reply) streamMock.mockReturnValue(fakeStream(reply));
    const events: CoachStreamEvent[] = [];
    for await (const e of coachChatReply(req, { tracker })) events.push(e);
    return events;
  }
  const shown = (events: CoachStreamEvent[]) =>
    events.reduce((text, e) => (e.type === 'delta' ? text + e.text : e.type === 'replace' ? e.text : text), '');

  it('streams a live answer that explains notation, and records the shared spend', async () => {
    const events = await collect({ chunks: ["R' means turn the right side down. ", "D' is the bottom the other way."] });
    expect(shown(events)).toBe("R' means turn the right side down. D' is the bottom the other way.");
    expect(events.at(-1)).toEqual({ type: 'done', source: 'live', mode: 'live' });
    expect(tracker.monthUsage().requests).toBe(1);
    expect(streamMock.mock.calls[0][0]).toEqual(buildChatRequest(request));
  });

  // The live API streams a few words at a time. An answer that opens a sentence with a move
  // outside the step ("F' ...") used to be replaced before its "means" arrived.
  const words = (text: string) => text.split(/(?<= )/);

  it('keeps a word-by-word notation answer that opens a sentence with a move outside the step', async () => {
    const answer =
      "The first U lines the piece up. F' means turn the front side the other way: the opposite of F. Then look for the edge.";
    const events = await collect({ chunks: words(answer) });
    expect(events.at(-1)).toMatchObject({ type: 'done', source: 'live' });
    expect(shown(events)).toBe(answer);
    // The F' sentence is shown only once it is complete, never half-way.
    const deltas = events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text);
    const withF = deltas.find((d) => d.includes("F'"))!;
    expect(withF).toContain("F' means turn the front side the other way: the opposite of F.");
  });

  it('still replaces a word-by-word instruction with a move outside the step, unshown', async () => {
    const events = await collect({ chunks: words('Good start. Now do D to finish. Then check it.') });
    const before = events.slice(0, events.findIndex((e) => e.type === 'replace'));
    expect(before.map((e) => (e.type === 'delta' ? e.text : '')).join('')).not.toContain('D');
    expect(events.at(-1)).toMatchObject({ type: 'done', source: 'template', reason: 'guard' });
  });

  it('streams sentences without outside moves word by word', async () => {
    const events = await collect({ chunks: words('Look at the top layer first. Find the corner with yellow.') });
    expect(events.filter((e) => e.type === 'delta').length).toBeGreaterThan(5);
    expect(events.at(-1)).toMatchObject({ source: 'live' });
  });

  it('allows the plan sequence in an answer', async () => {
    const events = await collect({ chunks: ["Do R U R' ", 'U R U2 ', "R' smoothly."] });
    expect(events.at(-1)).toMatchObject({ source: 'live' });
  });

  it('replaces an answer with a sequence that is not the plan, before it is shown', async () => {
    const events = await collect({ chunks: ['Try ', "R U' R' ", "U' instead."] });
    const before = events.slice(0, events.findIndex((e) => e.type === 'replace'));
    expect(before.map((e) => (e.type === 'delta' ? e.text : '')).join('')).not.toContain("U'");
    expect(events).toContainEqual({ type: 'replace', text: chatTemplate(SAMPLE_FACTS, request.question), reason: 'guard' });
    expect(events.at(-1)).toMatchObject({ type: 'done', source: 'template', reason: 'guard', notice: CHAT_NOTICES.fallback });
    expect(tracker.monthUsage().requests).toBe(1);
  });

  it('answers from the built-in notes without a key, calling no one', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const events = await collect();
    expect(streamMock).not.toHaveBeenCalled();
    expect(shown(events)).toBe(chatTemplate(SAMPLE_FACTS, request.question));
    expect(events.at(-1)).toEqual({ type: 'done', source: 'template', mode: 'mock', reason: 'mock', notice: CHAT_NOTICES.mock });
  });

  it('answers from the built-in notes at the shared cap', async () => {
    process.env.COACH_MONTHLY_CAP_USD = '0';
    const events = await collect();
    expect(streamMock).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ mode: 'capped', reason: 'capped', notice: CHAT_NOTICES.capped });
  });

  it('falls back when the answer is cut off', async () => {
    const events = await collect({ chunks: ['It works because '], stopReason: 'max_tokens' });
    expect(events.at(-1)).toMatchObject({ source: 'template', reason: 'max-tokens' });
  });
});
