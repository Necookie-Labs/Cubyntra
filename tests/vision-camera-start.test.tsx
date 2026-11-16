// @vitest-environment jsdom
/**
 * Cubyntra - Starting the camera never hangs (fake media)
 * Necookie Labs (c) 2026
 *
 * `initializeCameraStream` times out on a stream or a first frame that never comes and stops
 * the tracks; the checkpoint sheet's camera starts once its video element mounts, however late,
 * and always stops the tracks when it closes.
 */

import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  CAMERA_TIMEOUT_MESSAGE,
  METADATA_TIMEOUT_MS,
  STREAM_TIMEOUT_MS,
  initializeCameraStream,
} from '@/vision/camera';
import { useCheckpointCamera } from '@/components/solve/useCheckpointCamera';

class FakeTrack {
  stopped = false;
  stop() {
    this.stopped = true;
  }
  getCapabilities() {
    return {};
  }
  getSettings() {
    return { facingMode: 'environment' };
  }
}

function fakeStream() {
  const track = new FakeTrack();
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}

/** Just enough of a video element: a frame size arrives only when `loaded()` is called. */
function fakeVideo() {
  const target = new EventTarget();
  const video = Object.assign(target, {
    readyState: 0,
    srcObject: null as MediaStream | null,
    muted: false,
    setAttribute: vi.fn(),
    play: vi.fn(async () => {}),
    loaded() {
      video.readyState = 1;
      target.dispatchEvent(new Event('loadedmetadata'));
    },
  });
  return video;
}

let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  getUserMedia = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('initializeCameraStream', () => {
  it('starts once the first frame size is known', async () => {
    const { stream } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    const video = fakeVideo();
    const started = initializeCameraStream(video as unknown as HTMLVideoElement);
    await vi.waitFor(() => expect(video.srcObject).toBe(stream));
    video.loaded();
    await expect(started).resolves.toMatchObject({ stream, hasTorch: false });
  });

  it('gives up when the first frame never comes, and stops the camera', async () => {
    vi.useFakeTimers();
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    const video = fakeVideo();
    const started = initializeCameraStream(video as unknown as HTMLVideoElement);
    const outcome = expect(started).rejects.toThrow(CAMERA_TIMEOUT_MESSAGE);
    await vi.advanceTimersByTimeAsync(METADATA_TIMEOUT_MS + 1);
    await outcome;
    expect(track.stopped).toBe(true);
    expect(video.srcObject).toBeNull();
  });

  it('gives up when no stream comes, and stops one that arrives late', async () => {
    vi.useFakeTimers();
    const { stream, track } = fakeStream();
    let deliver: (s: MediaStream) => void = () => {};
    getUserMedia.mockReturnValue(new Promise<MediaStream>((resolve) => (deliver = resolve)));
    const started = initializeCameraStream(fakeVideo() as unknown as HTMLVideoElement);
    const outcome = expect(started).rejects.toThrow(CAMERA_TIMEOUT_MESSAGE);
    await vi.advanceTimersByTimeAsync(STREAM_TIMEOUT_MS + 1);
    await outcome;
    deliver(stream);
    await vi.advanceTimersByTimeAsync(0);
    expect(track.stopped).toBe(true);
  });
});

/** A sheet whose video element mounts some time after the camera is switched on. */
function LateVideoSheet({ enabled }: { enabled: boolean }) {
  const [mounted, setMounted] = useState(false);
  const { videoRef, status, error, retry } = useCheckpointCamera(enabled, null);
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="error">{error}</p>
      <button onClick={() => setMounted(true)}>mount</button>
      <button onClick={retry}>retry</button>
      {mounted && <video data-testid="video" ref={videoRef} />}
    </div>
  );
}

describe('useCheckpointCamera', () => {
  it('starts the camera when the video mounts late, and stops it on close', async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    const { rerender } = render(<LateVideoSheet enabled />);
    // Several frames pass before the element appears.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('mount'));
    const video = screen.getByTestId('video') as HTMLVideoElement;
    Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
    Object.defineProperty(video, 'play', { value: async () => {}, configurable: true });
    await vi.waitFor(() => expect(screen.getByTestId('status').textContent).toBe('live'));
    rerender(<LateVideoSheet enabled={false} />);
    expect(track.stopped).toBe(true);
    expect(screen.getByTestId('status').textContent).toBe('off');
  });

  it('shows an error after a camera that never starts, and tries again', async () => {
    vi.useFakeTimers();
    getUserMedia.mockReturnValue(new Promise<MediaStream>(() => {}));
    render(<LateVideoSheet enabled />);
    fireEvent.click(screen.getByText('mount'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STREAM_TIMEOUT_MS + 1);
    });
    expect(screen.getByTestId('status').textContent).toBe('error');
    expect(screen.getByTestId('error').textContent).toBe(CAMERA_TIMEOUT_MESSAGE);
    fireEvent.click(screen.getByText('retry'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('status').textContent).toBe('starting');
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('stops the tracks when the sheet unmounts while the camera is still starting', async () => {
    const { stream, track } = fakeStream();
    let deliver: (s: MediaStream) => void = () => {};
    getUserMedia.mockReturnValue(new Promise<MediaStream>((resolve) => (deliver = resolve)));
    const { unmount } = render(<LateVideoSheet enabled />);
    fireEvent.click(screen.getByText('mount'));
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    unmount();
    await act(async () => {
      deliver(stream);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(track.stopped).toBe(true);
  });
});
