/**
 * Cubyntra - Learning Feature Types
 * Necookie Labs (c) 2026
 *
 * The shapes the trainer, the timer and the progress world keep in the student profile. Kept
 * free of the case tables so the profile schema (shared with the `/api/student` route) stays
 * light. Pure TypeScript: no DOM, Node or React imports.
 */

/** The highest coach hint asked for: 0 = none, 3 = "Show the moves". */
export type HintUse = 0 | 1 | 2 | 3;

export const TRAINER_SET_IDS = ['beginner', 'f2l', 'last-layer-2look', 'oll', 'pll'] as const;
export type TrainerSetId = (typeof TRAINER_SET_IDS)[number];

/** Leitner boxes run from 1 (just missed or new) to `MAX_BOX` (known well). */
export const MAX_BOX = 5;
export type LeitnerBox = 1 | 2 | 3 | 4 | 5;

/** One case the student has drilled. `due` counts drills, not days, so it is deterministic. */
export interface TrainerCard {
  box: LeitnerBox;
  /** The drill number at which the case is due again (see `TrainerState.turn`). */
  due: number;
  seen: number;
  missed: number;
}

export interface TrainerState {
  /** Drills answered so far, over every set. */
  turn: number;
  /** By case id. A case that was never drilled has no card. */
  cards: Record<string, TrainerCard>;
  /** The set picked last, so the trainer opens on it again. */
  set: TrainerSetId | null;
}

export type Penalty = 'none' | '+2' | 'DNF';

/** One timed solve. `ms` is the time on the clock, without the +2. */
export interface TimerSolve {
  ms: number;
  penalty: Penalty;
  /** ISO date the solve finished. */
  at: string;
  scramble: string;
}

export interface TimerState {
  /** Oldest first, at most `MAX_TIMER_HISTORY`. */
  history: TimerSolve[];
}

export const MAX_TIMER_HISTORY = 100;

export function defaultTrainerState(): TrainerState {
  return { turn: 0, cards: {}, set: null };
}

export function defaultTimerState(): TimerState {
  return { history: [] };
}
