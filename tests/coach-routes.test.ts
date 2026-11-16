/**
 * Cubyntra - Coach Route Tests (mocked SDK, no network)
 * Necookie Labs (c) 2026
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postCoach } from '../src/app/api/coach/route';
import { GET as getStatus } from '../src/app/api/coach/status/route';
import { GET as getToken } from '../src/app/api/auth/token/route';
import { resetCoachClientForTests } from '../src/coach/service';
import { resetSpendTrackerForTests } from '../src/coach/spend';
import { createCoachEventParser } from '../src/coach/sse';
import { templateText } from '../src/coach/templates';
import { CoachStreamEvent } from '../src/coach/types';
import { APP_TOKEN_HEADER, coachRateLimiter, getAppSecret } from '../src/lib/localAuth';
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
  coachRateLimiter.reset();
  streamMock.mockReset();
  token = getAppSecret();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  scratch.cleanup();
  resetSpendTrackerForTests();
  delete process.env.ANTHROPIC_API_KEY;
  vi.restoreAllMocks();
});

function coachRequest(body: unknown, headers: Record<string, string> = { [APP_TOKEN_HEADER]: token }) {
  return new Request('http://localhost:3000/api/coach', {
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

describe('POST /api/coach', () => {
  it('rejects a missing or wrong token with 401', async () => {
    expect((await postCoach(coachRequest({ facts: SAMPLE_FACTS }, {}))).status).toBe(401);
    expect((await postCoach(coachRequest({ facts: SAMPLE_FACTS }, { [APP_TOKEN_HEADER]: 'nope' }))).status).toBe(401);
  });

  it('rate limits to 30 requests a minute per token with 429', async () => {
    for (let i = 0; i < 30; i++) {
      const res = await postCoach(coachRequest({ facts: SAMPLE_FACTS }));
      expect(res.status).toBe(200);
      await res.body?.cancel();
    }
    const limited = await postCoach(coachRequest({ facts: SAMPLE_FACTS }));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('rejects bad bodies with 400 and large ones with 413', async () => {
    expect((await postCoach(coachRequest('not json'))).status).toBe(400);
    expect((await postCoach(coachRequest({ facts: { ...SAMPLE_FACTS, hintLevel: 9 } }))).status).toBe(400);
    expect((await postCoach(coachRequest({ nope: true }))).status).toBe(400);
    expect((await postCoach(coachRequest({ facts: SAMPLE_FACTS, pad: 'x'.repeat(9000) }))).status).toBe(413);
  });

  it('streams templates as server-sent events in mock mode', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await postCoach(coachRequest({ facts: SAMPLE_FACTS }));
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    const events = await readEvents(res);
    expect(events).toEqual([
      { type: 'delta', text: templateText(SAMPLE_FACTS) },
      expect.objectContaining({ type: 'done', source: 'template', mode: 'mock' }),
    ]);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('relays a live reply from Claude', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    streamMock.mockReturnValue(fakeStream({ chunks: ['Find the ', 'yellow corner ', 'on top.'] }));
    const events = await readEvents(await postCoach(coachRequest({ facts: SAMPLE_FACTS })));
    expect(events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text).join('')).toBe(
      'Find the yellow corner on top.'
    );
    expect(events.at(-1)).toEqual({ type: 'done', source: 'live', mode: 'live' });
  });

  it('replaces a reply that fails the guardrail', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    streamMock.mockReturnValue(fakeStream({ chunks: ['Just do ', 'L2 D2 ', 'now.'] }));
    const events = await readEvents(await postCoach(coachRequest({ facts: SAMPLE_FACTS })));
    expect(events).toContainEqual({ type: 'replace', text: templateText(SAMPLE_FACTS), reason: 'guard' });
  });
});

describe('GET /api/coach/status', () => {
  it('needs the token and reports mode and spend', async () => {
    const url = 'http://localhost:3000/api/coach/status';
    expect((await getStatus(new Request(url))).status).toBe(401);
    const res = await getStatus(new Request(url, { headers: { [APP_TOKEN_HEADER]: token } }));
    expect(await res.json()).toMatchObject({ mode: 'mock', monthSpendUsd: 0, capUsd: 10 });
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const live = await getStatus(new Request(url, { headers: { [APP_TOKEN_HEADER]: token } }));
    expect((await live.json()).mode).toBe('live');
  });
});

describe('GET /api/auth/token', () => {
  it('gives the token to loopback requests only', async () => {
    const local = await getToken(new Request('http://localhost:3000/api/auth/token', { headers: { host: 'localhost:3000' } }));
    expect(local.status).toBe(200);
    expect(await local.json()).toEqual({ token });
    const lan = await getToken(new Request('http://192.168.1.4:3000/api/auth/token', { headers: { host: '192.168.1.4:3000' } }));
    expect(lan.status).toBe(403);
    const crossSite = await getToken(
      new Request('http://localhost:3000/api/auth/token', { headers: { host: 'localhost:3000', origin: 'https://evil.example' } })
    );
    expect(crossSite.status).toBe(403);
  });
});
