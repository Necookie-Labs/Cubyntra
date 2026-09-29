'use client';

/**
 * Cubyntra - Companion Sync Hook
 * Necookie Labs (c) 2026
 *
 * Owns the desktop side of a phone scanning session: creates the session, listens on the
 * event stream, fetches each face photo the phone sends, analyzes it locally, tells the
 * phone whether it was usable, and feeds accepted faces into the store.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import QRCode from 'qrcode';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { Face, FaceStickers, ScannedFace } from '@/cube/types';
import { FACES } from '@/cube/constants';
import { analyzeFaceImage } from '@/vision/faceImageAnalyzer';
import { RGBColor } from '@/vision/types';
import {
  CapturedFaceImagePayload,
  CapturedFacePayload,
  FaceImageNotice,
  SessionEvent,
  SessionState,
} from './types';

export type FaceScanStatus = 'analyzing' | 'accepted' | 'rejected';

export interface CompanionSyncState {
  sessionId: string | null;
  qrDataUrl: string | null;
  companionUrl: string | null;
  availableIps: string[];
  isCreating: boolean;
  /** The event stream is open. False while it is reconnecting. */
  isConnected: boolean;
  /** The server no longer knows this pairing (expired or deleted); a new QR code is needed. */
  sessionEnded: boolean;
  mobileConnected: boolean;
  error: string | null;
  faceStatus: Partial<Record<Face, FaceScanStatus>>;
  /** Why the latest photo of a face needs retaking. */
  faceReasons: Partial<Record<Face, string>>;
  /** Most recent photo of each face, accepted or not, for the progress panel. */
  lastPhotos: Partial<Record<Face, string>>;
}

const INITIAL_STATE: CompanionSyncState = {
  sessionId: null,
  qrDataUrl: null,
  companionUrl: null,
  availableIps: [],
  isCreating: false,
  isConnected: false,
  sessionEnded: false,
  mobileConnected: false,
  error: null,
  faceStatus: {},
  faceReasons: {},
  lastPhotos: {},
};

const QR_OPTIONS = { width: 320, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } };

/** The server answered that this pairing no longer exists. */
class SessionEndedError extends Error {
  constructor() {
    super('This pairing has ended');
  }
}

async function postJson(url: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 404) throw new SessionEndedError();
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
}

