/**
 * Cubyntra - "Block placed" moment
 * Necookie Labs (c) 2026
 *
 * After a passed checkpoint a green block drops onto the row of blocks already earned, with
 * the stepped place animation (cut under reduced motion). Flat, short and quiet.
 */

import React from 'react';
import { cx } from '@/components/ui';

export interface BlockPlacedProps {
  /** Blocks already in the row before this one. */
  earned: number;
  title: string;
  detail?: string;
}

const MAX_SHOWN = 7;

export function BlockPlaced({ earned, title, detail }: BlockPlacedProps) {
  const before = Math.min(earned, MAX_SHOWN - 1);
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <div aria-hidden className="flex h-16 items-end gap-1">
        {Array.from({ length: before }, (_, i) => (
          <span key={i} className="h-8 w-8 rounded-md bg-success shadow-[inset_0_-4px_0_0_var(--vx-success-edge)]" />
        ))}
        <span
          data-testid="placed-block"
          className={cx(
            'vx-place h-8 w-8 rounded-md bg-success shadow-[inset_0_-4px_0_0_var(--vx-success-edge)]'
          )}
          style={{ animationDuration: '320ms' }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-display text-2xl font-extrabold leading-tight text-ink">{title}</p>
        {detail && <p className="text-sm text-muted">{detail}</p>}
      </div>
    </div>
  );
}
