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
  /** How long to wait for the camera (and the browser's permission prompt) to give a stream. */
  streamTimeoutMs?: number;
  /** How long to wait for the first frame's size once the stream is attached. */
  metadataTimeoutMs?: number;
  /** Aborting (the screen closed) stops the camera at once, even while it is starting. */
  signal?: AbortSignal;
}

/** Long enough to read and answer the browser's permission prompt. */
export const STREAM_TIMEOUT_MS = 30_000;
/** A working camera reports its frame size within a second or two. */
export const METADATA_TIMEOUT_MS = 10_000;

export const CAMERA_TIMEOUT_MESSAGE =
  'The camera did not start in time. Close other apps or tabs that use the camera, then try again.';

const abortError = () => new DOMException('The camera was closed while it was starting.', 'AbortError');

/**
 * Rejects with the timeout message if `promise` has not settled after `ms`, or with an
 * AbortError once `signal` aborts. A value that arrives after either goes to `onLate`.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, signal?: AbortSignal, onLate?: (value: T) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const finish = () => {
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      if (done) return;
      finish();
      reject(abortError());
    };
    const timer = setTimeout(() => {
      if (done) return;
      finish();
      reject(new Error(CAMERA_TIMEOUT_MESSAGE));
    }, ms);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort);
    promise.then(
      (value) => {
        if (done) onLate?.(value);
        else {
          finish();
          resolve(value);
        }
      },
      (error) => {
        if (done) return;
        finish();
        reject(error);
      }
    );
  });
}

/** Resolves once the video knows its frame size (HAVE_METADATA). */
function metadataReady(video: HTMLVideoElement): Promise<void> {
  return new Promise<void>((resolve) => {
    if (video.readyState >= 1) {
      resolve();
      return;
    }
    const ready = () => {
      video.removeEventListener('loadedmetadata', ready);
      video.removeEventListener('loadeddata', ready);
      resolve();
    };
    video.addEventListener('loadedmetadata', ready);
    video.addEventListener('loadeddata', ready);
  });
}

export interface CameraResult {
  stream: MediaStream;
  hasTorch: boolean;
  actualFacingMode?: string;
}

/**
 * Requests camera permission and attaches the media stream to a video element. Never hangs:
 * no stream within `streamTimeoutMs`, or no frame size within `metadataTimeoutMs`, rejects with
 * `CAMERA_TIMEOUT_MESSAGE`, and any stream obtained is stopped (also one that arrives late).
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

  const {
    facingMode = 'environment',
    idealWidth = 1280,
    idealHeight = 720,
    streamTimeoutMs = STREAM_TIMEOUT_MS,
    metadataTimeoutMs = METADATA_TIMEOUT_MS,
    signal,
  } = options;
  const mediaDevices = navigator.mediaDevices;

  const request = async (): Promise<MediaStream> => {
    try {
      // Attempt with ideal constraints (prefers rear environment camera on mobile)
      return await mediaDevices.getUserMedia({
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
        return await mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (fallbackErr) {
        throw formatCameraError(fallbackErr);
      }
    }
  };

  // A stream that arrives after the timeout is stopped at once, so the camera light goes off.
  const stream = await withTimeout(request(), streamTimeoutMs, signal, terminateCameraStream);

  videoElement.srcObject = stream;
  videoElement.setAttribute('playsinline', 'true'); // Required for iOS Safari
  videoElement.muted = true;

  try {
    await withTimeout(metadataReady(videoElement), metadataTimeoutMs, signal);
  } catch (error) {
    terminateCameraStream(stream);
    videoElement.srcObject = null;
    throw error;
  }

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
          'The camera is blocked for this page. Allow it from the icon in the address bar, then press Try again.'
        );
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return new Error(
          'No camera was found on this device. Plug one in and press Try again, or practise with a demo cube.'
        );
      case 'NotReadableError':
      case 'TrackStartError':
        return new Error(
          'Another app or tab is using the camera. Close it, then press Try again.'
        );
      case 'OverconstrainedError':
        return new Error(
          'This camera cannot give the picture Cubyntra needs. Try another camera.'
        );
      default:
        return new Error(`The camera did not start (${error.message}). Press Try again.`);
    }
  }

  return error instanceof Error ? error : new Error(String(error));
}
