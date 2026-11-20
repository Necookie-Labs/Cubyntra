/**
 * Cubyntra - Student profile schema v5 (chat and voice-picker settings) and the migration from v4
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  STUDENT_PROFILE_VERSION,
  defaultStudentProfile,
  migrateProfileV4,
  parseStudentProfile,
} from '../src/lib/studentProfile';
import { applyProfileOps } from '../src/lib/profileOps';
import { CURATED_VOICES, DEFAULT_VOICE_ID } from '../src/voice/catalog';
import { sampleProfile } from './helpers/studentProfile';

const ALICE = 'Xb7hH8MSUJpSbSDYk0k2';

function v4Profile() {
  const profile = JSON.parse(JSON.stringify(sampleProfile()));
  profile.version = 4;
  for (const key of ['voiceId', 'voiceQuality', 'talkToCoach', 'chatAutoSend']) delete profile.settings[key];
  return profile;
}

describe('student profile v5 (chat and voice picker)', () => {
  it('is version 5, with talking to the coach off, auto-send on, Alice and high quality', () => {
    expect(STUDENT_PROFILE_VERSION).toBe(5);
    const { settings } = defaultStudentProfile();
    expect(settings).toMatchObject({ talkToCoach: false, chatAutoSend: true, voiceId: ALICE, voiceQuality: 'high' });
    expect(DEFAULT_VOICE_ID).toBe(ALICE);
  });

  it('migrates a version 4 profile, keeping everything it had', () => {
    const v4 = v4Profile();
    v4.settings.voiceMode = 'elevenlabs';
    const parsed = parseStudentProfile(v4);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.profile.version).toBe(5);
    expect(parsed.profile.settings).toEqual({
      ...v4.settings,
      voiceId: ALICE,
      voiceQuality: 'high',
      talkToCoach: false,
      chatAutoSend: true,
    });
    expect(parsed.profile.currentSolve).toEqual(v4.currentSolve);
    expect(parsed.profile.savedCubes).toEqual(v4.savedCubes);
  });

  it('migrates a version 1 profile all the way', () => {
    const v1 = {
      version: 1,
      name: 'Sam',
      settings: { methodDefault: 'cfop', plainLanguage: true, stickerLetters: false, reducedMotion: false, theme: 'system' },
      palette: null,
      currentSolve: null,
      stats: { solvesCompleted: 1, stepsCompleted: 2, checkpointsPassed: 2, lastSolveAt: null },
    };
    const parsed = parseStudentProfile(v1);
    expect(parsed.ok && parsed.profile.version).toBe(5);
    expect(parsed.ok && parsed.profile.settings).toMatchObject({ talkToCoach: false, chatAutoSend: true, voiceQuality: 'high' });
  });

  it('leaves other versions alone when migrating', () => {
    const current = defaultStudentProfile();
    expect(migrateProfileV4(current)).toBe(current);
    expect(migrateProfileV4('x')).toBe('x');
  });

  it('round-trips every curated voice and both qualities', () => {
    for (const voice of CURATED_VOICES) {
      for (const voiceQuality of ['high', 'fast'] as const) {
        const profile = { ...sampleProfile(), settings: { ...DEFAULT_SETTINGS, voiceId: voice.id, voiceQuality, talkToCoach: true, chatAutoSend: false } };
        const parsed = parseStudentProfile(JSON.parse(JSON.stringify(profile)));
        expect(parsed.ok && parsed.profile).toEqual(profile);
      }
    }
  });

  it.each([
    ['a voice id with symbols', { voiceId: '../../etc' }],
    ['an empty voice id', { voiceId: '' }],
    ['a number as voice id', { voiceId: 7 }],
    ['an unknown quality', { voiceQuality: 'ultra' }],
    ['talkToCoach as text', { talkToCoach: 'yes' }],
    ['chatAutoSend missing', { chatAutoSend: undefined }],
  ])('rejects %s', (_name, patch) => {
    const profile = { ...defaultStudentProfile(), settings: { ...DEFAULT_SETTINGS, ...patch } };
    expect(parseStudentProfile(JSON.parse(JSON.stringify(profile))).ok).toBe(false);
  });

  it('saves the new settings with the setSettings op', () => {
    const next = applyProfileOps(defaultStudentProfile(), [{ op: 'setSettings', settings: { talkToCoach: true, voiceQuality: 'fast' } }]);
    const parsed = parseStudentProfile(JSON.parse(JSON.stringify(next)));
    expect(parsed.ok && parsed.profile.settings).toMatchObject({ talkToCoach: true, voiceQuality: 'fast', chatAutoSend: true });
  });
});
