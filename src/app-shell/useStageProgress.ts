'use client';

/**
 * Cubyntra - Stage progress of a saved cube
 * Necookie Labs (c) 2026
 *
 * Asks the tutor engine (off the main thread) how far through its method a cube is, for the
 * home screen's "continue" card.
 */

import { useEffect, useState } from 'react';
import type { CubeState } from '@/cube/types';
import type { MethodId, TutorProgress } from '@/tutor/types';
import { tutorProgressInWorker } from '@/solver/client';

export function useStageProgress(state: CubeState | null, method: MethodId | null): TutorProgress | null {
  const [result, setResult] = useState<{ key: unknown; progress: TutorProgress } | null>(null);

  useEffect(() => {
    if (!state || !method) return;
    let live = true;
    tutorProgressInWorker(state, method)
      .then((progress) => {
        if (live) setResult({ key: state, progress });
      })
      .catch(() => {
        // Without progress the card just leaves out the stage bar.
      });
    return () => {
      live = false;
    };
  }, [state, method]);

  return result && result.key === state ? result.progress : null;
}
