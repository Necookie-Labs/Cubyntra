/**
 * Cubyntra - Coach Facts
 * Necookie Labs (c) 2026
 *
 * Turns a step plan into the compact facts JSON the coach sees, and validates facts that arrive
 * over HTTP. Only words and move notation leave the browser: no images and no cube state.
 */

import type { CubeColor } from '../cube/types';
import { formatAlgorithm, parseAlgorithm } from '../cube/transforms';
import type { StepPlan } from '../tutor/types';
import {
  AttemptRecord,
  CoachDiagnosis,
  CoachFacts,
  HintLevel,
  LikelyMistake,
  MAX_ATTEMPTS,
  MAX_MISTAKES,
  MAX_MOVES_FIELD,
  MAX_TEXT_FIELD,
  MISTAKE_KINDS,
  MistakeKind,
} from './types';

/** Builds the facts for one hint request. Keeps the newest `MAX_ATTEMPTS` attempts. */
export function buildCoachFacts(
  plan: StepPlan,
  hintLevel: HintLevel,
  attempts: readonly AttemptRecord[] = [],
  diagnosis?: CoachDiagnosis
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
  if (diagnosis?.likelyMistakes.length) {
    facts.diagnosis = { likelyMistakes: diagnosis.likelyMistakes.slice(0, MAX_MISTAKES) };
  }
  return facts;
}

/** Every move the step may mention (setup, algorithm, repeated unit), in canonical notation. */
export function allowedMoves(facts: Pick<CoachFacts, 'setupMoves' | 'algorithm' | 'repeat'>): Set<string> {
  const notation = [facts.setupMoves, facts.algorithm, facts.repeat?.unit ?? ''].join(' ').trim();
  if (!notation) return new Set();
  return new Set(parseAlgorithm(notation).map((m) => m.notation));
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

function likelyMistake(v: unknown): LikelyMistake | null {
  if (!isRecord(v)) return null;
  const kind = mistakeKind(v.kind);
  if (!kind) return null;
  const out: LikelyMistake = { kind };
  if (v.moveIndex !== undefined) {
    const i = v.moveIndex;
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i > 99) return null;
    out.moveIndex = i;
  }
  if (v.confidence !== undefined) {
    const c = v.confidence;
    if (typeof c !== 'number' || !(c >= 0 && c <= 1)) return null;
    out.confidence = c;
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
    const parsed = d.likelyMistakes.map(likelyMistake);
    if (parsed.some((m) => m === null)) return fail('diagnosis contains an invalid mistake');
    if (parsed.length) facts.diagnosis = { likelyMistakes: parsed as LikelyMistake[] };
  }

  return { ok: true, value: facts };
}
