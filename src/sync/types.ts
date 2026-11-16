/**
 * Cubyntra - Phone <-> Laptop Sync Types (state-only protocol, ADR-015)
 * Necookie Labs (c) 2026
 *
 * Every message is a small JSON object describing cube state, a step, playback, the grip, a
 * checkpoint result, presence or the scan flow. No message type can carry an image.
 */

import { Face, CubeColor, CubeState } from '../cube/types';
import type { MistakeKind } from '../coach/types';

/** Which device sent a message. The laptop is `desktop`, the phone is `mobile`. */
export type DeviceRole = 'desktop' | 'mobile';

export const DEVICE_ROLES: readonly DeviceRole[] = ['desktop', 'mobile'];

/** Upper bound on one sync request body. A face-scanned message is about 600 bytes. */
export const MAX_SYNC_BODY_BYTES = 16 * 1024;

export const SYNC_MESSAGE_TYPES = [
  'cube-state',
  'face-scanned',
  'step',
  'playback',
  'grip',
  'checkpoint-result',
  'presence',
  'scan-control',
] as const;

export type SyncMessageType = (typeof SYNC_MESSAGE_TYPES)[number];

/** Mean color of one tile, integers 0-255. Nine of these describe a face; they are not an image. */
export type TileRgb = [number, number, number];

/** One face read on the phone: its colors, how sure it was, and the nine tile means. */
export interface FaceScannedPayload {
  face: Face;
  colors: CubeColor[];
  confidences: number[];
  /** Lets the laptop run the nine-per-color resolution across all six faces. */
  tileRgb: TileRgb[];
  capturedAt: number;
}

export interface CubeStatePayload {
  state: CubeState;
}

export const STEP_METHODS = ['solver', 'beginner', 'cfop'] as const;
export type StepMethod = (typeof STEP_METHODS)[number];

/** The step on screen: which method, which step, which plan, and optionally its moves. */
export interface StepPayload {
  method: StepMethod;
  stepIndex: number;
  planId: string;
  /** Move notation for the step (or the whole solution in solver mode). */
  algorithm?: string;
  stepCount?: number;
}

export const PLAYBACK_ACTIONS = ['play', 'pause', 'seek', 'index', 'speed'] as const;
export type PlaybackAction = (typeof PLAYBACK_ACTIONS)[number];

/**
 * `play` / `pause` / `seek` / `speed` are commands from either device. `index` reports the
 * position the animating device reached; the other device mirrors it.
 */
export interface PlaybackPayload {
  action: PlaybackAction;
  /** Move position, -1 = before the first move. Required for `seek` and `index`. */
  index?: number;
  /** Required for `speed`. */
  speed?: number;
}

export interface GripPayload {
  top: CubeColor;
  front: CubeColor;
}

export const CHECKPOINT_RESULTS = ['matched', 'mismatch', 'unsure'] as const;
export type CheckpointResultKind = (typeof CHECKPOINT_RESULTS)[number];

export interface CheckpointResultPayload {
  planId: string;
  stepIndex: number;
  result: CheckpointResultKind;
  mistakes?: MistakeKind[];
}

export const PRESENCE_SCREENS = ['pairing', 'scan', 'review', 'solve', 'idle'] as const;
export type PresenceScreen = (typeof PRESENCE_SCREENS)[number];

export interface PresencePayload {
  /** The page is in the foreground. */
  visible: boolean;
  screen?: PresenceScreen;
}

/** Scan flow between the devices: retake a face, scan confirmed, start over. */
export type ScanControlPayload = { action: 'rescan'; face: Face } | { action: 'confirmed' } | { action: 'reset' };

export type SyncMessage =
  | { type: 'cube-state'; payload: CubeStatePayload }
  | { type: 'face-scanned'; payload: FaceScannedPayload }
  | { type: 'step'; payload: StepPayload }
  | { type: 'playback'; payload: PlaybackPayload }
  | { type: 'grip'; payload: GripPayload }
  | { type: 'checkpoint-result'; payload: CheckpointResultPayload }
  | { type: 'presence'; payload: PresencePayload }
  | { type: 'scan-control'; payload: ScanControlPayload };

/** What a device posts to `/api/session/[id]/messages`. */
export type SyncMessageInput = SyncMessage & {
  role: DeviceRole;
  /** Random per page load; lets a device recognise its own messages coming back. */
  clientId: string;
};

/** A message as relayed: stamped by the server with a per-session monotonic sequence number. */
export type SyncEvent = SyncMessageInput & { seq: number; at: number };

export interface ConnectionCounts {
  desktop: number;
  mobile: number;
}

/** Merged playback position; each field holds the value from the newest message that set it. */
export interface PlaybackState {
  playing: boolean;
  index: number;
  speed: number;
  seq: number;
}

/** Everything a device needs after (re)connecting. Never contains the secret or any image. */
export interface SessionSnapshot {
  sessionId: string;
  seq: number;
  connections: ConnectionCounts;
  faces: Partial<Record<Face, FaceScannedPayload>>;
  cubeState: SyncEvent | null;
  step: SyncEvent | null;
  grip: SyncEvent | null;
  checkpoint: SyncEvent | null;
  playback: PlaybackState;
  presence: Partial<Record<DeviceRole, PresencePayload>>;
  scanConfirmed: boolean;
}

/** How often the event stream sends a `ping` frame while nothing else happens. */
export const PING_INTERVAL_MS = 15_000;

/** One frame on the event stream (`data: <json>`). */
export type StreamEvent =
  | { kind: 'snapshot'; snapshot: SessionSnapshot }
  | { kind: 'message'; event: SyncEvent }
  | { kind: 'connections'; connections: ConnectionCounts }
  | { kind: 'ping'; at: number }
  | { kind: 'ended'; reason: 'expired' | 'deleted' };
