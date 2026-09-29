/**
 * Cubyntra - Session Relay & Sync Unit Tests
 * Necookie Labs (c) 2026
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { sessionManager } from '../src/sync/sessionManager';
import { CapturedFacePayload, SessionEvent } from '../src/sync/types';
import { FACES } from '../src/cube/constants';

describe('SessionManager Sync Engine', () => {
  beforeEach(() => {
    sessionManager.clearAll();
  });

  it('generates a unique 6-character session ID', () => {
    const id = sessionManager.generateSessionId();
    expect(id).toMatch(/^[a-z0-9]{3}-[a-z0-9]{3}$/);
  });

  it('creates and retrieves a new ephemeral session', () => {
    const session = sessionManager.createSession('test-123');
    expect(session.id).toBe('test-123');
    expect(session.desktopConnected).toBe(true);
    expect(session.mobileConnected).toBe(false);
    expect(session.isComplete).toBe(false);

    const retrieved = sessionManager.getSession('test-123');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe('test-123');
  });

  it('broadcasts published events to active subscribers', () => {
    sessionManager.createSession('test-broadcast');

    const receivedEvents: SessionEvent[] = [];
    const unsubscribe = sessionManager.subscribe('test-broadcast', (event) => {
      receivedEvents.push(event);
    });

    sessionManager.publish({
      type: 'CLIENT_CONNECTED',
      sessionId: 'test-broadcast',
      sender: 'mobile',
      timestamp: Date.now(),
    });

    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0].type).toBe('CLIENT_CONNECTED');
    expect(receivedEvents[0].sender).toBe('mobile');

    const session = sessionManager.getSession('test-broadcast');
    expect(session?.mobileConnected).toBe(true);

    unsubscribe();

    sessionManager.publish({
      type: 'PING',
      sessionId: 'test-broadcast',
      sender: 'system',
      timestamp: Date.now(),
    });

    // Should not receive ping after unsubscribing
    expect(receivedEvents.length).toBe(1);
  });

  it('records captured faces and marks complete when all 6 faces are submitted', () => {
    const session = sessionManager.createSession('test-complete');

    FACES.forEach((face, index) => {
      const payload: CapturedFacePayload = {
        face,
        centerColor: 'white',
        stickers: Array(9).fill('white'),
        confidences: Array(9).fill(1.0),
        capturedAt: Date.now(),
      };

      const updated = sessionManager.recordFace('test-complete', payload);
      expect(updated).not.toBeNull();
      if (index < 5) {
        expect(updated?.isComplete).toBe(false);
      } else {
        expect(updated?.isComplete).toBe(true);
      }
    });

    const finalSession = sessionManager.getSession('test-complete');
    expect(finalSession?.isComplete).toBe(true);
    expect(Object.keys(finalSession?.scannedFaces || {}).length).toBe(6);
  });

  it('supports face removal and session reset', () => {
    sessionManager.createSession('test-reset');

    const payload: CapturedFacePayload = {
      face: 'U',
      centerColor: 'white',
      stickers: Array(9).fill('white'),
      confidences: Array(9).fill(1.0),
      capturedAt: Date.now(),
    };

    sessionManager.recordFace('test-reset', payload);
    let session = sessionManager.getSession('test-reset');
    expect(session?.scannedFaces.U).toBeDefined();

    sessionManager.removeFace('test-reset', 'U');
    session = sessionManager.getSession('test-reset');
    expect(session?.scannedFaces.U).toBeUndefined();

    sessionManager.recordFace('test-reset', payload);
    sessionManager.resetSession('test-reset');
    session = sessionManager.getSession('test-reset');
    expect(Object.keys(session?.scannedFaces || {}).length).toBe(0);
  });
});
