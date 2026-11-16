/**
 * Cubyntra - Coach Types
 * Necookie Labs (c) 2026
 *
 * The coach explains a step the tutor engine already planned. It receives a compact facts
 * object (never images, never the full cube state) and returns plain text. Shared by the
 * server route, the client hook, the templates and the eval script.
 */

import type { CubeColor } from '../cube/types';
import type { MethodId } from '../tutor/types';

/** 1 = what to look for, 2 = why it works, 3 = the exact moves. */
export type HintLevel = 1 | 2 | 3;

export const HINT_LEVELS: readonly HintLevel[] = [1, 2, 3];

/** `live` calls Claude; `mock` has no API key; `capped` reached the monthly spend cap. */
export type CoachMode = 'live' | 'mock' | 'capped';

/** Kinds of mistake the checkpoint builder (Phase 5) can diagnose. */
export type MistakeKind =
  | 'wrong-direction'
  | 'skipped-move'
  | 'doubled-move'
  | 'wrong-face'
  | 'wrong-grip'
  | 'other';

export const MISTAKE_KINDS: readonly MistakeKind[] = [
  'wrong-direction',
  'skipped-move',
  'doubled-move',
  'wrong-face',
  'wrong-grip',
  'other',
];

/** One mistake consistent with what the checkpoint scan saw. */
export interface LikelyMistake {
  kind: MistakeKind;
  /** Index into the step's moves (setup then algorithm) where it most likely happened. */
  moveIndex?: number;
  /** 0..1, higher is more likely. */
  confidence?: number;
}

/** What the checkpoint builder fills after a failed check. Ranked, most likely first. */
export interface CoachDiagnosis {
  likelyMistakes: LikelyMistake[];
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
  /** Earlier tries at this step, oldest first (at most `MAX_ATTEMPTS`). */
  attempts: AttemptRecord[];
  diagnosis?: CoachDiagnosis;
}

/** Limits the route enforces on incoming facts. */
export const MAX_ATTEMPTS = 5;
export const MAX_MISTAKES = 5;
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
