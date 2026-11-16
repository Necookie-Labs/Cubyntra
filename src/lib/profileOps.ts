/**
 * Cubyntra - Student Profile Operations
 * Necookie Labs (c) 2026
 *
 * Changes to the profile travel as small operations, not as a whole profile, so two devices
 * (the laptop and a paired phone, or two tabs) never overwrite each other: the server applies
 * each device's operations to the profile it has, and the client applies the same operations to
 * its own copy straight away. Each operation merges rather than replaces:
 *
 * - timer solves are added, re-scored or removed by id (a solve already there is not added again);
 * - a trainer answer is replayed on the trainer state that is there (the Leitner update and the
 *   drill count), so answers from two devices both count;
 * - stats are incremented, stage records appended, active days unioned, `lastSolveAt` only moves
 *   forward;
 * - the current solve is replaced only by a newer one: a later `startedAt` (a new solve), or the
 *   same solve at a later step, or the same step with a later `updatedAt`. Clearing names the
 *   solve it clears, which is then closed: an older copy of it arriving late cannot bring it back;
 * - settings fields, the name and the palette are set (the last write wins per field).
 *
 * Pure TypeScript, shared by `/api/student` and the tutor store. No Node or DOM imports.
 */

import { answerDrill } from '../learn/leitner';
import { addActiveDay, recordStage } from '../learn/mastery';
import { MAX_TIMER_HISTORY, type HintUse, type Penalty, type TimerSolve, type TrainerSetId } from '../learn/types';
import type { StudentPalette } from '../vision/palette';
import type { CurrentSolve, StudentProfile, StudentSettings } from './studentProfile';

export type ProfileOp =
  | { op: 'setName'; name: string }
  | { op: 'setSettings'; settings: Partial<StudentSettings> }
  | { op: 'setPalette'; palette: StudentPalette | null }
  | { op: 'setCurrentSolve'; solve: CurrentSolve }
  /** Clears the solve that started at `startedAt` (or any older one) and closes it. */
  | { op: 'clearCurrentSolve'; startedAt: string }
  | { op: 'incrementStats'; solvesCompleted?: number; stepsCompleted?: number; checkpointsPassed?: number }
  | { op: 'setLastSolveAt'; at: string }
  | { op: 'recordStage'; key: string; hint: HintUse }
  | { op: 'addActiveDay'; day: string }
  | { op: 'answerTrainerCase'; caseId: string; correct: boolean }
  | { op: 'setTrainerSet'; set: TrainerSetId | null }
  | { op: 'addTimerSolve'; solve: TimerSolve & { id: string } }
  | { op: 'setTimerPenalty'; id: string; penalty: Penalty }
  | { op: 'deleteTimerSolve'; id: string };

export type ProfileOpName = ProfileOp['op'];

export const PROFILE_OP_NAMES: readonly ProfileOpName[] = [
  'setName',
  'setSettings',
  'setPalette',
  'setCurrentSolve',
  'clearCurrentSolve',
  'incrementStats',
  'setLastSolveAt',
  'recordStage',
  'addActiveDay',
  'answerTrainerCase',
  'setTrainerSet',
  'addTimerSolve',
  'setTimerPenalty',
  'deleteTimerSolve',
];

/** Most operations one request may carry. */
export const MAX_OPS_PER_REQUEST = 200;
/** A single increment is at most this (one request never adds more than a few steps). */
const MAX_INCREMENT = 1000;

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? -Infinity : t;
};

/**
 * True when `incoming` may replace `existing` as the current solve: a newer solve, the same
 * solve at a later step, or the same step saved later. `closedStartedAt` is the newest solve
 * that was cleared; nothing that started at or before it comes back.
 */
export function isNewerSolve(incoming: CurrentSolve, existing: CurrentSolve | null, closedStartedAt?: string): boolean {
  const started = time(incoming.startedAt);
  if (closedStartedAt !== undefined && started <= time(closedStartedAt)) return false;
  if (!existing) return true;
  const existingStarted = time(existing.startedAt);
  if (started !== existingStarted) return started > existingStarted;
  if (incoming.stepIndex !== existing.stepIndex) return incoming.stepIndex > existing.stepIndex;
  return time(incoming.updatedAt) >= time(existing.updatedAt);
}

const count = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= MAX_INCREMENT ? n : 0);

