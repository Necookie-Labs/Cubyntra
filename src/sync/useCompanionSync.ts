'use client';

/**
 * Cubyntra - Companion Sync Hook
 * Necookie Labs (c) 2026
 *
 * Establishes desktop session, listens to SSE updates, and handles face capture events.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import QRCode from 'qrcode';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { Face, CubeColor, FaceStickers, ScannedFace } from '@/cube/types';
import { SessionEvent, CapturedFacePayload } from './types';

export interface CompanionSyncState {
  sessionId: string | null;
  qrDataUrl: string | null;
  companionUrl: string | null;
  isCreating: boolean;
  isConnected: boolean;
  mobileConnected: boolean;
  error: string | null;
  capturedFaces: Partial<Record<Face, CapturedFacePayload>>;
}

export function useCompanionSync(autoStart: boolean = false) {
  const { captureFace, setAppState } = useCubyntraStore();

  const [state, setState] = useState<CompanionSyncState>({
    sessionId: null,
    qrDataUrl: null,
    companionUrl: null,
    isCreating: false,
    isConnected: false,
    mobileConnected: false,
    error: null,
    capturedFaces: {},
  });

  const eventSourceRef = useRef<EventSource | null>(null);

  const initSession = useCallback(async () => {
    setState((s) => ({ ...s, isCreating: true, error: null }));
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to initialize session');

      const sessionId: string = data.sessionId;
      // Build accurate companion URL
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const companionUrl = `${currentOrigin}/companion?session=${sessionId}`;

      // Generate QR Code data URL
      const qrDataUrl = await QRCode.toDataURL(companionUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });

      setState((s) => ({
        ...s,
        sessionId,
        companionUrl,
        qrDataUrl,
        isCreating: false,
      }));

      // Connect to SSE stream
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource(`/api/session/${sessionId}/events?role=desktop`);
      eventSourceRef.current = es;

      es.onopen = () => {
        setState((s) => ({ ...s, isConnected: true }));
      };

      es.onmessage = (msgEvent) => {
        try {
          const event: SessionEvent = JSON.parse(msgEvent.data);
          handleSessionEvent(event);
        } catch (e) {
          console.error('[CompanionSync] Malformed event payload:', e);
        }
      };

      es.onerror = () => {
        setState((s) => ({ ...s, isConnected: false }));
      };
    } catch (err) {
      setState((s) => ({
        ...s,
        isCreating: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, []);

  const handleSessionEvent = useCallback(
    (event: SessionEvent) => {
      if (event.type === 'CLIENT_CONNECTED' && event.sender === 'mobile') {
        setState((s) => ({ ...s, mobileConnected: true }));
      } else if (event.type === 'CLIENT_DISCONNECTED' && event.sender === 'mobile') {
        setState((s) => ({ ...s, mobileConnected: false }));
      } else if (event.type === 'STATE_SYNC' && event.payload) {
        const session = event.payload;
        setState((s) => ({
          ...s,
          mobileConnected: session.mobileConnected,
          capturedFaces: session.scannedFaces || {},
        }));
      } else if (event.type === 'FACE_CAPTURED' && event.payload) {
        const facePayload = event.payload as CapturedFacePayload;
        setState((s) => ({
          ...s,
          capturedFaces: {
            ...s.capturedFaces,
            [facePayload.face]: facePayload,
          },
        }));

        // Feed to Zustand store
        const scannedFace: ScannedFace = {
          face: facePayload.face,
          centerColor: facePayload.centerColor,
          stickers: facePayload.stickers as FaceStickers,
          confidences: facePayload.confidences,
          capturedAt: facePayload.capturedAt,
        };
        captureFace(scannedFace);
      } else if (event.type === 'SESSION_RESET') {
        setState((s) => ({ ...s, capturedFaces: {} }));
      }
    },
    [captureFace]
  );

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setState({
      sessionId: null,
      qrDataUrl: null,
      companionUrl: null,
      isCreating: false,
      isConnected: false,
      mobileConnected: false,
      error: null,
      capturedFaces: {},
    });
  }, []);

  useEffect(() => {
    if (autoStart) {
      initSession();
    }
    return () => {
      disconnect();
    };
  }, [autoStart, initSession, disconnect]);

  return {
    ...state,
    initSession,
    disconnect,
  };
}
