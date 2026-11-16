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
  /** Callback ref for the sheet's video element: the camera starts once it is mounted. */
  videoRef: (element: HTMLVideoElement | null) => void;
  status: CameraStatus;
  error: string | null;
  retry: () => void;
  /** Reads the face in the reticle now, or null when no frame is available. */
  capture: () => FaceReading | null;
}

export function useCheckpointCamera(enabled: boolean, palette: StudentPalette | null): CheckpointCamera {
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  // The element itself is state, so the camera starts when the sheet's video mounts (however
  // late) and restarts if it is replaced.
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const videoRef = useCallback((element: HTMLVideoElement | null) => {
    videoElRef.current = element;
    setVideo(element);
  }, []);
  const [status, setStatus] = useState<CameraStatus>('off');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !video) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    const closing = new AbortController();
    const start = async () => {
      setStatus('starting');
      setError(null);
      try {
        // Times out (and stops any stream) rather than waiting forever.
        const result = await initializeCameraStream(video, { facingMode: 'environment', signal: closing.signal });
        if (cancelled) {
          terminateCameraStream(result.stream);
          return;
        }
        stream = result.stream;
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
      closing.abort();
      terminateCameraStream(stream);
      stream = null;
      if (video.srcObject) video.srcObject = null;
      setStatus('off');
    };
  }, [enabled, video, attempt]);

  const capture = useCallback((): FaceReading | null => {
    const video = videoElRef.current;
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
