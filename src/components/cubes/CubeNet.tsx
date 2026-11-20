/**
 * Cubyntra - Cube net preview
 * Necookie Labs (c) 2026
 *
 * A saved cube as a small flat unfolded net (top above front, then left, front, right and back
 * in a row, bottom under front), laid out like the scan review's net. With `letters` every
 * sticker carries its color letter, for the color-blind option. One image to a screen reader:
 * the stickers themselves are not read out one by one.
 */

import React from 'react';
import type { CubeState, Face } from '@/cube/types';
import { cx, stickerColor, stickerLetter, stickerLetterClass } from '@/components/ui';

const NET: Record<Face, { col: number; row: number }> = {
  U: { col: 2, row: 1 },
  L: { col: 1, row: 2 },
  F: { col: 2, row: 2 },
  R: { col: 3, row: 2 },
  B: { col: 4, row: 2 },
  D: { col: 2, row: 3 },
};

export interface CubeNetProps {
  state: CubeState;
  /** Accessible name of the picture. */
  label: string;
  letters?: boolean;
  className?: string;
}

export function CubeNet({ state, label, letters = false, className }: CubeNetProps) {
  return (
    <div role="img" aria-label={label} className={cx('inline-grid shrink-0 grid-cols-4 grid-rows-3 gap-0.5', className)}>
      {(Object.keys(NET) as Face[]).map((face) => (
        <div
          key={face}
          className="grid grid-cols-3 gap-px rounded-xs bg-sticker-core p-px"
          style={{ gridColumn: NET[face].col, gridRow: NET[face].row }}
        >
          {state[face].map((color, i) => (
            <span
              key={i}
              className={cx('flex items-center justify-center', letters ? 'h-4 w-4' : 'h-2.5 w-2.5 sm:h-3 sm:w-3')}
              style={{ backgroundColor: stickerColor(color) }}
            >
              {letters && (
                <span aria-hidden className={cx('font-mono text-[8px] font-bold leading-none', stickerLetterClass(color))}>
                  {stickerLetter(color)}
                </span>
              )}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
