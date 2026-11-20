/**
 * Cubyntra - Mini cube diagram
 * Necookie Labs (c) 2026
 *
 * A flat unfolded cube showing how to hold it: each face is a small 3x3 with only its center
 * colored, in the student's grip. The face to show the camera is outlined and labelled, so the
 * instruction does not rely on color or on reading "the right face" correctly. A bar on one edge
 * of that face marks the edge that goes at the top of the camera picture: in this net it is
 * always the face's upper edge (the back edge of the top face, the front edge of the bottom
 * face, the top edge of the sides), matching `PICTURE_TOP`.
 */

import React from 'react';
import type { CubeColor, Face } from '@/cube/types';
import { cx, stickerColor, stickerLetter, stickerLetterClass } from '@/components/ui';
import { PICTURE_TOP } from '@/tutor/checkpoint';

const NET: Record<Face, { col: number; row: number }> = {
  U: { col: 2, row: 1 },
  L: { col: 1, row: 2 },
  F: { col: 2, row: 2 },
  R: { col: 3, row: 2 },
  B: { col: 4, row: 2 },
  D: { col: 2, row: 3 },
};

export const FACE_WORD: Record<Face, string> = {
  U: 'top',
  D: 'bottom',
  F: 'front',
  B: 'back',
  R: 'right',
  L: 'left',
};

export interface MiniCubeProps {
  /** Center color of every face in the student's grip. */
  centers: Record<Face, CubeColor>;
  /** The face to show, outlined. */
  highlight?: Face | null;
  letters?: boolean;
  className?: string;
}

export function MiniCube({ centers, highlight, letters = false, className }: MiniCubeProps) {
  const up = highlight ? PICTURE_TOP[highlight] : null;
  const label =
    highlight && up
      ? `Cube held with ${centers.U} on top and ${centers.F} in front. Show the ${FACE_WORD[highlight]} face, ${centers[highlight]} center, with the ${FACE_WORD[up]} face (${centers[up]} center) at the top of the picture.`
      : `Cube held with ${centers.U} on top and ${centers.F} in front.`;
  return (
    <div role="img" aria-label={label} className={cx('inline-grid grid-cols-4 grid-rows-3 gap-1', className)}>
      {(Object.keys(NET) as Face[]).map((face) => {
        const active = face === highlight;
        return (
          <div
            key={face}
            className={cx('relative flex flex-col items-center gap-0.5')}
            style={{ gridColumn: NET[face].col, gridRow: NET[face].row }}
          >
            {active && <span data-picture-top className="absolute -top-3 left-0 h-1 w-full rounded-full bg-ink" />}
            <div
              className={cx(
                'grid grid-cols-3 gap-px rounded-xs bg-sticker-core p-px',
                active ? 'outline-4 outline-offset-2 outline-focus' : 'border border-line-soft'
              )}
            >
              {Array.from({ length: 9 }, (_, i) => (
                <span
                  key={i}
                  className={cx('flex h-3 w-3 items-center justify-center sm:h-4 sm:w-4', i !== 4 && 'bg-well')}
                  style={i === 4 ? { backgroundColor: stickerColor(centers[face]) } : undefined}
                >
                  {i === 4 && letters && (
                    <span className={cx('font-mono text-[8px] font-bold leading-none', stickerLetterClass(centers[face]))}>
                      {stickerLetter(centers[face])}
                    </span>
                  )}
                </span>
              ))}
            </div>
            <span className={cx('text-[10px] leading-none', active ? 'font-bold text-ink' : 'text-muted')}>
              {FACE_WORD[face]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
