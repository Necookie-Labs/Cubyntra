/**
 * Cubyntra - Voice prewarm script tests (fake ElevenLabs, no network)
 * Necookie Labs (c) 2026
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPrewarmFlags, main, prewarm, prewarmPlan } from '../scripts/voice-prewarm';
import { clipHash, hasClip } from '../src/voice/clipCache';
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

  it('prints credits at the model rate: v4 one per character, Turbo half', async () => {
    const chars = phraseBankCharacters();
    const high: string[] = [];
    await main([], (l) => high.push(l));
    expect(high[0]).toContain(`(${chars.toLocaleString('en-US')} credits with eleven_v4 at 1 per character)`);
    const fast: string[] = [];
    await main(['--model', 'fast'], (l) => fast.push(l));
    expect(fast[0]).toContain(`(${(chars / 2).toLocaleString('en-US')} credits with eleven_v4_turbo at 0.5 per character)`);
    expect(fast.join(' ')).toContain(`about ${(chars / 2).toLocaleString('en-US')} credits`);
  });

  it('takes --voice by name or id and --model by quality or id, refusing anything else', () => {
    const base = elevenLabsConfig();
    expect(base).toMatchObject({ voiceId: 'Xb7hH8MSUJpSbSDYk0k2', model: 'eleven_v4' });
    expect(applyPrewarmFlags(base, ['--voice', 'matilda', '--model=fast'])).toEqual({
      ok: true,
      config: { ...base, voiceId: 'XrExE9yKIg1WjnnlVkGX', model: 'eleven_v4_turbo' },
    });
    expect(applyPrewarmFlags(base, ['--voice=JBFqnCBsd6RMkjVDRZzb', '--model', 'eleven_flash_v2_5'])).toMatchObject({
      ok: true,
      config: { voiceId: 'JBFqnCBsd6RMkjVDRZzb', model: 'eleven_flash_v2_5' },
    });
    expect(applyPrewarmFlags(base, ['--voice', 'abcdefghij12']).ok).toBe(false);
    expect(applyPrewarmFlags(base, ['--model', 'eleven_v9']).ok).toBe(false);
  });

  it('refuses an unknown voice without calling anyone', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk-test';
    const lines: string[] = [];
    expect(await main(['--yes', '--voice', 'Nobody'], (l) => lines.push(l))).toBe(1);
    expect(lines[0]).toContain('Unknown voice');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('makes clips for the chosen voice and model, keyed by both', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk-test';
    expect(await main(['--yes', '--voice', 'Will', '--model', 'fast'], () => {})).toBe(0);
    const first = PHRASES[0].text;
    expect(hasClip(clipHash('eleven_v4_turbo', 'bIHbv24MWmeRgasZH58o', first))).toBe(true);
    expect(hasClip(clipHash('eleven_v4', 'Xb7hH8MSUJpSbSDYk0k2', first))).toBe(false);
    const tts = fetchMock.mock.calls.find(([u]) => String(u).includes('text-to-speech'))!;
    expect(String(tts[0])).toContain('/bIHbv24MWmeRgasZH58o?');
    expect(JSON.parse(String((tts[1] as RequestInit).body)).model_id).toBe('eleven_v4_turbo');
    // The default voice and model still have everything to make.
    expect(prewarmPlan(elevenLabsConfig()).missing).toHaveLength(PHRASES.length);
  });
});
