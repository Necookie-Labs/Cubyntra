/**
 * Cubyntra - Device voice (ADR-016)
 * Necookie Labs (c) 2026
 *
 * The browser's built-in speech (`speechSynthesis`): free, offline, no key. Feature-detected; an
 * English voice is preferred (the device's default English voice, then any `en-*`). Each line
 * stops when its signal aborts, and `stop` cancels everything the browser still has queued.
 *
 * The speech objects are passed in (defaulting to the window's), so tests use a fake.
 */

import type { Speaker } from './speechQueue';

/** The parts of `speechSynthesis` the device voice uses. */
export interface SynthLike {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
}

export interface DeviceVoiceEnv {
  synth: SynthLike;
  Utterance: new (text: string) => SpeechSynthesisUtterance;
}

/** The window's speech objects, or null where the browser has none (or on the server). */
export function deviceVoiceEnv(): DeviceVoiceEnv | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { SpeechSynthesisUtterance?: DeviceVoiceEnv['Utterance'] };
  if (!w.speechSynthesis || typeof w.SpeechSynthesisUtterance !== 'function') return null;
  return { synth: w.speechSynthesis, Utterance: w.SpeechSynthesisUtterance };
}

export function isDeviceVoiceAvailable(): boolean {
  return deviceVoiceEnv() !== null;
}

const isEnglish = (v: SpeechSynthesisVoice) => /^en([-_]|$)/i.test(v.lang);

/**
 * The voice to use: the default voice if it is English, else a local English voice (US, then
 * GB, then any), else any English voice, else the default, else the first; null if none is
 * listed yet (the browser then uses its default).
 */
export function pickVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const english = voices.filter(isEnglish);
  const byLang = (lang: RegExp) => english.find((v) => v.localService && lang.test(v.lang));
  return (
    english.find((v) => v.default) ??
    byLang(/^en[-_]US$/i) ??
    byLang(/^en[-_]GB$/i) ??
    english.find((v) => v.localService) ??
    english[0] ??
    voices.find((v) => v.default) ??
    voices[0]
  );
}

export interface DeviceSpeakerOptions {
  /** Speaking speed, 1 = normal. */
  rate?: number;
  /** Defaults to the window's speech objects. */
  env?: DeviceVoiceEnv | null;
}

/** A speaker using the device voice. Says nothing where the browser has no speech. */
export function createDeviceSpeaker({ rate = 1, env = deviceVoiceEnv() }: DeviceSpeakerOptions = {}): Speaker {
  return {
    speak(item, signal) {
      if (!env || signal.aborted) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const utterance = new env.Utterance(item.text);
        utterance.rate = rate;
        utterance.lang = 'en-US';
        const voice = pickVoice(env.synth.getVoices());
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        }
        const done = () => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        };
        const onAbort = () => {
          env.synth.cancel();
          done();
        };
        utterance.onend = done;
        utterance.onerror = done;
        signal.addEventListener('abort', onAbort);
        env.synth.speak(utterance);
      });
    },
    stop() {
      env?.synth.cancel();
    },
  };
}
