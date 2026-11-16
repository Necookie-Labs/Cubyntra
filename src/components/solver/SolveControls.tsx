'use client';

/**
 * Cubyntra - Solution Playback & Move Execution Controls
 * Necookie Labs (c) 2026
 */

import React, { useCallback, useEffect } from 'react';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { CubeMove, CubeState } from '@/cube/types';
import { invertMove } from '@/cube/transforms';
import confetti from 'canvas-confetti';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  CheckCircle,
  Zap,
} from 'lucide-react';
import { BlockButton, Chip, IconButton, Panel } from '@/components/ui';

const STICKERS = ['green', 'yellow', 'blue', 'red', 'orange', 'white'] as const;

export interface SolveControlsProps {
  /** Animates one layer turn to targetState; resolves when the turn has finished. */
  onAnimateMove?: (move: CubeMove, targetState: CubeState, durationMs: number) => Promise<void>;
  /** Return to the start screen to scan another cube. */
  onNewScan: () => void;
}

// At 1x a turn takes 300 ms followed by a 250 ms rest, the same 550 ms cadence as before.
const BASE_TURN_MS = 300;
const BASE_REST_MS = 250;

function turnDurationMs(speed: number): number {
  return Math.min(600, Math.max(90, BASE_TURN_MS / speed));
}