export function useCompanionSync() {
  const [state, setState] = useState<CompanionSyncState>(INITIAL_STATE);

  const eventSourceRef = useRef<EventSource | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // Photos are analyzed one at a time in arrival order, so each face can be calibrated
  // against the centers of the faces accepted before it.
  const analysisChainRef = useRef<Promise<void>>(Promise.resolve());
  // capturedAt of the newest photo per face; older photos still in flight are discarded.
  const latestCaptureRef = useRef<Partial<Record<Face, number>>>({});

  const patchFace = useCallback(
    (face: Face, status: FaceScanStatus, extra: { reason?: string; photo?: string } = {}) => {
      setState((s) => ({
        ...s,
        faceStatus: { ...s.faceStatus, [face]: status },
        faceReasons: { ...s.faceReasons, [face]: extra.reason },
        lastPhotos: extra.photo ? { ...s.lastPhotos, [face]: extra.photo } : s.lastPhotos,
      }));
    },
    []
  );

  const analyzeFace = useCallback(
    async (sessionId: string, face: Face, capturedAt: number | undefined) => {
      const isStale = () => capturedAt !== undefined && latestCaptureRef.current[face] !== capturedAt;
      if (isStale()) return;

      const res = await fetch(`/api/session/${sessionId}/face?face=${face}`, { cache: 'no-store' });
      if (res.status === 404) {
        const body = await res.clone().json().catch(() => ({}));
        if (typeof body.error === 'string' && body.error.includes('Session not found')) throw new SessionEndedError();
      }
      if (!res.ok) {
        const reason = 'The photo did not reach this computer. Take it again.';
        patchFace(face, 'rejected', { reason });
        await postJson(`/api/session/${sessionId}/verdict`, { face, accepted: false, reason });
        return;
      }
      const { image } = (await res.json()) as { image: CapturedFaceImagePayload };
      if (capturedAt !== undefined && image.capturedAt !== capturedAt) return; // superseded
      if (isStale()) return;

      const { faceSamples } = useCubyntraStore.getState();
      const knownCenters: Partial<Record<Face, RGBColor>> = {};
      for (const f of FACES) {
        if (f !== face && faceSamples[f]) knownCenters[f] = faceSamples[f]![4].rgb;
      }

      const analysis = await analyzeFaceImage(image.imageDataUrl, face, knownCenters);
      if (isStale()) return;

      await postJson(`/api/session/${sessionId}/verdict`, {
        face,
        accepted: analysis.accepted,
        reason: analysis.reason,
        previewColors: analysis.previewColors,
      });

      patchFace(face, analysis.accepted ? 'accepted' : 'rejected', {
        reason: analysis.reason,
        photo: image.imageDataUrl,
      });

      if (analysis.accepted) {
        const store = useCubyntraStore.getState();
        const listening =
          store.scanSource === 'companion' && (store.appState === 'scanning' || store.appState === 'reviewing');
        if (listening) store.ingestFaceSamples(face, analysis.samples, image.imageDataUrl);
      }
    },
    [patchFace]
  );

  /** The server forgot this pairing: stop listening and let the UI offer a new QR code. */
  const markEnded = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setState((s) => ({ ...s, sessionEnded: true, isConnected: false, mobileConnected: false }));
  }, []);

  const enqueueFace = useCallback(
    (sessionId: string, face: Face, capturedAt?: number) => {
      if (capturedAt !== undefined) latestCaptureRef.current[face] = capturedAt;
      patchFace(face, 'analyzing');
      analysisChainRef.current = analysisChainRef.current
        .then(() => analyzeFace(sessionId, face, capturedAt))
        .catch((err) => {
          if (err instanceof SessionEndedError) {
            markEnded();
            return;
          }
          console.error('[CompanionSync] Face analysis failed:', err);
          patchFace(face, 'rejected', { reason: 'Could not read that photo. Take it again.' });
        });
    },
    [analyzeFace, markEnded, patchFace]
  );

  const handleEvent = useCallback(
    (event: SessionEvent) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId || event.sessionId !== sessionId) return;

      switch (event.type) {
        case 'CLIENT_CONNECTED':
          if (event.sender === 'mobile') setState((s) => ({ ...s, mobileConnected: true }));
          break;
        case 'CLIENT_DISCONNECTED':
          if (event.sender === 'mobile') setState((s) => ({ ...s, mobileConnected: false }));
          break;
        case 'STATE_SYNC': {
          const session = event.payload as SessionState;
          setState((s) => ({ ...s, mobileConnected: session.mobileConnected, isConnected: true, sessionEnded: false }));
          // After a stream reconnect, pick up any photos this page has not analyzed yet.
          const { faceSamples } = useCubyntraStore.getState();
          for (const face of session.imageFaces ?? []) {
            if (!faceSamples[face]) enqueueFace(sessionId, face);
          }
          break;
        }
        case 'FACE_IMAGE': {
          const notice = event.payload as FaceImageNotice;
          // A photo arriving is proof the phone is there, even if its stream has not opened.
          setState((s) => ({ ...s, mobileConnected: true }));
          enqueueFace(sessionId, notice.face, notice.capturedAt);
          break;
        }
        case 'FACE_CAPTURED': {
          // Older companion builds send nine pre-classified colors instead of a photo.
          const legacy = event.payload as CapturedFacePayload;
          const scanned: ScannedFace = {
            face: legacy.face,
            centerColor: legacy.centerColor,
            stickers: legacy.stickers as FaceStickers,
            confidences: legacy.confidences,
            capturedAt: legacy.capturedAt,
          };
          void useCubyntraStore.getState().captureFace(scanned);
          break;
        }
        case 'SESSION_RESET': {
          latestCaptureRef.current = {};
          setState((s) => ({ ...s, faceStatus: {}, faceReasons: {}, lastPhotos: {} }));
          // "Scan another cube" on the phone: start a fresh phone scan on the same pairing.
          const store = useCubyntraStore.getState();
          if (event.sender === 'mobile' && store.scanSource === 'companion') store.startCompanionScan();
          break;
        }
      }
    },
    [enqueueFace]
  );

  // The EventSource is created once per session; route events through a ref so it always
  // reaches the latest handler.
  const handleEventRef = useRef(handleEvent);
  useEffect(() => {
    handleEventRef.current = handleEvent;
  }, [handleEvent]);

  const setCustomUrl = useCallback(async (customUrl: string) => {
    try {
      const qrDataUrl = await QRCode.toDataURL(customUrl, QR_OPTIONS);
      setState((s) => ({ ...s, companionUrl: customUrl, qrDataUrl }));
    } catch (err) {
      console.error('Failed to generate QR for custom URL', err);
    }
  }, []);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    sessionIdRef.current = null;
    latestCaptureRef.current = {};
    analysisChainRef.current = Promise.resolve();
    setState(INITIAL_STATE);
  }, []);

  const initSession = useCallback(async () => {
    eventSourceRef.current?.close();
    latestCaptureRef.current = {};
    setState({ ...INITIAL_STATE, isCreating: true });
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to initialize session');

      const sessionId: string = data.sessionId;
      const companionUrl: string =
        data.companionUrl || `${window.location.origin}/companion?session=${sessionId}`;
      const qrDataUrl = await QRCode.toDataURL(companionUrl, QR_OPTIONS);

      sessionIdRef.current = sessionId;
      setState((s) => ({
        ...s,
        sessionId,
        companionUrl,
        availableIps: data.availableIps || [],
        qrDataUrl,
        isCreating: false,
      }));

      const es = new EventSource(`/api/session/${sessionId}/events?role=desktop`);
      eventSourceRef.current = es;
      es.onopen = () => setState((s) => ({ ...s, isConnected: true, sessionEnded: false }));
      es.onerror = () => {
        // CONNECTING: the browser is retrying on its own (Wi-Fi blip, server restart).
        // CLOSED: the server refused the stream, which means the pairing no longer exists.
        if (es.readyState === EventSource.CLOSED) markEnded();
        else setState((s) => ({ ...s, isConnected: false }));
      };
      es.onmessage = (msg) => {
        try {
          handleEventRef.current(JSON.parse(msg.data) as SessionEvent);
        } catch (e) {
          console.error('[CompanionSync] Malformed event payload:', e);
        }
      };
    } catch (err) {
      setState((s) => ({
        ...s,
        isCreating: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, [markEnded]);

  /** Sends the phone back to a face from the review screen. */
  const requestRescan = useCallback(
    async (face: Face) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      latestCaptureRef.current[face] = undefined;
      setState((s) => {
        const faceStatus = { ...s.faceStatus };
        delete faceStatus[face];
        return { ...s, faceStatus };
      });
      try {
        await postJson(`/api/session/${sessionId}/rescan`, { face });
      } catch (err) {
        if (err instanceof SessionEndedError) markEnded();
        else console.error('[CompanionSync] Rescan request failed:', err);
      }
    },
    [markEnded]
  );

  /** Tells the phone the scan is done; the server drops every held photo. */
  const confirmScan = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    try {
      await postJson(`/api/session/${sessionId}/confirm`);
    } catch (err) {
      // The solve continues either way; an ended pairing already dropped its photos.
      if (err instanceof SessionEndedError) markEnded();
      else console.error('[CompanionSync] Confirm failed:', err);
    }
  }, [markEnded]);

  useEffect(() => disconnect, [disconnect]);

  return {
    ...state,
    initSession,
    disconnect,
    setCustomUrl,
    requestRescan,
    confirmScan,
  };
}

export type CompanionSync = ReturnType<typeof useCompanionSync>;
