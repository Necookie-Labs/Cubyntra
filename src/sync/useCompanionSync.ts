'use client';

/**
 * Cubyntra - Companion Sync Hook (laptop side)
 * Necookie Labs (c) 2026
 *
 * Owns the laptop side of a pairing: gets the app token from this computer, creates a session,
 * shows its QR code and typed code, listens on the event stream, and feeds the faces the phone
 * read into the store. Only state messages travel (ADR-015); the phone never sends a photo.
 *
 * The session secret lives in memory only. `initSession` runs once at a time and is cancelled on
 * unmount; `disconnect` ends the session on the server (DELETE).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { Face } from '@/cube/types';
import { FACES } from '@/cube/constants';
import { samplesFromFaceScanned } from './faceSamples';
import { buildPairingUrl, PairingCredentials } from './pairingLink';
import {
  deleteSyncSession,
  newClientId,
  openSyncStream,
  postSyncMessage,
  PostResult,
  SyncStream,
} from './syncClient';
import { ConnectionCounts, FaceScannedPayload, PresencePayload, SyncEvent, SyncMessage } from './types';

/** Same header as `src/lib/localAuth.ts` (server only, so not imported here). */
const APP_TOKEN_HEADER = 'x-cubyntra-token';

export type FaceScanStatus = 'accepted';

export interface CompanionSyncState {
  sessionId: string | null;
  /** Six characters to type on the phone when the QR code cannot be scanned. */
  code: string | null;
  codeExpiresAt: number | null;
  qrDataUrl: string | null;
  /** The QR link (credentials in the fragment). */
  companionUrl: string | null;
  /** What to open on the phone before typing the code: the link without credentials. */
  companionBaseUrl: string | null;
  availableIps: string[];
  isCreating: boolean;
  /** The event stream is open. False while it is reconnecting. */
  isConnected: boolean;
  /** The server no longer knows this pairing (expired or deleted); a new QR code is needed. */
  sessionEnded: boolean;
  connections: ConnectionCounts;
  /** At least one phone stream is open. */
  mobileConnected: boolean;
  phonePresence: PresencePayload | null;
  error: string | null;
  faceStatus: Partial<Record<Face, FaceScanStatus>>;
}

const INITIAL_STATE: CompanionSyncState = {
  sessionId: null,
  code: null,
  codeExpiresAt: null,
  qrDataUrl: null,
  companionUrl: null,
  companionBaseUrl: null,
  availableIps: [],
  isCreating: false,
  isConnected: false,
  sessionEnded: false,
  connections: { desktop: 0, mobile: 0 },
  mobileConnected: false,
  phonePresence: null,
  error: null,
  faceStatus: {},
};

/** QR modules: dark ink on light paper, from the design tokens' fixed QR colors. */
const QR_OPTIONS = { width: 320, margin: 2, errorCorrectionLevel: 'M' as const };

export type SyncListener = (event: SyncEvent) => void;

function originFor(companionUrl: string): string {
  return new URL(companionUrl).origin;
}

/** True while the store is waiting for phone faces. */
function storeListening(): boolean {
  const store = useCubyntraStore.getState();
  return store.scanSource === 'companion' && (store.appState === 'scanning' || store.appState === 'reviewing');
}

function ingestFace(payload: FaceScannedPayload): void {
  if (!storeListening()) return;
  useCubyntraStore.getState().ingestFaceSamples(payload.face, samplesFromFaceScanned(payload));
}

