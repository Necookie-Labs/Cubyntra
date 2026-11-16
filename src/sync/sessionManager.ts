/**
 * Cubyntra - In-Memory Sync Session Relay (server only)
 * Necookie Labs (c) 2026
 *
 * Relays small state messages between the laptop and the phone (ADR-015). Sessions live in this
 * process's memory only: nothing is written to disk and no message ever carries an image.
 *
 * - Ids, secrets and typed codes come from the crypto RNG (`./pairing`).
 * - At most MAX_SESSIONS exist; creating one more evicts the least recently used session that has
 *   no open stream, or fails when every session is in use.
 * - A session expires after SESSION_IDLE_MS without activity (an open stream's keep-alive counts
 *   as activity) and after SESSION_MAX_LIFETIME_MS regardless. A typed code works once, for
 *   PAIRING_CODE_TTL_MS.
 * - Open streams are counted per role, so two laptop tabs closing one at a time never report the
 *   laptop as gone while the other is still open.
 * - Every relayed message gets the next per-session sequence number. Devices apply playback
 *   commands in sequence order, so the last writer wins.
 */

import { Face } from '../cube/types';
import { newPairingCode, newSessionId, newSessionSecret, secretsMatch } from './pairing';
import {
  ConnectionCounts,
  DeviceRole,
  FaceScannedPayload,
  PlaybackState,
  PresencePayload,
  SessionSnapshot,
  StreamEvent,
  SyncEvent,
  SyncMessageInput,
} from './types';

export const MAX_SESSIONS = 8;
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_MAX_LIFETIME_MS = 12 * 60 * 60 * 1000;
export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

type Listener = (event: StreamEvent) => void;

interface SessionRecord {
  id: string;
  secret: string;
  code: string | null;
  codeExpiresAt: number;
  createdAt: number;
  lastActiveAt: number;
  seq: number;
  connections: ConnectionCounts;
  listeners: Set<Listener>;
  faces: Partial<Record<Face, FaceScannedPayload>>;
  cubeState: SyncEvent | null;
  step: SyncEvent | null;
  grip: SyncEvent | null;
  checkpoint: SyncEvent | null;
  playback: PlaybackState;
  presence: Partial<Record<DeviceRole, PresencePayload>>;
  scanConfirmed: boolean;
}

/** What the laptop gets back when it creates a session. */
export interface CreatedSession {
  id: string;
  secret: string;
  code: string;
  codeExpiresAt: number;
}

export type AuthResult = { ok: true } | { ok: false; status: 403 | 404 };

const INITIAL_PLAYBACK: PlaybackState = { playing: false, index: -1, speed: 1, seq: 0 };

