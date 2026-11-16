/**
 * Cubyntra - Coach Facts
 * Necookie Labs (c) 2026
 *
 * Turns a step plan into the compact facts JSON the coach sees, and validates facts that arrive
 * over HTTP. Only words and move notation leave the browser: no images and no cube state.
 */

import type { CubeColor, Face } from '../cube/types';
import { moveName } from '../cube/moveNames';
import { formatAlgorithm, parseAlgorithm } from '../cube/transforms';
import type { Diagnosis, StepPlan } from '../tutor/types';
import { extractMoveTokens } from './guard';
import {
  AttemptRecord,
  CoachDiagnosisFacts,
  CoachFacts,
  CoachMistake,
  HintLevel,
  MAX_ATTEMPTS,
  MAX_MISTAKES,
  MAX_MOVES_FIELD,
  MAX_TEXT_FIELD,
  MISTAKE_DETAILS,
  MISTAKE_KINDS,
  MistakeKind,
} from './types';

/** Builds the facts for one hint request. Keeps the newest `MAX_ATTEMPTS` attempts. */
export function buildCoachFacts(
  plan: StepPlan,
  hintLevel: HintLevel,
  attempts: readonly AttemptRecord[] = [],
  diagnosis?: Diagnosis
): CoachFacts {
  const facts: CoachFacts = {
    method: plan.method,
    stage: plan.stage,
    stageName: plan.stageName,
    caseId: plan.caseId,
    caseName: plan.caseName,
    hintLevel,
    grip: { top: plan.grip.top, front: plan.grip.front },
    setupMoves: formatAlgorithm(plan.setupMoves),
    algorithm: formatAlgorithm(plan.algorithm),
    goal: plan.facts.goal,
    lookFor: plan.facts.lookFor,
    why: plan.facts.why,
    attempts: attempts.slice(-MAX_ATTEMPTS).map((a) => ({
      result: a.result,
      ...(a.mistakes?.length ? { mistakes: a.mistakes.slice(0, MAX_MISTAKES) } : {}),
    })),
  };
  if (plan.facts.repeat) {
    facts.repeat = { unit: formatAlgorithm(plan.facts.repeat.unit), times: plan.facts.repeat.times };
  }
  const projected = diagnosis && projectDiagnosis(diagnosis, facts);
  if (projected) facts.diagnosis = projected;
  return withMoveWords(facts);
}

/** Side names for `Diagnosis.showNext`: words, never a lone face letter. */
export const SIDE_WORDS: Readonly<Record<Face, string>> = {
  U: 'the top',
  D: 'the bottom',
  F: 'the front',
  B: 'the back',
  R: 'the right side',
  L: 'the left side',
};

/** Canonical notation of every move token in a piece of text. */
function notationIn(text: string): string[] {
  return extractMoveTokens(text).map((t) => t.canonical ?? t.raw);
}

/**
 * The compact diagnosis sent to Claude: the top `MAX_MISTAKES` mistakes with kind, detail,
 * moveIndex, confidence (two decimals) and description, never the tutor's move lists or cube
 * states. Move guardrail for descriptions: the top mistake's description may name moves of the
 * step or moves the student most likely did (its `performedMoves`); any other description may
 * name only moves of the step. A description that breaks this is left out (the kind remains).
 * Returns undefined when there is no mistake to report.
 */
export function projectDiagnosis(
  diagnosis: Diagnosis,
  step: Pick<CoachFacts, 'setupMoves' | 'algorithm' | 'repeat'>
): CoachDiagnosisFacts | undefined {
  const mistakes = diagnosis.likelyMistakes.slice(0, MAX_MISTAKES);
  if (!mistakes.length) return undefined;
  const stepMoves = allowedMoves(step);
  const likelyMistakes = mistakes.map((m, i): CoachMistake => {
    const allowed = new Set(stepMoves);
    if (i === 0) for (const move of m.performedMoves) allowed.add(move.notation);
    const description = m.description.trim().slice(0, MAX_TEXT_FIELD);
    const safe = description && notationIn(description).every((n) => allowed.has(n));
    return {
      kind: m.kind,
      ...(m.detail ? { detail: m.detail } : {}),
      ...(m.moveIndex !== undefined ? { moveIndex: m.moveIndex } : {}),
      confidence: Math.round(m.confidence * 100) / 100,
      ...(safe ? { description } : {}),
    };
  });
  return {
    likelyMistakes,
    confident: diagnosis.confident,
    ...(diagnosis.showNext ? { showNext: SIDE_WORDS[diagnosis.showNext] } : {}),
  };
}

