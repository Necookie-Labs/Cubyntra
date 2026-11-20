/**
 * Cubyntra - Progress Blocks
 * Necookie Labs (c) 2026
 *
 * A row of N rounded pips: done pips are filled green on their edge, the current one is
 * outlined in blue, the rest are empty wells. Exposed as a progressbar so the count is
 * announced.
 */

import React from 'react';
import { cx } from './cx';

export type BlockState = 'filled' | 'current' | 'empty';

/**
 * State of each block. `done` blocks are filled; the block at `current` (default: the first
 * one not done) is marked current. Inputs are clamped so a bad count never throws.
 */
export function progressBlockStates(total: number, done: number, current?: number): BlockState[] {
  const n = Math.max(0, Math.floor(total));
  const filled = Math.min(n, Math.max(0, Math.floor(done)));
  const active = current ?? (filled < n ? filled : -1);
  return Array.from({ length: n }, (_, i) => (i < filled ? 'filled' : i === active ? 'current' : 'empty'));
}

export interface ProgressBlocksProps {
  total: number;
  done: number;
  /** Index of the block in progress; defaults to the first one not done. */
  current?: number;
  /** Accessible name, e.g. "Faces scanned". */
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

const STATE_CLASS: Record<BlockState, string> = {
  filled: 'border-success-edge bg-success',
  current: 'border-primary bg-primary-soft',
  empty: 'border-line-soft bg-well',
};

export const ProgressBlocks: React.FC<ProgressBlocksProps> = ({
  total,
  done,
  current,
  label,
  size = 'md',
  className,
}) => {
  const states = progressBlockStates(total, done, current);
  const filled = states.filter((s) => s === 'filled').length;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={states.length}
      aria-valuenow={filled}
      aria-valuetext={`${filled} of ${states.length}`}
      className={cx('flex items-center', size === 'sm' ? 'gap-1' : 'gap-1.5', className)}
    >
      {states.map((state, i) => (
        <span
          key={i}
          data-state={state}
          className={cx(
            'block rounded-full border-2',
            size === 'sm' ? 'h-2.5 w-4' : 'h-3.5 w-7',
            STATE_CLASS[state],
            state === 'filled' && 'vx-pop'
          )}
        />
      ))}
    </div>
  );
};