export class SessionManager {
  private sessions = new Map<string, SessionRecord>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => this.purgeExpired(Date.now()), 60 * 1000);
      this.cleanupInterval.unref?.();
    }
  }

  /** Creates a session, or returns null when MAX_SESSIONS are all in use. */
  public createSession(now = Date.now()): CreatedSession | null {
    this.purgeExpired(now);
    if (this.sessions.size >= MAX_SESSIONS && !this.evictIdle()) return null;

    const usedCodes = new Set([...this.sessions.values()].map((s) => s.code));
    let code = newPairingCode();
    while (usedCodes.has(code)) code = newPairingCode();

    const record: SessionRecord = {
      id: newSessionId(),
      secret: newSessionSecret(),
      code,
      codeExpiresAt: now + PAIRING_CODE_TTL_MS,
      createdAt: now,
      lastActiveAt: now,
      seq: 0,
      connections: { desktop: 0, mobile: 0 },
      listeners: new Set(),
      faces: {},
      cubeState: null,
      step: null,
      grip: null,
      checkpoint: null,
      playback: { ...INITIAL_PLAYBACK },
      presence: {},
      scanConfirmed: false,
    };
    this.sessions.set(record.id, record);
    return { id: record.id, secret: record.secret, code, codeExpiresAt: record.codeExpiresAt };
  }

  /** Drops the least recently active session with no open stream. */
  private evictIdle(): boolean {
    let victim: SessionRecord | null = null;
    for (const s of this.sessions.values()) {
      if (s.connections.desktop + s.connections.mobile > 0) continue;
      if (!victim || s.lastActiveAt < victim.lastActiveAt) victim = s;
    }
    if (!victim) return false;
    this.deleteSession(victim.id, 'expired');
    return true;
  }

  /** Checks a presented secret in constant time. 404 for an unknown session, 403 for a wrong secret. */
  public authorize(id: string, secret: string | null | undefined): AuthResult {
    const session = this.sessions.get(id);
    if (!session) return { ok: false, status: 404 };
    return secretsMatch(secret, session.secret) ? { ok: true } : { ok: false, status: 403 };
  }

  /**
   * Trades a typed code for the session's credentials. A code works once and only until it
   * expires; a wrong or used code returns null.
   */
  public claimCode(code: string, now = Date.now()): { sessionId: string; secret: string } | null {
    for (const s of this.sessions.values()) {
      if (s.code !== null && secretsMatch(code, s.code)) {
        if (now > s.codeExpiresAt) return null;
        s.code = null;
        s.lastActiveAt = now;
        return { sessionId: s.id, secret: s.secret };
      }
    }
    return null;
  }

  public has(id: string): boolean {
    return this.sessions.has(id);
  }

  public get size(): number {
    return this.sessions.size;
  }

  /** Marks a session as in use. Returns false if it no longer exists. */
  public touch(id: string, now = Date.now()): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.lastActiveAt = now;
    return true;
  }

  public snapshot(id: string): SessionSnapshot | null {
    const s = this.sessions.get(id);
    if (!s) return null;
    return {
      sessionId: s.id,
      seq: s.seq,
      connections: { ...s.connections },
      faces: { ...s.faces },
      cubeState: s.cubeState,
      step: s.step,
      grip: s.grip,
      checkpoint: s.checkpoint,
      playback: { ...s.playback },
      presence: { ...s.presence },
      scanConfirmed: s.scanConfirmed,
    };
  }

  public subscribe(id: string, listener: Listener): () => void {
    const session = this.sessions.get(id);
    if (!session) return () => {};
    session.listeners.add(listener);
    return () => {
      session.listeners.delete(listener);
    };
  }

  public listenerCount(id: string): number {
    return this.sessions.get(id)?.listeners.size ?? 0;
  }

  /**
   * Counts an open stream for `role` and announces the new counts. Returns a release function
   * that is safe to call more than once.
   */
  public connect(id: string, role: DeviceRole): () => void {
    const session = this.sessions.get(id);
    if (!session) return () => {};
    session.connections[role]++;
    session.lastActiveAt = Date.now();
    this.broadcast(session, { kind: 'connections', connections: { ...session.connections } });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      session.connections[role] = Math.max(0, session.connections[role] - 1);
      if (this.sessions.get(id) === session) {
        this.broadcast(session, { kind: 'connections', connections: { ...session.connections } });
      }
    };
  }

  /** Records a validated message, stamps it with the next sequence number and relays it. */
  public publish(id: string, message: SyncMessageInput, now = Date.now()): SyncEvent | null {
    const s = this.sessions.get(id);
    if (!s) return null;
    s.lastActiveAt = now;
    const event = { ...message, seq: ++s.seq, at: now } as SyncEvent;

    switch (event.type) {
      case 'face-scanned':
        s.faces[event.payload.face] = event.payload;
        s.scanConfirmed = false;
        break;
      case 'scan-control':
        if (event.payload.action === 'rescan') {
          delete s.faces[event.payload.face];
          s.scanConfirmed = false;
        } else if (event.payload.action === 'confirmed') {
          s.scanConfirmed = true;
        } else {
          s.faces = {};
          s.scanConfirmed = false;
          s.cubeState = null;
          s.step = null;
          s.checkpoint = null;
          s.playback = { ...INITIAL_PLAYBACK, speed: s.playback.speed, seq: event.seq };
        }
        break;
      case 'cube-state':
        s.cubeState = event;
        break;
      case 'step':
        s.step = event;
        break;
      case 'grip':
        s.grip = event;
        break;
      case 'checkpoint-result':
        s.checkpoint = event;
        break;
      case 'presence':
        s.presence[event.role] = event.payload;
        break;
      case 'playback': {
        const p = event.payload;
        const next = { ...s.playback, seq: event.seq };
        if (p.action === 'play') next.playing = true;
        if (p.action === 'pause') next.playing = false;
        if ((p.action === 'seek' || p.action === 'index') && p.index !== undefined) next.index = p.index;
        if (p.action === 'seek') next.playing = false;
        if (p.action === 'speed' && p.speed !== undefined) next.speed = p.speed;
        s.playback = next;
        break;
      }
    }

    this.broadcast(s, { kind: 'message', event });
    return event;
  }

  /** Removes a session; open streams are told why and then closed. */
  public deleteSession(id: string, reason: 'expired' | 'deleted' = 'deleted'): void {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    this.broadcast(session, { kind: 'ended', reason });
    session.listeners.clear();
  }

  /** Deletes sessions idle past SESSION_IDLE_MS or older than SESSION_MAX_LIFETIME_MS. */
  public purgeExpired(now: number): string[] {
    const removed: string[] = [];
    for (const s of [...this.sessions.values()]) {
      if (now - s.lastActiveAt > SESSION_IDLE_MS || now - s.createdAt > SESSION_MAX_LIFETIME_MS) {
        this.deleteSession(s.id, 'expired');
        removed.push(s.id);
      }
    }
    return removed;
  }

  /** Test helper. */
  public clearAll(): void {
    for (const id of [...this.sessions.keys()]) this.deleteSession(id);
  }

  private broadcast(session: SessionRecord, event: StreamEvent): void {
    for (const listener of [...session.listeners]) {
      try {
        listener(event);
      } catch (err) {
        console.error('[SessionManager] Listener error:', err);
      }
    }
  }
}

// One instance per server process, kept across dev-server hot reloads.
const globalForSession = globalThis as unknown as { cubyntraSyncSessions?: SessionManager };

export const sessionManager = globalForSession.cubyntraSyncSessions ?? new SessionManager();

if (process.env.NODE_ENV !== 'production') {
  globalForSession.cubyntraSyncSessions = sessionManager;
}
