/**
 * Cubyntra - Solve Timer Rules
 * Necookie Labs (c) 2026
 *
 * The timer's logic, apart from the screen so it can be tested to the millisecond:
 *
 * - **Inspection** (WCA Regulation A3a1 and A3d1): 15 seconds to look at the scramble. Starting
 *   the solve after 15 s but before 17 s costs 2 seconds (+2); at 17 s or later the solve is a
 *   DNF (did not finish). Visual cues at 8 s and 12 s stand in for the judge's calls.
 * - **Times** are truncated to hundredths of a second, as a WCA timer shows them (A5b3).
 * - **Averages** (WCA 9f8, and the usual reading of it for 12): of the last 5 or 12 solves, the
 *   best and the worst are dropped and the rest are averaged, rounded to the nearest hundredth.
 *   A DNF counts as the worst result, so one DNF is dropped; two or more make the average a DNF.
 * - **Controls**: tap (or press space) to start inspecting; hold for `ARM_MS` until the timer
 *   is armed, release to start; any press stops it. The release after the stopping press is
 *   swallowed so it does not start a new inspection.
 */

import type { Penalty, TimerSolve } from './types';

export const INSPECTION_MS = 15_000;
export const DNF_AFTER_MS = 17_000;
export const PLUS_TWO_MS = 2_000;
/** How long a press must be held before the timer is ready to start. */
export const ARM_MS = 300;
/** The visual "8 seconds" and "12 seconds" calls. */
export const CUE_TIMES_MS = [8_000, 12_000] as const;

export type AverageResult = number | 'DNF' | null;

/** Truncates to hundredths of a second (WCA timers show hundredths and drop the rest). */
export function truncateToHundredths(ms: number): number {
  return Math.floor(ms / 10) * 10;
}

/** The penalty for starting the solve `elapsedMs` after inspection began. */
export function inspectionPenalty(elapsedMs: number): Penalty {
  if (elapsedMs < INSPECTION_MS) return 'none';
  if (elapsedMs < DNF_AFTER_MS) return '+2';
  return 'DNF';
}

export type InspectionCue = 'none' | '8s' | '12s' | 'plus-two' | 'dnf';

/** What the inspection display should call out after `elapsedMs`. */
export function inspectionCue(elapsedMs: number): InspectionCue {
  if (elapsedMs >= DNF_AFTER_MS) return 'dnf';
  if (elapsedMs >= INSPECTION_MS) return 'plus-two';
  if (elapsedMs >= CUE_TIMES_MS[1]) return '12s';
  if (elapsedMs >= CUE_TIMES_MS[0]) return '8s';
  return 'none';
}

/** Whole seconds of inspection left, counting down from 15 (0 once time is up). */
export function inspectionSecondsLeft(elapsedMs: number): number {
  return Math.max(0, Math.ceil((INSPECTION_MS - elapsedMs) / 1000));
}

/** The time that counts: +2 added, null for a DNF. */
export function effectiveMs(solve: Pick<TimerSolve, 'ms' | 'penalty'>): number | null {
  if (solve.penalty === 'DNF') return null;
  return solve.ms + (solve.penalty === '+2' ? PLUS_TWO_MS : 0);
}

/**
 * The trimmed average of exactly these solves (5 or 12), dropping the best and the worst.
 * Null when there are fewer than 3 solves.
 */
export function trimmedAverage(solves: readonly Pick<TimerSolve, 'ms' | 'penalty'>[]): AverageResult {
  if (solves.length < 3) return null;
  const times = solves.map(effectiveMs);
  const dnfs = times.filter((t) => t === null).length;
  if (dnfs > 1) return 'DNF';
  const sorted = times.map((t) => t ?? Infinity).sort((a, b) => a - b);
  const kept = sorted.slice(1, -1);
  const mean = kept.reduce((sum, t) => sum + t, 0) / kept.length;
  return Math.round(mean / 10) * 10;
}

/** The average of the newest `n` solves, or null with fewer than `n`. */
export function currentAverage(history: readonly TimerSolve[], n: number): AverageResult {
  return history.length < n ? null : trimmedAverage(history.slice(-n));
}

/** True when `a` is a better result than `b` (a time beats a DNF, null beats nothing). */
function better(a: AverageResult, b: AverageResult): boolean {
  if (a === null) return false;
  if (b === null) return true;
  if (a === 'DNF') return false;
  if (b === 'DNF') return true;
  return a < b;
}

/** The best average of `n` consecutive solves anywhere in the history. */
export function bestAverage(history: readonly TimerSolve[], n: number): AverageResult {
  let best: AverageResult = null;
  for (let end = n; end <= history.length; end++) {
    const avg = trimmedAverage(history.slice(end - n, end));
    if (better(avg, best)) best = avg;
  }
  return best;
}