/** The moves a level-3 hint walks through: setup, then the repeated unit or the whole algorithm. */
export function taughtMoves(facts: Pick<CoachFacts, 'setupMoves' | 'algorithm' | 'repeat'>): string {
  return [facts.setupMoves, facts.repeat?.unit ?? facts.algorithm].join(' ').trim();
}

/** `R = turn the right side up` for each move of `notation`. */
export function describeMoves(notation: string): string[] {
  if (!notation.trim()) return [];
  return parseAlgorithm(notation).map((m) => {
    const name = moveName(m);
    return `${m.notation} = ${name.charAt(0).toLowerCase()}${name.slice(1)}`;
  });
}

/** Sets `moveWords` at hint level 3 and removes it at the other levels. */
export function withMoveWords(facts: CoachFacts): CoachFacts {
  const rest: CoachFacts = { ...facts };
  delete rest.moveWords;
  return facts.hintLevel === 3 ? { ...rest, moveWords: describeMoves(taughtMoves(facts)) } : rest;
}

/** Phrases blanked out before the guardrail scan: the step's own case and stage names. */
export function guardNames(facts: Pick<CoachFacts, 'caseName' | 'stageName'>): string[] {
  return [facts.caseName, facts.stageName];
}

/**
 * Every move a reply may mention, in canonical notation: the step's setup, algorithm and
 * repeated unit, plus any move the top diagnosed mistake's description names (checked against
 * the student's likely moves when the facts were built, see `projectDiagnosis`).
 */
export function allowedMoves(
  facts: Pick<CoachFacts, 'setupMoves' | 'algorithm' | 'repeat'> & Partial<Pick<CoachFacts, 'diagnosis'>>
): Set<string> {
  const notation = [facts.setupMoves, facts.algorithm, facts.repeat?.unit ?? ''].join(' ').trim();
  const allowed = new Set(notation ? parseAlgorithm(notation).map((m) => m.notation) : []);
  const top = facts.diagnosis?.likelyMistakes[0]?.description;
  if (top) for (const n of notationIn(top)) allowed.add(n);
  return allowed;
}

// ---------------------------------------------------------------------------------------------
// Validation of facts received over HTTP
// ---------------------------------------------------------------------------------------------

const COLORS: readonly CubeColor[] = ['white', 'yellow', 'green', 'blue', 'red', 'orange'];
const ID = /^[a-z0-9][a-z0-9'-]{0,63}$/;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function text(v: unknown, max = MAX_TEXT_FIELD): string | null {
  return typeof v === 'string' && v.length <= max ? v : null;
}

function moves(v: unknown): string | null {
  const s = text(v, MAX_MOVES_FIELD);
  if (s === null) return null;
  if (!s.trim()) return '';
  try {
    return formatAlgorithm(parseAlgorithm(s));
  } catch {
    return null;
  }
}

function mistakeKind(v: unknown): MistakeKind | null {
  return MISTAKE_KINDS.includes(v as MistakeKind) ? (v as MistakeKind) : null;
}

function attempt(v: unknown): AttemptRecord | null {
  if (!isRecord(v)) return null;
  if (v.result !== 'matched' && v.result !== 'mismatch' && v.result !== 'unsure') return null;
  if (v.mistakes === undefined) return { result: v.result };
  if (!Array.isArray(v.mistakes) || v.mistakes.length > MAX_MISTAKES) return null;
  const kinds = v.mistakes.map(mistakeKind);
  if (kinds.some((k) => k === null)) return null;
  return { result: v.result, mistakes: kinds as MistakeKind[] };
}

const SIDES: readonly string[] = Object.values(SIDE_WORDS);

function likelyMistake(v: unknown): CoachMistake | null {
  if (!isRecord(v)) return null;
  const kind = mistakeKind(v.kind);
  const c = v.confidence;
  if (!kind || typeof c !== 'number' || !(c >= 0 && c <= 1)) return null;
  const out: CoachMistake = { kind, confidence: c };
  if (v.detail !== undefined) {
    if (!MISTAKE_DETAILS.includes(v.detail as (typeof MISTAKE_DETAILS)[number])) return null;
    out.detail = v.detail as CoachMistake['detail'];
  }
  if (v.moveIndex !== undefined) {
    const i = v.moveIndex;
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i > 99) return null;
    out.moveIndex = i;
  }
  if (v.description !== undefined) {
    const d = text(v.description);
    if (d === null) return null;
    out.description = d;
  }
  return out;
}

