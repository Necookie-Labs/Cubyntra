/**
 * Cubyntra - Student Profile Schema
 * Necookie Labs (c) 2026
 *
 * The one local student's profile: name, settings, color palette from the last full scan, the
 * solve in progress (so an interrupted solve resumes), stats (per-stage hint use for mastery,
 * active days for streaks), the trainer's Leitner boxes and the timer's history. It is stored in
 * `data/student.json` on the laptop through `/api/student`. Shared by the route (validation) and
 * the client (defaults). No Node or DOM imports.
 *
 * Version 2 added `settings.lastLayer`, `stats.stages`, `stats.activeDays`,
 * `currentSolve.stageHint`, `trainer` and `timer`. A version 1 profile is migrated when it is
 * read (`migrateProfileV1`), so an existing `data/student.json` keeps working.
 */

import type { CubeColor, CubeState, Face } from '../cube/types';
import { COLORS, FACES } from '../cube/constants';
import { isValidGrip, type Grip } from '../cube/grip';
import type { AttemptRecord, MistakeKind } from '../coach/types';
import { MISTAKE_KINDS } from '../coach/types';
import type { LastLayerMode, MethodId } from '../tutor/types';
import { parsePalette, type StudentPalette } from '../vision/palette';
import {
  MAX_BOX,
  MAX_TIMER_HISTORY,
  TRAINER_SET_IDS,
  defaultTimerState,
  defaultTrainerState,
  type HintUse,
  type LeitnerBox,
  type Penalty,
  type TimerSolve,
  type TimerState,
  type TrainerCard,
  type TrainerSetId,
  type TrainerState,
} from '../learn/types';

export const STUDENT_PROFILE_VERSION = 2;
/** Largest body `/api/student` accepts and the largest file it writes. */
export const MAX_STUDENT_BYTES = 128 * 1024;
export const MAX_NAME_LENGTH = 40;
/** Attempts kept for the step in progress (the coach reads the newest five). */
export const MAX_SAVED_ATTEMPTS = 20;
/** Completions kept per stage (mastery reads the newest five). */
export const MAX_STAGE_RECORDS = 10;
/** Active days kept for streaks (a little over a year). */
export const MAX_ACTIVE_DAYS = 400;
/** Trainer cards kept: every case of every set fits with room to spare. */
export const MAX_TRAINER_CARDS = 300;
const MAX_STAGE_KEYS = 40;
const MAX_SCRAMBLE_LENGTH = 200;

export type ThemeSetting = 'light' | 'dark' | 'system';

export interface StudentSettings {
  /** Method picked on the home screen unless the student chooses another. */
  methodDefault: MethodId;
  /** Spell moves out in words ("turn the right side up") by default. */
  plainLanguage: boolean;
  /** Draw a letter on every sticker (W Y R O B G), on the twin and in sticker grids. */
  stickerLetters: boolean;
  /** Cut animations to a minimum, whatever the device setting says. */
  reducedMotion: boolean;
  theme: ThemeSetting;
  /** CFOP only: the last layer in four steps (`2-look`) or in one OLL and one PLL step (`full`). */
  lastLayer: LastLayerMode;
}

/** A guided solve that has started and not finished. */
export interface CurrentSolve {
  method: MethodId;
  /** The cube as the student holds it now, before the next step. */
  state: CubeState;
  grip: Grip;
  /** Steps completed so far in this solve; the next plan gets this index. */
  stepIndex: number;
  /** Checkpoint tries at the step in progress, oldest first. */
  attempts: AttemptRecord[];
  /** The highest hint asked for so far on the stage in progress (absent = none). */
  stageHint?: HintUse;
  startedAt: string;
  updatedAt: string;
}

