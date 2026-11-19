/**
 * Cubyntra - Student profile schema v2 and the migration from v1
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_ACTIVE_DAYS,
  MAX_STAGE_RECORDS,
  STUDENT_PROFILE_VERSION,
  defaultStudentProfile,
  migrateProfileV1,
  parseStudentProfile,
} from '../src/lib/studentProfile';
import { MAX_TIMER_HISTORY } from '../src/learn/types';
import { sampleProfile } from './helpers/studentProfile';

/** A version 1 profile as Phase 7 wrote it. */
function v1Profile() {
  return {
    version: 1,
    name: 'Sam',
    settings: { methodDefault: 'cfop', plainLanguage: false, stickerLetters: true, reducedMotion: false, theme: 'dark' },
    palette: null,
    currentSolve: null,
    stats: { solvesCompleted: 3, stepsCompleted: 40, checkpointsPassed: 38, lastSolveAt: '2026-11-16T09:00:00.000Z' },
  };
}

describe('student profile v2', () => {
  it('is the current version with the learning fields empty by default', () => {
    const profile = defaultStudentProfile();
    expect(STUDENT_PROFILE_VERSION).toBeGreaterThanOrEqual(3);
    expect(profile.settings.lastLayer).toBe('2-look');
    expect(profile.stats.stages).toEqual({});
    expect(profile.stats.activeDays).toEqual([]);
    expect(profile.trainer).toEqual({ turn: 0, cards: {}, set: null });
    expect(profile.timer).toEqual({ history: [] });
  });

  it('migrates a version 1 profile, keeping everything it had', () => {
    const parsed = parseStudentProfile(v1Profile());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.profile.version).toBe(STUDENT_PROFILE_VERSION);
    expect(parsed.profile.name).toBe('Sam');
    expect(parsed.profile.settings).toEqual({
      methodDefault: 'cfop',
      plainLanguage: false,
      stickerLetters: true,
      reducedMotion: false,
      theme: 'dark',
      lastLayer: '2-look',
      voiceMode: 'off',
      voiceRate: 1,
      voiceMoves: 'words',
    });
    expect(parsed.profile.stats).toEqual({ ...v1Profile().stats, stages: {}, activeDays: [] });
    expect(parsed.profile.trainer).toEqual({ turn: 0, cards: {}, set: null });
    expect(parsed.profile.timer).toEqual({ history: [] });
  });

  it('migrates a v1 solve in progress', () => {
    const solve = sampleProfile().currentSolve;
    const parsed = parseStudentProfile({ ...v1Profile(), currentSolve: solve });
    expect(parsed.ok && parsed.profile.currentSolve).toEqual(solve);
  });

  it('leaves other versions and non-objects alone when migrating', () => {
    expect(migrateProfileV1('x')).toBe('x');
    const v2 = defaultStudentProfile();
    expect(migrateProfileV1(v2)).toBe(v2);
    expect(parseStudentProfile({ ...v1Profile(), version: 4 }).ok).toBe(false);
  });

  it('still rejects a broken v1 profile after migration', () => {
    expect(parseStudentProfile({ ...v1Profile(), stats: { ...v1Profile().stats, solvesCompleted: -1 } }).ok).toBe(false);
    expect(parseStudentProfile({ ...v1Profile(), settings: 'x' }).ok).toBe(false);
  });

  it('round-trips a full v2 profile', () => {
    const profile = {
      ...sampleProfile(),
      settings: { ...sampleProfile().settings, lastLayer: 'full' as const },
      stats: {
        ...sampleProfile().stats,
        stages: { 'cfop/f2l': [0, 1, 3] as (0 | 1 | 2 | 3)[], 'beginner/daisy': [0] as (0 | 1 | 2 | 3)[] },
        activeDays: ['2026-11-15', '2026-11-16'],
      },
      trainer: { turn: 4, cards: { 'oll-21': { box: 2 as const, due: 7, seen: 2, missed: 0 } }, set: 'oll' as const },
      timer: { history: [{ id: 'abc123', ms: 41230, penalty: '+2' as const, at: '2026-11-16T10:00:00.000Z', scramble: "R U R'" }] },
      currentSolve: { ...sampleProfile().currentSolve!, stageHint: 2 as const },
      closedSolveStartedAt: '2026-11-16T09:00:00.000Z',
    };
    const parsed = parseStudentProfile(JSON.parse(JSON.stringify(profile)));
    expect(parsed.ok && parsed.profile).toEqual(profile);
  });

  it('gives a timer solve saved before ids existed a stable id', () => {
    const solve = { ms: 41230, penalty: 'none' as const, at: '2026-11-16T10:00:00.000Z', scramble: '' };
    const withOld = { ...sampleProfile(), timer: { history: [solve, solve] } };
    const first = parseStudentProfile(withOld);
    const again = parseStudentProfile(withOld);
    const ids = first.ok ? first.profile.timer.history.map((s) => s.id) : [];
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(again.ok && again.profile.timer.history.map((s) => s.id)).toEqual(ids);
    expect(parseStudentProfile({ ...sampleProfile(), timer: { history: [{ ...solve, id: 'no spaces!' }] } }).ok).toBe(false);
  });

  it('sorts active days and drops repeats', () => {
    const base = defaultStudentProfile();
    const parsed = parseStudentProfile({ ...base, stats: { ...base.stats, activeDays: ['2026-11-16', '2026-11-15', '2026-11-16'] } });
    expect(parsed.ok && parsed.profile.stats.activeDays).toEqual(['2026-11-15', '2026-11-16']);
  });

  const base = defaultStudentProfile();
  it.each([
    ['an unknown last layer', { settings: { ...base.settings, lastLayer: '3-look' } }],
    ['a stage key without a method', { stats: { ...base.stats, stages: { f2l: [0] } } }],
    ['a stage key with an unknown method', { stats: { ...base.stats, stages: { 'roux/f2b': [0] } } }],
    ['a hint level of 4', { stats: { ...base.stats, stages: { 'cfop/f2l': [4] } } }],
    ['too many stage records', { stats: { ...base.stats, stages: { 'cfop/f2l': Array(MAX_STAGE_RECORDS + 1).fill(0) } } }],
    ['a day that is not a day', { stats: { ...base.stats, activeDays: ['yesterday'] } }],
    ['too many days', { stats: { ...base.stats, activeDays: Array(MAX_ACTIVE_DAYS + 1).fill('2026-01-01') } }],
    ['a Leitner box of 6', { trainer: { turn: 0, cards: { 'oll-01': { box: 6, due: 0, seen: 0, missed: 0 } }, set: null } }],
    ['a Leitner box of 0', { trainer: { turn: 0, cards: { 'oll-01': { box: 0, due: 0, seen: 0, missed: 0 } }, set: null } }],
    ['a bad case id', { trainer: { turn: 0, cards: { 'OLL 1': { box: 1, due: 0, seen: 0, missed: 0 } }, set: null } }],
    ['an unknown trainer set', { trainer: { turn: 0, cards: {}, set: 'roux' } }],
    ['a missing trainer', { trainer: undefined }],
    ['an unknown penalty', { timer: { history: [{ ms: 1, penalty: '+4', at: '2026-11-16T10:00:00Z', scramble: '' }] } }],
    ['a negative time', { timer: { history: [{ ms: -1, penalty: 'none', at: '2026-11-16T10:00:00Z', scramble: '' }] } }],
    [
      'too long a history',
      { timer: { history: Array(MAX_TIMER_HISTORY + 1).fill({ ms: 1, penalty: 'none', at: '2026-11-16T10:00:00Z', scramble: '' }) } },
    ],
    ['a stage hint of 5', { currentSolve: { ...sampleProfile().currentSolve, stageHint: 5 } }],
  ])('rejects %s', (_name, patch) => {
    expect(parseStudentProfile({ ...base, ...patch }).ok).toBe(false);
  });
});
