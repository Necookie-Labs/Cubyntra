/**
 * Cubyntra - Stage Mastery, Streaks and Graduation
 * Necookie Labs (c) 2026
 *
 * **Recording.** When a checked step finishes the stage it was in, the guided solve records the
 * highest coach hint asked for during that stage (0 = none, 3 = "Show the moves") under
 * `<method>/<stage>` in `stats.stages`. Stages the cube skipped (already done by an earlier
 * step) are not recorded: nothing was practised.
 *
 * **Mastered.** A stage is mastered when, among its newest `MASTERY_WINDOW` (5) recorded
 * completions, at least `MASTERY_NEEDED` (3) were done without a level-3 hint. Asking what to
 * look for or why it works (levels 1 and 2) is fine; needing the exact moves is not. A method is
 * mastered when every one of its stages is.
 *
 * **Streaks.** A day counts when a guided solve was finished or a trainer case was answered on
 * it (local calendar days). The current streak runs back from today, or from yesterday when
 * today has nothing yet, so the streak is not lost before the day is over.
 *
 * **Graduation.** Beginner's method mastered while it is still the default: suggest CFOP with the
 * 2-look last layer. CFOP's four 2-look stages mastered while the last layer is still 2-look:
 * suggest the full last layer. Pure: no DOM or React.
 */

import type { LastLayerMode, MethodId } from '../tutor/types';
import type { HintUse } from './types';

export const MASTERY_WINDOW = 5;
export const MASTERY_NEEDED = 3;
/** Completions kept per stage in the profile. */
export const STAGE_RECORDS_KEPT = 10;

/** Stage ids of each method as the engine runs it (tests keep these in step with `getMethod`). */
export const METHOD_STAGE_IDS = {
  beginner: [
    'daisy',
    'white-cross',
    'white-corners',
    'middle-edges',
    'yellow-cross',
    'yellow-edges',
    'yellow-corners-position',
    'yellow-corners-orient',
  ],
  cfop: ['cross', 'f2l', 'oll-edges', 'oll-corners', 'pll-corners', 'pll-edges', 'auf'],
  cfopFull: ['cross', 'f2l', 'oll', 'pll', 'auf'],
} as const;

/** The CFOP stages that make up the 2-look last layer. */
export const TWO_LOOK_STAGES = ['oll-edges', 'oll-corners', 'pll-corners', 'pll-edges'] as const;

export function stageIdsFor(method: MethodId, lastLayer: LastLayerMode = '2-look'): readonly string[] {
  if (method === 'beginner') return METHOD_STAGE_IDS.beginner;
  return lastLayer === 'full' ? METHOD_STAGE_IDS.cfopFull : METHOD_STAGE_IDS.cfop;
}

export function stageKey(method: MethodId, stage: string): string {
  return `${method}/${stage}`;
}

export type StageRecords = Readonly<Record<string, readonly HintUse[]>>;

/** The stage records with one more completion of `key`, keeping the newest `STAGE_RECORDS_KEPT`. */
export function recordStage(stages: StageRecords, key: string, hint: HintUse): Record<string, HintUse[]> {
  const records = [...(stages[key] ?? []), hint].slice(-STAGE_RECORDS_KEPT);
  return { ...(stages as Record<string, HintUse[]>), [key]: records };
}

/** True when at least 3 of the newest 5 completions needed no level-3 hint. */
export function isStageMastered(records: readonly HintUse[] | undefined): boolean {
  if (!records) return false;
  return records.slice(-MASTERY_WINDOW).filter((h) => h < 3).length >= MASTERY_NEEDED;
}

export type StageStatus = 'mastered' | 'started' | 'new';

export function stageStatus(records: readonly HintUse[] | undefined): StageStatus {
  if (isStageMastered(records)) return 'mastered';
  return records && records.length ? 'started' : 'new';
}

/** Mastered stages of a method, in stage order. */
export function masteredStages(stages: StageRecords, method: MethodId, ids: readonly string[]): string[] {
  return ids.filter((id) => isStageMastered(stages[stageKey(method, id)]));
}

export function isBeginnerMastered(stages: StageRecords): boolean {
  return METHOD_STAGE_IDS.beginner.every((id) => isStageMastered(stages[stageKey('beginner', id)]));
}

export function isTwoLookMastered(stages: StageRecords): boolean {
  return TWO_LOOK_STAGES.every((id) => isStageMastered(stages[stageKey('cfop', id)]));
}

/**
 * The stage a finished step completed, if it completed one. `progressAfter` is the engine's
 * progress value (`stageIndex * 1000 + within`), so the step left its stage when the thousands
 * went up.
 */
export function completedStage(plan: { stage: string; stageIndex: number; progressAfter: number }): string | null {
  return Math.floor(plan.progressAfter / 1000) > plan.stageIndex ? plan.stage : null;
}

// ---------------------------------------------------------------------------------------------
// Graduation
// ---------------------------------------------------------------------------------------------

export type GraduationSuggestion = 'try-cfop' | 'full-last-layer' | null;

export function graduationSuggestion(input: {
  stages: StageRecords;
  methodDefault: MethodId;
  lastLayer: LastLayerMode;
}): GraduationSuggestion {
  if (input.methodDefault === 'beginner' && isBeginnerMastered(input.stages)) return 'try-cfop';
  if (input.methodDefault === 'cfop' && input.lastLayer === '2-look' && isTwoLookMastered(input.stages)) {
    return 'full-last-layer';
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

/** The local calendar day of a date, `YYYY-MM-DD`. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const dayNumber = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

const dayFromNumber = (n: number) => {
  const date = new Date(n * 86_400_000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

/** The active days with `day` added: sorted, unique, the newest `limit` kept. */
export function addActiveDay(days: readonly string[], day: string, limit = 400): string[] {
  return [...new Set([...days, day])].sort().slice(-limit);
}

/** Days in a row with activity, ending today (or yesterday, while today is still empty). */
export function currentStreak(days: readonly string[], today: string): number {
  const set = new Set(days.map(dayNumber));
  let n = dayNumber(today);
  if (!set.has(n)) n -= 1;
  let streak = 0;
  while (set.has(n)) {
    streak++;
    n--;
  }
  return streak;
}

/** The longest run of consecutive active days. */
export function longestStreak(days: readonly string[]): number {
  const numbers = [...new Set(days.map(dayNumber))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < numbers.length; i++) {
    run = i > 0 && numbers[i] === numbers[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** The `count` days ending with `today`, oldest first. */
export function recentDays(today: string, count: number): string[] {
  const end = dayNumber(today);
  return Array.from({ length: count }, (_, i) => dayFromNumber(end - count + 1 + i));
}
