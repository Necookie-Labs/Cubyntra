'use client';

/**
 * Cubyntra - Mobile Companion 3x3 Reticle HUD
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { ScanStepGuidance, COLOR_HEX } from '@/cube/constants';
import { CubeColor } from '@/cube/types';

interface CompanionReticleProps {
  currentStep: ScanStepGuidance;
  stepIndex: number;
  totalSteps: number;
  liveColors?: (CubeColor | null)[];
  isReady: boolean;
}

export const CompanionReticle: React.FC<CompanionReticleProps> = ({
  currentStep,
  stepIndex,
  totalSteps,
  liveColors = [],
  isReady,
}) => {
  const targetHex = COLOR_HEX[currentStep.centerColor];

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-4 sm:p-6 z-20">
      {/* Top Guidance Pill */}
      <div className="flex flex-col items-center gap-1.5 w-full max-w-sm mt-2 text-center animate-in fade-in slide-in-from-top-4 duration-300">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-neutral-700/80 text-xs font-mono text-white shadow-lg">
          <span
            className="w-2.5 h-2.5 rounded-full border border-black/50 shadow-sm"
            style={{ backgroundColor: targetHex }}
          />
          <span className="font-bold">{currentStep.title}</span>
          <span className="text-neutral-400">
            ({stepIndex + 1}/{totalSteps})
          </span>
        </div>

        <div className="px-3.5 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-neutral-800 text-[11px] text-neutral-300 max-w-xs shadow-md">
          {currentStep.rotationHint}
        </div>
      </div>

      {/* 3x3 Center Viewfinder Square */}
      <div className="relative w-[78vw] max-w-[320px] aspect-square flex items-center justify-center my-auto">
        {/* Reticle Boundary Corners */}
        <div className="absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl-lg shadow-sm" />
        <div className="absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr-lg shadow-sm" />
        <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl-lg shadow-sm" />
        <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 border-white rounded-br-lg shadow-sm" />

        {/* 3x3 Grid Overlay */}
        <div className="w-full h-full grid grid-cols-3 grid-rows-3 border border-white/20 rounded-lg overflow-hidden backdrop-brightness-105">
          {Array.from({ length: 9 }).map((_, i) => {
            const isCenter = i === 4;
            const detectedColor = liveColors[i];
            const detectedHex = detectedColor ? COLOR_HEX[detectedColor] : null;

            return (
              <div
                key={i}
                className={`relative flex items-center justify-center border border-white/15 ${
                  isCenter ? 'bg-white/5 ring-1 ring-inset ring-white/30' : ''
                }`}
              >
                {/* Live color dot preview */}
                {detectedHex && (
                  <div
                    className="w-4 h-4 rounded-full border border-black/40 shadow-sm transition-transform duration-150 scale-100"
                    style={{ backgroundColor: detectedHex }}
                  />
                )}

                {/* Target Center Color Indicator */}
                {isCenter && !detectedHex && (
                  <div className="flex flex-col items-center gap-1 opacity-70">
                    <div
                      className="w-5 h-5 rounded-md border border-white/40 shadow-sm"
                      style={{ backgroundColor: targetHex }}
                    />
                    <span className="text-[9px] font-mono text-white tracking-widest uppercase">
                      CENTER
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Framing alignment status pulse */}
        <div
          className={`absolute -inset-2 rounded-xl border-2 transition-colors duration-300 pointer-events-none ${
            isReady
              ? 'border-emerald-400/80 shadow-[0_0_15px_rgba(52,211,153,0.3)]'
              : 'border-white/10'
          }`}
        />
      </div>

      {/* Bottom Hint */}
      <div className="mb-2 text-center">
        <div className="text-[11px] font-mono text-neutral-400 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-neutral-800">
          Hold steady inside the square
        </div>
      </div>
    </div>
  );
};