export interface StudentStats {
  solvesCompleted: number;
  stepsCompleted: number;
  checkpointsPassed: number;
  lastSolveAt: string | null;
  /**
   * Per stage, keyed `<method>/<stage id>` (e.g. `cfop/f2l`): the highest hint asked for each
   * time the stage was completed in a guided solve, oldest first, at most `MAX_STAGE_RECORDS`.
   */
  stages: Record<string, HintUse[]>;
  /** Local days (`YYYY-MM-DD`) with a finished solve or trainer session, ascending, unique. */
  activeDays: string[];
}

export interface StudentProfile {
  version: typeof STUDENT_PROFILE_VERSION;
  name: string;
  settings: StudentSettings;
  /** Learned from the last full scan; checkpoint scans classify against it. */
  palette: StudentPalette | null;
  currentSolve: CurrentSolve | null;
  stats: StudentStats;
  trainer: TrainerState;
  timer: TimerState;
}

export const DEFAULT_SETTINGS: StudentSettings = {
  methodDefault: 'beginner',
  plainLanguage: true,
  stickerLetters: false,
  reducedMotion: false,
  theme: 'system',
  lastLayer: '2-look',
};

export function defaultStats(): StudentStats {
  return { solvesCompleted: 0, stepsCompleted: 0, checkpointsPassed: 0, lastSolveAt: null, stages: {}, activeDays: [] };
}

export function defaultStudentProfile(): StudentProfile {
  return {
    version: STUDENT_PROFILE_VERSION,
    name: '',
    settings: { ...DEFAULT_SETTINGS },
    palette: null,
    currentSolve: null,
    stats: defaultStats(),
    trainer: defaultTrainerState(),
    timer: defaultTimerState(),
  };
}

