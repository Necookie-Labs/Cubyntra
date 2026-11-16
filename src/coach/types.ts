/**
 * Cubyntra - Coach Types
 * Necookie Labs (c) 2026
 *
 * The coach explains a step the tutor engine already planned. It receives a compact facts
 * object (never images, never the full cube state) and returns plain text. Shared by the
 * server route, the client hook, the templates and the eval script.
 */

import type { CubeColor } from '../cube/types';
import type { LikelyMistake, MethodId, MistakeDetail, MistakeKind } from '../tutor/types';

export type { MistakeKind } from '../tutor/types';

/** 1 = what to look for, 2 = why it works, 3 = the exact moves. */
export type HintLevel = 1 | 2 | 3;

export const HINT_LEVELS: readonly HintLevel[] = [1, 2, 3];

/** `live` calls Claude; `mock` has no API key; `capped` reached the monthly spend cap. */
export type CoachMode = 'live' | 'mock' | 'capped';

/** Every kind of slip the tutor's diagnosis can name (`src/tutor/diagnose.ts`). */
export const MISTAKE_KINDS = [
  'wrong-direction',
  'skipped-move',
  'doubled-move',
  'wrong-face',
  'wrong-grip',
  'other',
] as const satisfies readonly MistakeKind[];

/** Finer labels for kind `other`. */
export const MISTAKE_DETAILS = ['stopped-early', 'extra-repeat', 'two-mistakes'] as const satisfies readonly MistakeDetail[];

/**
 * The compact projection of one tutor `LikelyMistake` that is sent to Claude. The tutor's
 * `performedMoves`, `resultingState`, `score` and `contradictions` stay in the browser: they
 * are large and the coach does not need them.
 */
export type CoachMistake = Pick<LikelyMistake, 'kind' | 'detail' | 'moveIndex' | 'confidence'> & {
  /** The tutor's plain-language description; left out when it names a move it may not. */
  description?: string;
};

/** The compact projection of a tutor `Diagnosis`. */
export interface CoachDiagnosisFacts {
  /** Ranked, most likely first (at most `MAX_MISTAKES`). */
  likelyMistakes: CoachMistake[];
  /** True when the top mistake is the only explanation that fits the scan. */
  confident: boolean;
  /** When the scan could not tell mistakes apart: the side to show next, in words ("the front"). */
  showNext?: string;
}

/** One earlier try at the current step. */
export interface AttemptRecord {
  result: 'matched' | 'mismatch' | 'unsure';
  /** Most likely mistake kinds the check found, if any. */
  mistakes?: MistakeKind[];
}

/**
 * The only thing sent to Claude. Moves are space-separated notation strings; the guardrail
 * allows exactly the moves in `setupMoves`, `algorithm` and `repeat.unit`.
 */
export interface CoachFacts {
  method: MethodId;
  stage: string;
  stageName: string;
  caseId: string;
  caseName: string;
  hintLevel: HintLevel;
  grip: { top: CubeColor; front: CubeColor };
  setupMoves: string;
  algorithm: string;
  /** Set when `algorithm` is one short sequence repeated. */
  repeat?: { unit: string; times: number };
  goal: string;
  lookFor: string;
  why: string;
  /**
   * Hint level 3 only: one plain-language line per move, as `R = turn the right side up`, for
   * `setupMoves` then the algorithm (the repeated unit when `repeat` is set). Derived from the
   * notation (`src/cube/moveNames.ts`); the server recomputes it rather than trusting the client.
   */
  moveWords?: string[];
  /**
   * The case's own teaching note for this hint level (`src/coach/caseNotes.ts`): a recognition
   * cue at level 1, the idea and a common mistake at level 2, a fingertrick or practice tip at
   * level 3. Moves only at level 3, and only allowed ones. Recomputed by the server from `caseId`.
   */
  caseTip?: string;
  /** Earlier tries at this step, oldest first (at most `MAX_ATTEMPTS`). */
  attempts: AttemptRecord[];
  diagnosis?: CoachDiagnosisFacts;
}

/** Limits the route enforces on incoming facts. */
export const MAX_ATTEMPTS = 5;
export const MAX_MISTAKES = 3;
export const MAX_TEXT_FIELD = 400;
export const MAX_MOVES_FIELD = 200;
export const MAX_REQUEST_BYTES = 8 * 1024;

/** Why the reply is a template instead of Claude's text. */
export type FallbackReason =
  | 'mock'
  | 'capped'
  | 'guard'
  | 'refusal'
  | 'max-tokens'
  | 'rate-limited'
  | 'offline'
  | 'api-error'
  | 'empty';

/** Events on the `/api/coach` stream (sent as Server-Sent Events). */
export type CoachStreamEvent =
  /** More text to append. */
  | { type: 'delta'; text: string }
  /** Throw away the text so far and show this instead (a template). */
  | { type: 'replace'; text: string; reason: FallbackReason }
  /** The reply is complete. */
  | {
      type: 'done';
      source: 'live' | 'template';
      mode: CoachMode;
      reason?: FallbackReason;
      notice?: string;
    };

export interface CoachStatus {
  mode: CoachMode;
  /** Spend so far this calendar month (UTC), in US dollars. */
  monthSpendUsd: number;
  capUsd: number;
  /** `YYYY-MM` (UTC). */
  month: string;
}
