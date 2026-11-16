'use client';

/**
 * Cubyntra - Phone Side of a Pairing
 * Necookie Labs (c) 2026
 *
 * The phone reads each face itself and sends only the colors (`face-scanned`). It hears the
 * laptop's scan decisions (retake a face, scan confirmed), mirrors the step and playback, and can
 * control playback too. No image ever leaves the phone (ADR-015).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Face } from '@/cube/types';
import { PairingCredentials } from './pairingLink';
import { applyPlaybackAction, PlaybackView, shouldApplyPlayback, viewFromState } from './playbackSync';
import { newClientId, openSyncStream, postSyncMessage } from './syncClient';
import { FaceScannedPayload, PlaybackPayload, StepPayload, SyncEvent, SyncMessage } from './types';

export type PhoneFaceStatus = 'sending' | 'accepted' | 'rejected';

export interface MobileSession {
  /** The event stream to the laptop is open. */
  connected: boolean;
  /** The laptop ended the pairing or it expired; a new QR code or code is needed. */
  ended: boolean;
  status: Partial<Record<Face, PhoneFaceStatus>>;
  reasons: Partial<Record<Face, string>>;
  /** The student confirmed the scan on the laptop. */
  confirmed: boolean;
  /** Latest request from the laptop to retake a face; `at` distinguishes repeats. */
  rescanRequest: { face: Face; at: number } | null;
  step: StepPayload | null;
  playback: PlaybackView;
  /** Sends a face read on this phone (or just accepts it when not paired). */
  sendFace: (payload: FaceScannedPayload) => Promise<void>;
  /** Marks a face as needing a retake, with the reason to show. */
  rejectFace: (face: Face, reason: string) => void;
  /** Play / pause / seek / speed from the phone. */
  controlPlayback: (payload: PlaybackPayload) => void;
  reset: () => void;
  /** Scan another cube on the same pairing: clears this phone and tells the laptop. */
  startOver: () => Promise<void>;
}

const INITIAL_PLAYBACK: PlaybackView = { playing: false, index: -1, speed: 1 };

