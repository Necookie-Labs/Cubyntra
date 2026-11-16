'use client';

/**
 * Cubyntra - React binding for the twin's playback controller
 * Necookie Labs (c) 2026
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { PlaybackController, PlaybackSnapshot } from '@/three/playback';

/** The controller's current snapshot, re-rendering on every change. Null without a controller. */
export function usePlayback(controller: PlaybackController | null): PlaybackSnapshot | null {
  const subscribe = useCallback(
    (onChange: () => void) => (controller ? controller.subscribe(onChange) : () => {}),
    [controller]
  );
  return useSyncExternalStore(
    subscribe,
    () => controller?.getSnapshot() ?? null,
    () => null
  );
}

/** The chip in focus: the move animating, or the next one to play. */
export function currentMoveIndex(snapshot: PlaybackSnapshot): number {
  return snapshot.activeIndex ?? snapshot.index;
}
