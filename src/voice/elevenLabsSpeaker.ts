/**
 * Cubyntra - ElevenLabs speaker and the fallback chain (browser, ADR-016)
 * Necookie Labs (c) 2026
 *
 * `createElevenLabsSpeaker` asks the laptop's `/api/voice` for a clip (sending only
 * `{ text, kind, voiceId, quality, rate }`: the words and the student's voice choice) and plays
 * it. ElevenLabs applies the speed, so the clip plays at its own pace. Phrase clips are kept in memory once fetched, so replaying a
 * step asks the laptop once per move. Anything but audio back (no key, the cap, ElevenLabs down,
 * no network, autoplay blocked) is an error, and `createVoiceSpeaker` then says the line with the
 * device voice: ElevenLabs, then the device voice, then nothing.
 *
 * Which lines use ElevenLabs: phrase-bank lines (cached, so free after the first time) and coach
 * replies the student asked to hear with it ("Read with ElevenLabs"). Other coach replies use the
 * device voice.
 */

import type { VoiceMode } from '../lib/studentProfile';
import type { VoiceQuality } from './catalog';
import type { Speaker, SpeechItem } from './speechQueue';
import type { VoiceFallbackReason, VoiceRequestBody } from './types';

/** Same header as `src/lib/localAuth.ts` (server only, so not imported here). */
const APP_TOKEN_HEADER = 'x-cubyntra-token';

/** The student's ElevenLabs voice choice (Settings). */
export interface VoiceChoice {
  voiceId?: string;
  quality?: VoiceQuality;
  rate?: number;
}

/**
 * The only body the browser sends to `/api/voice`: the words, what kind of line they are, and
 * the voice, quality and speed to say them with.
 */
export function voiceRequestBody(item: SpeechItem, choice: VoiceChoice = {}): VoiceRequestBody {
  const body: VoiceRequestBody = { text: item.text, kind: item.kind };
  if (choice.voiceId) body.voiceId = choice.voiceId;
  if (choice.quality) body.quality = choice.quality;
  if (choice.rate !== undefined && choice.rate !== 1) body.rate = choice.rate;
  return body;
}

export class VoiceUnavailableError extends Error {
  constructor(readonly reason: VoiceFallbackReason | 'network' | 'playback') {
    super(`ElevenLabs voice unavailable (${reason})`);
    this.name = 'VoiceUnavailableError';
  }
}

/** The parts of an `<audio>` element the speaker uses. */
export interface AudioLike {
  src: string;
  playbackRate: number;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  play(): Promise<void>;
  pause(): void;
}

export interface ElevenLabsSpeakerOptions {
  token: string | null;
  rate?: number;
  voiceId?: string;
  quality?: VoiceQuality;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  createAudio?: () => AudioLike;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
}

/** Phrase clips kept in memory per page (the bank has about 140 lines). */
const MAX_MEMORY_CLIPS = 200;

export function createElevenLabsSpeaker({
  token,
  rate = 1,
  voiceId,
  quality,
  endpoint = '/api/voice',
  fetchImpl,
  createAudio = () => new Audio() as AudioLike,
  createUrl = (blob) => URL.createObjectURL(blob),
  revokeUrl = (url) => URL.revokeObjectURL(url),
}: ElevenLabsSpeakerOptions): Speaker {
  const clips = new Map<string, Blob>();
  let playing: AudioLike | null = null;

  const fetchClip = async (item: SpeechItem, signal: AbortSignal): Promise<Blob> => {
    const kept = item.kind === 'phrase' ? clips.get(item.text) : undefined;
    if (kept) return kept;
    if (!token) throw new VoiceUnavailableError('no-key');
    let res: Response;
    try {
      res = await (fetchImpl ?? globalThis.fetch)(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [APP_TOKEN_HEADER]: token },
        body: JSON.stringify(voiceRequestBody(item, { voiceId, quality, rate })),
        signal,
      });
    } catch {
      throw new VoiceUnavailableError('network');
    }
    if (!res.ok || !(res.headers.get('Content-Type') ?? '').startsWith('audio/')) {
      const body = (await res.json().catch(() => null)) as { reason?: VoiceFallbackReason } | null;
      throw new VoiceUnavailableError(body?.reason ?? 'upstream');
    }
    const blob = await res.blob();
    if (item.kind === 'phrase') {
      if (clips.size >= MAX_MEMORY_CLIPS) clips.delete(clips.keys().next().value as string);
      clips.set(item.text, blob);
    }
    return blob;
  };

  return {
    async speak(item, signal) {
      const blob = await fetchClip(item, signal);
      if (signal.aborted) return;
      const url = createUrl(blob);
      const audio = createAudio();
      playing = audio;
      try {
        await new Promise<void>((resolve, reject) => {
          const finish = () => {
            signal.removeEventListener('abort', onAbort);
            resolve();
          };
          const onAbort = () => {
            audio.pause();
            finish();
          };
          audio.onended = finish;
          audio.onerror = () => {
            signal.removeEventListener('abort', onAbort);
            reject(new VoiceUnavailableError('playback'));
          };
          signal.addEventListener('abort', onAbort);
          audio.src = url;
          // ElevenLabs already spoke at the chosen speed (voice_settings.speed).
          audio.playbackRate = 1;
          // Autoplay blocked (no tap yet) or a broken clip: let the device voice try.
          audio.play().catch(() => {
            signal.removeEventListener('abort', onAbort);
            reject(new VoiceUnavailableError('playback'));
          });
        });
      } finally {
        if (playing === audio) playing = null;
        revokeUrl(url);
      }
    },
    stop() {
      playing?.pause();
      playing = null;
    },
  };
}

export interface VoiceSpeakerOptions {
  mode: VoiceMode;
  device: Speaker;
  elevenlabs: Speaker;
  /** Told when ElevenLabs could not say a line and the device voice took over. */
  onFallback?: (reason: VoiceUnavailableError['reason']) => void;
}

/**
 * The fallback chain. Off: says nothing. Device: the device voice. ElevenLabs: phrase lines and
 * replies marked `premium` go to ElevenLabs, everything else to the device voice; when
 * ElevenLabs fails the device voice says the line. After "no key" or "credits used up" the
 * chain stops asking ElevenLabs until it is made again.
 */
export function createVoiceSpeaker({ mode, device, elevenlabs, onFallback }: VoiceSpeakerOptions): Speaker {
  let elevenOk = mode === 'elevenlabs';
  return {
    async speak(item, signal) {
      if (mode === 'off' || signal.aborted) return;
      if (elevenOk && (item.kind === 'phrase' || item.premium)) {
        try {
          await elevenlabs.speak(item, signal);
          return;
        } catch (error) {
          if (signal.aborted) return;
          const reason = error instanceof VoiceUnavailableError ? error.reason : 'upstream';
          if (reason === 'no-key' || reason === 'capped') elevenOk = false;
          onFallback?.(reason);
        }
      }
      await device.speak(item, signal);
    },
    stop() {
      elevenlabs.stop();
      device.stop();
    },
  };
}
