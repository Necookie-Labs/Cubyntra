'use client';

/**
 * Cubyntra - Mobile Companion Scanner
 * Necookie Labs (c) 2026
 *
 * The phone half of a scan. It coaches the user through six faces, checks each live frame
 * for the usual problems (wrong face, glare, darkness, motion), reads the face by itself once
 * the frame holds steady, and sends only the colors to the computer (ADR-015). The photo is
 * read in this tab and discarded; it never leaves the phone.
 *
 * Pairing: the QR link carries the credentials in its fragment; they move to sessionStorage and
 * the fragment is stripped (`src/sync/pairingStorage.ts`). Without a QR scan the student can
 * type the six-character code instead.
 */

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore, Suspense } from 'react';
import { SCAN_SEQUENCE } from '@/cube/constants';
import { CubeColor, Face } from '@/cube/types';
import { formatMove, parseAlgorithm } from '@/cube/transforms';
import { moveName } from '@/cube/moveNames';
import {
  initializeCameraStream,
  lockWhiteBalance,
  terminateCameraStream,
  toggleCameraTorch,
} from '@/vision/camera';
import { mapElementRectToVideo, sampleGridFromContext } from '@/vision/sampling';
import { detectCubeInROISync } from '@/vision/cubeDetector';
import { assessCaptureQuality, CaptureQuality, measureGlare } from '@/vision/captureQuality';
import { ROIBounds, RGBColor, StickerSample } from '@/vision/types';
import { analyzeFaceContext } from '@/vision/faceImageAnalyzer';
import { useMobileSession } from '@/sync/useMobileSession';
import { faceScannedFromSamples } from '@/sync/faceSamples';
import {
  endPairing,
  getPairingProblemSnapshot,
  getPairingSnapshot,
  getServerPairingProblemSnapshot,
  getServerPairingSnapshot,
  setPairing,
  subscribePairing,
} from '@/sync/pairingStorage';
import { CompanionReticle, ReticleTone } from '@/components/companion/CompanionReticle';
import { FaceGuide } from '@/components/companion/FaceGuide';
import { CaptureCoach, hasSeenCaptureCoach } from '@/components/companion/CaptureCoach';
import { PairCodeDialog } from '@/components/companion/PairCodeDialog';
import { PhoneStepCard } from '@/components/companion/PhoneStepCard';
import { BlockButton, IconButton, Panel, cx, stickerColor, stickerLetter, stickerLetterClass } from '@/components/ui';
import { useTutorStore } from '@/stores/useTutorStore';
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Link2,
  Loader2,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  Zap,
} from 'lucide-react';

/** Size of the crop read on the phone: plenty for nine tiles. It is never sent anywhere. */
const PHOTO_SIZE = 512;
/** How often the live frame is checked. */
const SAMPLE_INTERVAL_MS = 150;
/** How long every check must hold before the photo takes itself. */
const HOLD_MS = 600;
/** Segments in the shutter's hold meter. */
const HOLD_SEGMENTS = 4;

type HintKind = 'fix' | 'progress' | 'ok' | 'error';

const HINT_STYLE: Record<HintKind, string> = {
  error: 'bg-warn text-on-leaf',
  fix: 'bg-warn-soft text-ink',
  progress: 'bg-panel text-ink',
  ok: 'bg-leaf text-on-leaf',
};

/** What the phone says while it is not paired, by why (see `PairingProblem`). */
const PAIRING_HELP = {
  none: 'To send the colors to your computer, open Pair phone there and scan its QR code, or type its code.',
  invalid: 'That pairing link is incomplete. Scan the QR code on your computer again, or type its code.',
  ended: 'This pairing has ended or expired. On your computer, open Pair phone and make a new code.',
} as const;

/** localStorage has no change events worth following here; read it once per render. */
const noSubscription = () => () => {};

