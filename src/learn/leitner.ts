/**
 * Cubyntra - Leitner Boxes for the Trainer
 * Necookie Labs (c) 2026
 *
 * Spaced repetition counted in drills rather than days, so it is deterministic and works the
 * same in a five-minute session as over a week:
 *
 * - A case starts in box 1 the first time it is drilled.
 * - Got it: up one box (at most 5). Missed it: back to box 1.
 * - A case in box b comes back `BOX_GAP[b]` drills later. Box 1 comes back after 2 drills, so a
 *   missed case returns almost at once; box 5 waits 32 drills.
 * - The next case is the one most overdue (lowest `due`, then lowest box, then table order). When
 *   nothing is due, a case never drilled is introduced in table order; when every case has been
 *   drilled, the one due soonest comes up. The case just drilled is not repeated straight away
 *   if any other case is available.
 *
 * A case counts as learned from box `LEARNED_BOX` on: it was got right at least twice in a row.
 */

import { MAX_BOX, type LeitnerBox, type TrainerCard, type TrainerState } from './types';

/** Drills until a case in each box comes back (index = box). */
export const BOX_GAP: readonly number[] = [0, 2, 4, 8, 16, 32];

export const LEARNED_BOX: LeitnerBox = 3;

/** The card after one answer at drill number `turn` (the drill being answered). */
export function reviewCard(card: TrainerCard | undefined, correct: boolean, turn: number): TrainerCard {
  const before = card ?? { box: 1 as LeitnerBox, due: turn, seen: 0, missed: 0 };
  // A brand-new card answered correctly moves to box 2, like any other box-1 card.
  const box = (correct ? Math.min(MAX_BOX, before.box + 1) : 1) as LeitnerBox;
  return {
    box,
    due: turn + BOX_GAP[box],
    seen: before.seen + 1,
    missed: before.missed + (correct ? 0 : 1),
  };
}

/** The trainer state after answering `caseId` (got it or missed it). Advances the drill count. */
export function answerDrill(state: TrainerState, caseId: string, correct: boolean): TrainerState {
  return {
    ...state,
    turn: state.turn + 1,
    cards: { ...state.cards, [caseId]: reviewCard(state.cards[caseId], correct, state.turn) },
  };
}

/**
 * The next case to drill among `caseIds` (in table order), or null when the list is empty.
 * `lastCaseId` is not picked again if any other case is available.
 */
export function nextCase(state: TrainerState, caseIds: readonly string[], lastCaseId: string | null = null): string | null {
  if (!caseIds.length) return null;
  const pool = caseIds.length > 1 && lastCaseId ? caseIds.filter((id) => id !== lastCaseId) : [...caseIds];
  const order = new Map(pool.map((id, i) => [id, i]));
  const drilled = pool.filter((id) => state.cards[id]);
  const byUrgency = (a: string, b: string) => {
    const ca = state.cards[a];
    const cb = state.cards[b];
    return ca.due - cb.due || ca.box - cb.box || order.get(a)! - order.get(b)!;
  };

  const due = drilled.filter((id) => state.cards[id].due <= state.turn).sort(byUrgency);
  if (due.length) return due[0];
  const fresh = pool.find((id) => !state.cards[id]);
  if (fresh) return fresh;
  return [...drilled].sort(byUrgency)[0] ?? null;
}

/** True once a case sits in box `LEARNED_BOX` or higher. */
export function isLearned(card: TrainerCard | undefined): boolean {
  return Boolean(card && card.box >= LEARNED_BOX);
}

/** How many of `caseIds` are learned, drilled at all, and in total. */
export function setProgress(state: TrainerState, caseIds: readonly string[]): { learned: number; seen: number; total: number } {
  let learned = 0;
  let seen = 0;
  for (const id of caseIds) {
    const card = state.cards[id];
    if (card) seen++;
    if (isLearned(card)) learned++;
  }
  return { learned, seen, total: caseIds.length };
}
