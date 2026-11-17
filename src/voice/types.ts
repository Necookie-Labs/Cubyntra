/**
 * Cubyntra - Voice wire types (ADR-016)
 * Necookie Labs (c) 2026
 *
 * Shared by `/api/voice`, `/api/voice/status` and the browser. Only text travels to the laptop
 * and on to ElevenLabs: `{ text, kind? }`, never images, cube state or student data.
 */

import type { SpeechKind } from './speechQueue';

/**
 * What the laptop's voice can do right now. `elevenlabs`: a key is set, the student chose it and
 * credits are left. `device`: the browser's own voice (no key, the cap is reached, or the
 * student chose it). `off`: the student turned voice off.
 */
export type VoiceServerMode = 'elevenlabs' | 'device' | 'off';

/** Why ElevenLabs is not used, if it is not. */
export type VoiceFallbackReason = 'no-key' | 'capped' | 'chosen' | 'upstream' | 'off';

export interface VoiceStatus {
  mode: VoiceServerMode;
  /** An ElevenLabs key is set on the laptop. */
  keySet: boolean;
  /** Credits counted this month (UTC) in `data/voice-usage.json`. */
  monthCredits: number;
  /** The monthly cap (`ELEVENLABS_MONTHLY_CREDIT_CAP`, default 20,000). */
  capCredits: number;
  /** Credits left when a key is set: the lower of the cap and the account's real balance. */
  remaining?: number;
  /** The account's remaining balance from ElevenLabs, when a key is set and it was read. */
  accountRemaining?: number;
  /** 80% of the limit or more is used. */
  warning: boolean;
  reason?: VoiceFallbackReason;
  /** `YYYY-MM` in UTC. */
  month: string;
}

/** The body of `POST /api/voice`. `phrase` texts must be lines of the phrase bank. */
export interface VoiceRequestBody {
  text: string;
  kind?: SpeechKind;
}

/** Longest text one request may carry (a long coach reply is about 700 characters). */
export const MAX_VOICE_TEXT = 1200;
/** Largest request body `/api/voice` reads. */
export const MAX_VOICE_REQUEST_BYTES = 4 * 1024;
/** Share of the limit at which Settings warns. */
export const VOICE_WARNING_SHARE = 0.8;

/** A refusal from `/api/voice` that tells the browser to use the device voice. */
export interface VoiceFallbackBody {
  error: string;
  fallback: 'device';
  reason: VoiceFallbackReason;
}
