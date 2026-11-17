/**
 * Cubyntra - Student profile schema v3 (voice settings) and the migration from v2
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  STUDENT_PROFILE_VERSION,
  defaultStudentProfile,
  migrateProfileV2,
  parseStudentProfile,
} from '../src/lib/studentProfile';
import { applyProfileOps } from '../src/lib/profileOps';
import { sampleProfile } from './helpers/studentProfile';

/** A version 2 profile as Phase 10 wrote it: no voice settings. */
function v2Profile() {
  const profile = JSON.parse(JSON.stringify(sampleProfile()));
  const { voiceMode: _m, voiceRate: _r, voiceMoves: _v, ...settings } = profile.settings;
  return { ...profile, version: 2, settings: { ...settings, plainLanguage: false } };
}

describe('student profile v3 (voice)', () => {
  it('is version 3 with voice off, normal speed and moves in words by default', () => {
    expect(STUDENT_PROFILE_VERSION).toBe(3);
    expect(defaultStudentProfile().settings).toMatchObject({ voiceMode: 'off', voiceRate: 1, voiceMoves: 'words' });
  });

  it('migrates a version 2 profile, keeping everything it had', () => {
    const old = v2Profile();
    expect(old.settings.voiceMode).toBeUndefined();
    const parsed = parseStudentProfile(old);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.profile.version).toBe(3);
    expect(parsed.profile.settings).toEqual({ ...old.settings, voiceMode: 'off', voiceRate: 1, voiceMoves: 'words' });
    expect(parsed.profile.currentSolve).toEqual(old.currentSolve);
  });

  it('leaves other versions alone when migrating', () => {
    const v3 = defaultStudentProfile();
    expect(migrateProfileV2(v3)).toBe(v3);
    expect(migrateProfileV2(null)).toBeNull();
  });

  it('round-trips the voice settings', () => {
    const profile = { ...sampleProfile(), settings: { ...DEFAULT_SETTINGS, voiceMode: 'elevenlabs' as const, voiceRate: 1.25 as const, voiceMoves: 'notation' as const } };
    const parsed = parseStudentProfile(JSON.parse(JSON.stringify(profile)));
    expect(parsed.ok && parsed.profile).toEqual(profile);
  });

  it('changes voice settings with a setSettings operation', () => {
    const next = applyProfileOps(defaultStudentProfile(), [{ op: 'setSettings', settings: { voiceMoves: 'notation', voiceMode: 'device' } }]);
    expect(parseStudentProfile(next).ok).toBe(true);
    expect(next.settings).toMatchObject({ voiceMode: 'device', voiceMoves: 'notation', voiceRate: 1 });
  });

  const base = defaultStudentProfile();
  it.each([
    ['an unknown voice mode', { voiceMode: 'robot' }],
    ['a speed that is not offered', { voiceRate: 3 }],
    ['an unknown move style', { voiceMoves: 'letters' }],
    ['a missing voice mode', { voiceMode: undefined }],
  ])('rejects %s', (_name, patch) => {
    expect(parseStudentProfile({ ...base, settings: { ...base.settings, ...patch } }).ok).toBe(false);
  });
});
