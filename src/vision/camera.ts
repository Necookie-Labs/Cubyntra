/**
 * Cubyntra - WebRTC Camera Lifecycle & Device Stream Manager
 * Necookie Labs (c) 2026
 *
 * Ensures strictly local, client-side video processing with robust cleanup.
 */

export interface CameraOptions {
  facingMode?: 'user' | 'environment';
  idealWidth?: number;
  idealHeight?: number;
}

export interface CameraResult {
  stream: MediaStream;
  hasTorch: boolean;
  actualFacingMode?: string;
}

/**
 * Requests camera permission and attaches the media stream to a video element.
 */
export async function initializeCameraStream(
  videoElement: HTMLVideoElement,
  options: CameraOptions = {}
): Promise<CameraResult> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera access is not supported by your current browser.');
  }

  const { facingMode = 'environment', idealWidth = 1280, idealHeight = 720 } = options;

  let stream: MediaStream;

  try {
    // Attempt with ideal constraints (prefers rear environment camera on mobile)
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: idealWidth },
        height: { ideal: idealHeight },
      },
      audio: false,
    });
  } catch {
    // Fallback: request unconstrained video if initial constraints failed
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    } catch (fallbackErr) {
      throw formatCameraError(fallbackErr);
    }
  }

  videoElement.srcObject = stream;
  videoElement.setAttribute('playsinline', 'true'); // Required for iOS Safari
  videoElement.muted = true;

  await new Promise<void>((resolve) => {
    if (videoElement.readyState >= 2) {
      resolve();
    } else {
      videoElement.onloadedmetadata = () => {
        resolve();
      };
    }
  });

  await videoElement.play().catch(() => {
    // Auto-play was prevented; video will start on user interaction
  });

  const track = stream.getVideoTracks()[0];
  const capabilities = track.getCapabilities ? track.getCapabilities() : {};
  const hasTorch = Boolean((capabilities as Record<string, unknown>).torch);

  return {
    stream,
    hasTorch,
    actualFacingMode: track.getSettings().facingMode,
  };
}

/**
 * Completely releases all camera hardware resources and tracks.
 */
export function terminateCameraStream(stream: MediaStream | null): void {
  if (!stream) return;

  try {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
  } catch {
    // Clean ignore
  }
}

/**
 * Maps native DOMExceptions to helpful user-facing explanations.
 */
export function formatCameraError(error: unknown): Error {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return new Error(
          'Camera permission was denied. Please allow camera access in your browser address bar to scan the cube.'
        );
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return new Error(
          'No camera device was detected on your system. You can still use Mock Scan Mode to explore solutions.'
        );
      case 'NotReadableError':
      case 'TrackStartError':
        return new Error(
          'The camera is currently being used by another application or tab.'
        );
      case 'OverconstrainedError':
        return new Error(
          'Requested camera resolution or constraints are not supported by your camera hardware.'
        );
      default:
        return new Error(`Camera initialization error: ${error.message}`);
    }
  }

  return error instanceof Error ? error : new Error(String(error));
}
