'use client';

/**
 * Cubyntra - Phone Side of a Scanning Session
 * Necookie Labs (c) 2026
 *
 * Sends face photos to the desktop and listens for its decisions: whether each photo
 * could be read, requests to retake a face, and confirmation that the scan is done.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CubeColor, Face } from '@/cube/types';
import { CaptureQualitySummary, FaceVerdictPayload, RescanRequestPayload, SessionEvent } from './types';

export type PhoneFaceStatus = 'sending' | 'reading' | 'accepted' | 'rejected';

/** How long to wait for the computer to read a photo before telling the user something is off. */
const VERDICT_TIMEOUT_MS = 15_000;

export interface MobileSession {
  connected: boolean;
  status: Partial<Record<Face, PhoneFaceStatus>>;
  reasons: Partial<Record<Face, string>>;
  previews: Partial<Record<Face, CubeColor[]>>;
  /** The user confirmed the scan on the computer. */
  confirmed: boolean;
  /** Latest request from the computer to retake a face; `at` distinguishes repeats. */
  rescanRequest: { face: Face; at: number } | null;
  sendPhoto: (face: Face, imageDataUrl: string, quality?: CaptureQualitySummary) => Promise<void>;
  reset: () => void;
  /** Scan another cube on the same pairing: clears this phone and tells the computer. */
  startOver: () => Promise<void>;
}

export function useMobileSession(sessionId: string | null): MobileSession {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<Partial<Record<Face, PhoneFaceStatus>>>({});
  const [reasons, setReasons] = useState<Partial<Record<Face, string>>>({});
  const [previews, setPreviews] = useState<Partial<Record<Face, CubeColor[]>>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [rescanRequest, setRescanRequest] = useState<{ face: Face; at: number } | null>(null);
  const timeouts = useRef<Partial<Record<Face, ReturnType<typeof setTimeout>>>>({});
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const settle = useCallback((face: Face, next: PhoneFaceStatus | undefined, reason?: string) => {
    clearTimeout(timeouts.current[face]);
    setStatus((s) => {
      const copy = { ...s };
      if (next) copy[face] = next;
      else delete copy[face];
      return copy;
    });
    setReasons((r) => ({ ...r, [face]: reason }));
  }, []);

  const reset = useCallback(() => {
    Object.values(timeouts.current).forEach((t) => clearTimeout(t));
    timeouts.current = {};
    setStatus({});
    setReasons({});
    setPreviews({});
    setConfirmed(false);
    setRescanRequest(null);
  }, []);

  const startOver = useCallback(async () => {
    reset();
    if (!sessionId) return;
    try {
      // The computer answers with SESSION_RESET and starts a fresh phone scan.
      await fetch(`/api/session/${sessionId}/reset`, { method: 'POST' });
    } catch {
      // If the computer cannot be reached, the next photo reports it.
    }
  }, [reset, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const es = new EventSource(`/api/session/${sessionId}/events?role=mobile`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      let event: SessionEvent;
      try {
        event = JSON.parse(msg.data) as SessionEvent;
      } catch {
        return;
      }
      switch (event.type) {
        case 'FACE_VERDICT': {
          const verdict = event.payload as FaceVerdictPayload;
          settle(verdict.face, verdict.accepted ? 'accepted' : 'rejected', verdict.reason);
          if (verdict.previewColors) setPreviews((p) => ({ ...p, [verdict.face]: verdict.previewColors }));
          break;
        }
        case 'RESCAN_REQUEST': {
          const { face } = event.payload as RescanRequestPayload;
          settle(face, undefined);
          setConfirmed(false);
          setRescanRequest({ face, at: event.timestamp });
          break;
        }
        case 'SCAN_CONFIRMED':
          setConfirmed(true);
          break;
        case 'SESSION_RESET':
          reset();
          break;
      }
    };
    return () => {
      es.close();
      setConnected(false);
    };
  }, [sessionId, settle, reset]);

  useEffect(() => {
    const pending = timeouts.current;
    return () => Object.values(pending).forEach((t) => clearTimeout(t));
  }, []);

  const sendPhoto = useCallback(
    async (face: Face, imageDataUrl: string, quality?: CaptureQualitySummary) => {
      // Without a session the phone scans on its own; there is no computer to ask.
      if (!sessionId) {
        settle(face, 'accepted');
        return;
      }

      settle(face, 'sending');
      try {
        const res = await fetch(`/api/session/${sessionId}/face`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ face, imageDataUrl, capturedAt: Date.now(), quality }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          settle(face, 'rejected', res.status === 404 ? 'This session has ended. Scan the QR code again.' : body.error);
          return;
        }
      } catch {
        settle(face, 'rejected', 'Could not reach your computer. Check that both are on the same Wi-Fi.');
        return;
      }

      setStatus((s) => ({ ...s, [face]: 'reading' }));
      clearTimeout(timeouts.current[face]);
      timeouts.current[face] = setTimeout(() => {
        if (statusRef.current[face] === 'reading') {
          settle(face, 'rejected', 'Your computer did not answer. Is the Cubyntra tab still open?');
        }
      }, VERDICT_TIMEOUT_MS);
    },
    [sessionId, settle]
  );

  return { connected, status, reasons, previews, confirmed, rescanRequest, sendPhoto, reset, startOver };
}
