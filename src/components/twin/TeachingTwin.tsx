'use client';

/**
 * Cubyntra - Teaching Twin
 * Necookie Labs (c) 2026
 *
 * The 3D twin playing one tutor step: held the way the student holds the cube, the step's pieces
 * lit and the rest faded, the target slot outlined, with playback controls, move chips that
 * follow the animation and an optional faded "after" preview. When the step has been played to
 * the end the twin shows the plan's expected state, held in `gripAfter`.
 */

import React, { useState } from 'react';
import type { StepPlan } from '@/tutor/types';
import { createSolvedCubeState } from '@/cube/constants';
import type { CubeEngine } from '@/three/engine';
import { CubeVisualizer } from '@/components/cube/CubeVisualizer';
import { BlockButton, cx } from '@/components/ui';
import { MoveChips } from './MoveChips';
import { PlaybackControls } from './PlaybackControls';
import { currentMoveIndex } from './usePlayback';
import { useTeachingTwin } from './useTeachingTwin';

export interface TeachingTwinProps {
  /** The step to show; null shows the twin without a step. */
  plan: StepPlan | null;
  /** Called each time the step's moves have been played to the end. */
  onStepPlayed?: (plan: StepPlan) => void;
  /** Whether the "after" preview starts shown. Default false. */
  showGhost?: boolean;
  /** Whether the current move starts spelled out in words. Default false. */
  plainLanguage?: boolean;
  /** Color-blind option: a letter on every sticker. Default false. */
  stickerLetters?: boolean;
  className?: string;
}

export const TeachingTwin: React.FC<TeachingTwinProps> = ({
  plan,
  onStepPlayed,
  showGhost = false,
  plainLanguage = false,
  stickerLetters = false,
  className,
}) => {
  const [engine, setEngine] = useState<CubeEngine | null>(null);
  // The twin is painted by playback from here on; the visualizer only needs a first state.
  const [initialState] = useState(() => plan?.startState ?? createSolvedCubeState());
  const { snapshot, ghost, setGhost } = useTeachingTwin(engine, plan, { onStepPlayed, showGhost });
  const playback = engine?.playback ?? null;
  const ready = Boolean(plan && snapshot && snapshot.total > 0);

  return (
    <section aria-label="Teaching twin" className={cx('flex flex-col gap-3', className)}>
      <CubeVisualizer
        state={initialState}
        onEngineChange={setEngine}
        stickerLetters={stickerLetters}
        className="min-h-[320px] flex-1"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <PlaybackControls
          playing={snapshot?.playing ?? false}
          index={snapshot?.index ?? 0}
          total={snapshot?.total ?? 0}
          speed={snapshot?.speed ?? 1}
          loop={snapshot?.loop ?? false}
          disabled={!ready}
          onPlay={() => void playback?.play()}
          onPause={() => playback?.pause()}
          onStepBack={() => void playback?.stepBack()}
          onStepForward={() => void playback?.stepForward()}
          onSpeedChange={(speed) => playback?.setSpeed(speed)}
          onLoopChange={(loop) => playback?.setLoop(loop)}
        />
        <BlockButton size="sm" variant="ghost" aria-pressed={ghost} disabled={!plan} onClick={() => setGhost(!ghost)}>
          After
        </BlockButton>
      </div>

      {plan && snapshot && ready && (
        <MoveChips
          // A new step or a new default starts the words toggle afresh.
          key={`${plan.method}-${plan.stepIndex}-${plan.caseId}-${plainLanguage}`}
          moves={snapshot.moves}
          current={currentMoveIndex(snapshot)}
          onSelect={(i) => void playback?.seek(i)}
          defaultPlainLanguage={plainLanguage}
        />
      )}
    </section>
  );
};
