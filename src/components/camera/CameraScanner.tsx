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
import { detectCubeInROISync } from '@/vision/cubeDetector';
import { CubeDetectionResult } from '@/vision/ml/types';
import {
  Camera,
  CheckCircle2,
  RotateCw,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  Zap,
  UserX,
  Box,
} from 'lucide-react';

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
  const nativeFaceSignalRef = useRef(0.0);

  const [cameraStatus, setCameraStatus] = useState<'loading' | 'streaming' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStable, setIsStable] = useState(false);
  const [stabilityProgress, setStabilityProgress] = useState(0);
  const [avgConfidence, setAvgConfidence] = useState(0);
  const [liveStickers, setLiveStickers] = useState<{ predictedColor: CubeColor; confidence: number; isCubeColor?: boolean }[]>([]);
  const [cubeDetection, setCubeDetection] = useState<CubeDetectionResult | null>(null);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);

  const currentStep = SCAN_SEQUENCE[Math.min(currentStepIndex, SCAN_SEQUENCE.length - 1)];
  const currentStepRef = useRef(currentStep);
  const liveStickersRef = useRef(liveStickers);
  const cubeDetectionRef = useRef(cubeDetection);

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    liveStickersRef.current = liveStickers;
  }, [liveStickers]);

  useEffect(() => {
    cubeDetectionRef.current = cubeDetection;
  }, [cubeDetection]);

  // Handle Face Capture
  const handleCaptureFace = useCallback(() => {
    // Strictly prevent capture if ML model did not verify a cube or detected a human face
    if (!cubeDetectionRef.current || !cubeDetectionRef.current.isCube) return;

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

  // Native FaceDetector background polling (every 250ms)
  useEffect(() => {
    if (cameraStatus !== 'streaming') return;
    let isCancelled = false;

    const checkNativeFace = async () => {
      const video = videoRef.current;
      if (
        typeof window !== 'undefined' &&
        'FaceDetector' in window &&
        window.FaceDetector &&
        video &&
        video.readyState >= 2
      ) {
        try {
          const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 2 });
          const faces = await detector.detect(video);
          if (!isCancelled) {
            const width = video.videoWidth || 640;
            const height = video.videoHeight || 480;
            const roi = calculateROIBounds(width, height, 0.65);
            const faceInROI = faces.some(
              (f: { boundingBox: { x: number; y: number; width: number; height: number } }) => {
                const b = f.boundingBox;
                return !(
                  b.x + b.width < roi.x ||
                  b.x > roi.x + roi.size ||
                  b.y + b.height < roi.y ||
                  b.y > roi.y + roi.size
                );
              }
            );
            nativeFaceSignalRef.current = faceInROI ? 1.0 : 0.0;
          }
        } catch {
          nativeFaceSignalRef.current = 0.0;
        }
      }
    };

    const interval = setInterval(checkNativeFace, 250);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [cameraStatus]);

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

          // 2. Evaluate ML Cube vs Face presence
          const detection = detectCubeInROISync(
            ctx,
            roi,
            samples,
            nativeFaceSignalRef.current
          );
          setCubeDetection(detection);

          // 3. Evaluate Temporal Stability (strictly gated by ML cube presence)
          const stabilityResult = stabilityBufferRef.current.processFrame(
            samples,
            currentStepRef.current.face,
            detection
          );

          setIsStable(stabilityResult.isStable);
          setStabilityProgress(stabilityResult.stabilityProgress);
          setAvgConfidence(stabilityResult.averageConfidence);

          // Only display live colors when ML confirms a genuine Rubik's Cube
          if (detection.isCube) {
            setLiveStickers(
              samples.map((s) => ({
                predictedColor: s.predictedColor,
                confidence: s.confidence,
                isCubeColor: s.isCubeColor,
              }))
            );
          } else {
            // Clear live stickers so human face is NEVER classified or displayed as cube colors
            setLiveStickers([]);
          }

          // Update store for debugger view
          setClassification(stabilityResult);

          // Auto-capture ONLY when ML strictly confirms a Rubik's cube with 100% stability
          if (detection.isCube && stabilityResult.isStable && stabilityResult.stabilityProgress >= 1.0) {
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

            {/* Real-Time ML Verification Badge */}
            <div className="absolute top-4 left-4 right-14 z-20 pointer-events-none flex justify-center">
              {cubeDetection?.classification === 'face' ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-950/90 border border-rose-500/80 text-rose-300 text-xs font-mono shadow-xl backdrop-blur-md animate-pulse">
                  <UserX className="w-3.5 h-3.5 text-rose-400" />
                  <span>FACE DETECTED — ALIGN RUBIK&apos;S CUBE</span>
                </div>
              ) : cubeDetection?.isCube ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-950/90 border border-sky-400/80 text-sky-200 text-xs font-mono shadow-xl backdrop-blur-md">
                  <Box className="w-3.5 h-3.5 text-emerald-400" />
                  <span>RUBIK&apos;S CUBE VERIFIED ({Math.round(cubeDetection.cubeConfidence * 100)}%)</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-900/90 border border-neutral-700 text-neutral-400 text-xs font-mono shadow-xl backdrop-blur-md">
                  <Box className="w-3.5 h-3.5 text-neutral-400" />
                  <span>SEARCHING FOR RUBIK&apos;S CUBE...</span>
                </div>
              )}
            </div>

            {/* Central square target with dynamic ML border */}
            <div
              className={`relative w-[65%] h-[65%] border-2 rounded-xl p-1.5 grid grid-cols-3 gap-1.5 backdrop-blur-[0.5px] transition-all duration-200 shadow-2xl ${
                cubeDetection?.classification === 'face'
                  ? 'border-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.4)]'
                  : cubeDetection?.isCube
                  ? 'border-sky-400 shadow-[0_0_30px_rgba(56,189,248,0.35)]'
                  : 'border-white/30'
              }`}
            >
              {/* Corner Reticle Brackets */}
              <div
                className={`absolute -top-2.5 -left-2.5 w-5 h-5 border-t-2 border-l-2 transition-colors ${
                  cubeDetection?.classification === 'face'
                    ? 'border-rose-400'
                    : cubeDetection?.isCube
                    ? 'border-sky-400'
                    : 'border-neutral-500'
                }`}
              />
              <div
                className={`absolute -top-2.5 -right-2.5 w-5 h-5 border-t-2 border-r-2 transition-colors ${
                  cubeDetection?.classification === 'face'
                    ? 'border-rose-400'
                    : cubeDetection?.isCube
                    ? 'border-sky-400'
                    : 'border-neutral-500'
                }`}
              />
              <div
                className={`absolute -bottom-2.5 -left-2.5 w-5 h-5 border-b-2 border-l-2 transition-colors ${
                  cubeDetection?.classification === 'face'
                    ? 'border-rose-400'
                    : cubeDetection?.isCube
                    ? 'border-sky-400'
                    : 'border-neutral-500'
                }`}
              />
              <div
                className={`absolute -bottom-2.5 -right-2.5 w-5 h-5 border-b-2 border-r-2 transition-colors ${
                  cubeDetection?.classification === 'face'
                    ? 'border-rose-400'
                    : cubeDetection?.isCube
                    ? 'border-sky-400'
                    : 'border-neutral-500'
                }`}
              />

              {/* 9 Sampling Cells with Live Feedback */}
              {Array.from({ length: 9 }).map((_, index) => {
                const sample = liveStickers[index];
                const isCenter = index === 4;
                const isCubeVerified = Boolean(cubeDetection?.isCube);
                const isValidCubeColor = Boolean(sample && sample.isCubeColor !== false && isCubeVerified);
                const cellColorHex = isValidCubeColor && sample ? COLOR_HEX[sample.predictedColor] : 'transparent';

                return (
                  <div
                    key={index}
                    className={`relative rounded-lg border flex flex-col items-center justify-center overflow-hidden transition-all duration-150 ${
                      isValidCubeColor
                        ? 'border-white/30'
                        : cubeDetection?.classification === 'face'
                        ? 'border-rose-500/40 bg-rose-950/20'
                        : 'border-white/10 bg-neutral-900/30'
                    }`}
                    style={{
                      backgroundColor: isValidCubeColor ? `${cellColorHex}40` : 'transparent',
                    }}
                  >
                    {/* Inner sampling dot */}
                    {isValidCubeColor ? (
                      <div
                        className="w-3.5 h-3.5 rounded-full shadow-md border border-white/60 transition-transform duration-150"
                        style={{
                          backgroundColor: cellColorHex,
                          transform: isStable ? 'scale(1.15)' : 'scale(1)',
                        }}
                      />
                    ) : cubeDetection?.classification === 'face' ? (
                      <div className="w-2.5 h-2.5 rounded-full border border-rose-500/80 bg-rose-500/30" />
                    ) : (
                      <div className="w-2.5 h-2.5 rounded-full border border-neutral-600 bg-neutral-800/40" />
                    )}

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
            {cubeDetection?.classification === 'face' ? (
              <span className="text-rose-400 font-semibold flex items-center gap-1.5">
                <UserX className="w-3.5 h-3.5" />
                <span>FACE DETECTED (SCANNING BLOCKED)</span>
              </span>
            ) : !cubeDetection?.isCube ? (
              <span className="text-neutral-400">ALIGN CUBE WITH RETICLE</span>
            ) : isStable ? (
              <span className="text-emerald-400 font-semibold">✓ HOLD STILL (READY)</span>
            ) : (
              <span className="text-sky-400">STABILIZING CUBE COLORS...</span>
            )}

            <span className="text-neutral-400">
              {cubeDetection?.isCube && avgConfidence > 0 ? `Conf ${Math.round(avgConfidence * 100)}% • ` : ''}
              {Math.round(stabilityProgress * 100)}%
            </span>
          </div>

          <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-150 rounded-full ${
                cubeDetection?.classification === 'face'
                  ? 'bg-rose-500'
                  : isStable
                  ? 'bg-emerald-500'
                  : 'bg-sky-500'
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
            disabled={cameraStatus !== 'streaming' || !cubeDetection?.isCube}
            className="flex-1 py-2.5 rounded-lg bg-white text-neutral-950 font-semibold text-xs hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2 shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {cubeDetection?.classification === 'face' ? (
              <UserX className="w-4 h-4 text-rose-600" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
            <span>
              {cubeDetection?.isCube
                ? 'Capture Face'
                : cubeDetection?.classification === 'face'
                ? 'Face Detected (Align Cube)'
                : 'No Cube Detected'}
            </span>
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