export type ProfileParse = { ok: true; profile: StudentProfile } | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1e9;
const isMethod = (v: unknown): v is MethodId => v === 'beginner' || v === 'cfop';
const isColor = (v: unknown): v is CubeColor => typeof v === 'string' && (COLORS as readonly string[]).includes(v);
const isIsoDate = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isHintUse = (v: unknown): v is HintUse => v === 0 || v === 1 || v === 2 || v === 3;
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const STAGE_KEY = /^(beginner|cfop)\/[a-z0-9][a-z0-9-]{0,40}$/;
const CASE_ID = /^[a-z0-9][a-z0-9'-]{0,63}$/;

/**
 * Brings a version 1 profile up to version 2: the new fields get their defaults (2-look last
 * layer, no stage records, no active days, an empty trainer and timer). Everything else is left
 * for `parseStudentProfile` to check. Anything that is not a version 1 object is returned as is.
 */
export function migrateProfileV1(input: unknown): unknown {
  if (!isRecord(input) || input.version !== 1) return input;
  return {
    ...input,
    version: 2,
    settings: isRecord(input.settings) ? { lastLayer: '2-look', ...input.settings } : input.settings,
    stats: isRecord(input.stats) ? { stages: {}, activeDays: [], ...input.stats } : input.stats,
    trainer: defaultTrainerState(),
    timer: defaultTimerState(),
  };
}

class SchemaError extends Error {}

function need(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SchemaError(message);
}

function parseSettings(v: unknown): StudentSettings {
  need(isRecord(v), 'settings must be an object');
  need(isMethod(v.methodDefault), 'settings.methodDefault must be beginner or cfop');
  for (const key of ['plainLanguage', 'stickerLetters', 'reducedMotion'] as const) {
    need(typeof v[key] === 'boolean', `settings.${key} must be true or false`);
  }
  need(v.theme === 'light' || v.theme === 'dark' || v.theme === 'system', 'settings.theme must be light, dark or system');
  need(v.lastLayer === '2-look' || v.lastLayer === 'full', 'settings.lastLayer must be 2-look or full');
  return {
    methodDefault: v.methodDefault,
    plainLanguage: v.plainLanguage as boolean,
    stickerLetters: v.stickerLetters as boolean,
    reducedMotion: v.reducedMotion as boolean,
    theme: v.theme,
    lastLayer: v.lastLayer,
  };
}

function parseState(v: unknown): CubeState {
  need(isRecord(v), 'currentSolve.state must be an object');
  const state = {} as CubeState;
  for (const face of FACES as readonly Face[]) {
    const tiles = v[face];
    need(Array.isArray(tiles) && tiles.length === 9 && tiles.every(isColor), `currentSolve.state.${face} must be 9 colors`);
    state[face] = [...tiles] as CubeState[Face];
  }
  return state;
}

function parseAttempt(v: unknown): AttemptRecord {
  need(isRecord(v), 'an attempt must be an object');
  need(v.result === 'matched' || v.result === 'mismatch' || v.result === 'unsure', 'attempt.result is not known');
  const out: AttemptRecord = { result: v.result };
  if (v.mistakes !== undefined) {
    need(
      Array.isArray(v.mistakes) &&
        v.mistakes.length <= 5 &&
        v.mistakes.every((m) => (MISTAKE_KINDS as readonly string[]).includes(m as string)),
      'attempt.mistakes is not a list of known mistakes'
    );
    out.mistakes = [...(v.mistakes as MistakeKind[])];
  }
  return out;
}

function parseCurrentSolve(v: unknown): CurrentSolve | null {
  if (v === null) return null;
  need(isRecord(v), 'currentSolve must be an object or null');
  need(isMethod(v.method), 'currentSolve.method must be beginner or cfop');
  const state = parseState(v.state);
  need(isRecord(v.grip) && isColor(v.grip.top) && isColor(v.grip.front), 'currentSolve.grip must name two colors');
  const grip: Grip = { top: v.grip.top as CubeColor, front: v.grip.front as CubeColor };
  need(isValidGrip(grip), 'currentSolve.grip is not a possible way to hold the cube');
  need(isCount(v.stepIndex) && v.stepIndex <= 500, 'currentSolve.stepIndex must be a whole number');
  need(Array.isArray(v.attempts) && v.attempts.length <= MAX_SAVED_ATTEMPTS, 'currentSolve.attempts is too long');
  need(v.stageHint === undefined || isHintUse(v.stageHint), 'currentSolve.stageHint must be 0 to 3');
  need(isIsoDate(v.startedAt) && isIsoDate(v.updatedAt), 'currentSolve dates must be ISO dates');
  return {
    method: v.method,
    state,
    grip,
    stepIndex: v.stepIndex,
    attempts: v.attempts.map(parseAttempt),
    ...(v.stageHint !== undefined ? { stageHint: v.stageHint as HintUse } : {}),
    startedAt: v.startedAt,
    updatedAt: v.updatedAt,
  };
}

function parseStats(v: unknown): StudentStats {
  need(isRecord(v), 'stats must be an object');
  for (const key of ['solvesCompleted', 'stepsCompleted', 'checkpointsPassed'] as const) {
    need(isCount(v[key]), `stats.${key} must be a whole number`);
  }
  need(v.lastSolveAt === null || isIsoDate(v.lastSolveAt), 'stats.lastSolveAt must be a date or null');
  need(isRecord(v.stages), 'stats.stages must be an object');
  const keys = Object.keys(v.stages);
  need(keys.length <= MAX_STAGE_KEYS, 'stats.stages has too many stages');
  const stages: Record<string, HintUse[]> = {};
  for (const key of keys) {
    const records = v.stages[key];
    need(STAGE_KEY.test(key), 'stats.stages has a key that is not <method>/<stage>');
    need(
      Array.isArray(records) && records.length <= MAX_STAGE_RECORDS && records.every(isHintUse),
      `stats.stages.${key} must be a short list of hint levels`
    );
    stages[key] = [...(records as HintUse[])];
  }
  need(
    Array.isArray(v.activeDays) && v.activeDays.length <= MAX_ACTIVE_DAYS && v.activeDays.every(isDay),
    'stats.activeDays must be a list of days'
  );
  return {
    solvesCompleted: v.solvesCompleted as number,
    stepsCompleted: v.stepsCompleted as number,
    checkpointsPassed: v.checkpointsPassed as number,
    lastSolveAt: v.lastSolveAt as string | null,
    stages,
    activeDays: [...new Set(v.activeDays as string[])].sort(),
  };
}

function parseCard(id: string, v: unknown): TrainerCard {
  need(isRecord(v), `trainer.cards.${id} must be an object`);
  need(
    typeof v.box === 'number' && Number.isInteger(v.box) && v.box >= 1 && v.box <= MAX_BOX,
    `trainer.cards.${id}.box must be 1 to ${MAX_BOX}`
  );
  for (const key of ['due', 'seen', 'missed'] as const) {
    need(isCount(v[key]), `trainer.cards.${id}.${key} must be a whole number`);
  }
  return { box: v.box as LeitnerBox, due: v.due as number, seen: v.seen as number, missed: v.missed as number };
}

function parseTrainer(v: unknown): TrainerState {
  need(isRecord(v), 'trainer must be an object');
  need(isCount(v.turn), 'trainer.turn must be a whole number');
  need(isRecord(v.cards), 'trainer.cards must be an object');
  const ids = Object.keys(v.cards);
  need(ids.length <= MAX_TRAINER_CARDS, 'trainer.cards has too many cases');
  const cards: Record<string, TrainerCard> = {};
  for (const id of ids) {
    need(CASE_ID.test(id), 'trainer.cards has a key that is not a case id');
    cards[id] = parseCard(id, v.cards[id]);
  }
  need(v.set === null || (TRAINER_SET_IDS as readonly unknown[]).includes(v.set), 'trainer.set is not a known set');
  return { turn: v.turn as number, cards, set: v.set as TrainerSetId | null };
}

function parseTimerSolve(v: unknown): TimerSolve {
  need(isRecord(v), 'a timer solve must be an object');
  need(isCount(v.ms) && v.ms < 24 * 3600 * 1000, 'a timer solve needs a whole number of milliseconds');
  need(v.penalty === 'none' || v.penalty === '+2' || v.penalty === 'DNF', 'a timer solve penalty must be none, +2 or DNF');
  need(isIsoDate(v.at), 'a timer solve date must be an ISO date');
  need(typeof v.scramble === 'string' && v.scramble.length <= MAX_SCRAMBLE_LENGTH, 'a timer solve scramble is too long');
  return { ms: v.ms, penalty: v.penalty as Penalty, at: v.at, scramble: v.scramble };
}

function parseTimer(v: unknown): TimerState {
  need(isRecord(v), 'timer must be an object');
  need(Array.isArray(v.history) && v.history.length <= MAX_TIMER_HISTORY, `timer.history must hold at most ${MAX_TIMER_HISTORY} solves`);
  return { history: v.history.map(parseTimerSolve) };
}

/**
 * Validates a profile (parsed JSON). A version 1 profile is migrated first. Unknown fields are
 * dropped; anything malformed is an error.
 */
export function parseStudentProfile(raw: unknown): ProfileParse {
  try {
    const input = migrateProfileV1(raw);
    need(isRecord(input), 'the profile must be an object');
    need(input.version === STUDENT_PROFILE_VERSION, `version must be ${STUDENT_PROFILE_VERSION}`);
    need(typeof input.name === 'string' && input.name.length <= MAX_NAME_LENGTH, `name must be at most ${MAX_NAME_LENGTH} characters`);
    let palette: StudentPalette | null = null;
    if (input.palette !== null && input.palette !== undefined) {
      palette = parsePalette(input.palette);
      need(palette, 'palette is not a valid color palette');
    }
    return {
      ok: true,
      profile: {
        version: STUDENT_PROFILE_VERSION,
        name: input.name.trim(),
        settings: parseSettings(input.settings),
        palette,
        currentSolve: parseCurrentSolve(input.currentSolve ?? null),
        stats: parseStats(input.stats),
        trainer: parseTrainer(input.trainer),
        timer: parseTimer(input.timer),
      },
    };
  } catch (error) {
    if (error instanceof SchemaError) return { ok: false, error: error.message };
    throw error;
  }
}
