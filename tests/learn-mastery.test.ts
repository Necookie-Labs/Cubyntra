/**
 * Cubyntra - Stage mastery, streaks and graduation rules
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import { getMethod } from '../src/tutor';
import { MAX_STAGE_RECORDS } from '../src/lib/studentProfile';
import { METHOD_INFO } from '../src/app-shell/methodInfo';
import {
  METHOD_STAGE_IDS,
  STAGE_RECORDS_KEPT,
  addActiveDay,
  completedStage,
  currentStreak,
  graduationSuggestion,
  isBeginnerMastered,
  isStageMastered,
  isTwoLookMastered,
  localDay,
  longestStreak,
  masteredStages,
  recentDays,
  recordStage,
  stageIdsFor,
  stageStatus,
  type StageRecords,
} from '../src/learn/mastery';
import type { HintUse } from '../src/learn/types';

const mastered: HintUse[] = [0, 1, 2];

function allMastered(method: 'beginner' | 'cfop', ids: readonly string[]): Record<string, HintUse[]> {
  return Object.fromEntries(ids.map((id) => [`${method}/${id}`, mastered]));
}

describe('stage lists', () => {
  it('match the tutor engine and the UI', () => {
    expect(stageIdsFor('beginner')).toEqual(getMethod('beginner').stages.map((s) => s.id));
    expect(stageIdsFor('cfop')).toEqual(getMethod('cfop').stages.map((s) => s.id));
    expect(stageIdsFor('cfop', 'full')).toEqual(getMethod('cfop', { lastLayer: 'full' }).stages.map((s) => s.id));
    expect(METHOD_STAGE_IDS.beginner).toEqual(METHOD_INFO.beginner.stages.map((s) => s.id));
    expect(METHOD_STAGE_IDS.cfop).toEqual(METHOD_INFO.cfop.stages.map((s) => s.id));
    expect(STAGE_RECORDS_KEPT).toBe(MAX_STAGE_RECORDS);
  });
});

describe('mastery', () => {
  it('needs 3 of the newest 5 completions without a level-3 hint', () => {
    expect(isStageMastered(undefined)).toBe(false);
    expect(isStageMastered([0, 0])).toBe(false);
    expect(isStageMastered([0, 1, 2])).toBe(true);
    expect(isStageMastered([3, 3, 0, 0, 0])).toBe(true);
    expect(isStageMastered([0, 0, 3, 3, 3])).toBe(false);
    // Old good completions fall out of the window.
    expect(isStageMastered([0, 0, 0, 3, 3, 3, 0, 0])).toBe(false);
    expect(isStageMastered([3, 3, 3, 3, 0, 0, 0])).toBe(true);
  });

  it('says new, started or mastered', () => {
    expect(stageStatus(undefined)).toBe('new');
    expect(stageStatus([])).toBe('new');
    expect(stageStatus([3])).toBe('started');
    expect(stageStatus([0, 0, 0])).toBe('mastered');
  });

  it('records completions newest last and keeps ten', () => {
    let stages: StageRecords = {};
    for (let i = 0; i < 12; i++) stages = recordStage(stages, 'cfop/f2l', (i % 4) as HintUse);
    expect(stages['cfop/f2l']).toEqual([2, 3, 0, 1, 2, 3, 0, 1, 2, 3]);
    expect(recordStage({}, 'beginner/daisy', 1)).toEqual({ 'beginner/daisy': [1] });
  });

  it('lists mastered stages in order and decides whole methods', () => {
    const stages = { 'cfop/f2l': mastered, 'cfop/cross': mastered, 'cfop/auf': [3] as HintUse[] };
    expect(masteredStages(stages, 'cfop', stageIdsFor('cfop'))).toEqual(['cross', 'f2l']);
    expect(isBeginnerMastered(allMastered('beginner', METHOD_STAGE_IDS.beginner))).toBe(true);
    const missingOne = allMastered('beginner', METHOD_STAGE_IDS.beginner.slice(1));
    expect(isBeginnerMastered(missingOne)).toBe(false);
    expect(isTwoLookMastered(allMastered('cfop', ['oll-edges', 'oll-corners', 'pll-corners', 'pll-edges']))).toBe(true);
    expect(isTwoLookMastered(allMastered('cfop', ['oll-edges', 'oll-corners', 'pll-corners']))).toBe(false);
  });

  it('notices when a step finished its stage', () => {
    expect(completedStage({ stage: 'f2l', stageIndex: 1, progressAfter: 1006 })).toBeNull();
    expect(completedStage({ stage: 'f2l', stageIndex: 1, progressAfter: 2000 })).toBe('f2l');
    // A step that also skipped the next stage still records only its own.
    expect(completedStage({ stage: 'pll-edges', stageIndex: 5, progressAfter: 7000 })).toBe('pll-edges');
  });
});

describe('graduation', () => {
  const beginnerDone = allMastered('beginner', METHOD_STAGE_IDS.beginner);
  const twoLookDone = allMastered('cfop', ['oll-edges', 'oll-corners', 'pll-corners', 'pll-edges']);

  it('suggests CFOP once the beginner method is mastered', () => {
    expect(graduationSuggestion({ stages: beginnerDone, methodDefault: 'beginner', lastLayer: '2-look' })).toBe('try-cfop');
    expect(graduationSuggestion({ stages: {}, methodDefault: 'beginner', lastLayer: '2-look' })).toBeNull();
  });

  it('suggests the full last layer once 2-look is mastered on CFOP', () => {
    expect(graduationSuggestion({ stages: twoLookDone, methodDefault: 'cfop', lastLayer: '2-look' })).toBe('full-last-layer');
    expect(graduationSuggestion({ stages: twoLookDone, methodDefault: 'cfop', lastLayer: 'full' })).toBeNull();
    expect(graduationSuggestion({ stages: beginnerDone, methodDefault: 'cfop', lastLayer: '2-look' })).toBeNull();
  });

  it('suggests CFOP first when both are mastered and beginner is still the default', () => {
    const both = { ...beginnerDone, ...twoLookDone };
    expect(graduationSuggestion({ stages: both, methodDefault: 'beginner', lastLayer: '2-look' })).toBe('try-cfop');
  });
});

describe('streaks', () => {
  it('formats local days', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('adds days sorted, once, and keeps the newest', () => {
    expect(addActiveDay(['2026-11-16', '2026-11-14'], '2026-11-15')).toEqual(['2026-11-14', '2026-11-15', '2026-11-16']);
    expect(addActiveDay(['2026-11-16'], '2026-11-16')).toEqual(['2026-11-16']);
    expect(addActiveDay(['2026-11-14', '2026-11-15'], '2026-11-16', 2)).toEqual(['2026-11-15', '2026-11-16']);
  });

  it('counts the current streak back from today, or from yesterday while today is empty', () => {
    const days = ['2026-11-10', '2026-11-14', '2026-11-15', '2026-11-16'];
    expect(currentStreak(days, '2026-11-16')).toBe(3);
    expect(currentStreak(days, '2026-11-17')).toBe(3);
    expect(currentStreak(days, '2026-11-18')).toBe(0);
    expect(currentStreak([], '2026-11-18')).toBe(0);
  });

  it('crosses month and year ends', () => {
    expect(currentStreak(['2025-12-30', '2025-12-31', '2026-01-01'], '2026-01-01')).toBe(3);
    expect(currentStreak(['2026-02-28', '2026-03-01'], '2026-03-01')).toBe(2);
  });

  it('finds the longest streak', () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-10', '2026-11-11'])).toBe(3);
  });

  it('lists recent days oldest first', () => {
    expect(recentDays('2026-03-02', 4)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  });
});
