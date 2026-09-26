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
import { SCAN_SEQUENCE, COLOR_HEX, FACES } from '@/cube/constants';
import { CubeColor, Face, FaceStickers } from '@/cube/types';
import { initializeCameraStream, terminateCameraStream, toggleCameraTorch } from '@/vision/camera';
import { calculateROIBounds, sampleGridFromContext } from '@/vision/sampling';
import { CompanionReticle } from '@/components/companion/CompanionReticle';
import {
  Camera,
  Zap,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Smartphone,
  Sparkles,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

function CompanionScannerContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stepIndex, setStepIndex] = useState(0);
  const [cameraStatus, setCameraStatus] = useState<'loading' | 'streaming' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchActive, setTorchActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [completedFaces, setCompletedFaces] = useState<Face[]>([]);
  const [liveColors, setLiveColors] = useState<(CubeColor | null)[]>([]);
  const [captureFlash, setCaptureFlash] = useState(false);

  const currentStep = SCAN_SEQUENCE[Math.min(stepIndex, SCAN_SEQUENCE.length - 1)];
  const isAllComplete = completedFaces.length === 6;

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

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const roi = calculateROIBounds(canvas.width, canvas.height, 0.65);
      const samples = sampleGridFromContext(ctx, roi);

      setLiveColors(samples.map((s) => s.predictedColor));
      timer = setTimeout(sampleFrame, 200);
    };

    timer = setTimeout(sampleFrame, 200);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [cameraStatus]);

  // Toggle Torch
  const handleToggleTorch = useCallback(async () => {
    if (!hasTorch || !streamRef.current) return;
    const nextState = !torchActive;
    const success = await toggleCameraTorch(streamRef.current, nextState);
    if (success) {
      setTorchActive(nextState);
    }
  }, [hasTorch, torchActive]);

  // Take Snapshot & Dispatch Face
  const handleSnapFace = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || isCapturing) return;

    setIsCapturing(true);
    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 150);

    // Haptic feedback
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(50);
      } catch {
        // ignore
      }
    }

    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas context unavailable');

      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const roi = calculateROIBounds(canvas.width, canvas.height, 0.65);
      const samples = sampleGridFromContext(ctx, roi);

      const stickers = samples.map((s) => s.predictedColor);
      const confidences = samples.map((s) => s.confidence);

      // Create a small, lightweight thumbnail for desktop visualizer preview
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 120;
      thumbCanvas.height = 120;
      const thumbCtx = thumbCanvas.getContext('2d');
      if (thumbCtx) {
        thumbCtx.drawImage(
          canvas,
          roi.x,
          roi.y,
          roi.size,
          roi.size,
          0,
          0,
          120,
          120
        );
      }
      const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.6);

      const currentFace = currentStep.face;

      // Dispatch to session if sessionId exists
      if (sessionId) {
        await fetch(`/api/session/${sessionId}/face`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            face: currentFace,
            centerColor: currentStep.centerColor,
            stickers,
            confidences,
            thumbnail,
            capturedAt: Date.now(),
          }),
        });
      }

      setCompletedFaces((prev) =>
        prev.includes(currentFace) ? prev : [...prev, currentFace]
      );

      // Advance to next step
      if (stepIndex < SCAN_SEQUENCE.length - 1) {
        setStepIndex((i) => i + 1);
      }
    } catch (err) {
      console.error('[Companion] Capture failed:', err);
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, currentStep, sessionId, stepIndex]);

  // Restart Sequence
  const handleReset = useCallback(() => {
    setStepIndex(0);
    setCompletedFaces([]);
  }, []);

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
            <h2 className="text-xl font-bold text-white tracking-tight">All 6 Faces Captured!</h2>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Your cube photos have been synced to the desktop screen. Look at your computer to
              explore the 3D twin and step-by-step solution!
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
              const isDone = completedFaces.includes(step.face);
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
              disabled={isCapturing || cameraStatus !== 'streaming'}
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
