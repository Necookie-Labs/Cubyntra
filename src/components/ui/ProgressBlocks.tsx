/**
 * Cubyntra - Progress Blocks
 * Necookie Labs (c) 2026
 *
 * A row of N square blocks: done blocks are filled leaf, the current one is outlined and
 * tinted, the rest are empty wells. Exposed as a progressbar so the count is announced.
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
  filled: 'bg-leaf border-line shadow-[inset_0_-3px_0_0_var(--vx-leaf-edge)]',
  current: 'bg-leaf-soft border-line',
  empty: 'bg-well border-line-soft',
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
      className={cx('flex items-center', size === 'sm' ? 'gap-1' : 'gap-2', className)}
    >
      {states.map((state, i) => (
        <span
          key={i}
          data-state={state}
          className={cx(
            'block border-2',
            size === 'sm' ? 'h-3 w-3' : 'h-4 w-4',
            STATE_CLASS[state],
            state === 'filled' && 'vx-pop'
          )}
        />
      ))}
    </div>
  );
};
