/**
 * Cubyntra - Voice prewarm script tests (fake ElevenLabs, no network)
 * Necookie Labs (c) 2026
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main, prewarm, prewarmPlan } from '../scripts/voice-prewarm';
import { VoiceUsageTracker, resetVoiceUsageTrackerForTests } from '../src/voice/credits';
import { BalanceCache, elevenLabsConfig } from '../src/voice/elevenlabs';
import { PHRASES, phraseBankCharacters } from '../src/voice/phrases';
import { resetVoiceServiceForTests } from '../src/voice/service';
import { useScratchDataDir } from './helpers/scratchData';

let scratch: ReturnType<typeof useScratchDataDir>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scratch = useScratchDataDir();
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_MONTHLY_CREDIT_CAP;
  resetVoiceUsageTrackerForTests();
  resetVoiceServiceForTests();
  vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {});
  fetchMock = vi.fn(async (input: string | URL | Request) => {
    if (String(input).endsWith('/v1/user/subscription')) return Response.json({ character_count: 0, character_limit: 1_000_000 });
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  scratch.cleanup();
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_MONTHLY_CREDIT_CAP;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('voice:prewarm', () => {
  it('prints the character total first and spends nothing without --yes', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk-test';
    const lines: string[] = [];
    expect(await main([], (l) => lines.push(l))).toBe(0);
    expect(lines[0]).toContain(`${PHRASES.length} lines, ${phraseBankCharacters().toLocaleString('en-US')} characters`);
    expect(lines.join('\n')).toContain('--yes');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('needs a key to generate', async () => {
    const lines: string[] = [];
    expect(await main(['--yes'], (l) => lines.push(l))).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('generates the missing clips with --yes, then has nothing left to do', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk-test';
    const quiet = () => {};
    expect(await main(['--yes'], quiet)).toBe(0);
    const clips = fs.readdirSync(path.join(scratch.dir, 'voice'));
    expect(clips).toHaveLength(PHRASES.length);
    expect(prewarmPlan(elevenLabsConfig()).missing).toEqual([]);
    const ttsCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('text-to-speech')).length;
    expect(ttsCalls).toBe(PHRASES.length);
    expect(await main(['--yes'], quiet)).toBe(0);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('text-to-speech')).length).toBe(ttsCalls);
  });

  it('stops at the credit cap', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk-test';
    process.env.ELEVENLABS_MONTHLY_CREDIT_CAP = '50';
    const config = elevenLabsConfig();
    const deps = { config, tracker: new VoiceUsageTracker(path.join(scratch.dir, 'voice-usage.json')), balance: new BalanceCache() };
    const result = await prewarm(prewarmPlan(config), deps, () => {});
    expect(result.stopped).toBe('capped');
    expect(result.made).toBeGreaterThan(0);
    expect(deps.tracker.monthCredits()).toBeLessThanOrEqual(50);
  });
});
