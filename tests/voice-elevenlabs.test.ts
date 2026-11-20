/**
 * Cubyntra - ElevenLabs client tests (fake fetch, no network)
 * Necookie Labs (c) 2026
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BalanceCache,
  DEFAULT_VOICE_ID,
  ElevenLabsError,
  VOICE_SETTINGS,
  allowedVoiceIds,
  apiSpeed,
  elevenLabsConfig,
  fetchSubscription,
  textToSpeech,
} from '../src/voice/elevenlabs';
import { CURATED_VOICES } from '../src/voice/catalog';

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0]);

afterEach(() => {
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_VOICE_ID;
});

describe('elevenLabsConfig', () => {
  it('reads the key and voice, defaulting to Alice and Eleven v4', () => {
    expect(DEFAULT_VOICE_ID).toBe('Xb7hH8MSUJpSbSDYk0k2');
    expect(elevenLabsConfig()).toEqual({ apiKey: null, voiceId: DEFAULT_VOICE_ID, model: 'eleven_v4', envVoiceId: null });
    process.env.ELEVENLABS_API_KEY = ' sk-test ';
    process.env.ELEVENLABS_VOICE_ID = 'abcdefghij12';
    expect(elevenLabsConfig()).toMatchObject({ apiKey: 'sk-test', voiceId: 'abcdefghij12', envVoiceId: 'abcdefghij12' });
    expect(allowedVoiceIds(elevenLabsConfig()).has('abcdefghij12')).toBe(true);
    process.env.ELEVENLABS_VOICE_ID = '../../etc';
    expect(elevenLabsConfig().voiceId).toBe(DEFAULT_VOICE_ID);
    expect(allowedVoiceIds(elevenLabsConfig())).toEqual(new Set(CURATED_VOICES.map((v) => v.id)));
  });

  it('keeps the speed inside what ElevenLabs accepts', () => {
    expect(apiSpeed(0.75)).toBe(0.75);
    expect(apiSpeed(1)).toBe(1);
    expect(apiSpeed(1.25)).toBe(1.2);
    expect(apiSpeed(0.1)).toBe(0.7);
    expect(apiSpeed(Number.NaN)).toBe(1);
  });
});

describe('textToSpeech', () => {
  const opts = { apiKey: 'sk-test', voiceId: 'voice12345', model: 'eleven_flash_v2_5' };

  it('posts only the text, model and voice settings, with the key header, and returns the MP3', async () => {
    const fetchImpl = vi.fn(async () => new Response(MP3, { headers: { 'Content-Type': 'audio/mpeg' } }));
    const audio = await textToSpeech('Turn the top to the left', { ...opts, fetchImpl });
    expect([...audio]).toEqual([...MP3]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice12345?output_format=mp3_44100_128');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('sk-test');
    expect(JSON.parse(init.body as string)).toEqual({
      text: 'Turn the top to the left',
      model_id: 'eleven_flash_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 },
    });
  });

  it('sends the chosen model and speed', async () => {
    const fetchImpl = vi.fn(async () => new Response(MP3, { headers: { 'Content-Type': 'audio/mpeg' } }));
    await textToSpeech('Hi', { ...opts, model: 'eleven_v4_turbo', speed: 1.25, fetchImpl });
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ model_id: 'eleven_v4_turbo', voice_settings: { ...VOICE_SETTINGS, speed: 1.2 } });
  });

  it('throws an unbilled error on an HTTP error or no connection', async () => {
    const failing = vi.fn(async () => new Response('{"detail":"quota"}', { status: 401 }));
    await expect(textToSpeech('Hi', { ...opts, fetchImpl: failing })).rejects.toMatchObject({ status: 401, billed: false });
    const offline = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const error = await textToSpeech('Hi', { ...opts, fetchImpl: offline }).catch((e) => e);
    expect(error).toBeInstanceOf(ElevenLabsError);
    expect(error.billed).toBe(false);
  });

  it('counts audio that broke off as billed', async () => {
    const empty = vi.fn(async () => new Response(new Uint8Array(0)));
    await expect(textToSpeech('Hi', { ...opts, fetchImpl: empty })).rejects.toMatchObject({ billed: true });
  });
});

describe('fetchSubscription', () => {
  it('reads the remaining balance', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ character_count: 7000, character_limit: 30000, tier: 'starter' }));
    expect(await fetchSubscription('sk-test', fetchImpl)).toEqual({ characterCount: 7000, characterLimit: 30000, remaining: 23000 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/user/subscription');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('sk-test');
  });

  it('rejects an unexpected answer', async () => {
    await expect(fetchSubscription('k', vi.fn(async () => Response.json({ tier: 'free' })))).rejects.toThrow(ElevenLabsError);
  });
});

describe('BalanceCache', () => {
  it('reads the balance at most every ten minutes and takes off what was spent since', async () => {
    let now = 0;
    let remaining = 5000;
    const fetchImpl = vi.fn(async () => Response.json({ character_count: 10000 - remaining, character_limit: 10000 }));
    const cache = new BalanceCache(10 * 60_000, () => now);
    expect(await cache.get('k', fetchImpl)).toBe(5000);
    cache.noteSpent(200);
    now += 5 * 60_000;
    expect(await cache.get('k', fetchImpl)).toBe(4800);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    remaining = 4700;
    now += 6 * 60_000;
    expect(await cache.get('k', fetchImpl)).toBe(4700);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('keeps the last value when a read fails, and is null with none', async () => {
    let now = 0;
    const cache = new BalanceCache(1000, () => now);
    const down = vi.fn(async () => new Response('', { status: 500 }));
    expect(await cache.get('k', down)).toBeNull();
    now += 2000;
    expect(await cache.get('k', vi.fn(async () => Response.json({ character_count: 1, character_limit: 11 })))).toBe(10);
    now += 2000;
    expect(await cache.get('k', down)).toBe(10);
  });
});
