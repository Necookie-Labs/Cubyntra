/**
 * Cubyntra - Voice service (server only, ADR-016)
 * Necookie Labs (c) 2026
 *
 * What `/api/voice` and `/api/voice/status` do. A request carries only `{ text, kind? }`:
 * - a `phrase` (a line of the phrase bank) is served from `data/voice/` when it was made before,
 *   spending nothing; otherwise it is made with ElevenLabs and kept;
 * - a `reply` (a coach reply the student asked to hear with ElevenLabs) is made and not kept.
 * Before a call its credits are reserved against the lower of the monthly cap and the account's
 * real balance (read at most every ten minutes). No key, the cap, or an ElevenLabs failure answer
 * with a fallback telling the browser to use the device voice.
 */

import { getVoiceUsageTracker, creditsFor, type VoiceUsageTracker } from './credits';
import { clipHash, readClip, writeClip } from './clipCache';
import { BalanceCache, ElevenLabsError, elevenLabsConfig, textToSpeech, type ElevenLabsConfig } from './elevenlabs';
import { isPhraseText } from './phrases';
import type { SpeechKind } from './speechQueue';
import {
  MAX_VOICE_TEXT,
  type VoiceFallbackBody,
  type VoiceFallbackReason,
  type VoiceRequestBody,
  type VoiceServerMode,
  type VoiceStatus,
} from './types';
import type { VoiceMode } from '../lib/studentProfile';

export interface VoiceDeps {
  tracker: VoiceUsageTracker;
  balance: BalanceCache;
  config: ElevenLabsConfig;
  fetchImpl?: typeof fetch;
}

let sharedBalance: BalanceCache | null = null;

export function getBalanceCache(): BalanceCache {
  sharedBalance ??= new BalanceCache();
  return sharedBalance;
}

/** Test hook: forget the cached balance. */
export function resetVoiceServiceForTests(): void {
  sharedBalance = null;
}

export function defaultVoiceDeps(): VoiceDeps {
  return { tracker: getVoiceUsageTracker(), balance: getBalanceCache(), config: elevenLabsConfig() };
}

// A data URL, or a long run of base64 characters (an encoded image or file).
const IMAGE_LIKE = /data:[a-z]+\/[a-z0-9.+-]+[;,]|[A-Za-z0-9+/]{120,}={0,2}/i;

export type VoiceRequestParse = { ok: true; value: Required<VoiceRequestBody> } | { ok: false; error: string };

/**
 * Checks a request body: exactly `{ text, kind? }`, text 1 to 1,200 characters with no data URL
 * or encoded blob in it, `kind` phrase or reply (default reply), and a phrase must be a line of
 * the bank. Any other field is refused, so nothing but the text can travel.
 */
export function parseVoiceRequest(raw: unknown): VoiceRequestParse {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'The body must be { "text": "..." }' };
  const body = raw as Record<string, unknown>;
  const extra = Object.keys(body).filter((k) => k !== 'text' && k !== 'kind');
  if (extra.length) return { ok: false, error: `Only text and kind are accepted, not ${extra.join(', ')}` };
  if (typeof body.text !== 'string' || !body.text.trim()) return { ok: false, error: 'text must be a non-empty string' };
  if (body.text.length > MAX_VOICE_TEXT) return { ok: false, error: `text must be at most ${MAX_VOICE_TEXT} characters` };
  if (IMAGE_LIKE.test(body.text)) return { ok: false, error: 'text must be words to speak, not data' };
  const kind = body.kind ?? 'reply';
  if (kind !== 'phrase' && kind !== 'reply') return { ok: false, error: 'kind must be phrase or reply' };
  if (kind === 'phrase' && !isPhraseText(body.text)) return { ok: false, error: 'Not a line of the phrase bank' };
  return { ok: true, value: { text: body.text, kind: kind as SpeechKind } };
}

export type SpeakOutcome =
  | { ok: true; audio: Uint8Array; cached: boolean; credits: number }
  | { ok: false; status: 502 | 503; body: VoiceFallbackBody };

const fallback = (status: 502 | 503, reason: VoiceFallbackReason, error: string): SpeakOutcome => ({
  ok: false,
  status,
  body: { error, fallback: 'device', reason },
});

/** Speaks one checked request (see `parseVoiceRequest`). */
export async function speak(
  { text, kind }: Required<VoiceRequestBody>,
  deps: VoiceDeps = defaultVoiceDeps(),
  signal?: AbortSignal
): Promise<SpeakOutcome> {
  const { config, tracker, balance } = deps;
  const hash = kind === 'phrase' ? clipHash(config.model, config.voiceId, text) : null;
  if (hash) {
    const cached = readClip(hash);
    if (cached) return { ok: true, audio: cached, cached: true, credits: 0 };
  }
  if (!config.apiKey) return fallback(503, 'no-key', 'No ElevenLabs key is set on this laptop');

  const credits = creditsFor(text.length, config.model);
  const accountRemaining = await balance.get(config.apiKey, deps.fetchImpl);
  if (!tracker.reserve(credits, accountRemaining)) {
    return fallback(503, 'capped', 'The monthly voice credits are used up');
  }
  let audio: Uint8Array;
  try {
    audio = await textToSpeech(text, { apiKey: config.apiKey, voiceId: config.voiceId, model: config.model, signal, fetchImpl: deps.fetchImpl });
  } catch (error) {
    const billed = error instanceof ElevenLabsError && error.billed;
    await tracker.settle(credits, billed ? text.length : null, config.model).catch(() => 0);
    if (billed) balance.noteSpent(credits);
    console.warn('[Cubyntra] ElevenLabs failed, using the device voice:', (error as Error).message);
    return fallback(502, 'upstream', 'ElevenLabs did not answer');
  }
  await tracker.settle(credits, text.length, config.model);
  balance.noteSpent(credits);
  if (hash) await writeClip(hash, audio).catch((error) => console.warn('[Cubyntra] Could not cache a voice clip:', error));
  return { ok: true, audio, cached: false, credits };
}

/**
 * What the voice can do now for a student who chose `preference`: off, the device voice, or
 * ElevenLabs when a key is set and credits are left. Reads the account balance when a key is set.
 */
export async function voiceStatus(preference: VoiceMode, deps: VoiceDeps = defaultVoiceDeps()): Promise<VoiceStatus> {
  const { config, tracker, balance } = deps;
  const keySet = Boolean(config.apiKey);
  const accountRemaining = config.apiKey ? await balance.get(config.apiKey, deps.fetchImpl) : null;
  const capped = keySet && tracker.isCapped(accountRemaining);
  let mode: VoiceServerMode = 'elevenlabs';
  let reason: VoiceFallbackReason | undefined;
  if (preference === 'off') [mode, reason] = ['off', 'off'];
  else if (!keySet) [mode, reason] = ['device', 'no-key'];
  else if (capped) [mode, reason] = ['device', 'capped'];
  else if (preference === 'device') [mode, reason] = ['device', 'chosen'];
  return {
    mode,
    keySet,
    monthCredits: tracker.monthCredits(),
    capCredits: tracker.capCredits(),
    ...(keySet ? { remaining: tracker.remaining(accountRemaining) } : {}),
    ...(accountRemaining !== null ? { accountRemaining } : {}),
    warning: keySet && tracker.isWarning(accountRemaining),
    ...(reason ? { reason } : {}),
    month: tracker.month,
  };
}
