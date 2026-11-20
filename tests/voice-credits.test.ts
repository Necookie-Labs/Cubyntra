/**
 * Cubyntra - Voice credit tracking tests (cap, 80% warning, balance min)
 * Necookie Labs (c) 2026
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CREDITS_PER_CHARACTER,
  DEFAULT_MONTHLY_CREDIT_CAP,
  VOICE_MODEL,
  VoiceUsageTracker,
  creditsFor,
  monthlyCreditCap,
} from '../src/voice/credits';
import { QUALITY_MODEL, modelForQuality } from '../src/voice/catalog';
import { useScratchDataDir } from './helpers/scratchData';

let scratch: ReturnType<typeof useScratchDataDir>;
const file = () => path.join(scratch.dir, 'voice-usage.json');
const at = (iso: string) => () => new Date(iso);

beforeEach(() => {
  scratch = useScratchDataDir();
  delete process.env.ELEVENLABS_MONTHLY_CREDIT_CAP;
});

afterEach(() => {
  scratch.cleanup();
  delete process.env.ELEVENLABS_MONTHLY_CREDIT_CAP;
});

describe('credits', () => {
  it('counts Eleven v4 (the default) at one credit per character and v4 Turbo at half, from one table', () => {
    expect(VOICE_MODEL).toBe('eleven_v4');
    expect(CREDITS_PER_CHARACTER).toMatchObject({
      eleven_v4: 1,
      eleven_v4_turbo: 0.5,
      eleven_v3: 1,
      eleven_multilingual_v2: 1,
      eleven_flash_v2_5: 0.5,
    });
    expect(creditsFor(1000)).toBe(1000);
    expect(creditsFor(1000, 'eleven_v4')).toBe(1000);
    expect(creditsFor(1000, 'eleven_v4_turbo')).toBe(500);
    expect(creditsFor(1000, 'eleven_flash_v2_5')).toBe(500);
    expect(() => creditsFor(1, 'unknown')).toThrow();
    expect(() => creditsFor(1, 'constructor')).toThrow();
  });

  it('maps the Settings qualities to v4 and v4 Turbo', () => {
    expect(QUALITY_MODEL).toEqual({ high: 'eleven_v4', fast: 'eleven_v4_turbo' });
    expect(modelForQuality('fast')).toBe('eleven_v4_turbo');
    expect(modelForQuality(undefined)).toBe('eleven_v4');
    expect(creditsFor(200, modelForQuality('fast'))).toBe(100);
  });

  it('records credits at the model used', async () => {
    const tracker = new VoiceUsageTracker(file(), at('2026-11-18T10:00:00Z'));
    await tracker.record(100, 'eleven_v4_turbo');
    await tracker.record(100, 'eleven_v4');
    expect(tracker.monthUsage()).toMatchObject({ characters: 200, credits: 150, requests: 2 });
  });

  it('reads the cap from the environment, defaulting to 20,000', () => {
    expect(monthlyCreditCap()).toBe(DEFAULT_MONTHLY_CREDIT_CAP);
    process.env.ELEVENLABS_MONTHLY_CREDIT_CAP = '5000';
    expect(monthlyCreditCap()).toBe(5000);
    process.env.ELEVENLABS_MONTHLY_CREDIT_CAP = 'lots';
    expect(monthlyCreditCap()).toBe(DEFAULT_MONTHLY_CREDIT_CAP);
  });
});

describe('VoiceUsageTracker', () => {
  /** A half-credit model, so the numbers below read as characters / 2. */
  const HALF = 'eleven_v4_turbo';

  it('records characters and credits per month in the usage file', async () => {
    const tracker = new VoiceUsageTracker(file(), at('2026-11-18T10:00:00Z'));
    await tracker.record(300, HALF);
    await tracker.record(100, HALF);
    expect(tracker.monthUsage()).toEqual({ characters: 400, credits: 200, requests: 2 });
    const saved = JSON.parse(fs.readFileSync(file(), 'utf8'));
    expect(saved.months['2026-11']).toEqual({ characters: 400, credits: 200, requests: 2 });
    // A new month starts from zero, and a fresh tracker reads the file.
    expect(new VoiceUsageTracker(file(), at('2026-12-01T00:00:00Z')).monthCredits()).toBe(0);
    expect(new VoiceUsageTracker(file(), at('2026-11-30T00:00:00Z')).monthCredits()).toBe(200);
  });

  it('refuses a call that would pass the cap, before it is made', async () => {
    process.env.ELEVENLABS_MONTHLY_CREDIT_CAP = '1000';
    const tracker = new VoiceUsageTracker(file(), at('2026-11-18T10:00:00Z'));
    await tracker.record(1900, HALF); // 950 credits
    expect(tracker.remaining()).toBe(50);
    expect(tracker.reserve(60)).toBe(false);
    expect(tracker.reserve(50)).toBe(true);
    // The reservation counts: a second call cannot use the same credits.
    expect(tracker.reserve(1)).toBe(false);
    expect(tracker.isCapped()).toBe(true);
    await tracker.settle(50, 100, HALF);
    expect(tracker.monthCredits()).toBe(1000);
    expect(tracker.isCapped()).toBe(true);
  });

  it('releases a reservation that was not billed', async () => {
    const tracker = new VoiceUsageTracker(file(), at('2026-11-18T10:00:00Z'));
    expect(tracker.reserve(100)).toBe(true);
    expect(tracker.remaining()).toBe(DEFAULT_MONTHLY_CREDIT_CAP - 100);
    await tracker.settle(100, null);
    expect(tracker.remaining()).toBe(DEFAULT_MONTHLY_CREDIT_CAP);
    expect(fs.existsSync(file())).toBe(false);
  });

  it('warns at 80% of the cap', async () => {
    process.env.ELEVENLABS_MONTHLY_CREDIT_CAP = '1000';
    const tracker = new VoiceUsageTracker(file(), at('2026-11-18T10:00:00Z'));
    await tracker.record(1580, HALF); // 790 credits
    expect(tracker.isWarning()).toBe(false);
    await tracker.record(20, HALF); // 800 credits
    expect(tracker.isWarning()).toBe(true);
  });

  it('treats the lower of the cap and the real account balance as the limit', async () => {
    process.env.ELEVENLABS_MONTHLY_CREDIT_CAP = '1000';
    const tracker = new VoiceUsageTracker(file(), at('2026-11-18T10:00:00Z'));
    await tracker.record(200, HALF); // 100 credits used here
    expect(tracker.remaining(5000)).toBe(900); // the cap is lower
    expect(tracker.remaining(300)).toBe(300); // the account is lower
    expect(tracker.reserve(301, 300)).toBe(false);
    expect(tracker.reserve(300, 300)).toBe(true);
    expect(tracker.isCapped(300)).toBe(true);
    // 100 used of a limit of 100 + 20 = 120: past 80%.
    expect(tracker.isWarning(20)).toBe(true);
    expect(tracker.isWarning(5000)).toBe(false);
  });

  it('starts fresh from a corrupt file', () => {
    fs.writeFileSync(file(), '{nope');
    expect(new VoiceUsageTracker(file()).monthCredits()).toBe(0);
  });
});