export const SolveControls: React.FC<SolveControlsProps> = ({ onAnimateMove, onNewScan }) => {
  const {
    solution,
    currentMoveIndex,
    isPlaying,
    playbackSpeed,
    appState,
    stepNext,
    stepPrevious,
    togglePlay,
    setPlaybackSpeed,
    resetToScramble,
  } = useCubyntraStore();

  // The store is advanced first and the turn is queued in the same tick, before React
  // re-renders, so the visualizer sees a busy engine and defers repainting.
  const goNext = useCallback(async (): Promise<boolean> => {
    const move = stepNext();
    if (!move) return false;
    const { cubeState, playbackSpeed: speed } = useCubyntraStore.getState();
    await onAnimateMove?.(move, cubeState, turnDurationMs(speed));
    return true;
  }, [stepNext, onAnimateMove]);

  const goPrevious = useCallback(async (): Promise<void> => {
    const { solution: sol, currentMoveIndex: index } = useCubyntraStore.getState();
    if (!sol || index < 0) return;
    const undone = sol.moves[index];
    stepPrevious();
    const { cubeState, playbackSpeed: speed } = useCubyntraStore.getState();
    await onAnimateMove?.(invertMove(undone), cubeState, turnDurationMs(speed));
  }, [stepPrevious, onAnimateMove]);

  const moves = solution?.moves || [];
  const currentMove = currentMoveIndex >= 0 && currentMoveIndex < moves.length ? moves[currentMoveIndex] : null;
  const isSolved = appState === 'solved' || (moves.length > 0 && currentMoveIndex === moves.length - 1);

  // Auto-play: each turn is awaited before the next begins, so no move can be skipped
  // or overlap regardless of speed. Speed is re-read every step so changes apply live.
  useEffect(() => {
    if (!isPlaying) return;
    let cancelled = false;

    (async () => {
      while (!cancelled) {
        const advanced = await goNext();
        if (!advanced || cancelled) break;
        const rest = BASE_REST_MS / useCubyntraStore.getState().playbackSpeed;
        await new Promise((resolve) => setTimeout(resolve, rest));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPlaying, goNext]);

  // Trigger celebration confetti when solved
  useEffect(() => {
    if (isSolved && moves.length > 0) {
      try {
        // Confetti draws on a canvas, so read the sticker tokens' computed values.
        const css = getComputedStyle(document.documentElement);
        const colors = STICKERS.map((c) => css.getPropertyValue(`--vx-sticker-${c}`).trim()).filter(Boolean);
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          shapes: ['square'],
          colors,
        });
      } catch {
        // Safe ignore
      }
    }
  }, [isSolved, moves.length]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (!useCubyntraStore.getState().isPlaying) void goNext();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        void goPrevious();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        resetToScramble();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, goNext, goPrevious, resetToScramble]);

  if (!solution) return null;

  return (
    <Panel as="section" aria-label="Solution" className="vx-place flex flex-col gap-4 w-full">
      {/* Top Banner: Metrics & Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-line-soft pb-3">
        {isSolved ? (
          <Chip tone="solid" icon={<CheckCircle className="w-3.5 h-3.5" aria-hidden />}>
            Cube Solved
          </Chip>
        ) : (
          <Chip tone="leaf" icon={<Zap className="w-3.5 h-3.5" aria-hidden />}>
            Solution Ready
          </Chip>
        )}

        <div className="text-xs font-mono text-muted flex items-center gap-2">
          <span>{solution.moveCount} moves (HTM)</span>
          <span aria-hidden>·</span>
          <span>{solution.durationMs}ms</span>
        </div>
      </div>

      {/* Horizontal Algorithm Move Ticker */}
      <ol aria-label="Moves" className="w-full overflow-x-auto pt-1 pb-2 flex items-center gap-1">
        {moves.map((move: CubeMove, index: number) => {
          const isActive = index === currentMoveIndex;
          const isPast = index < currentMoveIndex;

          return (
            <li
              key={index}
              aria-current={isActive ? 'step' : undefined}
              className={`shrink-0 min-w-8 h-8 px-2 flex items-center justify-center border-2 text-sm font-mono font-bold ${
                isActive
                  ? 'vx-pop bg-leaf text-on-leaf border-line shadow-block-sm'
                  : isPast
                  ? 'bg-well text-muted border-line-soft'
                  : 'bg-panel text-ink border-line-soft'
              }`}
            >
              {move.notation}
            </li>
          );
        })}
      </ol>

      {/* Current Move Detail Spotlight */}
      <div className="vx-well p-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-bold text-muted uppercase tracking-wider">
            {currentMove ? `Move ${currentMoveIndex + 1} of ${moves.length}` : isSolved ? 'Complete' : 'Initial Position'}
          </div>
          <div className="text-base font-bold text-ink mt-1">
            {currentMove ? currentMove.description : isSolved ? 'All faces synchronized and solved!' : 'Ready to start solving.'}
          </div>
        </div>

        {currentMove && (
          <div
            key={currentMoveIndex}
            className="vx-pop shrink-0 min-w-14 h-14 px-3 flex items-center justify-center bg-panel border-2 border-line shadow-block-sm text-3xl font-black font-mono text-ink"
          >
            {currentMove.notation}
          </div>
        )}
      </div>

      {/* Primary Playback Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Step & Play Buttons */}
        <div className="flex items-center gap-2">
          <IconButton onClick={resetToScramble} label="Reset to Scramble" title="Reset to Scramble (R)">
            <RotateCcw className="w-4 h-4" />
          </IconButton>

          <IconButton
            onClick={() => void goPrevious()}
            disabled={currentMoveIndex < 0}
            label="Previous Move"
            title="Previous Move (Left Arrow)"
          >
            <SkipBack className="w-4 h-4" />
          </IconButton>

          <BlockButton
            variant="primary"
            onClick={togglePlay}
            disabled={isSolved && currentMoveIndex >= moves.length - 1}
            title="Play / Pause (Space)"
            className="min-w-24"
            icon={isPlaying ? <Pause className="w-4 h-4" aria-hidden /> : <Play className="w-4 h-4 fill-current" aria-hidden />}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </BlockButton>

          <IconButton
            onClick={() => void goNext()}
            disabled={isPlaying || currentMoveIndex >= moves.length - 1}
            label="Next Move"
            title="Next Move (Right Arrow)"
          >
            <SkipForward className="w-4 h-4" />
          </IconButton>
        </div>

        {/* Speed Controls & Rescan */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Playback speed selector */}
          <div role="group" aria-label="Playback speed" className="flex items-center gap-1 vx-well p-1">
            {[0.5, 1, 2, 4].map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => setPlaybackSpeed(speed)}
                aria-pressed={playbackSpeed === speed}
                className={`h-6 min-w-10 px-2 text-xs font-mono font-bold border-2 ${
                  playbackSpeed === speed
                    ? 'bg-leaf text-on-leaf border-line'
                    : 'bg-transparent text-muted border-transparent hover:text-ink hover:border-line-soft'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>

          <BlockButton size="sm" variant="ghost" onClick={onNewScan}>
            Scan another cube
          </BlockButton>
        </div>
      </div>
    </Panel>
  );
};
