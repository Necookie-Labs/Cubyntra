'use client';

/**
 * Cubyntra - Camera for checkpoint scans
 * Necookie Labs (c) 2026
 *
 * Opens the camera while the checkpoint sheet is open and reads one face on demand: the
 * centered reticle square of the current frame, sampled and classified with the student's
 * palette (src/vision/checkpointCapture.ts). Pixels stay in this tab.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { initializeCameraStream, terminateCameraStream } from '@/vision/camera';
import { calculateROIBounds } from '@/vision/sampling';
import { readFaceFromContext, type FaceReading } from '@/vision/checkpointCapture';
import type { StudentPalette } from '@/vision/palette';

/** Share of the frame's short side covered by the reticle (same as the full scan). */
export const RETICLE_SHARE = 0.65;

export type CameraStatus = 'off' | 'starting' | 'live' | 'denied' | 'error';

export interface CheckpointCamera {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: string | null;
  retry: () => void;
  /** Reads the face in the reticle now, or null when no frame is available. */
  capture: () => FaceReading | null;
}

export function useCheckpointCamera(enabled: boolean, palette: StudentPalette | null): CheckpointCamera {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('off');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const start = async () => {
      // The video element mounts with the sheet; wait a frame for it.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const video = videoRef.current;
      if (cancelled || !video) return;
      setStatus('starting');
      setError(null);
      try {
        const result = await initializeCameraStream(video, { facingMode: 'environment' });
        if (cancelled) {
          terminateCameraStream(result.stream);
          return;
        }
        streamRef.current = result.stream;
        setStatus('live');
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setStatus(/denied|permission/i.test(message) ? 'denied' : 'error');
      }
    };
    void start();
    return () => {
      cancelled = true;
      terminateCameraStream(streamRef.current);
      streamRef.current = null;
      setStatus('off');
    };
  }, [enabled, attempt]);

  const capture = useCallback((): FaceReading | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    const roi = calculateROIBounds(width, height, RETICLE_SHARE);
    const canvas = document.createElement('canvas');
    canvas.width = roi.size;
    canvas.height = roi.size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, roi.x, roi.y, roi.size, roi.size, 0, 0, roi.size, roi.size);
    return readFaceFromContext(ctx, roi.size, roi.size, palette);
  }, [palette]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { videoRef, status, error, retry, capture };
}
