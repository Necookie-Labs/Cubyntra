'use client';

/**
 * Cubyntra - React binding for the teaching twin
 * Necookie Labs (c) 2026
 *
 * Shows a tutor step plan on a twin engine (see src/twin/teaching.ts) and re-renders with its
 * playback. A new plan replaces the old one cleanly: the turn in flight lands, queued turns are
 * dropped and the new start state is shown before the aids are drawn.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StepPlan } from '@/tutor/types';
import type { PlaybackSnapshot } from '@/three/playback';
import { TeachingTwinController, type TeachingSurface } from '@/twin/teaching';
import { usePlayback } from './usePlayback';

export interface UseTeachingTwinOptions {
  /** Called each time the step's moves have been played to the end. */
  onStepPlayed?: (plan: StepPlan) => void;
  /** Whether the "after" preview starts shown. Default false. */
  showGhost?: boolean;
}

export interface TeachingTwinHandle {
  /** Playback of the step's moves (setup then algorithm), or null before the engine mounts. */
  snapshot: PlaybackSnapshot | null;
  /** Whether the "after" preview is shown. */
  ghost: boolean;
  setGhost: (visible: boolean) => void;
}

export function useTeachingTwin(
  engine: TeachingSurface | null,
  plan: StepPlan | null,
  { onStepPlayed, showGhost = false }: UseTeachingTwinOptions = {}
): TeachingTwinHandle {
  const controllerRef = useRef<TeachingTwinController | null>(null);
  const onStepPlayedRef = useRef(onStepPlayed);
  const [ghost, setGhostVisible] = useState(showGhost);
  const ghostRef = useRef(ghost);

  useEffect(() => {
    onStepPlayedRef.current = onStepPlayed;
  });

  // One controller per engine. It only drives the engine; the engine's owner disposes it.
  useEffect(() => {
    if (!engine) return;
    const controller = new TeachingTwinController(engine, {
      onStepPlayed: (p) => onStepPlayedRef.current?.(p),
      showGhost: ghostRef.current,
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [engine]);

  useEffect(() => {
    void controllerRef.current?.show(plan);
  }, [engine, plan]);

  const setGhost = useCallback((visible: boolean) => {
    ghostRef.current = visible;
    setGhostVisible(visible);
    controllerRef.current?.setGhostVisible(visible);
  }, []);

  return { snapshot: usePlayback(engine?.playback ?? null), ghost, setGhost };
}
