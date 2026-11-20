/**
 * Cubyntra - Voice credit tracking (server only, ADR-016)
 * Necookie Labs (c) 2026
 *
 * Counts the characters sent to ElevenLabs per calendar month (UTC) in `data/voice-usage.json`
 * and turns them into credits with one table. Before each call the credits it will cost are
 * reserved, and the call is refused when it could pass the limit: the lower of the monthly cap
 * (default 20,000 credits, env `ELEVENLABS_MONTHLY_CREDIT_CAP`) and the account's real balance.
 * Clips served from the cache cost nothing and are not counted.
 */

import fs from 'node:fs';
import { dataPath, writeFileAtomic } from '../lib/dataDir';
import { DEFAULT_VOICE_MODEL, VOICE_MODELS, creditsPerCharacter } from './catalog';
import { VOICE_WARNING_SHARE } from './types';

/** The default model: Eleven v4, "High quality" in Settings (`src/voice/catalog.ts`). */
export const VOICE_MODEL = DEFAULT_VOICE_MODEL;
export const DEFAULT_MONTHLY_CREDIT_CAP = 20_000;

/**
 * Credits charged per character of text, by model: a view of the one model table in
 * `src/voice/catalog.ts` (Eleven v4 1.0, Eleven v4 Turbo 0.5, Flash v2.5 0.5, ...).
 */
export const CREDITS_PER_CHARACTER: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(VOICE_MODELS).map(([id, info]) => [id, info.creditsPerCharacter])
);

/** Credits a text of `characters` characters costs with a model. */
export function creditsFor(characters: number, model: string = VOICE_MODEL): number {
  return characters * creditsPerCharacter(model);
}

/** The monthly cap in credits: `ELEVENLABS_MONTHLY_CREDIT_CAP` if it is a valid number, else 20,000. */
export function monthlyCreditCap(): number {
  const raw = process.env.ELEVENLABS_MONTHLY_CREDIT_CAP;
  if (raw === undefined || raw.trim() === '') return DEFAULT_MONTHLY_CREDIT_CAP;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_MONTHLY_CREDIT_CAP;
}

export interface VoiceMonth {
  characters: number;
  credits: number;
  requests: number;
}

export interface VoiceUsageFile {
  version: 1;
  months: Record<string, VoiceMonth>;
}

const emptyMonth = (): VoiceMonth => ({ characters: 0, credits: 0, requests: 0 });

/** `YYYY-MM` in UTC. */
export function voiceMonthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export class VoiceUsageTracker {
  private reserved = 0;
  private data: VoiceUsageFile | null = null;
  private saving: Promise<void> = Promise.resolve();

  constructor(
    private readonly file: string = dataPath('voice-usage.json'),
    private readonly now: () => Date = () => new Date()
  ) {}

  private load(): VoiceUsageFile {
    if (this.data) return this.data;
    let data: VoiceUsageFile = { version: 1, months: {} };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<VoiceUsageFile>;
      if (parsed && typeof parsed.months === 'object' && parsed.months) data = { version: 1, months: parsed.months };
    } catch {
      // Missing or unreadable: start a fresh file (a corrupt one is replaced on the next write).
    }
    this.data = data;
    return data;
  }

  get month(): string {
    return voiceMonthKey(this.now());
  }

  monthUsage(): VoiceMonth {
    return { ...emptyMonth(), ...this.load().months[this.month] };
  }

  monthCredits(): number {
    return this.monthUsage().credits;
  }

  capCredits(): number {
    return monthlyCreditCap();
  }

  /**
   * Credits that may still be spent: what is left under the cap and, when it is known, under the
   * account's real balance (`accountRemaining`), whichever is lower. Reservations count.
   */
  remaining(accountRemaining?: number | null): number {
    const underCap = this.capCredits() - this.monthCredits() - this.reserved;
    const underAccount = accountRemaining == null ? Infinity : accountRemaining - this.reserved;
    return Math.max(0, Math.min(underCap, underAccount));
  }

  /** True once nothing is left (cap reached or the account is empty). */
  isCapped(accountRemaining?: number | null): boolean {
    return this.remaining(accountRemaining) <= 0;
  }

  /**
   * True at 80% of the limit or more. The limit is the cap, or less when the account has fewer
   * credits left than the cap would allow.
   */
  isWarning(accountRemaining?: number | null): boolean {
    const used = this.monthCredits();
    const limit = Math.min(this.capCredits(), used + (accountRemaining ?? Infinity));
    return limit <= 0 || used / limit >= VOICE_WARNING_SHARE;
  }

  /**
   * Reserves the credits of one call. Returns false (and reserves nothing) when the call could
   * pass the limit, so a single request can never overshoot. Pair a true result with `settle`.
   */
  reserve(credits: number, accountRemaining?: number | null): boolean {
    if (credits > this.remaining(accountRemaining)) return false;
    this.reserved += credits;
    return true;
  }

  /** Releases a reservation and records the characters sent, if the call was billed. */
  async settle(credits: number, billedCharacters: number | null, model: string = VOICE_MODEL): Promise<number> {
    this.reserved = Math.max(0, this.reserved - credits);
    return billedCharacters === null ? 0 : this.record(billedCharacters, model);
  }

  /** Adds one call to this month and saves the file (saves run one after another). */
  async record(characters: number, model: string = VOICE_MODEL): Promise<number> {
    const credits = creditsFor(characters, model);
    const data = this.load();
    const key = this.month;
    const month = { ...emptyMonth(), ...data.months[key] };
    month.characters += characters;
    month.credits += credits;
    month.requests += 1;
    data.months[key] = month;
    const write = this.saving.then(() => writeFileAtomic(this.file, `${JSON.stringify(data, null, 2)}\n`));
    this.saving = write.catch(() => {});
    await write;
    return credits;
  }
}

let shared: VoiceUsageTracker | null = null;

/** The process-wide tracker for `data/voice-usage.json`. */
export function getVoiceUsageTracker(): VoiceUsageTracker {
  shared ??= new VoiceUsageTracker();
  return shared;
}

/** Test hook: forget the shared tracker (e.g. after changing `CUBYNTRA_DATA_DIR`). */
export function resetVoiceUsageTrackerForTests(): void {
  shared = null;
}
