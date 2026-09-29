'use client';

/**
 * Cubyntra - Mobile Companion 3x3 Reticle
 * Necookie Labs (c) 2026
 *
 * The square the user lines the cube up in. Its color says what is happening: white while
 * idle, amber while something needs fixing, sky while holding steady for the photo, and
 * emerald once the computer has read the face.
 */

import React from 'react';
import { COLOR_HEX } from '@/cube/constants';
import { CubeColor } from '@/cube/types';

export type ReticleTone = 'idle' | 'fix' | 'steady' | 'done';

const TONE_RING: Record<ReticleTone, string> = {
  idle: 'border-white/80',
  fix: 'border-amber-400',
  steady: 'border-sky-400',
  done: 'border-emerald-400',
};

const TONE_GLOW: Record<ReticleTone, string> = {
  idle: '',
  fix: 'shadow-[0_0_24px_rgba(251,191,36,0.25)]',
  steady: 'shadow-[0_0_24px_rgba(56,189,248,0.35)]',
  done: 'shadow-[0_0_24px_rgba(52,211,153,0.35)]',
};

interface CompanionReticleProps {
  tone: ReticleTone;
  /** Center color expected for this step. */
  expectedColor: CubeColor;
  /** Live per-tile reading, shown as small dots so the user sees the phone "sees" the cube. */
  liveColors?: (CubeColor | null)[];
  /** The viewfinder square; the photo is cropped to exactly this region of the camera frame. */
  squareRef?: React.Ref<HTMLDivElement>;
}

export const CompanionReticle: React.FC<CompanionReticleProps> = ({
  tone,
  expectedColor,
  liveColors = [],
  squareRef,
}) => {
  return (
    <div
      ref={squareRef}
      className={`relative shrink-0 w-[min(74vw,320px,max(200px,calc(100dvh-440px)))] aspect-square rounded-2xl transition-shadow duration-200 ${TONE_GLOW[tone]}`}
    >
      {/* Corner brackets */}
      {(['top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-2xl', 'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-2xl', 'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-2xl', 'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-2xl'] as const).map((pos) => (
        <span
          key={pos}
          aria-hidden
          className={`absolute w-9 h-9 transition-colors duration-200 ${pos} ${TONE_RING[tone]}`}
        />
      ))}

      {/* 3x3 grid */}
      <div className="absolute inset-[6px] grid grid-cols-3 grid-rows-3 gap-[3px]">
        {Array.from({ length: 9 }).map((_, i) => {
          const live = liveColors[i];
          const isCenter = i === 4;
          return (
            <div
              key={i}
              className={`relative grid place-items-center rounded-md border ${
                isCenter ? 'border-white/40 bg-white/[0.04]' : 'border-white/15'
              }`}
            >
              {isCenter ? (
                <span
                  className="w-6 h-6 rounded-md border-2 border-white/80 shadow"
                  style={{ backgroundColor: COLOR_HEX[expectedColor] }}
                  aria-hidden
                />
              ) : (
                live && (
                  <span
                    className="w-3 h-3 rounded-full border border-black/40 shadow-sm"
                    style={{ backgroundColor: COLOR_HEX[live] }}
                    aria-hidden
                  />
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