export function useCompanionSync() {
  const [state, setState] = useState<CompanionSyncState>(INITIAL_STATE);

  const credsRef = useRef<PairingCredentials | null>(null);
  const streamRef = useRef<SyncStream | null>(null);
  const initRef = useRef<Promise<void> | null>(null);
  const initAbortRef = useRef<AbortController | null>(null);
  const listenersRef = useRef(new Set<SyncListener>());
  const clientIdRef = useRef<string | null>(null);
  const getClientId = useCallback(() => (clientIdRef.current ??= newClientId()), []);

  /** Closes the stream and ends the session on the server. */
  const teardown = useCallback(() => {
    streamRef.current?.close();
    streamRef.current = null;
    const creds = credsRef.current;
    credsRef.current = null;
    if (creds) void deleteSyncSession(creds.sessionId, creds.secret);
  }, []);

  const handleMessage = useCallback((event: SyncEvent) => {
    for (const listener of [...listenersRef.current]) listener(event);
    if (event.role !== 'mobile') return;

    if (event.type === 'face-scanned') {
      setState((s) => ({ ...s, faceStatus: { ...s.faceStatus, [event.payload.face]: 'accepted' } }));
      ingestFace(event.payload);
    } else if (event.type === 'presence') {
      setState((s) => ({ ...s, phonePresence: event.payload }));
    } else if (event.type === 'scan-control' && event.payload.action === 'reset') {
      // "Scan another cube" on the phone: start a fresh phone scan on the same pairing.
      setState((s) => ({ ...s, faceStatus: {} }));
      if (useCubyntraStore.getState().scanSource === 'companion') useCubyntraStore.getState().startCompanionScan();
    }
  }, []);

  const handleMessageRef = useRef(handleMessage);
  useEffect(() => {
    handleMessageRef.current = handleMessage;
  }, [handleMessage]);

  const openStream = useCallback((creds: PairingCredentials) => {
    streamRef.current?.close();
    streamRef.current = openSyncStream({
      sessionId: creds.sessionId,
      secret: creds.secret,
      role: 'desktop',
      onStatus: (status) => setState((s) => ({ ...s, isConnected: status === 'open' })),
      onEnded: () => {
        // The server forgot this pairing: stop and let the UI offer a new QR code.
        if (credsRef.current?.sessionId !== creds.sessionId) return;
        credsRef.current = null;
        streamRef.current = null;
        setState((s) => ({ ...s, sessionEnded: true, isConnected: false, mobileConnected: false }));
      },
      onEvent: (event) => {
        if (credsRef.current?.sessionId !== creds.sessionId) return;
        if (event.kind === 'snapshot') {
          const { snapshot } = event;
          const received = FACES.filter((f) => snapshot.faces[f]);
          setState((s) => ({
            ...s,
            isConnected: true,
            sessionEnded: false,
            connections: snapshot.connections,
            mobileConnected: snapshot.connections.mobile > 0,
            phonePresence: snapshot.presence.mobile ?? null,
            faceStatus: Object.fromEntries(received.map((f) => [f, 'accepted'])),
          }));
          // After a reconnect, pick up faces this page has not seen yet.
          const { faceSamples } = useCubyntraStore.getState();
          for (const f of received) if (!faceSamples[f]) ingestFace(snapshot.faces[f]!);
        } else if (event.kind === 'connections') {
          setState((s) => ({ ...s, connections: event.connections, mobileConnected: event.connections.mobile > 0 }));
        } else if (event.kind === 'message') {
          handleMessageRef.current(event.event);
        }
      },
    });
  }, []);

  /** Ends the pairing: stops any pairing still being created, closes the stream, DELETEs the session. */
  const disconnect = useCallback(() => {
    initAbortRef.current?.abort();
    initAbortRef.current = null;
    initRef.current = null;
    teardown();
    setState(INITIAL_STATE);
  }, [teardown]);

  /** Creates a pairing. A second call while one is being created returns the same promise. */
  const initSession = useCallback((): Promise<void> => {
    if (initRef.current) return initRef.current;
    teardown();
    const abort = new AbortController();
    initAbortRef.current = abort;
    setState({ ...INITIAL_STATE, isCreating: true });

    const run = (async () => {
      let created: PairingCredentials | null = null;
      try {
        const tokenRes = await fetch('/api/auth/token', { cache: 'no-store', signal: abort.signal });
        if (!tokenRes.ok) {
          throw new Error('Open Cubyntra on this computer as https://localhost:3000 to pair a phone.');
        }
        const { token } = (await tokenRes.json()) as { token: string };

        const res = await fetch('/api/session', {
          method: 'POST',
          headers: { [APP_TOKEN_HEADER]: token },
          signal: abort.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.error || 'Could not create a pairing');
        created = { sessionId: data.sessionId, secret: data.secret, token };

        const companionUrl: string = data.companionUrl;
        const qrDataUrl = await QRCode.toDataURL(companionUrl, QR_OPTIONS);
        if (abort.signal.aborted) throw new DOMException('Aborted', 'AbortError');

        credsRef.current = created;
        created = null; // owned by credsRef now
        setState((s) => ({
          ...s,
          sessionId: data.sessionId,
          code: data.code,
          codeExpiresAt: data.codeExpiresAt,
          companionUrl,
          companionBaseUrl: `${originFor(companionUrl)}/companion`,
          availableIps: data.availableIps || [],
          qrDataUrl,
          isCreating: false,
        }));
        openStream(credsRef.current);
      } catch (err) {
        // A session created just before cancellation must not linger on the server.
        if (created) void deleteSyncSession(created.sessionId, created.secret);
        if (abort.signal.aborted) return;
        setState((s) => ({ ...s, isCreating: false, error: err instanceof Error ? err.message : 'Unknown error' }));
      } finally {
        if (initAbortRef.current === abort) initAbortRef.current = null;
      }
    })();

    const tracked = run.finally(() => {
      if (initRef.current === tracked) initRef.current = null;
    });
    initRef.current = tracked;
    return tracked;
  }, [openStream, teardown]);

  /** Points the QR code at another of this computer's addresses. */
  const selectHost = useCallback(async (ip: string) => {
    const creds = credsRef.current;
    if (!creds) return;
    const port = window.location.port ? `:${window.location.port}` : '';
    const companionUrl = buildPairingUrl(`${window.location.protocol}//${ip}${port}`, creds);
    try {
      const qrDataUrl = await QRCode.toDataURL(companionUrl, QR_OPTIONS);
      setState((s) => ({ ...s, companionUrl, companionBaseUrl: `${originFor(companionUrl)}/companion`, qrDataUrl }));
    } catch (err) {
      console.error('[CompanionSync] Could not draw the QR code', err);
    }
  }, []);

  /** Sends one state message to the phone. */
  const send = useCallback(async (message: SyncMessage): Promise<PostResult> => {
    const creds = credsRef.current;
    if (!creds) return { ok: false, status: 0 };
    const result = await postSyncMessage(creds.sessionId, creds.secret, {
      ...message,
      role: 'desktop',
      clientId: getClientId(),
    } as SyncMessage & { role: 'desktop'; clientId: string });
    if (!result.ok && (result.status === 403 || result.status === 404)) {
      credsRef.current = null;
      streamRef.current?.close();
      streamRef.current = null;
      setState((s) => ({ ...s, sessionEnded: true, isConnected: false, mobileConnected: false }));
    }
    return result;
  }, [getClientId]);

  /** Listens to every relayed message (both devices'). Returns an unsubscribe function. */
  const subscribe = useCallback((listener: SyncListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  /** Sends the phone back to a face from the review screen. */
  const requestRescan = useCallback(
    async (face: Face) => {
      setState((s) => {
        const faceStatus = { ...s.faceStatus };
        delete faceStatus[face];
        return { ...s, faceStatus };
      });
      await send({ type: 'scan-control', payload: { action: 'rescan', face } });
    },
    [send]
  );

  /** Tells the phone the scan is confirmed. */
  const confirmScan = useCallback(async () => {
    await send({ type: 'scan-control', payload: { action: 'confirmed' } });
  }, [send]);

  // Leaving the page ends the pairing, including one still being created.
  useEffect(() => disconnect, [disconnect]);

  return {
    ...state,
    /** This page's client id, to recognise its own messages coming back. */
    getClientId,
    initSession,
    disconnect,
    selectHost,
    send,
    subscribe,
    requestRescan,
    confirmScan,
  };
}

export type CompanionSync = ReturnType<typeof useCompanionSync>;
