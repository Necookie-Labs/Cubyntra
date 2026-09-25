'use client';

/**
 * Cubyntra - Interactive Camera Scanner & 3x3 Reticle Overlay
 * Necookie Labs (c) 2026
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { SCAN_SEQUENCE, COLOR_HEX } from '@/cube/constants';
import { CubeColor, FaceStickers, ScannedFace } from '@/cube/types';
import { initializeCameraStream, terminateCameraStream } from '@/vision/camera';
import { calculateROIBounds, sampleGridFromContext } from '@/vision/sampling';
import { TemporalStabilityBuffer } from '@/vision/stability';
import { Camera, CheckCircle2, RotateCw, AlertTriangle, Sparkles, RefreshCw, Zap } from 'lucide-react';

export const CameraScanner: React.FC = () => {
  const {
    currentStepIndex,
    scannedFaces,
    captureFace,
    rescanFace,
    setClassification,
    loadMockScramble,
  } = useCubyntraStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stabilityBufferRef = useRef<TemporalStabilityBuffer>(new TemporalStabilityBuffer({ requiredStableFrames: 8 }));
  const animationFrameIdRef = useRef<number | null>(null);

  const [cameraStatus, setCameraStatus] = useState<'loading' | 'streaming' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStable, setIsStable] = useState(false);
  const [stabilityProgress, setStabilityProgress] = useState(0);
  const [avgConfidence, setAvgConfidence] = useState(0);
  const [liveStickers, setLiveStickers] = useState<{ predictedColor: CubeColor; confidence: number }[]>([]);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);

  const currentStep = SCAN_SEQUENCE[Math.min(currentStepIndex, SCAN_SEQUENCE.length - 1)];
  const currentStepRef = useRef(currentStep);
  const liveStickersRef = useRef(liveStickers);

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    liveStickersRef.current = liveStickers;
  }, [liveStickers]);

  // Handle Face Capture
  const handleCaptureFace = useCallback(() => {
    const stickersSnapshot = liveStickersRef.current;
    if (stickersSnapshot.length !== 9) return;

    const stickers = stickersSnapshot.map((s) => s.predictedColor) as FaceStickers;
    const confidences = stickersSnapshot.map((s) => s.confidence);

    const faceData: ScannedFace = {
      face: currentStepRef.current.face,
      centerColor: stickers[4],
      stickers,
      confidences,
      capturedAt: Date.now(),
    };

    captureFace(faceData);
    stabilityBufferRef.current.reset();
  }, [captureFace]);

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
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      terminateCameraStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  // Frame Sampling & Stability Loop
  useEffect(() => {
    if (cameraStatus !== 'streaming') return;

    stabilityBufferRef.current.reset();

    const processLoop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= 2) {
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 480;

        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, width, height);

          // 1. Calculate ROI and sample 3x3 grid
          const roi = calculateROIBounds(width, height, 0.65);
          const samples = sampleGridFromContext(ctx, roi);

          // 2. Evaluate Temporal Stability
          const stabilityResult = stabilityBufferRef.current.processFrame(
            samples,
            currentStepRef.current.face
          );

          setIsStable(stabilityResult.isStable);
          setStabilityProgress(stabilityResult.stabilityProgress);
          setAvgConfidence(stabilityResult.averageConfidence);
          setLiveStickers(
            samples.map((s) => ({
              predictedColor: s.predictedColor,
              confidence: s.confidence,
            }))
          );

          // Update store for debugger view
          setClassification(stabilityResult);

          // Optional: Auto-capture when rock-solid stability is reached
          if (stabilityResult.isStable && stabilityResult.stabilityProgress >= 1.0) {
            handleCaptureFace();
            return;
          }
        }
      }

      animationFrameIdRef.current = requestAnimationFrame(processLoop);
    };

    animationFrameIdRef.current = requestAnimationFrame(processLoop);

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [cameraStatus, currentStepIndex, handleCaptureFace, setClassification]);

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && hasTorch) {
      try {
        const nextState = !torchEnabled;
        // @ts-expect-error advanced constraints for torch
        await track.applyConstraints({ advanced: [{ torch: nextState }] });
        setTorchEnabled(nextState);
      } catch {
        // Ignore torch failure
      }
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-xl mx-auto p-4 select-none">
      {/* Viewfinder Container */}
      <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-neutral-950 border border-neutral-800 shadow-2xl flex items-center justify-center">
        {/* Hidden processing canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Video feed */}
        <video
          ref={videoRef}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            cameraStatus === 'streaming' ? 'opacity-100' : 'opacity-0'
          }`}
          playsInline
          muted
          autoPlay
        />

        {/* Loading State */}
        {cameraStatus === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-950 text-neutral-400">
            <RefreshCw className="w-8 h-8 animate-spin text-sky-400" />
            <p className="text-sm font-mono">Initializing Camera Pipeline...</p>
          </div>
        )}

        {/* Error Fallback */}
        {cameraStatus === 'error' && (
          <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center gap-4 bg-neutral-950 text-neutral-300">
            <div className="w-12 h-12 rounded-full bg-red-950/60 border border-red-800/80 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Camera Unavailable</h3>
              <p className="text-xs text-neutral-400 mt-1 max-w-xs">{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => loadMockScramble()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium shadow-md transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              <span>Use Simulated Scramble Demo</span>
            </button>
          </div>
        )}

        {/* 3x3 Reticle Overlay (Only when streaming) */}
        {cameraStatus === 'streaming' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Darkened vignette surround */}
            <div className="absolute inset-0 bg-neutral-950/35" />

            {/* Central square target */}
            <div className="relative w-[65%] h-[65%] border-2 border-white/40 rounded-xl p-1.5 grid grid-cols-3 gap-1.5 backdrop-blur-[0.5px] shadow-2xl">
              {/* Corner Reticle Brackets */}
              <div className="absolute -top-2.5 -left-2.5 w-5 h-5 border-t-2 border-l-2 border-sky-400" />
              <div className="absolute -top-2.5 -right-2.5 w-5 h-5 border-t-2 border-r-2 border-sky-400" />
              <div className="absolute -bottom-2.5 -left-2.5 w-5 h-5 border-b-2 border-l-2 border-sky-400" />
              <div className="absolute -bottom-2.5 -right-2.5 w-5 h-5 border-b-2 border-r-2 border-sky-400" />

              {/* 9 Sampling Cells with Live Feedback */}
              {Array.from({ length: 9 }).map((_, index) => {
                const sample = liveStickers[index];
                const isCenter = index === 4;
                const cellColorHex = sample ? COLOR_HEX[sample.predictedColor] : 'transparent';

                return (
                  <div
                    key={index}
                    className="relative rounded-lg border border-white/20 flex flex-col items-center justify-center overflow-hidden transition-all duration-150"
                    style={{
                      backgroundColor: sample ? `${cellColorHex}40` : 'transparent',
                    }}
                  >
                    {/* Inner sampling dot */}
                    <div
                      className="w-3.5 h-3.5 rounded-full shadow-md border border-white/60 transition-transform duration-150"
                      style={{
                        backgroundColor: cellColorHex,
                        transform: isStable ? 'scale(1.15)' : 'scale(1)',
                      }}
                    />

                    {/* Center piece indicator */}
                    {isCenter && (
                      <span className="absolute bottom-1 text-[9px] font-mono tracking-tighter uppercase text-white/90 bg-black/60 px-1 rounded">
                        Center
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Flashlight button */}
            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`absolute top-4 right-4 p-2 rounded-full pointer-events-auto border transition-colors ${
                  torchEnabled
                    ? 'bg-amber-400 text-neutral-950 border-amber-300'
                    : 'bg-neutral-900/80 text-white border-neutral-700'
                }`}
                title="Toggle Torch Light"
              >
                <Zap className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Guidance & Stability Bar */}
      <div className="mt-4 p-4 rounded-xl bg-neutral-900/90 border border-neutral-800 shadow-lg flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLOR_HEX[currentStep.centerColor] }} />
              <h2 className="text-sm font-semibold text-white">{currentStep.title}</h2>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">{currentStep.instruction}</p>
          </div>
          <span className="text-xs font-mono text-neutral-400">
            {currentStepIndex + 1} / 6
          </span>
        </div>

        {/* Stability Progress Indicator */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className={isStable ? 'text-emerald-400 font-semibold' : 'text-neutral-400'}>
              {isStable ? '✓ HOLD STILL (READY)' : 'ALIGN CUBE WITH RETICLE'}
            </span>
            <span className="text-neutral-400">
              {avgConfidence > 0 ? `Conf ${Math.round(avgConfidence * 100)}% • ` : ''}
              {Math.round(stabilityProgress * 100)}%
            </span>
          </div>

          <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-150 rounded-full ${
                isStable ? 'bg-emerald-500' : 'bg-sky-500'
              }`}
              style={{ width: `${Math.max(5, stabilityProgress * 100)}%` }}
            />
          </div>
        </div>

        {/* Physical Rotation Hint */}
        <div className="flex items-center gap-2 text-xs text-neutral-400 font-mono bg-neutral-950/60 p-2 rounded-lg border border-neutral-800/60">
          <RotateCw className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span>{currentStep.rotationHint}</span>
        </div>

        {/* Manual Capture & Quick Action Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleCaptureFace}
            disabled={cameraStatus !== 'streaming'}
            className="flex-1 py-2.5 rounded-lg bg-white text-neutral-950 font-semibold text-xs hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
          >
            <Camera className="w-4 h-4" />
            <span>Capture Face</span>
          </button>

          <button
            type="button"
            onClick={() => loadMockScramble()}
            className="px-3 py-2.5 rounded-lg bg-neutral-800 text-neutral-300 font-medium text-xs hover:bg-neutral-700 transition-colors border border-neutral-700 flex items-center gap-1.5"
            title="Skip scan and load scramble"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Use Scramble</span>
          </button>
        </div>
      </div>

      {/* 6-Face Capture Thumbnails (Review & Rescan) */}
      <div className="mt-3 grid grid-cols-6 gap-2">
        {SCAN_SEQUENCE.map((seq) => {
          const isCaptured = Boolean(scannedFaces[seq.face]);
          const isCurrent = seq.face === currentStep.face;
          const capturedData = scannedFaces[seq.face];

          return (
            <button
              key={seq.face}
              type="button"
              onClick={() => rescanFace(seq.face)}
              className={`relative aspect-square rounded-lg p-1 border transition-all flex flex-col items-center justify-center ${
                isCurrent
                  ? 'border-sky-400 bg-sky-950/30 ring-1 ring-sky-400'
                  : isCaptured
                  ? 'border-neutral-700 bg-neutral-900 hover:border-neutral-500'
                  : 'border-neutral-800 bg-neutral-950/60 opacity-60'
              }`}
              title={`Face ${seq.face} (${seq.centerColor}) - Click to rescan`}
            >
              {isCaptured && capturedData ? (
                <div className="grid grid-cols-3 gap-0.5 w-full h-full p-0.5">
                  {capturedData.stickers.map((col, idx) => (
                    <div
                      key={idx}
                      className="rounded-[1px]"
                      style={{ backgroundColor: COLOR_HEX[col] }}
                    />
                  ))}
                </div>
              ) : (
                <span className="text-xs font-mono font-bold text-neutral-400">
                  {seq.face}
                </span>
              )}

              {isCaptured && (
                <CheckCircle2 className="w-3 h-3 text-emerald-400 absolute -top-1 -right-1 bg-neutral-950 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