export function useMobileSession(
  creds: PairingCredentials | null,
  options: { onEnded?: () => void } = {}
): MobileSession {
  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState(false);
  const [status, setStatus] = useState<Partial<Record<Face, PhoneFaceStatus>>>({});
  const [reasons, setReasons] = useState<Partial<Record<Face, string>>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [rescanRequest, setRescanRequest] = useState<{ face: Face; at: number } | null>(null);
  const [step, setStep] = useState<StepPayload | null>(null);
  const [playback, setPlayback] = useState<PlaybackView>(INITIAL_PLAYBACK);

  const clientIdRef = useRef<string | null>(null);
  const lastPlaybackSeqRef = useRef(0);
  const onEndedRef = useRef(options.onEnded);
  useEffect(() => {
    onEndedRef.current = options.onEnded;
  }, [options.onEnded]);

  const settle = useCallback((face: Face, next: PhoneFaceStatus | undefined, reason?: string) => {
    setStatus((s) => {
      const copy = { ...s };
      if (next) copy[face] = next;
      else delete copy[face];
      return copy;
    });
    setReasons((r) => ({ ...r, [face]: reason }));
  }, []);

  const reset = useCallback(() => {
    setStatus({});
    setReasons({});
    setConfirmed(false);
    setRescanRequest(null);
    setStep(null);
  }, []);

  const send = useCallback(
    async (message: SyncMessage) => {
      if (!creds) return null;
      clientIdRef.current ??= newClientId();
      const result = await postSyncMessage(creds.sessionId, creds.secret, {
        ...message,
        role: 'mobile',
        clientId: clientIdRef.current,
      } as SyncMessage & { role: 'mobile'; clientId: string });
      if (!result.ok && (result.status === 403 || result.status === 404)) {
        setEnded(true);
        onEndedRef.current?.();
      }
      return result;
    },
    [creds]
  );

  const handleEvent = useCallback(
    (event: SyncEvent) => {
      if (event.type === 'playback') {
        clientIdRef.current ??= newClientId();
        const apply = shouldApplyPlayback(event, {
          lastSeq: lastPlaybackSeqRef.current,
          ownClientId: clientIdRef.current,
          drives: false,
          locallyPlaying: false,
        });
        lastPlaybackSeqRef.current = Math.max(lastPlaybackSeqRef.current, event.seq);
        if (apply) setPlayback((v) => applyPlaybackAction(v, event.payload));
        return;
      }
      if (event.type === 'step') {
        setStep(event.payload);
        return;
      }
      if (event.type !== 'scan-control') return;
      const control = event.payload;
      if (control.action === 'rescan') {
        settle(control.face, undefined);
        setConfirmed(false);
        setRescanRequest({ face: control.face, at: event.seq });
      } else if (control.action === 'confirmed') {
        setConfirmed(true);
      } else if (event.role === 'desktop') {
        reset();
      }
    },
    [reset, settle]
  );

  const handleEventRef = useRef(handleEvent);
  useEffect(() => {
    handleEventRef.current = handleEvent;
  }, [handleEvent]);

  useEffect(() => {
    if (!creds) return;
    const stream = openSyncStream({
      sessionId: creds.sessionId,
      secret: creds.secret,
      role: 'mobile',
      onStatus: (s) => {
        setConnected(s === 'open');
        if (s === 'open') {
          void send({
            type: 'presence',
            payload: { visible: document.visibilityState === 'visible', screen: 'scan' },
          });
        }
      },
      onEnded: () => {
        setConnected(false);
        setEnded(true);
        onEndedRef.current?.();
      },
      onEvent: (event) => {
        if (event.kind === 'snapshot') {
          const { snapshot } = event;
          setEnded(false);
          setConfirmed(snapshot.scanConfirmed);
          setStatus((s) => {
            const next = { ...s };
            for (const face of Object.keys(snapshot.faces) as Face[]) next[face] = 'accepted';
            return next;
          });
          setStep(snapshot.step?.type === 'step' ? snapshot.step.payload : null);
          lastPlaybackSeqRef.current = snapshot.playback.seq;
          setPlayback(viewFromState(snapshot.playback));
        } else if (event.kind === 'message') {
          handleEventRef.current(event.event);
        }
      },
    });

    const onVisibility = () =>
      void send({ type: 'presence', payload: { visible: document.visibilityState === 'visible' } });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stream.close();
      setConnected(false);
    };
  }, [creds, send]);

  const sendFace = useCallback(
    async (payload: FaceScannedPayload) => {
      // Without a pairing the phone scans on its own.
      if (!creds) {
        settle(payload.face, 'accepted');
        return;
      }
      settle(payload.face, 'sending');
      const result = await send({ type: 'face-scanned', payload });
      if (result?.ok) settle(payload.face, 'accepted');
      else if (result && (result.status === 403 || result.status === 404)) {
        settle(payload.face, 'rejected', 'This pairing has ended. Scan the QR code on your computer again.');
      } else {
        settle(payload.face, 'rejected', 'Could not reach your computer. Check that both are on the same Wi-Fi.');
      }
    },
    [creds, send, settle]
  );

  const rejectFace = useCallback((face: Face, reason: string) => settle(face, 'rejected', reason), [settle]);

  const controlPlayback = useCallback(
    (payload: PlaybackPayload) => {
      setPlayback((v) => applyPlaybackAction(v, payload));
      void send({ type: 'playback', payload });
    },
    [send]
  );

  const startOver = useCallback(async () => {
    reset();
    // The laptop answers by starting a fresh phone scan on the same pairing.
    await send({ type: 'scan-control', payload: { action: 'reset' } });
  }, [reset, send]);

  return {
    connected,
    ended,
    status,
    reasons,
    confirmed,
    rescanRequest,
    step,
    playback,
    sendFace,
    rejectFace,
    controlPlayback,
    reset,
    startOver,
  };
}
