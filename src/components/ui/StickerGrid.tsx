/**
 * Cubyntra - Sticker Grid
 * Necookie Labs (c) 2026
 *
 * One face as a flat 3x3 grid of stickers on dark plastic. With `letters` each sticker also
 * carries its color letter (color-blind option). With `onTileClick` the tiles are buttons
 * (e.g. to correct a misread tile); `marked` tiles get a small warning block.
 */

import React from 'react';
import type { CubeColor } from '@/cube/types';
import { cx } from './cx';
import { stickerColor, stickerLetter, stickerLetterClass } from './sticker';

export interface StickerGridProps {
  /** Nine colors row-major; null draws an unknown (empty) tile. */
  tiles: ReadonlyArray<CubeColor | null>;
  /** Accessible name of the face, e.g. "Front face". */
  label: string;
  letters?: boolean;
  /** Tile indexes to mark as needing a look. */
  marked?: readonly number[];
  onTileClick?: (index: number) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const TILE = { sm: 'h-3 w-3', md: 'h-8 w-8 text-xs', lg: 'h-12 w-12 text-sm' } as const;
/** Tiles that are buttons sit edge to edge, so on phones they grow to a full 44px instead. */
const TAP_TILE = { sm: 'h-11 w-11 lg:h-3 lg:w-3', md: 'h-11 w-11 text-sm lg:h-8 lg:w-8 lg:text-xs', lg: 'h-12 w-12 text-sm' } as const;

function tileName(index: number, color: CubeColor | null): string {
  return `row ${Math.floor(index / 3) + 1} column ${(index % 3) + 1}: ${color ?? 'not read'}`;
}

export const StickerGrid: React.FC<StickerGridProps> = ({
  tiles,
  label,
  letters = false,
  marked = [],
  onTileClick,
  size = 'md',
  className,
}) => (
  <div
    role="group"
    aria-label={label}
    className={cx('inline-grid grid-cols-3 gap-0.5 rounded-sm bg-sticker-core p-1', className)}
  >
    {tiles.map((color, index) => {
      const isMarked = marked.includes(index);
      const content = (
        <>
          {letters && color && size !== 'sm' && (
            <span aria-hidden className={cx('font-mono font-bold leading-none', stickerLetterClass(color))}>
              {stickerLetter(color)}
            </span>
          )}
          {isMarked && <span aria-hidden className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-sticker-core bg-warn" />}
        </>
      );
      const style = color ? { backgroundColor: stickerColor(color) } : undefined;
      const base = cx(
        'relative flex items-center justify-center rounded-xs',
        (onTileClick ? TAP_TILE : TILE)[size],
        !color && 'bg-well'
      );
      const name = `${tileName(index, color)}${isMarked ? ', needs a look' : ''}`;
      return onTileClick ? (
        <button
          key={index}
          type="button"
          aria-label={name}
          onClick={() => onTileClick(index)}
          className={cx(base, 'hover:-translate-y-px')}
          style={style}
        >
          {content}
        </button>
      ) : (
        <span key={index} role="img" aria-label={name} className={base} style={style}>
          {content}
        </span>
      );
    })}
  </div>
);
