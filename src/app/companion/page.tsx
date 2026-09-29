'use client';

/**
 * Cubyntra - Mobile Companion Scanner Viewport
 * Necookie Labs (c) 2026
 *
 * Dedicated mobile-first photo scanner for high-resolution, glare-free capture.
 * Follows ADR-001: 100% on-device image processing and transient peer synchronization.
 */

import React, { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SCAN_SEQUENCE, COLOR_HEX } from '@/cube/constants';
import { CubeColor } from '@/cube/types';
import {
  initializeCameraStream,
  lockWhiteBalance,
  terminateCameraStream,
  toggleCameraTorch,
} from '@/vision/camera';
import { mapElementRectToVideo, sampleGridFromContext } from '@/vision/sampling';
import { ROIBounds } from '@/vision/types';
import { useMobileSession } from '@/sync/useMobileSession';
import { CompanionReticle } from '@/components/companion/CompanionReticle';
import {
  Camera,
  Zap,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Smartphone,
  AlertCircle,
  Loader2,
  Monitor,
} from 'lucide-react';

/** Size of the photo sent to the computer: plenty for nine tiles, small enough to send fast. */
const PHOTO_SIZE = 512;

function toScreenRect(el: Element) {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function CompanionScannerContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const session = useMobileSession(sessionId);

  const [stepIndex, setStepIndex] = useState(0);
  const [cameraStatus, setCameraStatus] = useState<'loading' | 'streaming' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchActive, setTorchActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [liveColors, setLiveColors] = useState<(CubeColor | null)[]>([]);
  const [captureFlash, setCaptureFlash] = useState(false);

  const currentStep = SCAN_SEQUENCE[Math.min(stepIndex, SCAN_SEQUENCE.length - 1)];
  const isAccepted = (i: number) => session.status[SCAN_SEQUENCE[i].face] === 'accepted';
  const isAllComplete = SCAN_SEQUENCE.every((_, i) => isAccepted(i));
  const currentStatus = session.status[currentStep.face];

  // Move on once the computer has read the current face; stay put while it reads or asks
  // for a retake. Faces may be done out of order, so jump to the first one still missing.
  const [advancedFor, setAdvancedFor] = useState<string | null>(null);
  if (currentStatus === 'accepted' && advancedFor !== currentStep.face) {
    setAdvancedFor(currentStep.face);
    const next = SCAN_SEQUENCE.findIndex((_, i) => !isAccepted(i));
    if (next !== -1) setStepIndex(next);
  }

  // The computer asked for a specific face again (from its review screen).
  const [handledRescanAt, setHandledRescanAt] = useState<number | null>(null);
  if (session.rescanRequest && session.rescanRequest.at !== handledRescanAt) {
    setHandledRescanAt(session.rescanRequest.at);
    const target = SCAN_SEQUENCE.findIndex((step) => step.face === session.rescanRequest!.face);
    if (target !== -1) setStepIndex(target);
    setAdvancedFor(null);
  }

  /** Where the reticle sits in camera-frame pixels; the same region is sampled and sent. */
  const reticleRegion = useCallback((): ROIBounds | null => {
    const video = videoRef.current;
    const square = squareRef.current;
    if (!video || !square || !video.videoWidth) return null;
    return mapElementRectToVideo(toScreenRect(square), toScreenRect(video), video.videoWidth, video.videoHeight);
  }, []);

  // Initialize Camera
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

        // Give auto white balance a moment to settle on the scene, then freeze it so every
        // face is shot at the same color temperature.
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

    startCamera();

    return () => {
      isCancelled = true;
      terminateCameraStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  // Live Sampling Loop (every 200ms)
  useEffect(() => {
    if (cameraStatus !== 'streaming') return;
    let timer: NodeJS.Timeout | null = null;

    const sampleFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        timer = setTimeout(sampleFrame, 200);
        return;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        timer = setTimeout(sampleFrame, 200);
        return;
      }

      const roi = reticleRegion();
      if (!roi) {
        timer = setTimeout(sampleFrame, 200);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const samples = sampleGridFromContext(ctx, roi);

      setLiveColors(samples.map((s) => s.predictedColor));
      timer = setTimeout(sampleFrame, 200);
    };

    timer = setTimeout(sampleFrame, 200);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [cameraStatus, reticleRegion]);

  // Toggle Torch
  const handleToggleTorch = useCallback(async () => {
    if (!hasTorch || !streamRef.current) return;
    const nextState = !torchActive;
    const success = await toggleCameraTorch(streamRef.current, nextState);
    if (success) {
      setTorchActive(nextState);
    }
  }, [hasTorch, torchActive]);

  // Take the photo: crop exactly the reticle square and send it to the computer.
  const handleSnapFace = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const roi = reticleRegion();
    if (!video || !canvas || !roi || isCapturing) return;

    setIsCapturing(true);
    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 150);

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(50);
      } catch {
        // Haptics are optional.
      }
    }

    try {
      const photo = document.createElement('canvas');
      photo.width = PHOTO_SIZE;
      photo.height = PHOTO_SIZE;
      const pctx = photo.getContext('2d');
      if (!pctx) throw new Error('Canvas context unavailable');
      pctx.drawImage(video, roi.x, roi.y, roi.size, roi.size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);

      await session.sendPhoto(currentStep.face, photo.toDataURL('image/jpeg', 0.9));
    } catch (err) {
      console.error('[Companion] Capture failed:', err);
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, currentStep, reticleRegion, session]);

  // Restart Sequence
  const handleReset = useCallback(() => {
    session.reset();
    setAdvancedFor(null);
    setStepIndex(0);
  }, [session]);

  return (
    <div className="relative w-full h-[100dvh] bg-black text-white flex flex-col justify-between overflow-hidden select-none">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Screen Shutter Flash Effect */}
      {captureFlash && (
        <div className="absolute inset-0 bg-white z-50 pointer-events-none animate-out fade-out duration-150" />
      )}

      {/* Top Floating App Bar */}
      <header className="relative z-30 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xs font-bold tracking-tight text-white flex items-center gap-1.5">
              Cubyntra Companion
            </h1>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-400">
              {sessionId ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>ID: {sessionId}</span>
                </>
              ) : (
                <span className="text-amber-400">Standalone Mode</span>
              )}
            </div>
          </div>
        </div>

        {/* Torch / Flashlight Toggle */}
        {hasTorch && (
          <button
            type="button"
            onClick={handleToggleTorch}
            className={`p-2.5 rounded-full border transition-all ${
              torchActive
                ? 'bg-amber-400 text-black border-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.6)]'
                : 'bg-black/60 backdrop-blur-md text-white border-neutral-700'
            }`}
          >
            <Zap className="w-4 h-4" />
          </button>
        )}
      </header>

      {/* Full-Screen Camera Viewport */}
      <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden bg-neutral-950">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover"
        />

        {cameraStatus === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 gap-3 z-30">
            <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-mono text-neutral-300">Accessing rear camera...</span>
          </div>
        )}

        {cameraStatus === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 p-6 text-center gap-4 z-30">
            <AlertCircle className="w-10 h-10 text-rose-400" />
            <div className="text-sm font-bold text-white">Camera Unavailable</div>
            <p className="text-xs text-neutral-400 max-w-xs">{errorMessage}</p>
          </div>
        )}

        {/* Reticle Overlay */}
        {cameraStatus === 'streaming' && !isAllComplete && (
          <CompanionReticle
            currentStep={currentStep}
            stepIndex={stepIndex}
            totalSteps={SCAN_SEQUENCE.length}
            liveColors={liveColors}
            isReady={true}
            squareRef={squareRef}
          />
        )}
      </div>

      {/* All Complete Screen Modal */}
      {isAllComplete && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center p-6 bg-black/90 backdrop-blur-lg text-center gap-5">
          <div className="p-4 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 animate-in zoom-in-95 duration-300">
            <CheckCircle2 className="w-16 h-16" />
          </div>

          <div className="flex flex-col gap-1 max-w-xs">
            <h2 className="text-xl font-bold text-white tracking-tight">
              {session.confirmed ? 'Solving on your computer' : 'All six faces read'}
            </h2>
            <p className="text-sm text-neutral-400 leading-relaxed flex items-start gap-2 text-left">
              <Monitor className="w-4 h-4 mt-0.5 shrink-0 text-sky-400" />
              {session.confirmed
                ? 'Follow the moves on the 3D cube. You can put your phone down.'
                : 'Check the cube on your computer, fix any tile it marks, then press Confirm & solve.'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-white border border-neutral-700 transition-all mt-4"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Scan Another Cube</span>
          </button>
        </div>
      )}

      {/* Bottom Floating Control Bar */}
      {!isAllComplete && (
        <footer className="relative z-30 flex flex-col items-center gap-3 p-4 bg-gradient-to-t from-black/95 via-black/80 to-transparent">
          {/* 6-Step Indicator Pills */}
          <div className="flex items-center gap-2">
            {SCAN_SEQUENCE.map((step, idx) => {
              const isDone = session.status[step.face] === 'accepted';
              const isCurrent = idx === stepIndex;
              const hex = COLOR_HEX[step.centerColor];

              return (
                <button
                  key={step.face}
                  type="button"
                  onClick={() => setStepIndex(idx)}
                  className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
                    isCurrent
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-110'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: hex, borderColor: isCurrent ? '#ffffff' : 'transparent' }}
                >
                  {isDone && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-neutral-900 stroke-[3]" />
                  )}
                </button>
              );
            })}
          </div>

          {currentStatus && currentStatus !== 'accepted' && (
            <div
              role="status"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border backdrop-blur-md ${
                currentStatus === 'rejected'
                  ? 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                  : 'bg-sky-500/15 border-sky-400/40 text-sky-200'
              }`}
            >
              {currentStatus === 'rejected' ? (
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
              )}
              {currentStatus === 'sending' && 'Sending to your computer…'}
              {currentStatus === 'reading' && 'Reading on your computer…'}
              {currentStatus === 'rejected' && (session.reasons[currentStep.face] ?? 'Take this one again.')}
            </div>
          )}

          {/* Shutter Button & Step Nav */}
          <div className="flex items-center justify-between w-full max-w-xs px-2">
            <button
              type="button"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              className="p-3 text-neutral-400 hover:text-white disabled:opacity-20 transition-all"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            {/* Shutter Button */}
            <button
              type="button"
              disabled={isCapturing || cameraStatus !== 'streaming' || currentStatus === 'sending' || currentStatus === 'reading'}
              onClick={handleSnapFace}
              className="relative p-1 rounded-full border-4 border-white/80 active:scale-95 transition-transform"
            >
              <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg active:bg-neutral-200">
                <Camera className="w-6 h-6 text-black" />
              </div>
            </button>

            <button
              type="button"
              disabled={stepIndex === SCAN_SEQUENCE.length - 1}
              onClick={() => setStepIndex((i) => Math.min(SCAN_SEQUENCE.length - 1, i + 1))}
              className="p-3 text-neutral-400 hover:text-white disabled:opacity-20 transition-all"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

export default function CompanionPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full h-[100dvh] bg-black flex items-center justify-center text-white text-xs font-mono">
          Loading Companion...
        </div>
      }
    >
      <CompanionScannerContent />
    </Suspense>
  );
}
