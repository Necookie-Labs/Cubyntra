/**
 * Cubyntra - In-Memory Ephemeral Session Relay Manager
 * Necookie Labs (c) 2026
 *
 * Provides real-time synchronization between desktop 3D twin and mobile companion.
 * Follows ADR-001: Zero persistent database storage. All session data is ephemeral in-memory.
 */

import {
  SessionState,
  SessionEvent,
  CapturedFacePayload,
  CapturedFaceImagePayload,
  FaceImageNotice,
  FaceVerdictPayload,
} from './types';
import { Face } from '../cube/types';
import { FACES } from '../cube/constants';

type EventListener = (event: SessionEvent) => void;

class SessionManager {
  private sessions: Map<string, SessionState> = new Map();
  private listeners: Map<string, Set<EventListener>> = new Map();
  // Photos are kept apart from SessionState so they can never leak into a JSON snapshot
  // or be replayed to reconnecting clients. Cleared on confirm, reset, delete, and expiry.
  private images: Map<string, Partial<Record<Face, CapturedFaceImagePayload>>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.startCleanupTimer();
  }

  private startCleanupTimer() {
    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [id, session] of this.sessions.entries()) {
          if (now - session.lastActiveAt > this.SESSION_TTL_MS) {
            this.deleteSession(id);
          }
        }
      }, 60 * 1000);
      if (this.cleanupInterval.unref) {
        this.cleanupInterval.unref();
      }
    }
  }

  /**
   * Generates a 6-character human-friendly session ID (e.g. "cb-7x9q")
   */
  public generateSessionId(): string {
    const chars = '23456789abcdefghjkmnpqrstuvwxyz';
    let id = '';
    for (let i = 0; i < 6; i++) {
      if (i === 3) id += '-';
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }

  /**
   * Creates a new ephemeral scanning session
   */
  public createSession(preferredId?: string): SessionState {
    const id = preferredId || this.generateSessionId();
    const now = Date.now();

    const session: SessionState = {
      id,
      createdAt: now,
      lastActiveAt: now,
      desktopConnected: true,
      mobileConnected: false,
      scannedFaces: {},
      imageFaces: [],
      verdicts: {},
      isComplete: false,
    };

    this.sessions.set(id, session);
    this.listeners.set(id, new Set());
    return session;
  }

  /**
   * Retrieves an active session by ID
   */
  public getSession(id: string): SessionState | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    session.lastActiveAt = Date.now();
    return session;
  }

  /**
   * Subscribes a listener to events for a specific session
   */
  public subscribe(sessionId: string, listener: EventListener): () => void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set());
    }
    const set = this.listeners.get(sessionId)!;
    set.add(listener);

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(sessionId);
      }
    };
  }

  /**
   * Broadcasts an event to all subscribers of a session
   */
  public publish(event: SessionEvent): void {
    const session = this.sessions.get(event.sessionId);
    if (session) {
      session.lastActiveAt = Date.now();
      if (event.type === 'CLIENT_CONNECTED') {
        if (event.sender === 'mobile') session.mobileConnected = true;
        if (event.sender === 'desktop') session.desktopConnected = true;
      } else if (event.type === 'CLIENT_DISCONNECTED') {
        if (event.sender === 'mobile') session.mobileConnected = false;
        if (event.sender === 'desktop') session.desktopConnected = false;
      }
    }

    const set = this.listeners.get(event.sessionId);
    if (set) {
      for (const listener of set) {
        try {
          listener(event);
        } catch (err) {
          console.error('[SessionManager] Listener error:', err);
        }
      }
    }
  }

  /**
   * Records a scanned face captured by the mobile companion
   */
  public recordFace(sessionId: string, facePayload: CapturedFacePayload): SessionState | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.lastActiveAt = Date.now();
    session.scannedFaces[facePayload.face] = facePayload;

    // Check if all 6 canonical faces are present
    const completedFaces = FACES.filter((f) => session.scannedFaces[f] !== undefined);
    session.isComplete = completedFaces.length === 6;

    this.publish({
      type: 'FACE_CAPTURED',
      sessionId,
      sender: 'mobile',
      payload: facePayload,
      timestamp: Date.now(),
    });

    return session;
  }

  /**
   * Stores a face photo in memory and notifies subscribers that it can be fetched.
   * A new photo of a face supersedes any earlier photo and verdict for it.
   */
  public recordFaceImage(sessionId: string, payload: CapturedFaceImagePayload): SessionState | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.lastActiveAt = Date.now();
    const stored = this.images.get(sessionId) ?? {};
    stored[payload.face] = payload;
    this.images.set(sessionId, stored);

    if (!session.imageFaces.includes(payload.face)) session.imageFaces.push(payload.face);
    delete session.verdicts[payload.face];
    // A photo is proof the phone is there, even before or without its event stream.
    session.mobileConnected = true;
    session.isComplete = false;

    const notice: FaceImageNotice = {
      face: payload.face,
      capturedAt: payload.capturedAt,
      quality: payload.quality,
    };
    this.publish({
      type: 'FACE_IMAGE',
      sessionId,
      sender: 'mobile',
      payload: notice,
      timestamp: Date.now(),
    });

    return session;
  }

  public getFaceImage(sessionId: string, face: Face): CapturedFaceImagePayload | null {
    return this.images.get(sessionId)?.[face] ?? null;
  }

  /**
   * Records the desktop's accept/retake decision for a face and relays it to the phone.
   */
  public recordVerdict(sessionId: string, verdict: FaceVerdictPayload): SessionState | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.lastActiveAt = Date.now();
    session.verdicts[verdict.face] = verdict;
    session.isComplete = FACES.every((f) => session.verdicts[f]?.accepted === true);

    this.publish({
      type: 'FACE_VERDICT',
      sessionId,
      sender: 'desktop',
      payload: verdict,
      timestamp: Date.now(),
    });

    return session;
  }

  /** Asks the phone to return to a face so the user can shoot it again. */
  public requestRescan(sessionId: string, face: Face): SessionState | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.lastActiveAt = Date.now();
    this.publish({
      type: 'RESCAN_REQUEST',
      sessionId,
      sender: 'desktop',
      payload: { face },
      timestamp: Date.now(),
    });
    return session;
  }

  /** The user confirmed the reviewed cube: photos are no longer needed and are dropped. */
  public confirmScan(sessionId: string): SessionState | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.lastActiveAt = Date.now();
    this.clearImages(sessionId);
    this.publish({
      type: 'SCAN_CONFIRMED',
      sessionId,
      sender: 'desktop',
      timestamp: Date.now(),
    });
    return session;
  }

  public clearImages(sessionId: string): void {
    this.images.delete(sessionId);
    const session = this.sessions.get(sessionId);
    if (session) session.imageFaces = [];
  }

  /**
   * Removes or resets a specific face
   */
  public removeFace(sessionId: string, face: Face): SessionState | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.lastActiveAt = Date.now();
    delete session.scannedFaces[face];
    session.isComplete = false;

    this.publish({
      type: 'FACE_REMOVED',
      sessionId,
      sender: 'desktop',
      payload: { face },
      timestamp: Date.now(),
    });

    return session;
  }

  /**
   * Resets all faces for the session
   */
  public resetSession(sessionId: string): SessionState | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.lastActiveAt = Date.now();
    session.scannedFaces = {};
    session.verdicts = {};
    session.isComplete = false;
    this.clearImages(sessionId);

    this.publish({
      type: 'SESSION_RESET',
      sessionId,
      sender: 'desktop',
      timestamp: Date.now(),
    });

    return session;
  }

  /**
   * Permanently deletes a session and detaches all listeners
   */
  public deleteSession(id: string): void {
    this.sessions.delete(id);
    this.listeners.delete(id);
    this.images.delete(id);
  }

  /**
   * Helper for testing/inspections: clears all active sessions
   */
  public clearAll(): void {
    this.sessions.clear();
    this.listeners.clear();
    this.images.clear();
  }
}

// Global singleton instance preserved across Next.js dev server hot reloads
const globalForSession = globalThis as unknown as {
  cubyntraSessionManager?: SessionManager;
};

export const sessionManager =
  globalForSession.cubyntraSessionManager ?? new SessionManager();

if (process.env.NODE_ENV !== 'production') {
  globalForSession.cubyntraSessionManager = sessionManager;
}
