/**
 * Cubyntra - ElevenLabs client (server only, ADR-016)
 * Necookie Labs (c) 2026
 *
 * Two calls, made with `fetch` (no SDK: two plain HTTP requests do not need one):
 * - text to speech, `POST /v1/text-to-speech/{voice_id}?output_format=mp3_44100_128` with the
 *   `xi-api-key` header and `{ text, model_id }`, answering with MP3 bytes;
 * - the subscription, `GET /v1/user/subscription`, whose `character_limit - character_count`
 *   is the account's remaining balance in credits.
 * Checked against https://elevenlabs.io/docs/api-reference/text-to-speech/convert and
 * https://elevenlabs.io/docs/api-reference/user/subscription/get (2026-11-18).
 *
 * The key comes only from `ELEVENLABS_API_KEY` in `.env.local` and is never sent to the browser.
 * Only the text to speak is sent: no images, cube state or student data. Stock voices only.
 */

import { VOICE_MODEL } from './credits';

export const ELEVENLABS_API = 'https://api.elevenlabs.io';
/** "George", a premade stock voice (the voice in the API reference examples). No cloning. */
export const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
export const OUTPUT_FORMAT = 'mp3_44100_128';
/** How long the account balance is trusted before it is read again. */
export const BALANCE_TTL_MS = 10 * 60_000;

const VOICE_ID = /^[A-Za-z0-9]{8,40}$/;

export interface ElevenLabsConfig {
  apiKey: string | null;
  voiceId: string;
  model: string;
}

/** The key and voice from the environment (`ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`). */
export function elevenLabsConfig(): ElevenLabsConfig {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim() || null;
  const voice = process.env.ELEVENLABS_VOICE_ID?.trim() ?? '';
  return { apiKey, voiceId: VOICE_ID.test(voice) ? voice : DEFAULT_VOICE_ID, model: VOICE_MODEL };
}

export class ElevenLabsError extends Error {
  constructor(
    message: string,
    /** HTTP status from ElevenLabs, if it answered. */
    readonly status: number | null,
    /** Whether the characters may have been billed (an answer that broke off part-way). */
    readonly billed: boolean
  ) {
    super(message);
    this.name = 'ElevenLabsError';
  }
}

type FetchLike = typeof fetch;

export interface TtsOptions {
  apiKey: string;
  voiceId: string;
  model: string;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
}

/** Speaks `text` with ElevenLabs and returns the MP3 bytes. Throws `ElevenLabsError`. */
export async function textToSpeech(text: string, { apiKey, voiceId, model, signal, fetchImpl }: TtsOptions): Promise<Uint8Array> {
  const doFetch = fetchImpl ?? globalThis.fetch;
  const url = `${ELEVENLABS_API}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT}`;
  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: model }),
      signal,
    });
  } catch (error) {
    // The request may not have arrived: nothing is known to be billed.
    throw new ElevenLabsError(`ElevenLabs could not be reached: ${(error as Error).message}`, null, false);
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new ElevenLabsError(`ElevenLabs answered ${res.status}`, res.status, false);
  }
  try {
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error('empty audio');
    return bytes;
  } catch (error) {
    // The speech was made (and billed) but the audio broke off.
    throw new ElevenLabsError(`ElevenLabs audio broke off: ${(error as Error).message}`, res.status, true);
  }
}

export interface Subscription {
  characterCount: number;
  characterLimit: number;
  /** `characterLimit - characterCount`, never below 0. */
  remaining: number;
}

/** Reads the account's balance. Throws `ElevenLabsError` when it cannot. */
export async function fetchSubscription(apiKey: string, fetchImpl?: FetchLike, signal?: AbortSignal): Promise<Subscription> {
  const doFetch = fetchImpl ?? globalThis.fetch;
  let res: Response;
  try {
    res = await doFetch(`${ELEVENLABS_API}/v1/user/subscription`, { headers: { 'xi-api-key': apiKey }, signal });
  } catch (error) {
    throw new ElevenLabsError(`ElevenLabs could not be reached: ${(error as Error).message}`, null, false);
  }
  if (!res.ok) throw new ElevenLabsError(`ElevenLabs answered ${res.status}`, res.status, false);
  const body = (await res.json().catch(() => null)) as { character_count?: unknown; character_limit?: unknown } | null;
  const count = body?.character_count;
  const limit = body?.character_limit;
  if (typeof count !== 'number' || typeof limit !== 'number' || !Number.isFinite(count) || !Number.isFinite(limit)) {
    throw new ElevenLabsError('ElevenLabs sent an unexpected subscription', res.status, false);
  }
  return { characterCount: count, characterLimit: limit, remaining: Math.max(0, limit - count) };
}

/**
 * The account balance, read at most every `BALANCE_TTL_MS`. Credits spent since the last read
 * are taken off, so the cached value never overstates what is left. When a read fails the last
 * known value is kept (or null when there is none: the cap alone then limits spending).
 */
export class BalanceCache {
  private value: number | null = null;
  private readAt = -Infinity;
  private spentSince = 0;
  private pending: Promise<number | null> | null = null;

  constructor(
    private readonly ttlMs: number = BALANCE_TTL_MS,
    private readonly now: () => number = Date.now
  ) {}

  /** The remaining balance in credits, or null when it is not known. */
  async get(apiKey: string, fetchImpl?: FetchLike): Promise<number | null> {
    if (this.now() - this.readAt < this.ttlMs) return this.current();
    this.pending ??= (async () => {
      try {
        const sub = await fetchSubscription(apiKey, fetchImpl);
        this.value = sub.remaining;
        this.spentSince = 0;
      } catch {
        // Keep the last value; try again after the next interval.
      }
      this.readAt = this.now();
      return this.current();
    })().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  /** Takes credits spent through this laptop off the cached balance. */
  noteSpent(credits: number): void {
    this.spentSince += credits;
  }

  private current(): number | null {
    return this.value === null ? null : Math.max(0, this.value - this.spentSince);
  }
}
