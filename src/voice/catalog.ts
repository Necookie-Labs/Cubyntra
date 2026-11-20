/**
 * Cubyntra - ElevenLabs models and voices (ADR-016)
 * Necookie Labs (c) 2026
 *
 * The one table of ElevenLabs models Cubyntra knows, with what each costs in credits per
 * character, and the short list of stock voices the student can pick in Settings. Shared by the
 * server (credits, the request to ElevenLabs, which voice ids it accepts) and the browser (the
 * Settings picker, the profile defaults). Pure: no Node or DOM imports.
 *
 * Models and multipliers as listed for the owner's account (2026-11-20). `eleven_v4` is the
 * default ("High quality", one credit per character); "Faster, half the credits" picks
 * `eleven_v4_turbo`. The older models stay in the table so old usage files and clips still add
 * up, and so `ELEVENLABS_MODEL`-style experiments need no code change.
 */

export interface VoiceModelInfo {
  /** Credits charged per character of text. */
  creditsPerCharacter: number;
  label: string;
}

export const VOICE_MODELS: Readonly<Record<string, VoiceModelInfo>> = {
  eleven_v4: { creditsPerCharacter: 1, label: 'Eleven v4 (high quality)' },
  eleven_v4_turbo: { creditsPerCharacter: 0.5, label: 'Eleven v4 Turbo (faster, half the credits)' },
  eleven_v3: { creditsPerCharacter: 1, label: 'Eleven v3' },
  eleven_multilingual_v2: { creditsPerCharacter: 1, label: 'Multilingual v2' },
  eleven_flash_v2_5: { creditsPerCharacter: 0.5, label: 'Flash v2.5' },
  eleven_turbo_v2_5: { creditsPerCharacter: 0.5, label: 'Turbo v2.5' },
};

/** The two qualities offered in Settings. */
export type VoiceQuality = 'high' | 'fast';
export const VOICE_QUALITIES: readonly VoiceQuality[] = ['high', 'fast'];

/** The model behind each quality. */
export const QUALITY_MODEL: Readonly<Record<VoiceQuality, string>> = {
  high: 'eleven_v4',
  fast: 'eleven_v4_turbo',
};

export const DEFAULT_VOICE_QUALITY: VoiceQuality = 'high';
export const DEFAULT_VOICE_MODEL = QUALITY_MODEL[DEFAULT_VOICE_QUALITY];

export const QUALITY_LABEL: Readonly<Record<VoiceQuality, string>> = {
  high: 'High quality',
  fast: 'Faster, half the credits',
};

/** A premade ElevenLabs stock voice (never a clone). */
export interface CuratedVoice {
  id: string;
  name: string;
  /** One short line for the picker. */
  description: string;
}

/** The voices offered in Settings, in the order shown. The first is the default. */
export const CURATED_VOICES: readonly CuratedVoice[] = [
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', description: 'British, a clear and engaging teacher.' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', description: 'American, a calm and friendly teacher.' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', description: 'American, bright and warm.' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', description: 'American, relaxed and easy-going.' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', description: 'British, a storyteller (the old voice).' },
];

/** Alice: the default voice, unless `ELEVENLABS_VOICE_ID` names another on the server. */
export const DEFAULT_VOICE_ID = CURATED_VOICES[0].id;

/** What an ElevenLabs voice id looks like (letters and digits). */
export const VOICE_ID_PATTERN = /^[A-Za-z0-9]{8,40}$/;

export function isCuratedVoiceId(id: unknown): id is string {
  return typeof id === 'string' && CURATED_VOICES.some((v) => v.id === id);
}

export function isVoiceQuality(v: unknown): v is VoiceQuality {
  return typeof v === 'string' && (VOICE_QUALITIES as readonly string[]).includes(v);
}

/** The model for a quality (the default model for anything else). */
export function modelForQuality(quality: VoiceQuality | undefined): string {
  return quality && isVoiceQuality(quality) ? QUALITY_MODEL[quality] : DEFAULT_VOICE_MODEL;
}

/** Credits per character for a model; throws for a model not in the table. */
export function creditsPerCharacter(model: string): number {
  const info = Object.prototype.hasOwnProperty.call(VOICE_MODELS, model) ? VOICE_MODELS[model] : undefined;
  if (!info) throw new Error(`No credit rate for model ${model}`);
  return info.creditsPerCharacter;
}
