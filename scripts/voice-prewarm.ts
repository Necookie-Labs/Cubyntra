/**
 * Cubyntra - Voice phrase-bank prewarm (ADR-016)
 * Necookie Labs (c) 2026
 *
 * Generates every phrase-bank line with ElevenLabs in one go and keeps the clips in
 * `data/voice/`, so step narration never waits for a first-time clip. It first prints how many
 * lines and characters (and credits) it would send; it spends nothing without `--yes`:
 *
 *   npm run voice:prewarm                                  # show the cost only
 *   npm run voice:prewarm -- --yes                         # generate the missing clips
 *   npm run voice:prewarm -- --voice Matilda --model fast  # another voice, v4 Turbo
 *
 * `--voice` takes a curated voice's name or id (or the laptop's `ELEVENLABS_VOICE_ID`); the
 * default is the laptop's default voice (Alice unless `ELEVENLABS_VOICE_ID` is set). `--model`
 * takes a model id from the table in `src/voice/catalog.ts` or a quality, `high` (Eleven v4,
 * the default, one credit per character) or `fast` (Eleven v4 Turbo, half). Credits are
 * printed at that model's rate. Clips are made at normal speed, the speed most students use.
 *
 * Lines already cached are skipped and cost nothing. Each clip counts toward the monthly credit
 * cap in `data/voice-usage.json`; the run stops at the cap. Reads `ELEVENLABS_API_KEY` (and the
 * optional `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MONTHLY_CREDIT_CAP`) from `.env.local`.
 */

import { CURATED_VOICES, QUALITY_MODEL, VOICE_MODELS, isVoiceQuality } from '../src/voice/catalog';
import { clipHash, hasClip } from '../src/voice/clipCache';
import { creditsFor } from '../src/voice/credits';
import { allowedVoiceIds, elevenLabsConfig, type ElevenLabsConfig } from '../src/voice/elevenlabs';
import { PHRASES, phraseBankCharacters, type Phrase } from '../src/voice/phrases';
import { defaultVoiceDeps, speak, type VoiceDeps } from '../src/voice/service';

export interface PrewarmPlan {
  lines: number;
  characters: number;
  missing: Phrase[];
  missingCharacters: number;
  missingCredits: number;
}

/** What the bank costs, and which lines are not cached yet for this voice and model. */
export function prewarmPlan(config: ElevenLabsConfig, phrases: readonly Phrase[] = PHRASES): PrewarmPlan {
  const missing = phrases.filter((p) => !hasClip(clipHash(config.model, config.voiceId, p.text)));
  const missingCharacters = phraseBankCharacters(missing);
  return {
    lines: phrases.length,
    characters: phraseBankCharacters(phrases),
    missing,
    missingCharacters,
    missingCredits: creditsFor(missingCharacters, config.model),
  };
}

/** The value after a flag (`--voice Alice` or `--voice=Alice`), if given. */
function flag(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i >= 0) return argv[i + 1];
  const inline = argv.find((a) => a.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

export type PrewarmChoice = { ok: true; config: ElevenLabsConfig } | { ok: false; error: string };

/** The config with `--voice` and `--model` applied, or why they cannot be used. */
export function applyPrewarmFlags(config: ElevenLabsConfig, argv: readonly string[]): PrewarmChoice {
  let { voiceId, model } = config;
  const voice = flag(argv, '--voice');
  if (voice !== undefined) {
    const named = CURATED_VOICES.find((v) => v.name.toLowerCase() === voice.toLowerCase());
    const id = named?.id ?? voice;
    if (!allowedVoiceIds(config).has(id)) {
      return { ok: false, error: `Unknown voice "${voice}". Use one of: ${CURATED_VOICES.map((v) => v.name).join(', ')}.` };
    }
    voiceId = id;
  }
  const asked = flag(argv, '--model');
  if (asked !== undefined) {
    const id = isVoiceQuality(asked) ? QUALITY_MODEL[asked] : asked;
    if (!Object.prototype.hasOwnProperty.call(VOICE_MODELS, id)) {
      return { ok: false, error: `Unknown model "${asked}". Use high, fast or one of: ${Object.keys(VOICE_MODELS).join(', ')}.` };
    }
    model = id;
  }
  return { ok: true, config: { ...config, voiceId, model } };
}

export interface PrewarmResult {
  made: number;
  stopped: 'capped' | 'no-key' | 'upstream' | null;
}

/** Makes the missing clips one after another; stops at the cap or when ElevenLabs fails. */
export async function prewarm(plan: PrewarmPlan, deps: VoiceDeps, log: (line: string) => void = console.log): Promise<PrewarmResult> {
  let made = 0;
  for (const phrase of plan.missing) {
    const outcome = await speak({ text: phrase.text, kind: 'phrase' }, deps);
    if (!outcome.ok) {
      const reason = outcome.body.reason as PrewarmResult['stopped'];
      log(`Stopped after ${made} clips: ${outcome.body.error}.`);
      return { made, stopped: reason };
    }
    if (!outcome.cached) made++;
  }
  return { made, stopped: null };
}

export async function main(argv: readonly string[] = process.argv.slice(2), log: (line: string) => void = console.log): Promise<number> {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // No .env.local: the environment may still carry the key.
  }
  const chosen = applyPrewarmFlags(elevenLabsConfig(), argv);
  if (!chosen.ok) {
    log(chosen.error);
    return 1;
  }
  const { config } = chosen;
  const plan = prewarmPlan(config);
  const rate = VOICE_MODELS[config.model].creditsPerCharacter;
  log(`Phrase bank: ${plan.lines} lines, ${plan.characters.toLocaleString('en-US')} characters (${creditsFor(plan.characters, config.model).toLocaleString('en-US')} credits with ${config.model} at ${rate} per character).`);
  log(`Already cached for voice ${config.voiceId}: ${plan.lines - plan.missing.length}.`);
  log(`To generate: ${plan.missing.length} lines, ${plan.missingCharacters.toLocaleString('en-US')} characters, about ${plan.missingCredits.toLocaleString('en-US')} credits.`);
  if (!plan.missing.length) {
    log('Nothing to do.');
    return 0;
  }
  if (!argv.includes('--yes')) {
    log('Nothing was sent. Run `npm run voice:prewarm -- --yes` to generate them.');
    return 0;
  }
  if (!config.apiKey) {
    log('ELEVENLABS_API_KEY is not set in .env.local, so nothing can be generated.');
    return 1;
  }
  // The chosen voice and model become the defaults `speak` uses for these clips.
  const result = await prewarm(plan, { ...defaultVoiceDeps(), config }, log);
  log(`Generated ${result.made} clips into data/voice/.`);
  return result.stopped ? 1 : 0;
}

// Run only when started as a script (npm run voice:prewarm), not when a test imports it.
if (/voice-prewarm\.[cm]?[jt]s$/.test(process.argv[1] ?? '')) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error);
      process.exitCode = 1;
    }
  );
}
