/**
 * Cubyntra - Face Photo Relay Tests
 * Necookie Labs (c) 2026
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { sessionManager } from '../src/sync/sessionManager';
import { CapturedFaceImagePayload, SessionEvent } from '../src/sync/types';
import { FACES } from '../src/cube/constants';
import { Face } from '../src/cube/types';

const PIXELS = 'data:image/jpeg;base64,' + 'A'.repeat(4096);

function photo(face: Face): CapturedFaceImagePayload {
  return { face, imageDataUrl: PIXELS, capturedAt: Date.now() };
}

describe('SessionManager face photo relay', () => {
  beforeEach(() => {
    sessionManager.clearAll();
  });

  it('announces a photo without putting pixels on the event stream', () => {
    sessionManager.createSession('img-notice');
    const events: SessionEvent[] = [];
    sessionManager.subscribe('img-notice', (e) => events.push(e));

    sessionManager.recordFaceImage('img-notice', photo('F'));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('FACE_IMAGE');
    expect(JSON.stringify(events[0])).not.toContain('base64');
    expect(sessionManager.getFaceImage('img-notice', 'F')?.imageDataUrl).toBe(PIXELS);
  });

  it('never exposes pixels through the serialized session state', () => {
    sessionManager.createSession('img-leak');
    for (const face of FACES) sessionManager.recordFaceImage('img-leak', photo(face));

    const serialized = JSON.stringify(sessionManager.getSession('img-leak'));
    expect(serialized).not.toContain('base64');
    expect(sessionManager.getSession('img-leak')?.imageFaces).toHaveLength(6);
  });

  it('completes only once every face has an accepted verdict', () => {
    sessionManager.createSession('img-verdict');
    for (const face of FACES) {
      sessionManager.recordFaceImage('img-verdict', photo(face));
      sessionManager.recordVerdict('img-verdict', { face, accepted: face !== 'B' });
    }
    expect(sessionManager.getSession('img-verdict')?.isComplete).toBe(false);

    sessionManager.recordVerdict('img-verdict', { face: 'B', accepted: true });
    expect(sessionManager.getSession('img-verdict')?.isComplete).toBe(true);
  });

  it('invalidates the old verdict when a face is photographed again', () => {
    sessionManager.createSession('img-retake');
    sessionManager.recordFaceImage('img-retake', photo('R'));
    sessionManager.recordVerdict('img-retake', { face: 'R', accepted: false, reason: 'Glare' });

    sessionManager.recordFaceImage('img-retake', photo('R'));
    expect(sessionManager.getSession('img-retake')?.verdicts.R).toBeUndefined();
  });

  it('drops every photo when the scan is confirmed', () => {
    sessionManager.createSession('img-confirm');
    const events: SessionEvent[] = [];
    sessionManager.subscribe('img-confirm', (e) => events.push(e));
    for (const face of FACES) sessionManager.recordFaceImage('img-confirm', photo(face));

    sessionManager.confirmScan('img-confirm');

    for (const face of FACES) expect(sessionManager.getFaceImage('img-confirm', face)).toBeNull();
    expect(sessionManager.getSession('img-confirm')?.imageFaces).toEqual([]);
    expect(events.at(-1)?.type).toBe('SCAN_CONFIRMED');
  });

  it('drops photos on reset and on delete', () => {
    sessionManager.createSession('img-reset');
    sessionManager.recordFaceImage('img-reset', photo('U'));
    sessionManager.resetSession('img-reset');
    expect(sessionManager.getFaceImage('img-reset', 'U')).toBeNull();

    sessionManager.recordFaceImage('img-reset', photo('U'));
    sessionManager.deleteSession('img-reset');
    expect(sessionManager.getFaceImage('img-reset', 'U')).toBeNull();
  });

  it('relays a rescan request for a specific face', () => {
    sessionManager.createSession('img-rescan');
    const events: SessionEvent[] = [];
    sessionManager.subscribe('img-rescan', (e) => events.push(e));

    sessionManager.requestRescan('img-rescan', 'L');
    expect(events[0]).toMatchObject({ type: 'RESCAN_REQUEST', payload: { face: 'L' } });
  });
});

describe('SessionManager expiry', () => {
  beforeEach(() => {
    sessionManager.clearAll();
  });

  it('expires a session left idle past the TTL', () => {
    const s = sessionManager.createSession('exp-idle');
    const later = s.lastActiveAt + 31 * 60 * 1000;
    expect(sessionManager.purgeExpired(later)).toEqual(['exp-idle']);
    expect(sessionManager.getSession('exp-idle')).toBeNull();
  });

  it('keeps a session alive while a client stream keeps touching it', () => {
    const s = sessionManager.createSession('exp-live');
    // A connected stream pings every 15 s; simulate 40 minutes of pings with no scanning.
    let now = s.lastActiveAt;
    for (let i = 0; i < 160; i++) {
      now += 15_000;
      expect(sessionManager.touch('exp-live', now)).toBe(true);
      sessionManager.purgeExpired(now);
    }
    expect(sessionManager.getSession('exp-live')).not.toBeNull();
  });

  it('reports a session that no longer exists', () => {
    expect(sessionManager.touch('never-created')).toBe(false);
  });
});
