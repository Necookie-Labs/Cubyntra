'use client';

/**
 * Cubyntra - Interactive Camera Scanner & 3x3 Reticle Overlay
 * Necookie Labs (c) 2026
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { SCAN_SEQUENCE } from '@/cube/constants';
import { CubeColor } from '@/cube/types';
import { StickerSample } from '@/vision/types';
import { initializeCameraStream, terminateCameraStream } from '@/vision/camera';
import { calculateROIBounds, sampleGridFromContext } from '@/vision/sampling';
import { TemporalStabilityBuffer } from '@/vision/stability';
import { detectCubeInROISync } from '@/vision/cubeDetector';
import { CubeDetectionResult } from '@/vision/ml/types';
import {
  Camera,
  Check,
  RotateCw,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  Zap,
  UserX,
  Box,
  ArrowLeft,
} from 'lucide-react';
import { BlockButton, Chip, IconButton, Panel, ProgressBlocks, cx, stickerColor, stickerLetter, stickerLetterClass } from '@/components/ui';
import { useTutorStore } from '@/stores/useTutorStore';

interface CameraScannerProps {
  /** Leave the scan and return to the start screen. */
  onBack: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onBack }) => {
  // Color-blind option: the letter of each color the camera sees, in the live grid.
  const letters = useTutorStore((s) => s.profile.settings.stickerLetters);
  const {
    currentStepIndex,
    scannedFaces,
    ingestFaceSamples,
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
  // Full measurements of the latest confirmed-cube frame; the resolver needs raw RGB, not labels.
  const liveSamplesRef = useRef<StickerSample[]>([]);

  const [cameraStatus, setCameraStatus] = useState<'loading' | 'streaming' | 'error'>('loading');
  // Bumped by "Try again" to re-run camera setup.
  const [cameraAttempt, setCameraAttempt] = useState(0);
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

    const samples = liveSamplesRef.current;
    if (samples.length !== 9) return;

    // Colors are resolved across all six faces once the last one is in, then reviewed.
    ingestFaceSamples(currentStepRef.current.face, samples);
    stabilityBufferRef.current.reset();
  }, [ingestFaceSamples]);

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
  }, [cameraAttempt]);

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
            liveSamplesRef.current = samples;
            setLiveStickers(
              samples.map((s) => ({
                predictedColor: s.predictedColor,
                confidence: s.confidence,
                isCubeColor: s.isCubeColor,
              }))
            );
          } else {
            // Clear live stickers so human face is NEVER classified or displayed as cube colors
            liveSamplesRef.current = [];
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

  const isFace = cubeDetection?.classification === 'face';
  const isCube = Boolean(cubeDetection?.isCube);
  // Frame color follows what the detector sees: danger for a face, leaf for a cube.
  const frameBorder = isFace ? 'border-danger' : isCube ? 'border-leaf' : 'border-sticker-white';
  const cornerFill = isFace ? 'bg-danger' : isCube ? 'bg-leaf' : 'bg-sticker-white';

  return (
    <div className="flex flex-col h-full w-full max-w-xl mx-auto p-4 select-none">
      <BlockButton
        variant="ghost"
        size="sm"
        onClick={onBack}
        icon={<ArrowLeft className="w-4 h-4" />}
        className="self-start mb-3 -ml-3"
      >
        Back
      </BlockButton>

      {/* Viewfinder Container */}
      <div className="relative w-full aspect-square overflow-hidden bg-sticker-core border-4 border-line shadow-block flex items-center justify-center">
        {/* Hidden processing canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Video feed */}
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${cameraStatus === 'streaming' ? 'opacity-100' : 'opacity-0'}`}
          playsInline
          muted
          autoPlay
        />

        {/* Loading State */}
        {cameraStatus === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-sticker-core p-4">
            <div className="vx-panel vx-place flex items-center gap-3 px-4 py-3 pb-4">
              <RefreshCw className="w-5 h-5 animate-spin text-leaf-edge" />
              <p className="text-sm font-bold text-ink">Starting the camera…</p>
            </div>
          </div>
        )}

        {/* Error Fallback */}
        {cameraStatus === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-sticker-core p-4">
            <div className="vx-panel vx-place flex w-full max-w-sm flex-col items-center gap-4 p-6 pb-7 text-center">
              <div
                aria-hidden
                data-variant="danger"
                className="vx-block flex h-12 w-12 items-center justify-center pb-1"
              >
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg text-ink">Camera Unavailable</h3>
                <p className="text-sm text-muted mt-1 max-w-xs">{errorMessage}</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <BlockButton
                  variant="primary"
                  size="sm"
                  onClick={() => setCameraAttempt((n) => n + 1)}
                  icon={<RefreshCw className="w-4 h-4" />}
                >
                  Try again
                </BlockButton>
                <BlockButton size="sm" onClick={() => loadMockScramble()} icon={<Sparkles className="w-4 h-4" />}>
                  Use demo cube
                </BlockButton>
                <BlockButton variant="ghost" size="sm" onClick={onBack}>
                  Back
                </BlockButton>
              </div>
            </div>
          </div>
        )}

        {/* 3x3 Reticle Overlay (Only when streaming) */}
        {cameraStatus === 'streaming' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Real-Time ML Verification Badge */}
            <div className="absolute top-4 left-4 right-16 z-20 pointer-events-none flex justify-center">
              {isFace ? (
                <Chip tone="danger" icon={<UserX className="w-4 h-4" />} className="h-8 px-3">
                  Face detected. Show the cube instead
                </Chip>
              ) : isCube && cubeDetection ? (
                <Chip tone="leaf" icon={<Box className="w-4 h-4" />} className="h-8 px-3">
                  Cube found{' '}
                  <span className="font-mono">({Math.round(cubeDetection.cubeConfidence * 100)}%)</span>
                </Chip>
              ) : (
                <Chip tone="neutral" icon={<Box className="w-4 h-4" />} className="h-8 px-3">
                  Looking for the cube…
                </Chip>
              )}
            </div>

            {/* Central square target: a block frame with solid pixel corners */}
            <div className={`relative w-[65%] h-[65%] border-4 p-1 grid grid-cols-3 gap-1 ${frameBorder}`}>
              {(['-top-2 -left-2', '-top-2 -right-2', '-bottom-2 -left-2', '-bottom-2 -right-2'] as const).map(
                (pos) => (
                  <span key={pos} aria-hidden className={`absolute ${pos} w-4 h-4 border-2 border-line ${cornerFill}`} />
                )
              )}

              {/* 9 Sampling Cells with Live Feedback */}
              {Array.from({ length: 9 }).map((_, index) => {
                const sample = liveStickers[index];
                const isCenter = index === 4;
                const isValidCubeColor = Boolean(sample && sample.isCubeColor !== false && isCube);
                const cellColor = isValidCubeColor && sample ? stickerColor(sample.predictedColor) : undefined;

                return (
                  <div
                    key={index}
                    className={`relative border-2 flex flex-col items-center justify-center overflow-hidden ${
                      isValidCubeColor ? '' : isFace ? 'border-danger' : 'border-sticker-white'
                    }`}
                    style={cellColor ? { borderColor: cellColor } : undefined}
                  >
                    {/* Inner sampling block */}
                    {isValidCubeColor ? (
                      <div
                        className={cx(
                          'flex items-center justify-center border-2 border-line transition-transform duration-150',
                          letters ? 'h-6 w-6' : 'h-4 w-4'
                        )}
                        style={{
                          backgroundColor: cellColor,
                          transform: isStable ? 'scale(1.25)' : 'scale(1)',
                        }}
                      >
                        {letters && sample && (
                          <span
                            data-testid="live-letter"
                            className={cx('font-mono text-xs font-bold leading-none', stickerLetterClass(sample.predictedColor))}
                          >
                            {stickerLetter(sample.predictedColor)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className={`w-2 h-2 ${isFace ? 'bg-danger' : 'bg-sticker-white'}`} />
                    )}

                    {/* Center piece indicator */}
                    {isCenter && (
                      <span className="absolute bottom-1 border-2 border-line bg-panel px-1 text-xs font-bold leading-none text-ink">
                        Center
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Flashlight button */}
            {hasTorch && (
              <IconButton
                label="Toggle Torch Light"
                variant={torchEnabled ? 'primary' : 'secondary'}
                size="sm"
                aria-pressed={torchEnabled}
                onClick={toggleTorch}
                className="absolute top-4 right-4 pointer-events-auto"
              >
                <Zap className="w-4 h-4" />
              </IconButton>
            )}
          </div>
        )}
      </div>

      {/* Guidance & Stability Bar */}
      <Panel className="mt-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="w-4 h-4 shrink-0 border-2 border-line"
                style={{ backgroundColor: stickerColor(currentStep.centerColor) }}
              />
              <h2 className="text-lg leading-tight text-ink">{currentStep.title}</h2>
            </div>
            <p className="text-sm text-muted mt-1">{currentStep.instruction}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-xs font-mono font-bold text-ink">{currentStepIndex + 1} / 6</span>
            <ProgressBlocks total={6} done={currentStepIndex} label="Faces scanned" size="sm" />
          </div>
        </div>

        {/* Stability Progress Indicator */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            {isFace ? (
              <Chip tone="danger" icon={<UserX className="w-3 h-3" />}>
                Face detected, scanning paused
              </Chip>
            ) : !isCube ? (
              <Chip tone="neutral">Line the cube up with the grid</Chip>
            ) : isStable ? (
              <Chip tone="leaf">✓ Hold still (ready)</Chip>
            ) : (
              <Chip tone="warn">Reading the colors…</Chip>
            )}

            <span className="text-xs font-mono text-muted">
              {isCube && avgConfidence > 0 ? `Conf ${Math.round(avgConfidence * 100)}% • ` : ''}
              {Math.round(stabilityProgress * 100)}%
            </span>
          </div>

          <div className="w-full h-4 bg-well border-2 border-line overflow-hidden">
            <div
              className={`h-full border-r-2 border-line transition-[width] duration-150 ${
                isFace ? 'bg-danger' : isStable ? 'bg-leaf' : 'bg-warn'
              }`}
              style={{ width: `${Math.max(5, stabilityProgress * 100)}%` }}
            />
          </div>
        </div>

        {/* Physical Rotation Hint */}
        <div className="vx-well flex items-center gap-2 p-2 text-xs text-muted">
          <RotateCw className="w-4 h-4 shrink-0 text-ink" />
          <span>{currentStep.rotationHint}</span>
        </div>

        {/* Manual Capture & Quick Action Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <BlockButton
            variant="primary"
            onClick={handleCaptureFace}
            disabled={cameraStatus !== 'streaming' || !isCube}
            icon={isFace ? <UserX className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
            className="flex-1"
          >
            {isCube ? 'Capture Face' : isFace ? 'Face Detected (Align Cube)' : 'No Cube Detected'}
          </BlockButton>

          <BlockButton
            onClick={() => loadMockScramble()}
            title="Skip scan and load scramble"
            aria-label="Use Scramble"
            icon={<Sparkles className="w-4 h-4" />}
          >
            <span className="hidden sm:inline">Use Scramble</span>
          </BlockButton>
        </div>
      </Panel>

      {/* 6-Face Capture Thumbnails (Review & Rescan) */}
      <div className="mt-4 grid grid-cols-6 gap-2">
        {SCAN_SEQUENCE.map((seq) => {
          const isCaptured = Boolean(scannedFaces[seq.face]);
          const isCurrent = seq.face === currentStep.face;
          const capturedData = scannedFaces[seq.face];

          return (
            <button
              key={seq.face}
              type="button"
              onClick={() => rescanFace(seq.face)}
              className={`relative aspect-square p-1 border-2 flex flex-col items-center justify-center transition-transform duration-75 hover:-translate-y-px ${
                isCurrent
                  ? 'border-line bg-leaf-soft shadow-block-sm'
                  : isCaptured
                  ? 'border-line bg-panel'
                  : 'border-line-soft bg-well'
              }`}
              title={`Face ${seq.face} (${seq.centerColor}) - Click to rescan`}
              aria-label={`Scan the ${seq.centerColor} center face (${isCaptured ? 'read' : isCurrent ? 'scanning now' : 'not read yet'})`}
            >
              {isCaptured && capturedData ? (
                <div className="grid grid-cols-3 gap-0.5 w-full h-full bg-sticker-core p-0.5">
                  {capturedData.stickers.map((col, idx) => (
                    <div key={idx} style={{ backgroundColor: stickerColor(col) }} />
                  ))}
                </div>
              ) : (
                <span className={`text-sm font-mono font-bold ${isCurrent ? 'text-ink' : 'text-muted'}`}>
                  {seq.face}
                </span>
              )}

              {isCaptured && (
                <span
                  aria-hidden
                  className="vx-pop absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center border-2 border-line bg-leaf text-on-leaf"
                >
                  <Check className="w-3 h-3" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
