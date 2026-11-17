/**
 * Cubyntra - ElevenLabs client tests (fake fetch, no network)
 * Necookie Labs (c) 2026
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BalanceCache,
  DEFAULT_VOICE_ID,
  ElevenLabsError,
  elevenLabsConfig,
  fetchSubscription,
  textToSpeech,
} from '../src/voice/elevenlabs';

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0]);

afterEach(() => {
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_VOICE_ID;
});

describe('elevenLabsConfig', () => {
  it('reads the key and voice, defaulting to a stock voice and Flash', () => {
    expect(elevenLabsConfig()).toEqual({ apiKey: null, voiceId: DEFAULT_VOICE_ID, model: 'eleven_flash_v2_5' });
    process.env.ELEVENLABS_API_KEY = ' sk-test ';
    process.env.ELEVENLABS_VOICE_ID = 'abcdefghij12';
    expect(elevenLabsConfig()).toMatchObject({ apiKey: 'sk-test', voiceId: 'abcdefghij12' });
    process.env.ELEVENLABS_VOICE_ID = '../../etc';
    expect(elevenLabsConfig().voiceId).toBe(DEFAULT_VOICE_ID);
  });
});

describe('textToSpeech', () => {
  const opts = { apiKey: 'sk-test', voiceId: 'voice12345', model: 'eleven_flash_v2_5' };

  it('posts only the text and model, with the key header, and returns the MP3', async () => {
    const fetchImpl = vi.fn(async () => new Response(MP3, { headers: { 'Content-Type': 'audio/mpeg' } }));
    const audio = await textToSpeech('Turn the top to the left', { ...opts, fetchImpl });
    expect([...audio]).toEqual([...MP3]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice12345?output_format=mp3_44100_128');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('sk-test');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'Turn the top to the left', model_id: 'eleven_flash_v2_5' });
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
