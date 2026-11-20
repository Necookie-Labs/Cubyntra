/**
 * Cubyntra - POST /api/coach/chat (mocked SDK, no network)
 * Necookie Labs (c) 2026
 *
 * Same identity guard, token and body cap as /api/coach; its own limit of 20 questions a minute
 * (per user when hosted); the same SSE contract; built-in answers without a key.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postChat } from '../src/app/api/coach/chat/route';
import { GET as getToken } from '../src/app/api/auth/token/route';
import { POST as signIn } from '../src/app/api/auth/signin/route';
import { CHAT_NOTICES, MAX_CHAT_REQUEST_BYTES, chatTemplate } from '../src/coach/chat';
import { resetCoachClientForTests } from '../src/coach/service';
import { resetSpendTrackerForTests, getSpendTracker } from '../src/coach/spend';
import { createCoachEventParser } from '../src/coach/sse';
import type { CoachStreamEvent } from '../src/coach/types';
import { APP_TOKEN_HEADER, chatRateLimiter, coachRateLimiter, getAppSecret } from '../src/lib/localAuth';
import { SESSION_COOKIE, signInLimiter } from '../src/lib/passcodeSession';
import { SAMPLE_FACTS } from './helpers/coachFacts';
import { fakeStream } from './helpers/fakeAnthropic';
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
let token: string;

beforeEach(() => {
  scratch = useScratchDataDir();
  delete process.env.ANTHROPIC_API_KEY;
  resetSpendTrackerForTests();
  resetCoachClientForTests();
  chatRateLimiter.reset();
  coachRateLimiter.reset();
  signInLimiter.reset();
  streamMock.mockReset();
  token = getAppSecret();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  scratch.cleanup();
  resetSpendTrackerForTests();
  delete process.env.ANTHROPIC_API_KEY;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const QUESTION = { facts: SAMPLE_FACTS, question: "What does R' mean?", history: [] };

function chatRequest(body: unknown, headers: Record<string, string> = { [APP_TOKEN_HEADER]: token }) {
  return new Request('http://localhost:3000/api/coach/chat', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function readEvents(res: Response): Promise<CoachStreamEvent[]> {
  const events: CoachStreamEvent[] = [];
  const push = createCoachEventParser((e) => events.push(e));
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    push(decoder.decode(value, { stream: true }));
  }
  return events;
}

describe('POST /api/coach/chat: access', () => {
  it('rejects a missing or wrong token with 401', async () => {
    expect((await postChat(chatRequest(QUESTION, {}))).status).toBe(401);
    expect((await postChat(chatRequest(QUESTION, { [APP_TOKEN_HEADER]: 'nope' }))).status).toBe(401);
  });

  it('rejects a body over the cap with 413', async () => {
    const res = await postChat(chatRequest({ ...QUESTION, pad: 'x'.repeat(MAX_CHAT_REQUEST_BYTES) }));
    expect(res.status).toBe(413);
  });

  it.each([
    ['not JSON', 'nope'],
    ['no facts', { question: 'Why?', history: [] }],
    ['an empty question', { ...QUESTION, question: '' }],
    ['a question over 400 characters', { ...QUESTION, question: 'a'.repeat(401) }],
    ['an image', { ...QUESTION, image: 'data:image/png;base64,AAAA' }],
  ])('rejects %s with 400', async (_name, body) => {
    expect((await postChat(chatRequest(body))).status).toBe(400);
  });

  it('allows 20 questions a minute, apart from the hint limit', async () => {
    for (let i = 0; i < 20; i++) {
      const res = await postChat(chatRequest(QUESTION));
      expect(res.status).toBe(200);
      await readEvents(res);
    }
    const res = await postChat(chatRequest(QUESTION));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    // Hints still have their own budget.
    expect(coachRateLimiter.hit(token).ok).toBe(true);
  });
});

describe('POST /api/coach/chat: answers', () => {
  it('streams a built-in answer without a key, with the mode notice', async () => {
    const res = await postChat(chatRequest(QUESTION));
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    const events = await readEvents(res);
    expect(streamMock).not.toHaveBeenCalled();
    expect(events[0]).toEqual({ type: 'delta', text: chatTemplate(SAMPLE_FACTS, QUESTION.question) });
    expect(events.at(-1)).toEqual({ type: 'done', source: 'template', mode: 'mock', reason: 'mock', notice: CHAT_NOTICES.mock });
  });

  it('streams a live answer and records it against the shared cap', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    streamMock.mockReturnValue(fakeStream({ chunks: ["R' means turn ", 'the right side down.'] }));
    const events = await readEvents(await postChat(chatRequest({ ...QUESTION, history: [{ role: 'student', text: 'Hi' }, { role: 'coach', text: 'Hello!' }] })));
    expect(events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text).join('')).toBe("R' means turn the right side down.");
    expect(events.at(-1)).toEqual({ type: 'done', source: 'live', mode: 'live' });
    const params = streamMock.mock.calls[0][0];
    expect(params.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(params.max_tokens).toBe(500);
    expect(getSpendTracker().monthUsage().requests).toBe(1);
  });

  it('sends a replace event when the answer names a sequence that is not the plan', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    streamMock.mockReturnValue(fakeStream({ chunks: ["Do F R U R' U' F' now."] }));
    const events = await readEvents(await postChat(chatRequest(QUESTION)));
    expect(events).toContainEqual({ type: 'replace', text: chatTemplate(SAMPLE_FACTS, QUESTION.question), reason: 'guard' });
    expect(events.at(-1)).toMatchObject({ source: 'template', reason: 'guard' });
  });
});

describe('POST /api/coach/chat: hosted (passcode) mode', () => {
  const CODE = 'cube-night-2026';
  const loopback = (path: string, headers: Record<string, string> = {}, init: RequestInit = {}) =>
    new Request(`http://localhost:3001${path}`, {
      ...init,
      headers: { host: 'localhost:3001', 'x-forwarded-for': '127.0.0.1', ...headers },
    });

  async function signedIn(name: string) {
    const res = await signIn(
      loopback('/api/auth/signin', { 'Content-Type': 'application/json' }, { method: 'POST', body: JSON.stringify({ name, code: CODE }) })
    );
    const cookie = { cookie: `${SESSION_COOKIE}=${/cubyntra_session=([^;]*)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? ''}` };
    const { token: userToken } = await (await getToken(loopback('/api/auth/token', cookie))).json();
    return { ...cookie, [APP_TOKEN_HEADER]: userToken as string };
  }
  const ask = (headers: Record<string, string>) =>
    postChat(loopback('/api/coach/chat', { 'Content-Type': 'application/json', ...headers }, { method: 'POST', body: JSON.stringify(QUESTION) }));

  it('needs a signed-in user with their own token, and limits each user separately', async () => {
    vi.stubEnv('CUBYNTRA_AUTH_MODE', 'passcode');
    vi.stubEnv('CUBYNTRA_ACCESS_CODE', CODE);
    expect((await ask({ [APP_TOKEN_HEADER]: getAppSecret() })).status).toBe(401);
    const kiko = await signedIn('Kiko');
    const sam = await signedIn('Sam');
    expect((await ask({ ...kiko, [APP_TOKEN_HEADER]: sam[APP_TOKEN_HEADER] })).status).toBe(401);
    for (let i = 0; i < 20; i++) await readEvents(await ask(kiko));
    expect((await ask(kiko)).status).toBe(429);
    expect((await ask(sam)).status).toBe(200);
  });
});
