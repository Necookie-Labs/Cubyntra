/**
 * Cubyntra - Mobile Companion & Session Synchronization Types
 * Necookie Labs (c) 2026
 */

import { Face, CubeColor, ScannedFace } from '../cube/types';

export type SessionEventType =
  | 'CLIENT_CONNECTED'
  | 'CLIENT_DISCONNECTED'
  | 'FACE_CAPTURED'
  | 'FACE_REMOVED'
  | 'SESSION_RESET'
  | 'STATE_SYNC'
  | 'PING';

export interface CapturedFacePayload {
  face: Face;
  centerColor: CubeColor;
  stickers: CubeColor[];
  confidences: number[];
  thumbnail?: string; // High-efficiency small data-URI thumbnail for visual feedback
  capturedAt: number;
}

export interface SessionEvent {
  type: SessionEventType;
  sessionId: string;
  sender: 'desktop' | 'mobile' | 'system';
  payload?: any;
  timestamp: number;
}

export interface SessionState {
  id: string;
  createdAt: number;
  lastActiveAt: number;
  desktopConnected: boolean;
  mobileConnected: boolean;
  scannedFaces: Partial<Record<Face, CapturedFacePayload>>;
  isComplete: boolean;
}