/** The profile after one operation. Unknown or malformed operations change nothing. */
export function applyProfileOp(profile: StudentProfile, op: ProfileOp): StudentProfile {
  switch (op.op) {
    case 'setName':
      return typeof op.name === 'string' ? { ...profile, name: op.name } : profile;
    case 'setSettings':
      return op.settings && typeof op.settings === 'object' ? { ...profile, settings: { ...profile.settings, ...op.settings } } : profile;
    case 'setPalette':
      return { ...profile, palette: op.palette ?? null };
    case 'setCurrentSolve':
      if (!op.solve || !isNewerSolve(op.solve, profile.currentSolve, profile.closedSolveStartedAt)) return profile;
      return { ...profile, currentSolve: op.solve };
    case 'clearCurrentSolve': {
      if (typeof op.startedAt !== 'string' || Number.isNaN(Date.parse(op.startedAt))) return profile;
      const closed =
        profile.closedSolveStartedAt && time(profile.closedSolveStartedAt) >= time(op.startedAt)
          ? profile.closedSolveStartedAt
          : op.startedAt;
      const current = profile.currentSolve;
      // A newer solve than the one being cleared stays.
      const keep = current && time(current.startedAt) > time(op.startedAt);
      return { ...profile, currentSolve: keep ? current : null, closedSolveStartedAt: closed };
    }
    case 'incrementStats': {
      const s = profile.stats;
      return {
        ...profile,
        stats: {
          ...s,
          solvesCompleted: s.solvesCompleted + count(op.solvesCompleted),
          stepsCompleted: s.stepsCompleted + count(op.stepsCompleted),
          checkpointsPassed: s.checkpointsPassed + count(op.checkpointsPassed),
        },
      };
    }
    case 'setLastSolveAt': {
      const last = profile.stats.lastSolveAt;
      if (typeof op.at !== 'string' || (last && time(last) >= time(op.at))) return profile;
      return { ...profile, stats: { ...profile.stats, lastSolveAt: op.at } };
    }
    case 'recordStage':
      return { ...profile, stats: { ...profile.stats, stages: recordStage(profile.stats.stages, op.key, op.hint) } };
    case 'addActiveDay':
      return { ...profile, stats: { ...profile.stats, activeDays: addActiveDay(profile.stats.activeDays, op.day) } };
    case 'answerTrainerCase':
      return { ...profile, trainer: answerDrill(profile.trainer, op.caseId, op.correct === true) };
    case 'setTrainerSet':
      return { ...profile, trainer: { ...profile.trainer, set: op.set } };
    case 'addTimerSolve': {
      const history = profile.timer.history;
      if (!op.solve || history.some((s) => s.id === op.solve.id)) return profile;
      return { ...profile, timer: { history: [...history, op.solve].slice(-MAX_TIMER_HISTORY) } };
    }
    case 'setTimerPenalty':
      return {
        ...profile,
        timer: { history: profile.timer.history.map((s) => (s.id === op.id ? { ...s, penalty: op.penalty } : s)) },
      };
    case 'deleteTimerSolve':
      return { ...profile, timer: { history: profile.timer.history.filter((s) => s.id !== op.id) } };
    default:
      return profile;
  }
}

export function applyProfileOps(profile: StudentProfile, ops: readonly ProfileOp[]): StudentProfile {
  return ops.reduce(applyProfileOp, profile);
}

export type OpsParse = { ok: true; ops: ProfileOp[]; batchId: string | null } | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Checks the envelope of a `PATCH /api/student` body: `{ ops: ProfileOp[], batchId?: string }`.
 * Each operation's fields are checked by type here; the values are checked by validating the
 * whole profile after the operations are applied (`parseStudentProfile`).
 */
export function parseProfileOps(body: unknown): OpsParse {
  if (!isRecord(body) || !Array.isArray(body.ops)) return { ok: false, error: 'The body must be { "ops": [...] }' };
  if (body.ops.length > MAX_OPS_PER_REQUEST) return { ok: false, error: `At most ${MAX_OPS_PER_REQUEST} operations per request` };
  const batchId = body.batchId === undefined ? null : body.batchId;
  if (batchId !== null && (typeof batchId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(batchId))) {
    return { ok: false, error: 'batchId must be 8 to 64 letters, digits, - or _' };
  }
  const ops: ProfileOp[] = [];
  for (const [i, raw] of body.ops.entries()) {
    const bad = (what: string) => ({ ok: false as const, error: `ops[${i}]: ${what}` });
    if (!isRecord(raw) || !(PROFILE_OP_NAMES as readonly unknown[]).includes(raw.op)) return bad('unknown operation');
    const str = (k: string) => typeof raw[k] === 'string';
    switch (raw.op as ProfileOpName) {
      case 'setName':
        if (!str('name')) return bad('name must be a string');
        break;
      case 'setSettings':
        if (!isRecord(raw.settings)) return bad('settings must be an object');
        break;
      case 'setPalette':
        if (raw.palette !== null && !isRecord(raw.palette)) return bad('palette must be an object or null');
        break;
      case 'setCurrentSolve':
        if (!isRecord(raw.solve)) return bad('solve must be an object');
        break;
      case 'clearCurrentSolve':
        if (!str('startedAt') || Number.isNaN(Date.parse(raw.startedAt as string))) return bad('startedAt must be a date');
        break;
      case 'incrementStats':
        for (const k of ['solvesCompleted', 'stepsCompleted', 'checkpointsPassed']) {
          if (raw[k] !== undefined && count(raw[k]) === 0) return bad(`${k} must be a small positive whole number`);
        }
        break;
      case 'setLastSolveAt':
        if (!str('at') || Number.isNaN(Date.parse(raw.at as string))) return bad('at must be a date');
        break;
      case 'recordStage':
        if (!str('key') || ![0, 1, 2, 3].includes(raw.hint as number)) return bad('needs a stage key and a hint 0 to 3');
        break;
      case 'addActiveDay':
        if (!str('day') || !/^\d{4}-\d{2}-\d{2}$/.test(raw.day as string)) return bad('day must be YYYY-MM-DD');
        break;
      case 'answerTrainerCase':
        if (!str('caseId') || typeof raw.correct !== 'boolean') return bad('needs a caseId and correct true or false');
        break;
      case 'setTrainerSet':
        if (raw.set !== null && !str('set')) return bad('set must be a set id or null');
        break;
      case 'addTimerSolve':
        if (!isRecord(raw.solve) || typeof raw.solve.id !== 'string') return bad('solve must be an object with an id');
        break;
      case 'setTimerPenalty':
        if (!str('id') || !['none', '+2', 'DNF'].includes(raw.penalty as string)) return bad('needs an id and a penalty');
        break;
      case 'deleteTimerSolve':
        if (!str('id')) return bad('id must be a string');
        break;
    }
    ops.push(raw as unknown as ProfileOp);
  }
  return { ok: true, ops, batchId };
}