function toScreenRect(el: Element) {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function CompanionScannerContent() {
  const pairing = useSyncExternalStore(subscribePairing, getPairingSnapshot, getServerPairingSnapshot);
  const sessionId = pairing?.sessionId ?? null;
  const pairingProblem = useSyncExternalStore(subscribePairing, getPairingProblemSnapshot, getServerPairingProblemSnapshot);
  const session = useMobileSession(pairing, { onEnded: endPairing });
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  // Faces read on this phone, used to calibrate each next face against the centers seen so far.
  const acceptedSamplesRef = useRef<Partial<Record<Face, StickerSample[]>>>({});

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stepIndex, setStepIndex] = useState(0);
  const [cameraStatus, setCameraStatus] = useState<'loading' | 'streaming' | 'error'>('loading');
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchActive, setTorchActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(0);
  const [liveColors, setLiveColors] = useState<(CubeColor | null)[]>([]);
  const [quality, setQuality] = useState<CaptureQuality | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [autoCapture, setAutoCapture] = useState(true);
  // The coach shows once per device. The server renders it as already seen, and the client
  // corrects that after hydration. `coachOverride` records the user opening or closing it.
  const coachSeen = useSyncExternalStore(noSubscription, hasSeenCaptureCoach, () => true);
  const letters = useTutorStore((s) => s.profile.settings.stickerLetters);
  const [coachOverride, setCoachOverride] = useState<boolean | null>(null);
  const showCoach = coachOverride ?? !coachSeen;

  const currentStep = SCAN_SEQUENCE[Math.min(stepIndex, SCAN_SEQUENCE.length - 1)];
  const isAccepted = (i: number) => session.status[SCAN_SEQUENCE[i].face] === 'accepted';
  const isAllComplete = SCAN_SEQUENCE.every((_, i) => isAccepted(i));
  const currentStatus = session.status[currentStep.face];
  const isWaitingOnComputer = currentStatus === 'sending';

  // Move on once the computer has read the current face. Faces can be done out of order,
  // so jump to the first one still missing.
  // Only the moment a face *becomes* read moves on: opening a face that was read earlier (to
  // check it or scan it again) must stay on it.
  const [readSeen, setReadSeen] = useState<Partial<Record<Face, boolean>>>({});
  if (currentStatus === 'accepted' && !readSeen[currentStep.face]) {
    setReadSeen((seen) => ({ ...seen, [currentStep.face]: true }));
    const next = SCAN_SEQUENCE.findIndex((_, i) => !isAccepted(i));
    if (next !== -1) setStepIndex(next);
  } else if (currentStatus !== 'accepted' && readSeen[currentStep.face]) {
    setReadSeen((seen) => ({ ...seen, [currentStep.face]: false }));
  }

  // The computer asked for a specific face again from its review screen.
  const [handledRescanAt, setHandledRescanAt] = useState<number | null>(null);
  if (session.rescanRequest && session.rescanRequest.at !== handledRescanAt) {
    setHandledRescanAt(session.rescanRequest.at);
    const target = SCAN_SEQUENCE.findIndex((step) => step.face === session.rescanRequest!.face);
    if (target !== -1) setStepIndex(target);
  }

  /** Where the reticle sits in camera-frame pixels; the same region is checked and sent. */
  const reticleRegion = useCallback((): ROIBounds | null => {
    const video = videoRef.current;
    const square = squareRef.current;
    if (!video || !square || !video.videoWidth) return null;
    return mapElementRectToVideo(toScreenRect(square), toScreenRect(video), video.videoWidth, video.videoHeight);
  }, []);

  // Camera
  useEffect(() => {
    let isCancelled = false;

    const startCamera = async () => {
      if (!videoRef.current) return;
      setCameraStatus('loading');
      setErrorMessage(null);
      try {
        const result = await initializeCameraStream(videoRef.current, {
          facingMode: 'environment',
          idealWidth: 1920,
          idealHeight: 1080,
        });
        if (isCancelled) {
          terminateCameraStream(result.stream);
          return;
        }
        streamRef.current = result.stream;
        setHasTorch(result.hasTorch);
        setCameraStatus('streaming');

        // Let auto white balance settle on the scene, then freeze it so every face is shot
        // at the same color temperature.
        setTimeout(() => {
          if (!isCancelled) void lockWhiteBalance(result.stream);
        }, 1500);
      } catch (err: unknown) {
        if (!isCancelled) {
          setCameraStatus('error');
          setErrorMessage(err instanceof Error ? err.message : String(err));
        }
      }
    };

    void startCamera();
    return () => {
      isCancelled = true;
      terminateCameraStream(streamRef.current);
      streamRef.current = null;
    };
  }, [cameraAttempt]);

  // Read the face: crop exactly the reticle square, read it here, send only the colors.
  const takePhoto = useCallback(
    async () => {
      const video = videoRef.current;
      const roi = reticleRegion();
      if (!video || !roi || isCapturing) return;

      setIsCapturing(true);
      setCaptureFlash((n) => n + 1);
      try {
        navigator.vibrate?.(40);
      } catch {
        // Haptics are optional.
      }

      try {
        const photo = document.createElement('canvas');
        photo.width = PHOTO_SIZE;
        photo.height = PHOTO_SIZE;
        const pctx = photo.getContext('2d', { willReadFrequently: true });
        if (!pctx) throw new Error('Canvas context unavailable');
        pctx.drawImage(video, roi.x, roi.y, roi.size, roi.size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);

        const face = currentStep.face;
        const knownCenters: Partial<Record<Face, RGBColor>> = {};
        for (const [f, samples] of Object.entries(acceptedSamplesRef.current) as [Face, StickerSample[]][]) {
          if (f !== face) knownCenters[f] = samples[4].rgb;
        }
        const analysis = analyzeFaceContext(pctx, PHOTO_SIZE, PHOTO_SIZE, face, knownCenters);
        // The pixels end here: drop the crop before anything is sent.
        photo.width = 0;
        photo.height = 0;

        if (!analysis.accepted) {
          session.rejectFace(face, analysis.reason ?? 'Take this one again.');
          return;
        }
        acceptedSamplesRef.current[face] = analysis.samples;
        await session.sendFace(faceScannedFromSamples(face, analysis.samples, analysis.previewColors));
      } catch (err) {
        console.error('[Companion] Capture failed:', err);
      } finally {
        setIsCapturing(false);
      }
    },
    [currentStep, isCapturing, reticleRegion, session]
  );

  // The sampling loop reads these through refs so it never runs on stale values.
  const loopState = useRef({
    face: currentStep.face,
    busy: false,
    auto: true,
    paused: false,
    takePhoto,
  });
  useEffect(() => {
    loopState.current = {
      face: currentStep.face,
      busy: isCapturing || isWaitingOnComputer || currentStatus === 'accepted',
      auto: autoCapture,
      paused: showCoach || isAllComplete,
      takePhoto,
    };
  }, [currentStep.face, isCapturing, isWaitingOnComputer, currentStatus, autoCapture, showCoach, isAllComplete, takePhoto]);

  // After a photo the shutter disarms until the frame stops qualifying (the user turns the
  // cube or moves), so a rejected photo is never retaken in a loop.
  const armedRef = useRef(true);
  const readySinceRef = useRef<number | null>(null);
  const previousSamplesRef = useRef<StickerSample[] | null>(null);

  useEffect(() => {
    armedRef.current = true;
    readySinceRef.current = null;
  }, [currentStep.face]);

  // Live checks
  useEffect(() => {
    if (cameraStatus !== 'streaming') return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      timer = setTimeout(tick, SAMPLE_INTERVAL_MS);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const roi = reticleRegion();
      if (!video || !canvas || !roi || video.readyState < 2) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const state = loopState.current;
      const samples = sampleGridFromContext(ctx, roi);
      const detection = detectCubeInROISync(ctx, roi, samples);
      const q = assessCaptureQuality({
        samples,
        detection,
        expectedFace: state.face,
        glareByTile: measureGlare(ctx, roi),
        previousSamples: previousSamplesRef.current,
      });
      previousSamplesRef.current = samples;

      setQuality(q);
      setLiveColors(detection.isCube ? samples.map((s) => s.predictedColor) : []);

      if (!q.ready) {
        armedRef.current = true;
        readySinceRef.current = null;
        setHoldProgress(0);
        return;
      }
      if (!state.auto || state.paused || state.busy || !armedRef.current) {
        readySinceRef.current = null;
        setHoldProgress(0);
        return;
      }

      const now = performance.now();
      readySinceRef.current ??= now;
      const progress = Math.min(1, (now - readySinceRef.current) / HOLD_MS);
      setHoldProgress(progress);
      if (progress >= 1) {
        armedRef.current = false;
        readySinceRef.current = null;
        setHoldProgress(0);
        void state.takePhoto();
      }
    };

    timer = setTimeout(tick, SAMPLE_INTERVAL_MS);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [cameraStatus, reticleRegion]);

  const handleToggleTorch = useCallback(async () => {
    if (!hasTorch || !streamRef.current) return;
    const next = !torchActive;
    if (await toggleCameraTorch(streamRef.current, next)) setTorchActive(next);
  }, [hasTorch, torchActive]);

  const handleReset = useCallback(() => {
    void session.startOver();
    acceptedSamplesRef.current = {};
    setReadSeen({});
    setStepIndex(0);
  }, [session]);

  // The guided solve on the computer: the phone shows the step like the solve screen does.
  const tutorStep =
    session.step && (session.step.method === 'beginner' || session.step.method === 'cfop')
      ? { ...session.step, method: session.step.method }
      : null;

  // Remote control for the older solver playback (it sends the whole solution as one step).
  const solutionMoves = (() => {
    try {
      return session.step?.algorithm ? parseAlgorithm(session.step.algorithm) : [];
    } catch {
      return [];
    }
  })();
  const playIndex = session.playback.index;
  const playMove = playIndex >= 0 && playIndex < solutionMoves.length ? solutionMoves[playIndex] : null;
  const atEnd = playIndex >= solutionMoves.length - 1;

  // What the reticle and the hint line say right now, most urgent first.
  let tone: ReticleTone = 'idle';
  let hint: { text: string; kind: HintKind } | null = null;
  if (currentStatus === 'rejected') {
    tone = 'fix';
    hint = { text: session.reasons[currentStep.face] ?? 'Take this one again.', kind: 'error' };
  } else if (currentStatus === 'sending') {
    tone = 'steady';
    hint = { text: 'Sending the colors to your computer…', kind: 'progress' };
  } else if (quality && !quality.ready) {
    tone = quality.topHint === 'Hold still.' ? 'idle' : 'fix';
    hint = { text: quality.topHint ?? 'Line up the cube', kind: 'fix' };
  } else if (quality?.ready) {
    tone = 'steady';
    hint = { text: autoCapture ? 'Hold still…' : 'Looks good. Tap the shutter.', kind: 'ok' };
  }
  if (currentStatus === 'accepted') tone = 'done';

  // The shutter is a square block; its hold progress is a row of four segments under it.
  const holdSteps = Math.round(holdProgress * HOLD_SEGMENTS);
  const shutterNeedsFix = Boolean(quality && !quality.ready && !isWaitingOnComputer);

  return (
    <div className="relative w-full h-[100dvh] flex flex-col bg-ground text-ink overflow-hidden select-none">
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera */}
      <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 z-0 w-full h-full object-cover" />

      {/* Shutter flash, re-keyed per photo */}
      {captureFlash > 0 && <div key={captureFlash} className="vx-flash absolute inset-0 z-40 bg-qr-paper pointer-events-none" />}

      {/* Top bar: a solid strip, so it reads over any scene */}
      <header className="relative z-40 shrink-0 flex items-center justify-between gap-3 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 bg-panel border-b-2 border-line">
        {/* The shell's <main> wraps this screen; the viewfinder needs no visible title. */}
        <h1 className="sr-only">Phone camera</h1>
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cx(
              'w-3 h-3 shrink-0 border-2 border-line',
              !sessionId ? 'bg-warn' : session.connected ? 'bg-leaf' : 'bg-well'
            )}
            aria-hidden
          />
          <span className="text-xs font-bold text-ink truncate">
            {!sessionId ? 'Not linked to a computer' : session.connected ? 'Linked to your computer' : 'Connecting…'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!sessionId && (
            <IconButton label="Link with a code" variant="ghost" onClick={() => setShowCodeEntry(true)}>
              <Link2 className="w-5 h-5" />
            </IconButton>
          )}
          <IconButton label="How to take the photos" variant="ghost" onClick={() => setCoachOverride(true)}>
            <CircleHelp className="w-5 h-5" />
          </IconButton>
          {hasTorch && (
            <IconButton
              label="Flash"
              variant={torchActive ? 'primary' : 'ghost'}
              onClick={handleToggleTorch}
              aria-pressed={torchActive}
            >
              <Zap className="w-5 h-5" />
            </IconButton>
          )}
        </div>
      </header>

      {/* Not paired: say why (a broken or ended link) and how to pair, not just "Not linked". */}
      {!sessionId && (
        <div
          role="status"
          className="relative z-40 shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-panel border-b-2 border-line"
        >
          <p className="text-xs text-ink">{PAIRING_HELP[pairingProblem ?? 'none']}</p>
          <BlockButton size="sm" onClick={() => setShowCodeEntry(true)} className="shrink-0">
            Type a code
          </BlockButton>
        </div>
      )}

      {/* Guidance + reticle */}
      {cameraStatus === 'streaming' && !isAllComplete && (
        <div className="relative z-20 flex-1 min-h-0 flex flex-col items-center justify-center gap-4 px-4 pointer-events-none">
          <section
            key={currentStep.face}
            className="vx-panel vx-place flex items-center gap-3 w-full max-w-sm p-3 pb-4"
            aria-live="polite"
          >
            <FaceGuide
              key={currentStep.face}
              front={currentStep.centerColor}
              top={currentStep.view.top}
              right={currentStep.view.right}
              className="vx-pop w-16 h-16 shrink-0"
            />
            <div className="flex flex-col gap-1 min-w-0">
              <span className="font-display text-xs uppercase tracking-wider text-leaf">
                Step {stepIndex + 1} of 6 · {currentStep.title}
              </span>
              <p className="text-sm font-bold leading-snug text-ink">{currentStep.instruction}</p>
              <span className="text-xs text-muted">{currentStep.rotationHint}</span>
            </div>
          </section>

          <CompanionReticle
            tone={tone}
            expectedColor={currentStep.centerColor}
            liveColors={liveColors}
            squareRef={squareRef}
            letters={letters}
          />

          <div className="min-h-10 shrink-0 flex items-center">
            {currentStatus === 'accepted' ? (
              // A face already read can be taken again when a color came out wrong.
              <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
                <p role="status" className={cx('inline-flex items-center gap-2 px-3 py-2 text-sm font-bold border-2 border-line shadow-block-sm', HINT_STYLE.ok)}>
                  <Check className="w-4 h-4" strokeWidth={3} />
                  {currentStep.title} read
                </p>
                <BlockButton
                  size="sm"
                  onClick={() => session.redoFace(currentStep.face)}
                  icon={<RotateCcw aria-hidden className="w-4 h-4" />}
                >
                  Scan this face again
                </BlockButton>
              </div>
            ) : hint && (
              <p
                role="status"
                className={cx(
                  'inline-flex items-center gap-2 px-3 py-2 text-sm font-bold border-2 border-line shadow-block-sm',
                  HINT_STYLE[hint.kind]
                )}
              >
                {hint.kind === 'progress' && <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />}
                {hint.kind === 'error' && <RotateCcw className="w-4 h-4" />}
                {hint.text}
              </p>
            )}
          </div>
        </div>
      )}

      {(cameraStatus !== 'streaming' || isAllComplete) && <div className="flex-1" aria-hidden />}

      {/* Camera states */}
      {cameraStatus === 'loading' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-ground">
          <Loader2 className="w-8 h-8 text-leaf animate-spin motion-reduce:animate-none" />
          <p className="text-sm font-bold text-ink">Opening the camera…</p>
          <p className="text-xs text-muted">Allow camera access if your phone asks.</p>
        </div>
      )}
      {cameraStatus === 'error' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-ground px-8 text-center">
          <span className="vx-block grid place-items-center w-16 h-16 pb-1" data-variant="danger" aria-hidden>
            <AlertCircle className="w-8 h-8" />
          </span>
          <div className="flex flex-col gap-2">
            <h2 className="text-xl">The camera didn’t open</h2>
            <p className="text-sm text-muted max-w-xs">{errorMessage}</p>
          </div>
          <BlockButton variant="primary" size="lg" onClick={() => setCameraAttempt((n) => n + 1)}>
            Try again
          </BlockButton>
        </div>
      )}

      {/* Bottom controls: a solid deck so the shutter is easy to find */}
      {!isAllComplete && cameraStatus === 'streaming' && (
        <footer className="relative z-30 shrink-0 flex flex-col items-center gap-3 px-4 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-panel border-t-2 border-line">
          <ol className="flex items-center gap-2" aria-label="Faces">
            {SCAN_SEQUENCE.map((step, idx) => {
              const status = session.status[step.face];
              const isCurrent = idx === stepIndex;
              return (
                <li key={step.face}>
                  <button
                    type="button"
                    onClick={() => setStepIndex(idx)}
                    aria-current={isCurrent ? 'step' : undefined}
                    aria-label={`${step.title}${status === 'accepted' ? ', read' : status === 'rejected' ? ', needs a retake' : ''}`}
                    className="w-11 h-11 grid place-items-center"
                  >
                    <span
                      className={cx(
                        'grid place-items-center border-2 transition-transform duration-100',
                        isCurrent
                          ? 'w-8 h-8 border-line shadow-block-sm -translate-y-0.5'
                          : status === 'rejected'
                          ? 'w-6 h-6 border-warn'
                          : 'w-6 h-6 border-line'
                      )}
                      style={{ backgroundColor: stickerColor(step.centerColor) }}
                    >
                      {status === 'accepted' ? (
                        <span className="grid place-items-center w-4 h-4 bg-leaf border-2 border-line">
                          <Check className="w-3 h-3 text-on-leaf" strokeWidth={4} />
                        </span>
                      ) : (
                        letters && (
                          <span
                            aria-hidden
                            className={cx('font-mono text-xs font-bold leading-none', stickerLetterClass(step.centerColor))}
                          >
                            {stickerLetter(step.centerColor)}
                          </span>
                        )
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="flex items-center justify-between w-full max-w-xs">
            <IconButton
              label="Previous face"
              variant="ghost"
              size="lg"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft className="w-6 h-6" />
            </IconButton>

            {/* Shutter: the segments fill while the frame holds steady, then the photo takes itself. */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                data-variant="primary"
                onClick={() => void takePhoto()}
                disabled={isCapturing || isWaitingOnComputer}
                aria-label="Take photo"
                className="vx-block w-20 h-20 pb-1 grid place-items-center"
              >
                {isWaitingOnComputer ? (
                  <Loader2 className="w-8 h-8 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Camera className="w-8 h-8" />
                )}
              </button>
              <span className="flex gap-1" aria-hidden>
                {Array.from({ length: HOLD_SEGMENTS }).map((_, i) => (
                  <span
                    key={i}
                    className={cx(
                      'block w-4 h-2 border-2',
                      i < holdSteps
                        ? 'bg-leaf border-line'
                        : shutterNeedsFix
                        ? 'bg-warn-soft border-warn-edge'
                        : 'bg-well border-line-soft'
                    )}
                  />
                ))}
              </span>
            </div>

            <IconButton
              label="Next face"
              variant="ghost"
              size="lg"
              disabled={stepIndex === SCAN_SEQUENCE.length - 1}
              onClick={() => setStepIndex((i) => Math.min(SCAN_SEQUENCE.length - 1, i + 1))}
            >
              <ChevronRight className="w-6 h-6" />
            </IconButton>
          </div>

          <button
            type="button"
            onClick={() => setAutoCapture((a) => !a)}
            aria-pressed={autoCapture}
            className="min-h-11 inline-flex items-center gap-2 px-3 text-xs font-bold text-muted hover:text-ink"
          >
            Auto-capture
            <span
              className={cx(
                'inline-flex items-center h-6 px-2 border-2 font-mono',
                autoCapture ? 'bg-leaf text-on-leaf border-line' : 'bg-well text-muted border-line-soft'
              )}
            >
              {autoCapture ? 'on' : 'off'}
            </span>
          </button>
        </footer>
      )}

      {/* Done */}
      {isAllComplete && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 p-8 bg-ground text-center">
          <span className="vx-block vx-pop grid place-items-center w-24 h-24 pb-1" data-variant="primary" aria-hidden>
            <CheckCircle2 className="w-12 h-12" />
          </span>
          <Panel className="vx-place flex flex-col gap-3 max-w-xs p-4 pb-6">
            <h2 className="text-2xl leading-tight">
              {session.confirmed ? 'Solving on your computer' : sessionId ? 'All six faces read' : 'All six faces read here'}
            </h2>
            <p className="text-sm text-muted leading-relaxed flex items-start gap-2 text-left">
              <Monitor className="w-4 h-4 mt-0.5 shrink-0 text-ink" />
              {session.confirmed
                ? 'Follow the moves on the 3D cube. You can control them from here, or solve on this phone.'
                : sessionId
                ? 'Check the cube on your computer, fix any tile it marks, then press Confirm & solve.'
                : 'To use a computer, open Cubyntra there and scan its QR code before you scan the cube.'}
            </p>
          </Panel>

          {/* The guided solve's step, with remote playback and a way to solve on this phone. */}
          {session.confirmed && sessionId && tutorStep && (
            <PhoneStepCard step={tutorStep} playback={session.playback} onControl={session.controlPlayback} />
          )}

          {/* Remote control: either device can play, pause and step; the computer shows the turns. */}
          {session.confirmed && sessionId && !tutorStep && solutionMoves.length > 0 && (
            <Panel as="section" aria-label="Solution controls" className="flex flex-col items-center gap-3 w-full max-w-xs p-4 pb-5">
              <p role="status" className="text-sm font-bold text-ink">
                {playMove
                  ? `Move ${playIndex + 1} of ${solutionMoves.length}: ${formatMove(playMove)}`
                  : playIndex < 0
                  ? `${solutionMoves.length} moves`
                  : 'Solved'}
              </p>
              {playMove && <p className="text-xs text-muted">{moveName(playMove)}</p>}
              <div className="flex items-center gap-3">
                <IconButton
                  label="Previous move"
                  disabled={playIndex < 0}
                  onClick={() => session.controlPlayback({ action: 'seek', index: playIndex - 1 })}
                >
                  <ChevronLeft className="w-5 h-5" />
                </IconButton>
                <IconButton
                  label={session.playback.playing ? 'Pause' : 'Play'}
                  variant="primary"
                  size="lg"
                  disabled={!session.playback.playing && atEnd}
                  onClick={() => session.controlPlayback({ action: session.playback.playing ? 'pause' : 'play' })}
                >
                  {session.playback.playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                </IconButton>
                <IconButton
                  label="Next move"
                  disabled={atEnd}
                  onClick={() => session.controlPlayback({ action: 'seek', index: playIndex + 1 })}
                >
                  <ChevronRight className="w-5 h-5" />
                </IconButton>
              </div>
            </Panel>
          )}
          <BlockButton size="lg" onClick={handleReset} icon={<RotateCcw className="w-5 h-5" />}>
            Scan another cube
          </BlockButton>
        </div>
      )}

      {showCoach && <CaptureCoach onDone={() => setCoachOverride(false)} />}

      <PairCodeDialog
        open={showCodeEntry && !sessionId}
        onClose={() => setShowCodeEntry(false)}
        onPaired={(creds) => {
          setShowCodeEntry(false);
          setPairing(creds);
        }}
      />
    </div>
  );
}

export default function CompanionPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full h-[100dvh] bg-ground grid place-items-center text-sm text-muted">Loading…</div>
      }
    >
      <CompanionScannerContent />
    </Suspense>
  );
}
