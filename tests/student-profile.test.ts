/**
 * Cubyntra - Student profile schema
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_NAME_LENGTH,
  STUDENT_PROFILE_VERSION,
  defaultStudentProfile,
  parseStudentProfile,
} from '../src/lib/studentProfile';
import { sampleProfile } from './helpers/studentProfile';

describe('student profile schema', () => {
  it('accepts the default profile and a profile with a solve in progress', () => {
    expect(parseStudentProfile(defaultStudentProfile())).toEqual({ ok: true, profile: defaultStudentProfile() });
    const parsed = parseStudentProfile(JSON.parse(JSON.stringify(sampleProfile())));
    expect(parsed.ok && parsed.profile).toEqual(sampleProfile());
  });

  it('drops unknown fields and trims the name', () => {
    const parsed = parseStudentProfile({ ...defaultStudentProfile(), name: '  Ana ', extra: 'x' });
    expect(parsed.ok && parsed.profile).toEqual({ ...defaultStudentProfile(), name: 'Ana' });
  });

  it.each([
    ['a missing version', { version: undefined }],
    ['a newer version', { version: STUDENT_PROFILE_VERSION + 1 }],
    ['a long name', { name: 'x'.repeat(MAX_NAME_LENGTH + 1) }],
    ['an unknown method', { settings: { ...defaultStudentProfile().settings, methodDefault: 'roux' } }],
    ['a bad theme', { settings: { ...defaultStudentProfile().settings, theme: 'neon' } }],
    ['a bad palette', { palette: { version: 1, colors: {} } }],
    ['negative stats', { stats: { ...defaultStudentProfile().stats, stepsCompleted: -1 } }],
  ])('rejects %s', (_name, patch) => {
    const result = parseStudentProfile({ ...defaultStudentProfile(), ...patch });
    expect(result.ok).toBe(false);
  });

  it('rejects a current solve with a broken cube, grip or attempt list', () => {
    const base = sampleProfile();
    const solve = base.currentSolve!;
    const bad = [
      { ...solve, state: { ...solve.state, U: ['white'] } },
      { ...solve, state: { ...solve.state, F: Array(9).fill('purple') } },
      { ...solve, grip: { top: 'white', front: 'yellow' } },
      { ...solve, stepIndex: 1.5 },
      { ...solve, attempts: Array(21).fill({ result: 'matched' }) },
      { ...solve, attempts: [{ result: 'mismatch', mistakes: ['sneezed'] }] },
      { ...solve, startedAt: 'yesterday' },
    ];
    for (const currentSolve of bad) {
      expect(parseStudentProfile({ ...base, currentSolve }).ok).toBe(false);
    }
  });
});
