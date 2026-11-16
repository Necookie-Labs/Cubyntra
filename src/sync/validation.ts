/**
 * Cubyntra - Session Request Validation
 * Necookie Labs (c) 2026
 *
 * Pure parsers for untrusted request bodies arriving at the session relay routes.
 */

import { CubeColor, CubeState, Face } from '../cube/types';
import { COLORS, FACES } from '../cube/constants';
import { isValidGrip } from '../cube/grip';
import { parseAlgorithm } from '../cube/transforms';
import { MISTAKE_KINDS } from '../coach/types';
import {
  CHECKPOINT_RESULTS,
  CheckpointResultPayload,
  DEVICE_ROLES,
  FaceScannedPayload,
  GripPayload,
  PLAYBACK_ACTIONS,
  PRESENCE_SCREENS,
  PlaybackPayload,
  PresencePayload,
  STEP_METHODS,
  SYNC_MESSAGE_TYPES,
  ScanControlPayload,
  StepPayload,
  SyncMessage,
  SyncMessageInput,
  SyncMessageType,
  TileRgb,
} from './types';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function isFace(value: unknown): value is Face {
  return typeof value === 'string' && (FACES as readonly string[]).includes(value);
}

export function isCubeColor(value: unknown): value is CubeColor {
  return typeof value === 'string' && (COLORS as readonly string[]).includes(value);
}

