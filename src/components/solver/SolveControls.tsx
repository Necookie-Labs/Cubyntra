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

export interface SolveControlsProps {
  /** Animates one layer turn to targetState; resolves when the turn has finished. */
  onAnimateMove?: (move: CubeMove, targetState: CubeState, durationMs: number) => Promise<void>;
}

// At 1x a turn takes 300 ms followed by a 250 ms rest, the same 550 ms cadence as before.
const BASE_TURN_MS = 300;
const BASE_REST_MS = 250;

function turnDurationMs(speed: number): number {
  return Math.min(600, Math.max(90, BASE_TURN_MS / speed));
}

export const SolveControls: React.FC<SolveControlsProps> = ({ onAnimateMove }) => {
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
    startScanning,
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
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#009B48', '#FFD700', '#0046AD', '#B71234', '#FF5800', '#FFFFFF'],
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
    <div className="flex flex-col gap-3 w-full bg-[#0d0f12]/95 backdrop-blur-md border border-neutral-800 p-4 rounded-xl shadow-2xl">
      {/* Top Banner: Metrics & Status */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-2">
          {isSolved ? (
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs uppercase tracking-wider font-mono">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>Cube Solved</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-sky-400 font-bold text-xs uppercase tracking-wider font-mono">
              <Zap className="w-4 h-4 text-sky-400" />
              <span>Solution Ready</span>
            </div>
          )}
        </div>

        <div className="text-xs font-mono text-neutral-400 flex items-center gap-3">
          <span>{solution.moveCount} moves (HTM)</span>
          <span>•</span>
          <span>{solution.durationMs}ms</span>
        </div>
      </div>

      {/* Horizontal Algorithm Move Ticker */}
      <div className="w-full overflow-x-auto py-1 scrollbar-thin flex items-center gap-1.5">
        {moves.map((move: CubeMove, index: number) => {
          const isActive = index === currentMoveIndex;
          const isPast = index < currentMoveIndex;

          return (
            <div
              key={index}
              className={`shrink-0 px-2.5 py-1 rounded text-xs font-mono font-bold transition-all ${
                isActive
                  ? 'bg-sky-500 text-neutral-950 scale-105 shadow-md shadow-sky-500/20'
                  : isPast
                  ? 'bg-neutral-800 text-neutral-400'
                  : 'bg-neutral-900/60 text-neutral-400 border border-neutral-800'
              }`}
            >
              {move.notation}
            </div>
          );
        })}
      </div>

      {/* Current Move Detail Spotlight */}
      <div className="bg-neutral-900/70 border border-neutral-800/80 rounded-lg p-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
            {currentMove ? `Move ${currentMoveIndex + 1} of ${moves.length}` : isSolved ? 'Complete' : 'Initial Position'}
          </div>
          <div className="text-sm font-semibold text-white mt-0.5">
            {currentMove ? currentMove.description : isSolved ? 'All faces synchronized and solved!' : 'Ready to start solving.'}
          </div>
        </div>

        {currentMove && (
          <div className="text-2xl font-black font-mono text-sky-400 bg-sky-950/50 border border-sky-800/60 px-3 py-1 rounded-lg shadow-inner">
            {currentMove.notation}
          </div>
        )}
      </div>

      {/* Primary Playback Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Step & Play Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={resetToScramble}
            className="p-2 rounded-lg bg-neutral-850 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition-colors"
            title="Reset to Scramble (R)"
            aria-label="Reset to Scramble"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => void goPrevious()}
            disabled={currentMoveIndex < 0}
            className="p-2 rounded-lg bg-neutral-850 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 disabled:opacity-40 transition-colors"
            title="Previous Move (Left Arrow)"
            aria-label="Previous Move"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            disabled={isSolved && currentMoveIndex >= moves.length - 1}
            className="px-4 py-2 rounded-lg bg-white text-neutral-950 font-bold text-xs hover:bg-neutral-200 transition-colors flex items-center gap-1.5 shadow-md disabled:opacity-40"
            title="Play / Pause (Space)"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <button
            type="button"
            onClick={() => void goNext()}
            disabled={isPlaying || currentMoveIndex >= moves.length - 1}
            className="p-2 rounded-lg bg-neutral-850 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 disabled:opacity-40 transition-colors"
            title="Next Move (Right Arrow)"
            aria-label="Next Move"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Speed Controls & Rescan */}
        <div className="flex items-center gap-2">
          {/* Playback speed selector */}
          <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-0.5">
            {[0.5, 1, 2, 4].map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => setPlaybackSpeed(speed)}
                className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                  playbackSpeed === speed
                    ? 'bg-neutral-700 text-white font-bold'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={startScanning}
            className="text-xs font-mono text-neutral-400 hover:text-white px-2.5 py-1.5 rounded-lg border border-neutral-800 hover:bg-neutral-800 transition-colors"
          >
            New Scan
          </button>
        </div>
      </div>
    </div>
  );
};
