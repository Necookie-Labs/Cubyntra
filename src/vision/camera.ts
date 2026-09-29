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
  // Browsers only expose the camera on secure pages: https://, or localhost on the same device.
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new Error(
      'The camera only works on a secure page. Open this page with an https:// address (scan the QR code again).'
    );
  }
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
 * Toggles the hardware camera torch/flashlight if supported.
 */
export async function toggleCameraTorch(
  stream: MediaStream | null,
  enabled: boolean
): Promise<boolean> {
  if (!stream) return false;
  const track = stream.getVideoTracks()[0];
  if (!track) return false;

  try {
    const capabilities = (track.getCapabilities ? track.getCapabilities() : {}) as Record<string, unknown>;
    if (capabilities.torch) {
      await track.applyConstraints({
        advanced: [{ torch: enabled } as MediaTrackConstraintSet],
      });
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Freezes white balance at its current setting where the device allows it (most Android
 * Chrome builds; iOS Safari ignores it). All six faces are then shot at one color
 * temperature, so the same plastic reads as the same color on every face instead of
 * drifting as auto white balance reacts to whichever colors fill the frame.
 */
export async function lockWhiteBalance(stream: MediaStream | null): Promise<boolean> {
  const track = stream?.getVideoTracks()[0];
  if (!track?.getCapabilities) return false;

  const modes = (track.getCapabilities() as { whiteBalanceMode?: string[] }).whiteBalanceMode;
  if (!modes?.includes('manual')) return false;

  try {
    await track.applyConstraints({ advanced: [{ whiteBalanceMode: 'manual' } as MediaTrackConstraintSet] });
    return true;
  } catch {
    return false;
  }
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
