'use client';

/**
 * Cubyntra - Mobile Companion Scanner
 * Necookie Labs (c) 2026
 *
 * The phone half of a scan. It coaches the user through six photos, checks each live frame
 * for the usual problems (wrong face, glare, darkness, motion), takes the photo by itself
 * once the frame holds steady, and sends a crop of exactly the reticle to the computer,
 * which reads the colors and answers.
 */

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { COLOR_HEX, SCAN_SEQUENCE } from '@/cube/constants';
import { CubeColor } from '@/cube/types';
import {
  initializeCameraStream,
  lockWhiteBalance,
  terminateCameraStream,
  toggleCameraTorch,
} from '@/vision/camera';
import { mapElementRectToVideo, sampleGridFromContext } from '@/vision/sampling';
import { detectCubeInROISync } from '@/vision/cubeDetector';
import { assessCaptureQuality, CaptureQuality, measureGlare } from '@/vision/captureQuality';
import { ROIBounds, StickerSample } from '@/vision/types';
import { useMobileSession } from '@/sync/useMobileSession';
import { CompanionReticle, ReticleTone } from '@/components/companion/CompanionReticle';
import { FaceGuide } from '@/components/companion/FaceGuide';
import { CaptureCoach, hasSeenCaptureCoach } from '@/components/companion/CaptureCoach';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Loader2,
  Monitor,
  RotateCcw,
  Zap,
} from 'lucide-react';

/** Size of the photo sent to the computer: plenty for nine tiles, small enough to send fast. */
const PHOTO_SIZE = 512;
/** How often the live frame is checked. */
const SAMPLE_INTERVAL_MS = 150;
/** How long every check must hold before the photo takes itself. */
const HOLD_MS = 600;

/** localStorage has no change events worth following here; read it once per render. */
const noSubscription = () => () => {};

