/**
 * Cubyntra - Student Profile Schema
 * Necookie Labs (c) 2026
 *
 * The one local student's profile: name, settings, color palette from the last full scan, the
 * solve in progress (so an interrupted solve resumes) and stats placeholders for Phase 9. It is
 * stored in `data/student.json` on the laptop through `/api/student`. Shared by the route
 * (validation) and the client (defaults). No Node or DOM imports.
 */

import type { CubeColor, CubeState, Face } from '../cube/types';
import { COLORS, FACES } from '../cube/constants';
import { isValidGrip, type Grip } from '../cube/grip';
import type { AttemptRecord, MistakeKind } from '../coach/types';
import { MISTAKE_KINDS } from '../coach/types';
import type { MethodId } from '../tutor/types';
import { parsePalette, type StudentPalette } from '../vision/palette';

export const STUDENT_PROFILE_VERSION = 1;
/** Largest body `/api/student` accepts and the largest file it writes. */
export const MAX_STUDENT_BYTES = 32 * 1024;
export const MAX_NAME_LENGTH = 40;
/** Attempts kept for the step in progress (the coach reads the newest five). */
export const MAX_SAVED_ATTEMPTS = 20;

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
  startedAt: string;
  updatedAt: string;
}

/** Filled by the learning features in Phase 9. */
export interface StudentStats {
  solvesCompleted: number;
  stepsCompleted: number;
  checkpointsPassed: number;
  lastSolveAt: string | null;
}

export interface StudentProfile {
  version: typeof STUDENT_PROFILE_VERSION;
  name: string;
  settings: StudentSettings;
  /** Learned from the last full scan; checkpoint scans classify against it. */
  palette: StudentPalette | null;
  currentSolve: CurrentSolve | null;
  stats: StudentStats;
}

export const DEFAULT_SETTINGS: StudentSettings = {
  methodDefault: 'beginner',
  plainLanguage: true,
  stickerLetters: false,
  reducedMotion: false,
  theme: 'system',
};

export function defaultStudentProfile(): StudentProfile {
  return {
    version: STUDENT_PROFILE_VERSION,
    name: '',
    settings: { ...DEFAULT_SETTINGS },
    palette: null,
    currentSolve: null,
    stats: { solvesCompleted: 0, stepsCompleted: 0, checkpointsPassed: 0, lastSolveAt: null },
  };
}

export type ProfileParse = { ok: true; profile: StudentProfile } | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1e9;
const isMethod = (v: unknown): v is MethodId => v === 'beginner' || v === 'cfop';
const isColor = (v: unknown): v is CubeColor => typeof v === 'string' && (COLORS as readonly string[]).includes(v);
const isIsoDate = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

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
  return {
    methodDefault: v.methodDefault,
    plainLanguage: v.plainLanguage as boolean,
    stickerLetters: v.stickerLetters as boolean,
    reducedMotion: v.reducedMotion as boolean,
    theme: v.theme,
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
  need(isIsoDate(v.startedAt) && isIsoDate(v.updatedAt), 'currentSolve dates must be ISO dates');
  return {
    method: v.method,
    state,
    grip,
    stepIndex: v.stepIndex,
    attempts: v.attempts.map(parseAttempt),
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
  return {
    solvesCompleted: v.solvesCompleted as number,
    stepsCompleted: v.stepsCompleted as number,
    checkpointsPassed: v.checkpointsPassed as number,
    lastSolveAt: v.lastSolveAt as string | null,
  };
}

/** Validates a profile (parsed JSON). Unknown fields are dropped; anything malformed is an error. */
export function parseStudentProfile(input: unknown): ProfileParse {
  try {
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
      },
    };
  } catch (error) {
    if (error instanceof SchemaError) return { ok: false, error: error.message };
    throw error;
  }
}