/** The best single solve (DNFs never count), or null. */
export function bestSingle(history: readonly TimerSolve[]): number | null {
  let best: number | null = null;
  for (const solve of history) {
    const t = effectiveMs(solve);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

/** `9.87`, `42.10`, `1:03.45`. */
export function formatTime(ms: number): string {
  const total = truncateToHundredths(Math.max(0, ms));
  const minutes = Math.floor(total / 60_000);
  const rest = total - minutes * 60_000;
  const seconds = Math.floor(rest / 1000);
  const hundredths = Math.floor((rest % 1000) / 10);
  const cs = String(hundredths).padStart(2, '0');
  return minutes ? `${minutes}:${String(seconds).padStart(2, '0')}.${cs}` : `${seconds}.${cs}`;
}

/** A solve as a results list shows it: `12.34`, `14.34+` (the +2 included), `DNF`. */
export function formatSolve(solve: Pick<TimerSolve, 'ms' | 'penalty'>): string {
  const t = effectiveMs(solve);
  if (t === null) return 'DNF';
  return solve.penalty === '+2' ? `${formatTime(t)}+` : formatTime(t);
}

export function formatAverage(avg: AverageResult): string {
  if (avg === null) return '–';
  return avg === 'DNF' ? 'DNF' : formatTime(avg);
}

// ---------------------------------------------------------------------------------------------
// The press / hold / release machine
// ---------------------------------------------------------------------------------------------

export type TimerPhase = 'idle' | 'inspecting' | 'holding' | 'armed' | 'running' | 'stopping';

export interface TimerMachine {
  phase: TimerPhase;
  /** When inspection began. */
  inspectionStart: number | null;
  /** When the current press began (holding). */
  pressedAt: number | null;
  /** When the solve started. */
  startedAt: number | null;
  /** The penalty earned by starting late. */
  penalty: Penalty;
  /** The finished solve, set on the event that finishes it and kept until the next one. */
  result: { ms: number; penalty: Penalty } | null;
}

export type TimerEvent =
  | { type: 'press'; at: number }
  | { type: 'release'; at: number }
  | { type: 'tick'; at: number }
  | { type: 'cancel' };

export const INITIAL_TIMER: TimerMachine = {
  phase: 'idle',
  inspectionStart: null,
  pressedAt: null,
  startedAt: null,
  penalty: 'none',
  result: null,
};

const dnf = (m: TimerMachine): TimerMachine => ({
  ...INITIAL_TIMER,
  result: { ms: 0, penalty: 'DNF' },
  // Keep the phase busy until the student lets go, if a press is in progress.
  phase: m.phase === 'holding' || m.phase === 'armed' ? 'stopping' : 'idle',
});

/** The timer after one event. Pure: the same events at the same times give the same result. */
export function timerReducer(m: TimerMachine, event: TimerEvent): TimerMachine {
  if (event.type === 'cancel') {
    return m.phase === 'idle' ? m : { ...INITIAL_TIMER, result: m.result };
  }
  const { at } = event;
  const inspecting = m.phase === 'inspecting' || m.phase === 'holding' || m.phase === 'armed';
  if (inspecting && m.inspectionStart !== null && at - m.inspectionStart >= DNF_AFTER_MS) return dnf(m);

  switch (m.phase) {
    case 'idle':
      return event.type === 'release' ? { ...INITIAL_TIMER, phase: 'inspecting', inspectionStart: at, result: m.result } : m;
    case 'inspecting':
      return event.type === 'press' ? { ...m, phase: 'holding', pressedAt: at } : m;
    case 'holding':
      if (event.type === 'release') return { ...m, phase: 'inspecting', pressedAt: null };
      if (m.pressedAt !== null && at - m.pressedAt >= ARM_MS) return { ...m, phase: 'armed' };
      return m;
    case 'armed': {
      if (event.type !== 'release') return m;
      const penalty = inspectionPenalty(at - (m.inspectionStart ?? at));
      if (penalty === 'DNF') return dnf({ ...m, phase: 'idle' });
      return { ...m, phase: 'running', pressedAt: null, startedAt: at, penalty };
    }
    case 'running':
      if (event.type !== 'press' || m.startedAt === null) return m;
      return {
        ...INITIAL_TIMER,
        phase: 'stopping',
        result: { ms: truncateToHundredths(at - m.startedAt), penalty: m.penalty },
      };
    case 'stopping':
      return event.type === 'release' ? { ...m, phase: 'idle' } : m;
  }
}
