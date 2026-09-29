/**
 * Cubyntra - Mobile Companion & Session Synchronization Types
 * Necookie Labs (c) 2026
 */

import { Face, CubeColor } from '../cube/types';

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
