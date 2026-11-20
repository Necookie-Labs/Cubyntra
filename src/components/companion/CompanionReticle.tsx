'use client';

/**
 * Cubyntra - Mobile Companion 3x3 Reticle
 * Necookie Labs (c) 2026
 *
 * The square the user lines the cube up in. Its color says what is happening: ink while
 * idle, warn yellow while something needs fixing, success green while holding steady for the
 * photo, and a solid green frame once the computer has read the face. Rounded corner brackets,
 * no glow.
 * With the letters setting on, the center and the live tiles carry their color's letter, so
 * they never rely on the swatch alone.
 */

import React from 'react';
import { CubeColor } from '@/cube/types';
import { cx, stickerColor, stickerLetter, stickerLetterClass } from '@/components/ui';

export type ReticleTone = 'idle' | 'fix' | 'steady' | 'done';

const TONE_RING: Record<ReticleTone, string> = {
  idle: 'border-ink',
  fix: 'border-warn',
  steady: 'border-success',
  done: 'border-success',
};

const BRACKETS = [
  'top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl',
  'top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl',
  'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl',
  'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl',
] as const;

interface CompanionReticleProps {
  tone: ReticleTone;
  /** Center color expected for this step. */
  expectedColor: CubeColor;
  /** Live per-tile reading, shown as small dots so the user sees the phone "sees" the cube. */
  liveColors?: (CubeColor | null)[];
  /** The viewfinder square; the photo is cropped to exactly this region of the camera frame. */
  squareRef?: React.Ref<HTMLDivElement>;
  /** Letters on stickers (the color-blind setting). */
  letters?: boolean;
}

function Letter({ color, size }: { color: CubeColor; size: string }) {
  return <span className={cx('font-mono font-bold leading-none', size, stickerLetterClass(color))}>{stickerLetter(color)}</span>;
}

export const CompanionReticle: React.FC<CompanionReticleProps> = ({
  tone,
  expectedColor,
  liveColors = [],
  squareRef,
  letters = false,
}) => {
  return (
    <div
      ref={squareRef}
      className="relative shrink-0 w-[min(74vw,320px,max(200px,calc(100dvh-440px)))] aspect-square"
    >
      {/* Read: a solid green frame snaps in around the whole square. */}
      {tone === 'done' && <span aria-hidden className="vx-pop absolute inset-0 rounded-2xl border-4 border-success" />}

      {/* Corner brackets */}
      {BRACKETS.map((pos) => (
        <span
          key={pos}
          aria-hidden
          className={cx('absolute w-10 h-10 transition-colors duration-100', pos, TONE_RING[tone])}
        />
      ))}

      {/* 3x3 grid */}
      <div className="absolute inset-2 grid grid-cols-3 grid-rows-3 gap-1">
        {Array.from({ length: 9 }).map((_, i) => {
          const live = liveColors[i];
          const isCenter = i === 4;
          return (
            <div key={i} className="relative grid place-items-center">
              <span aria-hidden className={cx('absolute inset-0 rounded-md border-2 border-ink', isCenter ? 'opacity-60' : 'opacity-25')} />
              {isCenter ? (
                <span
                  className="relative grid w-8 h-8 place-items-center rounded-sm border-2 border-sticker-core shadow-block-sm"
                  style={{ backgroundColor: stickerColor(expectedColor) }}
                  aria-hidden
                >
                  {letters && <Letter color={expectedColor} size="text-sm" />}
                </span>
              ) : (
                live && (
                  <span
                    className={cx('vx-pop relative grid place-items-center rounded-xs border-2 border-sticker-core', letters ? 'w-5 h-5' : 'w-4 h-4')}
                    style={{ backgroundColor: stickerColor(live) }}
                    aria-hidden
                  >
                    {letters && <Letter color={live} size="text-[10px]" />}
                  </span>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
