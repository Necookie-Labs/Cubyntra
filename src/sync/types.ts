/**
 * Cubyntra - Mobile Companion & Session Synchronization Types
 * Necookie Labs (c) 2026
 */

import { Face, CubeColor, CubeState } from '../cube/types';
import type { MistakeKind } from '../coach/types';

export type SessionEventType =
  | 'CLIENT_CONNECTED'
  | 'CLIENT_DISCONNECTED'
  | 'FACE_CAPTURED'
  | 'FACE_REMOVED'
  | 'SESSION_RESET'
  | 'STATE_SYNC'
  | 'PING'
  | 'FACE_IMAGE' // mobile -> desktop: a photo is ready to fetch
  | 'FACE_VERDICT' // desktop -> mobile: the photo was accepted or needs a retake
  | 'RESCAN_REQUEST' // desktop -> mobile: jump back to a face from the review screen
  | 'SCAN_CONFIRMED'; // desktop -> mobile: the user confirmed all 54 stickers

export interface CapturedFacePayload {
  face: Face;
  centerColor: CubeColor;
  stickers: CubeColor[];
  confidences: number[];
  thumbnail?: string; // High-efficiency small data-URI thumbnail for visual feedback
  capturedAt: number;
}

/** Result of the phone's live capture checks at the moment the photo was taken. */
export interface CaptureQualitySummary {
  passed: boolean;
  failing: string[];
}

/**
 * A photo of one face, cropped on the phone to exactly the square the user framed.
 * Held in server memory only until the desktop confirms the scan; never persisted.
 */
export interface CapturedFaceImagePayload {
  face: Face;
  imageDataUrl: string;
  capturedAt: number;
  quality?: CaptureQualitySummary;
}

/** Lightweight notice broadcast when a photo arrives; the desktop fetches the image itself. */
export interface FaceImageNotice {
  face: Face;
  capturedAt: number;
  quality?: CaptureQualitySummary;
}

export interface FaceVerdictPayload {
  face: Face;
  accepted: boolean;
  /** Plain-language fix shown on the phone when a retake is needed. */
  reason?: string;
  /** The desktop's provisional reading, echoed so the phone can show what it saw. */
  previewColors?: CubeColor[];
}

export interface RescanRequestPayload {
  face: Face;
}

export interface SessionEvent {
  type: SessionEventType;
  sessionId: string;
  sender: 'desktop' | 'mobile' | 'system';
  payload?: unknown;
  timestamp: number;
}

export interface SessionState {
  id: string;
  createdAt: number;
  lastActiveAt: number;
  desktopConnected: boolean;
  mobileConnected: boolean;
  scannedFaces: Partial<Record<Face, CapturedFacePayload>>;
  /** Faces whose photo is held in memory; the pixels themselves are never in this object. */
  imageFaces: Face[];
  verdicts: Partial<Record<Face, FaceVerdictPayload>>;
  isComplete: boolean;
}

// ---------------------------------------------------------------------------------------------
// State-only sync protocol (ADR-015). Every message is a small JSON object; none carries pixels.
// ---------------------------------------------------------------------------------------------

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

/** One frame on the event stream (`data: <json>`). */
export type StreamEvent =
  | { kind: 'snapshot'; snapshot: SessionSnapshot }
  | { kind: 'message'; event: SyncEvent }
  | { kind: 'connections'; connections: ConnectionCounts }
  | { kind: 'ping'; at: number }
  | { kind: 'ended'; reason: 'expired' | 'deleted' };
