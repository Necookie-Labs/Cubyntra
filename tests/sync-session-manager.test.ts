/**
 * Cubyntra - Sync session manager tests
 * Necookie Labs (c) 2026
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_SESSIONS,
  PAIRING_CODE_TTL_MS,
  SESSION_IDLE_MS,
  SESSION_MAX_LIFETIME_MS,
  SessionManager,
} from '../src/sync/sessionManager';
import { StreamEvent, SyncMessageInput } from '../src/sync/types';

const from = (role: 'desktop' | 'mobile') => ({ role, clientId: `${role}-client-1` });

function playback(role: 'desktop' | 'mobile', payload: Record<string, unknown>): SyncMessageInput {
  return { type: 'playback', payload, ...from(role) } as unknown as SyncMessageInput;
}

let manager: SessionManager;
beforeEach(() => {
  manager?.clearAll();
  manager = new SessionManager();
});

describe('session lifecycle', () => {
  it('creates sessions with crypto ids, secrets and codes', () => {
    const a = manager.createSession()!;
    const b = manager.createSession()!;
    expect(a.id).not.toBe(b.id);
    expect(a.secret).not.toBe(b.secret);
    expect(a.code).toMatch(/^[2-9A-Z]{6}$/);
  });

  it('caps sessions and evicts the least recently used idle one', () => {
    const t0 = 1_000_000;
    const ids = Array.from({ length: MAX_SESSIONS }, (_, i) => manager.createSession(t0 + i)!.id);
    expect(manager.size).toBe(MAX_SESSIONS);
    manager.touch(ids[0], t0 + 100); // the oldest is used again, so ids[1] is now the stalest

    const extra = manager.createSession(t0 + 200);
    expect(extra).not.toBeNull();
    expect(manager.size).toBe(MAX_SESSIONS);
    expect(manager.has(ids[0])).toBe(true);
    expect(manager.has(ids[1])).toBe(false);
  });

  it('refuses a new session when every slot has an open stream', () => {
    for (let i = 0; i < MAX_SESSIONS; i++) manager.connect(manager.createSession()!.id, 'desktop');
    expect(manager.createSession()).toBeNull();
  });

  it('expires idle sessions and tells their streams', () => {
    const { id } = manager.createSession(0)!;
    const events: StreamEvent[] = [];
    manager.subscribe(id, (e) => events.push(e));
    expect(manager.purgeExpired(SESSION_IDLE_MS + 1)).toEqual([id]);
    expect(manager.has(id)).toBe(false);
    expect(events.at(-1)).toEqual({ kind: 'ended', reason: 'expired' });
  });

  it('keeps a touched session alive, but not past its maximum lifetime', () => {
    const { id } = manager.createSession(0)!;
    for (let t = 15_000; t < SESSION_MAX_LIFETIME_MS; t += 15 * 60_000) {
      manager.touch(id, t);
      expect(manager.purgeExpired(t)).toEqual([]);
    }
    manager.touch(id, SESSION_MAX_LIFETIME_MS + 1);
    expect(manager.purgeExpired(SESSION_MAX_LIFETIME_MS + 1)).toEqual([id]);
  });

  it('snapshots never contain the secret or the code', () => {
    const s = manager.createSession()!;
    const text = JSON.stringify(manager.snapshot(s.id));
    expect(text).not.toContain(s.secret);
    expect(text).not.toContain(s.code);
  });
});

describe('authorization and codes', () => {
  it('tells an unknown session (404) from a wrong secret (403)', () => {
    const s = manager.createSession()!;
    expect(manager.authorize(s.id, s.secret)).toEqual({ ok: true });
    expect(manager.authorize(s.id, 'A'.repeat(22))).toEqual({ ok: false, status: 403 });
    expect(manager.authorize(s.id, null)).toEqual({ ok: false, status: 403 });
    expect(manager.authorize('nope', s.secret)).toEqual({ ok: false, status: 404 });
  });

  it('a typed code works once', () => {
    const s = manager.createSession()!;
    expect(manager.claimCode(s.code)).toEqual({ sessionId: s.id, secret: s.secret });
    expect(manager.claimCode(s.code)).toBeNull();
  });

  it('a typed code expires', () => {
    const s = manager.createSession(0)!;
    expect(manager.claimCode(s.code, PAIRING_CODE_TTL_MS + 1)).toBeNull();
  });
});

describe('connections', () => {
  it('counts streams per role and releases each only once', () => {
    const { id } = manager.createSession()!;
    const events: StreamEvent[] = [];
    manager.subscribe(id, (e) => events.push(e));

    const tab1 = manager.connect(id, 'desktop');
    const tab2 = manager.connect(id, 'desktop');
    const phone = manager.connect(id, 'mobile');
    expect(manager.snapshot(id)!.connections).toEqual({ desktop: 2, mobile: 1 });

    tab1();
    tab1();
    expect(manager.snapshot(id)!.connections).toEqual({ desktop: 1, mobile: 1 });
    phone();
    tab2();
    expect(manager.snapshot(id)!.connections).toEqual({ desktop: 0, mobile: 0 });
    expect(events.filter((e) => e.kind === 'connections')).toHaveLength(6);
  });
});

describe('messages', () => {
  it('stamps a strictly increasing sequence number', () => {
    const { id } = manager.createSession()!;
    const seqs = [1, 2, 3].map(() => manager.publish(id, playback('mobile', { action: 'play' }))!.seq);
    expect(seqs).toEqual([1, 2, 3]);
  });

  it('merges playback so the last writer wins', () => {
    const { id } = manager.createSession()!;
    manager.publish(id, playback('desktop', { action: 'play' }));
    manager.publish(id, playback('desktop', { action: 'index', index: 4 }));
    const pause = manager.publish(id, playback('mobile', { action: 'pause' }))!;
    manager.publish(id, playback('mobile', { action: 'speed', speed: 2 }));
    expect(manager.snapshot(id)!.playback).toMatchObject({ playing: false, index: 4, speed: 2 });
    expect(manager.snapshot(id)!.playback.seq).toBeGreaterThan(pause.seq);
  });

  it('keeps scanned faces until a rescan or reset', () => {
    const { id } = manager.createSession()!;
    const face = {
      face: 'U' as const,
      colors: Array(9).fill('white'),
      confidences: Array(9).fill(1),
      tileRgb: Array(9).fill([240, 240, 240]),
      capturedAt: 1,
    };
    manager.publish(id, { type: 'face-scanned', payload: face, ...from('mobile') } as SyncMessageInput);
    manager.publish(id, { type: 'face-scanned', payload: { ...face, face: 'F' }, ...from('mobile') } as SyncMessageInput);
    expect(Object.keys(manager.snapshot(id)!.faces).sort()).toEqual(['F', 'U']);

    manager.publish(id, { type: 'scan-control', payload: { action: 'rescan', face: 'U' }, ...from('desktop') });
    expect(Object.keys(manager.snapshot(id)!.faces)).toEqual(['F']);

    manager.publish(id, { type: 'scan-control', payload: { action: 'confirmed' }, ...from('desktop') });
    expect(manager.snapshot(id)!.scanConfirmed).toBe(true);

    manager.publish(id, { type: 'scan-control', payload: { action: 'reset' }, ...from('mobile') });
    expect(manager.snapshot(id)!.faces).toEqual({});
    expect(manager.snapshot(id)!.scanConfirmed).toBe(false);
  });

  it('relays to subscribers and forgets them on delete', () => {
    const { id } = manager.createSession()!;
    const events: StreamEvent[] = [];
    manager.subscribe(id, (e) => events.push(e));
    manager.publish(id, { type: 'presence', payload: { visible: true }, ...from('mobile') });
    expect(events[0]).toMatchObject({ kind: 'message', event: { type: 'presence', seq: 1 } });

    manager.deleteSession(id);
    expect(events.at(-1)).toEqual({ kind: 'ended', reason: 'deleted' });
    expect(manager.listenerCount(id)).toBe(0);
    expect(manager.publish(id, { type: 'presence', payload: { visible: true }, ...from('mobile') })).toBeNull();
  });
});