function toScreenRect(el: Element) {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function CompanionScannerContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');
  const session = useMobileSession(sessionId);

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
  const [coachOverride, setCoachOverride] = useState<boolean | null>(null);
  const showCoach = coachOverride ?? !coachSeen;

  const currentStep = SCAN_SEQUENCE[Math.min(stepIndex, SCAN_SEQUENCE.length - 1)];
  const isAccepted = (i: number) => session.status[SCAN_SEQUENCE[i].face] === 'accepted';
  const isAllComplete = SCAN_SEQUENCE.every((_, i) => isAccepted(i));
  const currentStatus = session.status[currentStep.face];
  const isWaitingOnComputer = currentStatus === 'sending' || currentStatus === 'reading';

  // Move on once the computer has read the current face. Faces can be done out of order,
  // so jump to the first one still missing.
  const [advancedFor, setAdvancedFor] = useState<string | null>(null);
  if (currentStatus === 'accepted' && advancedFor !== currentStep.face) {
    setAdvancedFor(currentStep.face);
    const next = SCAN_SEQUENCE.findIndex((_, i) => !isAccepted(i));
    if (next !== -1) setStepIndex(next);
  }

  // The computer asked for a specific face again from its review screen.
  const [handledRescanAt, setHandledRescanAt] = useState<number | null>(null);
  if (session.rescanRequest && session.rescanRequest.at !== handledRescanAt) {
    setHandledRescanAt(session.rescanRequest.at);
    const target = SCAN_SEQUENCE.findIndex((step) => step.face === session.rescanRequest!.face);
    if (target !== -1) setStepIndex(target);
    setAdvancedFor(null);
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

  // Take the photo: crop exactly the reticle square and send it to the computer.
  const takePhoto = useCallback(
    async (snapshot: CaptureQuality | null) => {
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
        const pctx = photo.getContext('2d');
        if (!pctx) throw new Error('Canvas context unavailable');
        pctx.drawImage(video, roi.x, roi.y, roi.size, roi.size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);

        await session.sendPhoto(
          currentStep.face,
          photo.toDataURL('image/jpeg', 0.9),
          snapshot
            ? { passed: snapshot.ready, failing: snapshot.checks.filter((c) => !c.ok).map((c) => c.id) }
            : undefined
        );
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
        void state.takePhoto(q);
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
    setAdvancedFor(null);
    setStepIndex(0);
  }, [session]);

  // What the reticle and the hint line say right now, most urgent first.
  let tone: ReticleTone = 'idle';
  let hint: { text: string; kind: 'fix' | 'progress' | 'ok' | 'error' } | null = null;
  if (currentStatus === 'rejected') {
    tone = 'fix';
    hint = { text: session.reasons[currentStep.face] ?? 'Take this one again.', kind: 'error' };
  } else if (currentStatus === 'sending') {
    tone = 'steady';
    hint = { text: 'Sending to your computer…', kind: 'progress' };
  } else if (currentStatus === 'reading') {
    tone = 'steady';
    hint = { text: 'Reading on your computer…', kind: 'progress' };
  } else if (quality && !quality.ready) {
    tone = quality.topHint === 'Hold still.' ? 'idle' : 'fix';
    hint = { text: quality.topHint ?? 'Line up the cube', kind: 'fix' };
  } else if (quality?.ready) {
    tone = 'steady';
    hint = { text: autoCapture ? 'Hold still…' : 'Looks good. Tap the shutter.', kind: 'ok' };
  }
  if (currentStatus === 'accepted') tone = 'done';

  const ringCircumference = 2 * Math.PI * 38;

  return (
    <div className="relative w-full h-[100dvh] flex flex-col bg-black text-white overflow-hidden select-none">
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera */}
      <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 z-0 w-full h-full object-cover" />

      {/* Shutter flash, re-keyed per photo */}
      {captureFlash > 0 && <div key={captureFlash} className="cb-flash absolute inset-0 z-40 bg-white pointer-events-none" />}

      {/* Top bar */}
      <header className="relative z-30 shrink-0 flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              !sessionId ? 'bg-amber-400' : session.connected ? 'bg-emerald-400' : 'bg-neutral-500'
            }`}
            aria-hidden
          />
          <span className="text-xs text-neutral-300 truncate">
            {!sessionId ? 'Not linked to a computer' : session.connected ? 'Linked to your computer' : 'Connecting…'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCoachOverride(true)}
            aria-label="How to take the photos"
            className="w-11 h-11 grid place-items-center rounded-full text-neutral-200 hover:bg-white/10 transition-colors"
          >
            <CircleHelp className="w-5 h-5" />
          </button>
          {hasTorch && (
            <button
              type="button"
              onClick={handleToggleTorch}
              aria-pressed={torchActive}
              aria-label="Flash"
              className={`w-11 h-11 grid place-items-center rounded-full transition-colors ${
                torchActive ? 'bg-amber-400 text-black' : 'text-neutral-200 hover:bg-white/10'
              }`}
            >
              <Zap className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* Guidance + reticle */}
      {cameraStatus === 'streaming' && !isAllComplete && (
        <main className="relative z-20 flex-1 min-h-0 flex flex-col items-center justify-center gap-4 px-4 pointer-events-none">
          <section
            key={currentStep.face}
            className="cb-rise flex items-center gap-3 w-full max-w-sm p-3 rounded-2xl bg-black/65 backdrop-blur-md border border-white/10"
            aria-live="polite"
          >
            <FaceGuide
              key={currentStep.face}
              front={currentStep.centerColor}
              top={currentStep.view.top}
              right={currentStep.view.right}
              className="cb-turn-in w-16 h-16 shrink-0"
            />
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[11px] font-mono uppercase tracking-wider text-sky-300">
                Step {stepIndex + 1} of 6 · {currentStep.title}
              </span>
              <p className="text-sm leading-snug text-white">{currentStep.instruction}</p>
              <span className="text-xs text-neutral-400">{currentStep.rotationHint}</span>
            </div>
          </section>

          <CompanionReticle
            tone={tone}
            expectedColor={currentStep.centerColor}
            liveColors={liveColors}
            squareRef={squareRef}
          />

          <div className="h-10 shrink-0 flex items-center">
            {hint && (
              <p
                role="status"
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-sm backdrop-blur-md border ${
                  hint.kind === 'error'
                    ? 'bg-amber-500/20 border-amber-400/50 text-amber-100'
                    : hint.kind === 'fix'
                    ? 'bg-black/60 border-amber-400/40 text-amber-100'
                    : hint.kind === 'progress'
                    ? 'bg-sky-500/20 border-sky-400/40 text-sky-100'
                    : 'bg-black/60 border-sky-400/40 text-sky-100'
                }`}
              >
                {hint.kind === 'progress' && <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />}
                {hint.kind === 'error' && <RotateCcw className="w-4 h-4" />}
                {hint.text}
              </p>
            )}
          </div>
        </main>
      )}

      {(cameraStatus !== 'streaming' || isAllComplete) && <div className="flex-1" aria-hidden />}

      {/* Camera states */}
      {cameraStatus === 'loading' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black">
          <Loader2 className="w-7 h-7 text-sky-400 animate-spin motion-reduce:animate-none" />
          <p className="text-sm text-neutral-300">Opening the camera…</p>
          <p className="text-xs text-neutral-500">Allow camera access if your phone asks.</p>
        </div>
      )}
      {cameraStatus === 'error' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black px-8 text-center">
          <AlertCircle className="w-10 h-10 text-rose-400" />
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold">The camera didn’t open</h2>
            <p className="text-sm text-neutral-400 max-w-xs">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setCameraAttempt((n) => n + 1)}
            className="min-h-12 px-6 rounded-2xl bg-white text-neutral-950 font-bold text-sm"
          >
            Try again
          </button>
        </div>
      )}

      {/* Bottom controls */}
      {!isAllComplete && cameraStatus === 'streaming' && (
        <footer className="relative z-30 shrink-0 flex flex-col items-center gap-3 px-4 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/90 via-black/70 to-transparent">
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
                    className="w-9 h-9 grid place-items-center"
                  >
                    <span
                      className={`w-6 h-6 rounded-full grid place-items-center border-2 transition-transform duration-150 ${
                        isCurrent ? 'scale-110 border-white' : status === 'rejected' ? 'border-amber-400' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: COLOR_HEX[step.centerColor] }}
                    >
                      {status === 'accepted' && <CheckCircle2 className="w-4 h-4 text-neutral-950" strokeWidth={3} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="flex items-center justify-between w-full max-w-xs">
            <button
              type="button"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              aria-label="Previous face"
              className="w-12 h-12 grid place-items-center text-neutral-300 disabled:opacity-25"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            {/* Shutter: the ring fills while the frame holds steady, then the photo takes itself. */}
            <button
              type="button"
              onClick={() => void takePhoto(quality)}
              disabled={isCapturing || isWaitingOnComputer}
              aria-label="Take photo"
              className="relative w-[84px] h-[84px] grid place-items-center active:scale-95 transition-transform disabled:opacity-60"
            >
              <svg viewBox="0 0 84 84" className="absolute inset-0 -rotate-90" aria-hidden>
                <circle cx="42" cy="42" r="38" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="4" />
                <circle
                  cx="42"
                  cy="42"
                  r="38"
                  fill="none"
                  stroke={quality && !quality.ready && !isWaitingOnComputer ? '#fbbf24' : '#38bdf8'}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringCircumference * (1 - holdProgress)}
                />
              </svg>
              <span className="w-[66px] h-[66px] rounded-full bg-white grid place-items-center">
                {isWaitingOnComputer ? (
                  <Loader2 className="w-6 h-6 text-neutral-900 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Camera className="w-6 h-6 text-neutral-900" />
                )}
              </span>
            </button>

            <button
              type="button"
              disabled={stepIndex === SCAN_SEQUENCE.length - 1}
              onClick={() => setStepIndex((i) => Math.min(SCAN_SEQUENCE.length - 1, i + 1))}
              aria-label="Next face"
              className="w-12 h-12 grid place-items-center text-neutral-300 disabled:opacity-25"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setAutoCapture((a) => !a)}
            aria-pressed={autoCapture}
            className="min-h-9 px-3 text-xs text-neutral-400 hover:text-white transition-colors"
          >
            Auto-capture <span className={autoCapture ? 'text-sky-300' : 'text-neutral-500'}>{autoCapture ? 'on' : 'off'}</span>
          </button>
        </footer>
      )}

      {/* Done */}
      {isAllComplete && (
        <div className="cb-rise absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 p-8 bg-black/92 backdrop-blur-lg text-center">
          <div className="p-4 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <CheckCircle2 className="w-14 h-14" />
          </div>
          <div className="flex flex-col gap-2 max-w-xs">
            <h2 className="text-xl font-bold tracking-tight">
              {session.confirmed ? 'Solving on your computer' : sessionId ? 'All six faces read' : 'All six photos taken'}
            </h2>
            <p className="text-sm text-neutral-300 leading-relaxed flex items-start gap-2 text-left">
              <Monitor className="w-4 h-4 mt-0.5 shrink-0 text-sky-400" />
              {session.confirmed
                ? 'Follow the moves on the 3D cube. You can put your phone down.'
                : sessionId
                ? 'Check the cube on your computer, fix any tile it marks, then press Confirm & solve.'
                : 'Open Cubyntra on a computer and scan its QR code to send your photos there.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="min-h-12 inline-flex items-center gap-2 px-5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-sm font-semibold transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Scan another cube
          </button>
        </div>
      )}

      {showCoach && <CaptureCoach onDone={() => setCoachOverride(false)} />}
    </div>
  );
}

export default function CompanionPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full h-[100dvh] bg-black grid place-items-center text-sm text-neutral-400">Loading…</div>
      }
    >
      <CompanionScannerContent />
    </Suspense>
  );
}
