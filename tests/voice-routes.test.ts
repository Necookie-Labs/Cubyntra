/**
 * Cubyntra - Voice route tests (fake ElevenLabs via a mocked fetch, no network)
 * Necookie Labs (c) 2026
 *
 * Auth, body size and rate limit; cached phrases spend nothing; the cap and the real balance
 * cut ElevenLabs off before a call; every failure falls back to the device voice.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postVoice } from '../src/app/api/voice/route';
import { GET as getStatus } from '../src/app/api/voice/status/route';
import { APP_TOKEN_HEADER, getAppSecret, voiceRateLimiter } from '../src/lib/localAuth';
import { resetVoiceUsageTrackerForTests } from '../src/voice/credits';
import { LINES } from '../src/voice/phrases';
import { resetVoiceServiceForTests } from '../src/voice/service';
import type { VoiceStatus } from '../src/voice/types';
import { useScratchDataDir } from './helpers/scratchData';

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0]);

/** A fake ElevenLabs: text to speech answers MP3, the subscription a balance. */
function fakeElevenLabs({ remaining = 100_000, tts = 'ok' as 'ok' | 'error' | 'offline' } = {}) {
  const calls: { url: string; body?: unknown }[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith('/v1/user/subscription')) {
      return Response.json({ character_count: 1_000_000 - remaining, character_limit: 1_000_000 });
    }
    if (url.includes('/v1/text-to-speech/')) {
      if (tts === 'offline') throw new TypeError('fetch failed');
      if (tts === 'error') return new Response('{"detail":"nope"}', { status: 500 });
      return new Response(MP3, { headers: { 'Content-Type': 'audio/mpeg' } });
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const ttsCalls = () => calls.filter((c) => c.url.includes('/v1/text-to-speech/'));
  const subscriptionCalls = () => calls.filter((c) => c.url.endsWith('/v1/user/subscription'));
  return { calls, ttsCalls, subscriptionCalls };
}

let scratch: ReturnType<typeof useScratchDataDir>;
let token: string;

beforeEach(() => {
  scratch = useScratchDataDir();
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_VOICE_ID;
  delete process.env.ELEVENLABS_MONTHLY_CREDIT_CAP;
  resetVoiceUsageTrackerForTests();
  resetVoiceServiceForTests();
  voiceRateLimiter.reset();
  token = getAppSecret();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  scratch.cleanup();
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_MONTHLY_CREDIT_CAP;
  resetVoiceUsageTrackerForTests();
  resetVoiceServiceForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function voiceRequest(body: unknown, headers: Record<string, string> = { [APP_TOKEN_HEADER]: token }) {
  return new Request('http://localhost:3000/api/voice', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function statusRequest(query = '', headers: Record<string, string> = { [APP_TOKEN_HEADER]: token }) {
  return new Request(`http://localhost:3000/api/voice/status${query}`, { headers });
}

const usage = () => {
  const file = path.join(scratch.dir, 'voice-usage.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
};
const month = () => new Date().toISOString().slice(0, 7);

describe('POST /api/voice: access', () => {
  it('rejects a missing or wrong token with 401', async () => {
    fakeElevenLabs();
    expect((await postVoice(voiceRequest({ text: 'Hi' }, {}))).status).toBe(401);
    expect((await postVoice(voiceRequest({ text: 'Hi' }, { [APP_TOKEN_HEADER]: 'nope' }))).status).toBe(401);
  });

  it('rejects a body over 4 KB with 413', async () => {
    fakeElevenLabs();
    const big = JSON.stringify({ text: 'a'.repeat(5000) });
    expect((await postVoice(voiceRequest(big))).status).toBe(413);
  });

  it.each([
    ['not JSON', 'nope'],
    ['no text', { kind: 'reply' }],
    ['empty text', { text: '   ' }],
    ['an unknown kind', { text: 'Hi', kind: 'song' }],
    ['a phrase that is not in the bank', { text: 'Anything I like', kind: 'phrase' }],
    ['text over 1,200 characters', { text: 'word '.repeat(250) }],
  ])('rejects %s with 400', async (_name, body) => {
    fakeElevenLabs();
    expect((await postVoice(voiceRequest(body))).status).toBe(400);
  });

  it('allows 60 requests a minute per token, then 429', async () => {
    fakeElevenLabs();
    for (let i = 0; i < 60; i++) expect((await postVoice(voiceRequest({ text: LINES.praise1, kind: 'phrase' }))).status).not.toBe(429);
    const res = await postVoice(voiceRequest({ text: LINES.praise1, kind: 'phrase' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });
});

describe('POST /api/voice: speaking', () => {
  it('falls back to the device voice when no key is set, without calling ElevenLabs', async () => {
    const fake = fakeElevenLabs();
    const res = await postVoice(voiceRequest({ text: LINES.match, kind: 'phrase' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ fallback: 'device', reason: 'no-key' });
    expect(fake.calls).toHaveLength(0);
  });

  it('returns MP3 audio and counts the characters sent', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk-test';
    const fake = fakeElevenLabs();
    const res = await postVoice(voiceRequest({ text: 'Look for the white edge.', kind: 'reply' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(res.headers.get('X-Voice-Cache')).toBe('miss');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...MP3]);
    expect(fake.ttsCalls()[0].body).toEqual({
      text: 'Look for the white edge.',
      model_id: 'eleven_v4',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 },
    });
    // Alice, the default voice.
    expect(fake.ttsCalls()[0].url).toContain('/v1/text-to-speech/Xb7hH8MSUJpSbSDYk0k2?');
    // Eleven v4: one credit per character.
    expect(usage().months[month()]).toEqual({ characters: 24, credits: 24, requests: 1 });
  });

  it('sends the chosen voice, model and speed to ElevenLabs, and counts credits at that model', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk-test';
    const fake = fakeElevenLabs();
    const body = { text: 'Look for the white edge.', voiceId: 'XrExE9yKIg1WjnnlVkGX', quality: 'fast', rate: 0.75 };
    expect((await postVoice(voiceRequest(body))).status).toBe(200);
    const call = fake.ttsCalls()[0];
    expect(call.url).toContain('/v1/text-to-speech/XrExE9yKIg1WjnnlVkGX?');
    expect(call.body).toMatchObject({ model_id: 'eleven_v4_turbo', voice_settings: { speed: 0.75 } });
    // v4 Turbo: half a credit per character.
    expect(usage().months[month()]).toEqual({ characters: 24, credits: 12, requests: 1 });
  });

  it.each([
    ['an arbitrary voice id', { voiceId: 'abcdefghij12' }],
    ['a voice id with symbols', { voiceId: '../x' }],
    ['a voice id that is not text', { voiceId: 42 }],
    ['an unknown quality', { quality: 'ultra' }],
    ['a speed that is not a setting', { rate: 3 }],
    ['a model field', { model_id: 'eleven_v3' }],
  ])('refuses %s without calling ElevenLabs', async (_name, extra) => {
    process.env.ELEVENLABS_API_KEY = 'sk-test';
    const fake = fakeElevenLabs();
    expect((await postVoice(voiceRequest({ text: 'Hi', ...extra }))).status).toBe(400);
    expect(fake.calls).toHaveLength(0);
  });

  it('accepts the laptop voice from ELEVENLABS_VOICE_ID and uses it as the default', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk-test';
    process.env.ELEVENLABS_VOICE_ID = 'abcdefghij12';
    const fake = fakeElevenLabs();
    expect((await postVoice(voiceRequest({ text: 'Hi', voiceId: 'abcdefghij12' }))).status).toBe(200);
    expect((await postVoice(voiceRequest({ text: 'Hi' }))).status).toBe(200);
    expect(fake.ttsCalls().map((c) => c.url.split('?')[0].split('/').pop())).toEqual(['abcdefghij12', 'abcdefghij12']);
    const status = (await (await getStatus(statusRequest('?preference=elevenlabs'))).json()) as VoiceStatus;
    expect(status.laptopVoiceId).toBe('abcdefghij12');
    delete process.env.ELEVENLABS_VOICE_ID;
  });

  it('makes a new phrase clip when the voice, the quality or the speed changes', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk-test';
    const fake = fakeElevenLabs();
    const phrase = { text: LINES.match, kind: 'phrase' };
    const cache = async (extra: object) => (await postVoice(voiceRequest({ ...phrase, ...extra }))).headers.get('X-Voice-Cache');
    expect(await cache({})).toBe('miss');
    expect(await cache({})).toBe('hit');
    expect(await cache({ voiceId: 'Xb7hH8MSUJpSbSDYk0k2', quality: 'high' })).toBe('hit');
    expect(await cache({ voiceId: 'bIHbv24MWmeRgasZH58o' })).toBe('miss');
    expect(await cache({ quality: 'fast' })).toBe('miss');
    expect(await cache({ rate: 1.25 })).toBe('miss');
    expect(await cache({ quality: 'fast' })).toBe('hit');
    expect(fake.ttsCalls()).toHaveLength(4);
  });

  it('serves a cached phrase without spending credits', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk-test';
    const fake = fakeElevenLabs();
    const first = await postVoice(voiceRequest({ text: LINES.match, kind: 'phrase' }));
    expect(first.headers.get('X-Voice-Cache')).toBe('miss');
    expect(fs.readdirSync(path.join(scratch.dir, 'voice')).filter((f) => f.endsWith('.mp3'))).toHaveLength(1);
    const credits = usage().months[month()].credits;
    const second = await postVoice(voiceRequest({ text: LINES.match, kind: 'phrase' }));
    expect(second.status).toBe(200);
    expect(second.headers.get('X-Voice-Cache')).toBe('hit');
    expect([...new Uint8Array(await second.arrayBuffer())]).toEqual([...MP3]);
    expect(fake.ttsCalls()).toHaveLength(1);
    expect(usage().months[month()].credits).toBe(credits);
  });

  it('does not keep coach replies', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk-test';
    const fake = fakeElevenLabs();
    await postVoice(voiceRequest({ text: 'Nice turn there.', kind: 'reply' }));
    await postVoice(voiceRequest({ text: 'Nice turn there.', kind: 'reply' }));
    expect(fake.ttsCalls()).toHaveLength(2);
    expect(fs.existsSync(path.join(scratch.dir, 'voice'))).toBe(false);
  });

  it('stops at the monthly cap: a call that would pass it is never made', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk-test';
    process.env.ELEVENLABS_MONTHLY_CREDIT_CAP = '20';
    const fake = fakeElevenLabs();
    // 30 characters with v4 Turbo = 15 credits: fits.
    expect((await postVoice(voiceRequest({ text: 'a'.repeat(29) + '.', quality: 'fast' }))).status).toBe(200);
    // Another 30 with v4 (30 credits) would pass 20: refused before calling.
    const res = await postVoice(voiceRequest({ text: 'b'.repeat(29) + '.' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ fallback: 'device', reason: 'capped' });
    expect(fake.ttsCalls()).toHaveLength(1);
    expect(usage().months[month()].credits).toBe(15);
  });

  it('treats the real account balance as the limit when it is lower than the cap', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk-test';
    const fake = fakeElevenLabs({ remaining: 10 });
    const res = await postVoice(voiceRequest({ text: 'This needs more than ten credits to say.' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ reason: 'capped' });
    expect(fake.ttsCalls()).toHaveLength(0);
    expect(fake.subscriptionCalls()).toHaveLength(1);
    // The balance is cached: a second request does not read it again.
    expect((await postVoice(voiceRequest({ text: 'Short.' }))).status).toBe(200);
    expect(fake.subscriptionCalls()).toHaveLength(1);
  });

  it.each(['error', 'offline'] as const)('falls back to the device voice when ElevenLabs is %s, charging nothing', async (tts) => {
    process.env.ELEVENLABS_API_KEY = 'sk-test';
    fakeElevenLabs({ tts });
    const res = await postVoice(voiceRequest({ text: LINES.solved, kind: 'phrase' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ fallback: 'device', reason: 'upstream' });
    expect(usage()).toBeNull();
    expect(fs.existsSync(path.join(scratch.dir, 'voice'))).toBe(false);
  });
});

describe('GET /api/voice/status', () => {
  it('needs the token', async () => {
    expect((await getStatus(statusRequest('', {}))).status).toBe(401);
  });

  it('is off when the student turned voice off (the default profile)', async () => {
    const status = (await (await getStatus(statusRequest())).json()) as VoiceStatus;
    expect(status).toMatchObject({ mode: 'off', keySet: false, monthCredits: 0, capCredits: 20_000, warning: false });
  });

  it('uses the device voice without a key, without reading any balance', async () => {
    const fake = fakeElevenLabs();
    const status = (await (await getStatus(statusRequest('?preference=elevenlabs'))).json()) as VoiceStatus;
    expect(status).toMatchObject({ mode: 'device', reason: 'no-key', keySet: false });
    expect(status.remaining).toBeUndefined();
    expect(fake.calls).toHaveLength(0);
  });

  it('offers ElevenLabs with a key, with the lower of the cap and the balance as remaining', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk-test';
    fakeElevenLabs({ remaining: 7000 });
    const status = (await (await getStatus(statusRequest('?preference=elevenlabs'))).json()) as VoiceStatus;
    expect(status).toMatchObject({ mode: 'elevenlabs', keySet: true, remaining: 7000, accountRemaining: 7000, warning: false });
    const chosen = (await (await getStatus(statusRequest('?preference=device'))).json()) as VoiceStatus;
    expect(chosen).toMatchObject({ mode: 'device', reason: 'chosen', remaining: 7000 });
  });

  it('warns at 80% and drops to the device voice at the cap', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk-test';
    process.env.ELEVENLABS_MONTHLY_CREDIT_CAP = '100';
    fakeElevenLabs();
    await postVoice(voiceRequest({ text: 'abc '.repeat(40), quality: 'fast' })); // 80 credits
    let status = (await (await getStatus(statusRequest('?preference=elevenlabs'))).json()) as VoiceStatus;
    expect(status).toMatchObject({ mode: 'elevenlabs', monthCredits: 80, remaining: 20, warning: true });
    await postVoice(voiceRequest({ text: 'xyz '.repeat(5) })); // 20 credits with v4: the cap
    status = (await (await getStatus(statusRequest('?preference=elevenlabs'))).json()) as VoiceStatus;
    expect(status).toMatchObject({ mode: 'device', reason: 'capped', monthCredits: 100, remaining: 0, warning: true });
  });
});
