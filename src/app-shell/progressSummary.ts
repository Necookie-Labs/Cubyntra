/**
 * Cubyntra - Progress Summary
 * Necookie Labs (c) 2026
 *
 * The few numbers Home and Progress both show: blocks placed (stages mastered over both
 * methods), the day streak and the cases learned in the trainer.
 */

import type { StudentProfile } from '@/lib/studentProfile';
import { currentStreak, stageKey, stageStatus } from '@/learn/mastery';
import { setProgress } from '@/learn/leitner';
import { TRAINER_SETS } from '@/learn/trainerSets';
import { METHOD_INFO } from './methodInfo';

/** CFOP's full last-layer stages, shown on the CFOP island once that setting is in use. */
export const FULL_LAST_LAYER_STAGES: readonly { id: string; name: string }[] = [
  { id: 'oll', name: 'Yellow top in one look' },
  { id: 'pll', name: 'Top layer in one look' },
];

/** The CFOP stages the progress world shows: the full last-layer ones once they are in use. */
export function cfopWorldStages(profile: Pick<StudentProfile, 'settings' | 'stats'>): readonly { id: string; name: string }[] {
  const used =
    profile.settings.lastLayer === 'full' ||
    FULL_LAST_LAYER_STAGES.some((s) => (profile.stats.stages[stageKey('cfop', s.id)]?.length ?? 0) > 0);
  return used ? [...METHOD_INFO.cfop.stages, ...FULL_LAST_LAYER_STAGES] : METHOD_INFO.cfop.stages;
}

export interface ProgressSummary {
  blocks: number;
  totalBlocks: number;
  /** Null until the browser's date is known. */
  streak: number | null;
  casesLearned: number;
  caseTotal: number;
}

export function summarizeProgress(
  profile: Pick<StudentProfile, 'settings' | 'stats' | 'trainer'>,
  today: string | null
): ProgressSummary {
  const keys = [
    ...METHOD_INFO.beginner.stages.map((s) => stageKey('beginner', s.id)),
    ...cfopWorldStages(profile).map((s) => stageKey('cfop', s.id)),
  ];
  let casesLearned = 0;
  let caseTotal = 0;
  for (const set of TRAINER_SETS) {
    casesLearned += setProgress(profile.trainer, set.cases.map((c) => c.id)).learned;
    caseTotal += set.cases.length;
  }
  return {
    blocks: keys.filter((key) => stageStatus(profile.stats.stages[key]) === 'mastered').length,
    totalBlocks: keys.length,
    streak: today ? currentStreak(profile.stats.activeDays, today) : null,
    casesLearned,
    caseTotal,
  };
}