/** Strict shape check for facts from a request body. Unknown fields are dropped. */
export function parseCoachFacts(input: unknown): ParseResult<CoachFacts> {
  const fail = (error: string): ParseResult<CoachFacts> => ({ ok: false, error });
  if (!isRecord(input)) return fail('facts must be an object');
  const v = input;

  if (v.method !== 'beginner' && v.method !== 'cfop') return fail('method must be beginner or cfop');
  if (typeof v.stage !== 'string' || !ID.test(v.stage)) return fail('stage is not a valid id');
  if (typeof v.caseId !== 'string' || !ID.test(v.caseId)) return fail('caseId is not a valid id');
  if (v.hintLevel !== 1 && v.hintLevel !== 2 && v.hintLevel !== 3) return fail('hintLevel must be 1, 2 or 3');
  const grip = v.grip;
  if (!isRecord(grip) || !COLORS.includes(grip.top as CubeColor) || !COLORS.includes(grip.front as CubeColor)) {
    return fail('grip must name a top and front color');
  }

  const stageName = text(v.stageName, 80);
  const caseName = text(v.caseName, 80);
  const goal = text(v.goal);
  const lookFor = text(v.lookFor);
  const why = text(v.why);
  if (stageName === null || caseName === null) return fail('stageName and caseName must be short strings');
  if (goal === null || lookFor === null || why === null) return fail('goal, lookFor and why must be short strings');

  const setupMoves = moves(v.setupMoves);
  const algorithm = moves(v.algorithm);
  if (setupMoves === null || algorithm === null) return fail('setupMoves and algorithm must be move notation');
  if (!algorithm) return fail('algorithm must not be empty');

  const facts: CoachFacts = {
    method: v.method,
    stage: v.stage,
    stageName,
    caseId: v.caseId,
    caseName,
    hintLevel: v.hintLevel,
    grip: { top: grip.top as CubeColor, front: grip.front as CubeColor },
    setupMoves,
    algorithm,
    goal,
    lookFor,
    why,
    attempts: [],
  };

  if (v.repeat !== undefined) {
    if (!isRecord(v.repeat)) return fail('repeat must be an object');
    const unit = moves(v.repeat.unit);
    const times = v.repeat.times;
    if (!unit || typeof times !== 'number' || !Number.isInteger(times) || times < 1 || times > 12) {
      return fail('repeat needs a move unit and a count from 1 to 12');
    }
    facts.repeat = { unit, times };
  }

  if (v.attempts !== undefined) {
    if (!Array.isArray(v.attempts) || v.attempts.length > MAX_ATTEMPTS) {
      return fail(`attempts must be a list of at most ${MAX_ATTEMPTS}`);
    }
    const parsed = v.attempts.map(attempt);
    if (parsed.some((a) => a === null)) return fail('attempts contain an invalid entry');
    facts.attempts = parsed as AttemptRecord[];
  }

  if (v.diagnosis !== undefined) {
    const d = v.diagnosis;
    if (!isRecord(d) || !Array.isArray(d.likelyMistakes)) return fail('diagnosis must have a likelyMistakes list');
    if (d.likelyMistakes.length > MAX_MISTAKES) return fail('too many likely mistakes');
    if (typeof d.confident !== 'boolean') return fail('diagnosis.confident must be true or false');
    if (d.showNext !== undefined && (typeof d.showNext !== 'string' || !SIDES.includes(d.showNext))) {
      return fail('diagnosis.showNext must name a side');
    }
    const parsed = d.likelyMistakes.map(likelyMistake);
    if (parsed.some((m) => m === null)) return fail('diagnosis contains an invalid mistake');
    const mistakes = parsed as CoachMistake[];
    // Only the top mistake's description may name moves outside the step (see projectDiagnosis).
    const stepMoves = allowedMoves(facts);
    if (mistakes.slice(1).some((m) => m.description && notationIn(m.description).some((n) => !stepMoves.has(n)))) {
      return fail('a diagnosis description names a move outside the step');
    }
    if (mistakes.length) {
      facts.diagnosis = {
        likelyMistakes: mistakes,
        confident: d.confident,
        ...(typeof d.showNext === 'string' ? { showNext: d.showNext } : {}),
      };
    }
  }

  return { ok: true, value: withMoveWords(facts) };
}