function asRecord(body: unknown): Record<string, unknown> | null {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

// ---------------------------------------------------------------------------------------------
// State-only sync messages (ADR-015). Each parser builds a fresh object from known fields only,
// so unknown fields (an image, a blob, anything) are dropped, never relayed.
// ---------------------------------------------------------------------------------------------

const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;
const PLAN_ID = /^[A-Za-z0-9:._-]{1,64}$/;
const MAX_STEP_INDEX = 999;
const MAX_ALGORITHM_CHARS = 600;
const MAX_ALGORITHM_MOVES = 200;
export const MIN_PLAYBACK_SPEED = 0.25;
export const MAX_PLAYBACK_SPEED = 4;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function isIntIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function nineOf<T>(value: unknown, check: (v: unknown) => v is T): T[] | null {
  return Array.isArray(value) && value.length === 9 && value.every(check) ? (value.slice() as T[]) : null;
}

const isUnit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const isByte = (v: unknown): v is number => isIntIn(v, 0, 255);
const isTileRgb = (v: unknown): v is TileRgb => Array.isArray(v) && v.length === 3 && v.every(isByte);

export function parseCubeStateValue(value: unknown): CubeState | null {
  const s = asRecord(value);
  if (!s) return null;
  const state = {} as Record<Face, CubeColor[]>;
  for (const face of FACES) {
    const stickers = nineOf(s[face], isCubeColor);
    if (!stickers) return null;
    state[face] = stickers;
  }
  return state as unknown as CubeState;
}

function parseFaceScanned(p: Record<string, unknown>): ParseResult<FaceScannedPayload> {
  if (!isFace(p.face)) return fail('Invalid face identifier');
  const colors = nineOf(p.colors, isCubeColor);
  if (!colors) return fail('colors must be 9 cube colors');
  const confidences = nineOf(p.confidences, isUnit);
  if (!confidences) return fail('confidences must be 9 numbers from 0 to 1');
  const tileRgb = nineOf(p.tileRgb, isTileRgb);
  if (!tileRgb) return fail('tileRgb must be 9 [r, g, b] triples of integers 0-255');
  const capturedAt = typeof p.capturedAt === 'number' && Number.isFinite(p.capturedAt) ? p.capturedAt : Date.now();
  return {
    ok: true,
    value: {
      face: p.face,
      colors,
      confidences,
      tileRgb: tileRgb.map(([r, g, b]): TileRgb => [r, g, b]),
      capturedAt,
    },
  };
}

function parseStep(p: Record<string, unknown>): ParseResult<StepPayload> {
  if (!isOneOf(STEP_METHODS, p.method)) return fail('Unknown method');
  if (!isIntIn(p.stepIndex, 0, MAX_STEP_INDEX)) return fail('Invalid stepIndex');
  if (typeof p.planId !== 'string' || !PLAN_ID.test(p.planId)) return fail('Invalid planId');
  const value: StepPayload = { method: p.method, stepIndex: p.stepIndex, planId: p.planId };
  if (p.algorithm !== undefined) {
    if (typeof p.algorithm !== 'string' || p.algorithm.length > MAX_ALGORITHM_CHARS) return fail('Invalid algorithm');
    try {
      if (parseAlgorithm(p.algorithm).length > MAX_ALGORITHM_MOVES) return fail('Algorithm too long');
    } catch {
      return fail('Invalid algorithm');
    }
    value.algorithm = p.algorithm.trim();
  }
  if (p.stepCount !== undefined) {
    if (!isIntIn(p.stepCount, 0, MAX_STEP_INDEX + 1)) return fail('Invalid stepCount');
    value.stepCount = p.stepCount;
  }
  if (p.solveStartedAt !== undefined) {
    if (typeof p.solveStartedAt !== 'string' || p.solveStartedAt.length > 40 || Number.isNaN(Date.parse(p.solveStartedAt))) {
      return fail('Invalid solveStartedAt');
    }
    value.solveStartedAt = p.solveStartedAt;
  }
  return { ok: true, value };
}

function parsePlayback(p: Record<string, unknown>): ParseResult<PlaybackPayload> {
  if (!isOneOf(PLAYBACK_ACTIONS, p.action)) return fail('Unknown playback action');
  const value: PlaybackPayload = { action: p.action };
  if (p.action === 'seek' || p.action === 'index') {
    if (!isIntIn(p.index, -1, MAX_ALGORITHM_MOVES)) return fail('index must be an integer from -1');
    value.index = p.index;
  }
  if (p.action === 'speed') {
    if (typeof p.speed !== 'number' || !(p.speed >= MIN_PLAYBACK_SPEED && p.speed <= MAX_PLAYBACK_SPEED)) {
      return fail(`speed must be from ${MIN_PLAYBACK_SPEED} to ${MAX_PLAYBACK_SPEED}`);
    }
    value.speed = p.speed;
  }
  return { ok: true, value };
}

function parseGrip(p: Record<string, unknown>): ParseResult<GripPayload> {
  if (!isCubeColor(p.top) || !isCubeColor(p.front)) return fail('Grip colors must be cube colors');
  const grip = { top: p.top, front: p.front };
  if (!isValidGrip(grip)) return fail('Impossible grip');
  const value: GripPayload = grip;
  if (p.planId !== undefined) {
    if (typeof p.planId !== 'string' || !PLAN_ID.test(p.planId)) return fail('Invalid planId');
    value.planId = p.planId;
  }
  if (p.stepIndex !== undefined) {
    if (!isIntIn(p.stepIndex, 0, MAX_STEP_INDEX)) return fail('Invalid stepIndex');
    value.stepIndex = p.stepIndex;
  }
  return { ok: true, value };
}

function parseCheckpoint(p: Record<string, unknown>): ParseResult<CheckpointResultPayload> {
  if (typeof p.planId !== 'string' || !PLAN_ID.test(p.planId)) return fail('Invalid planId');
  if (!isIntIn(p.stepIndex, 0, MAX_STEP_INDEX)) return fail('Invalid stepIndex');
  if (!isOneOf(CHECKPOINT_RESULTS, p.result)) return fail('Unknown checkpoint result');
  const value: CheckpointResultPayload = { planId: p.planId, stepIndex: p.stepIndex, result: p.result };
  if (p.mistakes !== undefined) {
    if (!Array.isArray(p.mistakes) || p.mistakes.length > 5 || !p.mistakes.every((m) => isOneOf(MISTAKE_KINDS, m))) {
      return fail('Invalid mistakes');
    }
    value.mistakes = p.mistakes.slice();
  }
  return { ok: true, value };
}

function parsePresence(p: Record<string, unknown>): ParseResult<PresencePayload> {
  if (typeof p.visible !== 'boolean') return fail('visible must be a boolean');
  const value: PresencePayload = { visible: p.visible };
  if (p.screen !== undefined) {
    if (!isOneOf(PRESENCE_SCREENS, p.screen)) return fail('Unknown screen');
    value.screen = p.screen;
  }
  return { ok: true, value };
}

function parseScanControl(p: Record<string, unknown>): ParseResult<ScanControlPayload> {
  if (p.action === 'rescan') {
    return isFace(p.face) ? { ok: true, value: { action: 'rescan', face: p.face } } : fail('Invalid face identifier');
  }
  if (p.action === 'confirmed' || p.action === 'reset') return { ok: true, value: { action: p.action } };
  return fail('Unknown scan action');
}

function wrap<T extends SyncMessage>(type: T['type'], r: ParseResult<T['payload']>): ParseResult<SyncMessage> {
  return r.ok ? { ok: true, value: { type, payload: r.value } as SyncMessage } : r;
}

/** Validates one message payload of the given type. */
export function parseSyncPayload(type: SyncMessageType, payload: unknown): ParseResult<SyncMessage> {
  const p = asRecord(payload);
  if (!p) return fail('payload must be an object');
  switch (type) {
    case 'cube-state': {
      const state = parseCubeStateValue(p.state);
      return state ? { ok: true, value: { type, payload: { state } } } : fail('state must be 6 faces of 9 cube colors');
    }
    case 'face-scanned':
      return wrap(type, parseFaceScanned(p));
    case 'step':
      return wrap(type, parseStep(p));
    case 'playback':
      return wrap(type, parsePlayback(p));
    case 'grip':
      return wrap(type, parseGrip(p));
    case 'checkpoint-result':
      return wrap(type, parseCheckpoint(p));
    case 'presence':
      return wrap(type, parsePresence(p));
    case 'scan-control':
      return wrap(type, parseScanControl(p));
  }
}

/** Validates a whole request body for `POST /api/session/[id]/messages`. */
export function parseSyncMessage(body: unknown): ParseResult<SyncMessageInput> {
  const b = asRecord(body);
  if (!b) return fail('Expected a JSON object');
  if (!isOneOf(DEVICE_ROLES, b.role)) return fail('role must be desktop or mobile');
  if (typeof b.clientId !== 'string' || !CLIENT_ID.test(b.clientId)) return fail('Invalid clientId');
  if (!isOneOf(SYNC_MESSAGE_TYPES, b.type)) return fail('Unknown message type');
  const parsed = parseSyncPayload(b.type, b.payload);
  if (!parsed.ok) return parsed;
  return { ok: true, value: { ...parsed.value, role: b.role, clientId: b.clientId } as SyncMessageInput };
}
