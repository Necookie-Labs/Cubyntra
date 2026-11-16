'use client';

/**
 * Cubyntra - Playback Controls
 * Necookie Labs (c) 2026
 *
 * Play / pause, step back and forward, half speed and loop for an algorithm on the twin.
 * Controlled: pass a snapshot from `usePlayback` (or any matching state) and the handlers.
 */

import React from 'react';
import { Pause, Play, Repeat, StepBack, StepForward } from 'lucide-react';
import type { PlaybackSpeed } from '@/three/playback';
import { BlockButton, IconButton, cx } from '@/components/ui';

export interface PlaybackControlsProps {
  playing: boolean;
  /** Moves applied so far (0 = start). */
  index: number;
  total: number;
  speed: PlaybackSpeed;
  loop: boolean;
  disabled?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSpeedChange: (speed: PlaybackSpeed) => void;
  onLoopChange: (loop: boolean) => void;
  className?: string;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  playing,
  index,
  total,
  speed,
  loop,
  disabled = false,
  onPlay,
  onPause,
  onStepBack,
  onStepForward,
  onSpeedChange,
  onLoopChange,
  className,
}) => {
  const empty = total === 0;
  return (
    <div role="group" aria-label="Playback" className={cx('flex flex-wrap items-center gap-2', className)}>
      <IconButton label="Step back" onClick={onStepBack} disabled={disabled || index <= 0}>
        <StepBack className="h-5 w-5" />
      </IconButton>
      <IconButton
        label={playing ? 'Pause' : 'Play'}
        variant="primary"
        size="lg"
        onClick={playing ? onPause : onPlay}
        disabled={disabled || empty}
      >
        {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
      </IconButton>
      <IconButton label="Step forward" onClick={onStepForward} disabled={disabled || index >= total}>
        <StepForward className="h-5 w-5" />
      </IconButton>
      <BlockButton
        size="sm"
        aria-pressed={speed === 0.5}
        aria-label="Half speed"
        onClick={() => onSpeedChange(speed === 0.5 ? 1 : 0.5)}
        disabled={disabled}
        className="font-mono"
      >
        0.5×
      </BlockButton>
      <IconButton label="Loop" size="sm" aria-pressed={loop} onClick={() => onLoopChange(!loop)} disabled={disabled}>
        <Repeat className="h-4 w-4" />
      </IconButton>
    </div>
  );
};
