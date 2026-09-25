'use client';

/**
 * Cubyntra - Computer Vision Telemetry & Diagnostics Inspector
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { COLOR_HEX } from '@/cube/constants';
import { Activity, X, Eye } from 'lucide-react';

export const CVDebugger: React.FC = () => {
  const { currentClassification, isDebugMode, toggleDebugMode } = useCubyntraStore();

  if (!isDebugMode) return null;

  const stickers = currentClassification?.stickers || [];

  return (
    <div className="fixed bottom-4 left-4 z-40 w-96 max-h-[85vh] bg-[#0c0e12]/95 backdrop-blur-md border border-neutral-800 rounded-xl shadow-2xl p-4 flex flex-col gap-3 font-mono text-xs overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <div className="flex items-center gap-2 text-sky-400">
          <Activity className="w-4 h-4" />
          <span className="font-bold tracking-wider uppercase text-[11px]">
            CV Pipeline Telemetry
          </span>
        </div>
        <button
          type="button"
          onClick={toggleDebugMode}
          className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-800"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Global Stability Metrics */}
      <div className="grid grid-cols-2 gap-2 text-[11px] bg-neutral-900/80 p-2.5 rounded-lg border border-neutral-800/80">
        <div>
          <span className="text-neutral-400">Target Face:</span>{' '}
          <span className="text-white font-bold">{currentClassification?.expectedFace || 'None'}</span>
        </div>
        <div>
          <span className="text-neutral-400">Avg Conf:</span>{' '}
          <span className="text-emerald-400 font-bold">
            {currentClassification ? `${Math.round(currentClassification.averageConfidence * 100)}%` : '--'}
          </span>
        </div>
        <div>
          <span className="text-neutral-400">Stability:</span>{' '}
          <span className={currentClassification?.isStable ? 'text-emerald-400' : 'text-amber-400'}>
            {currentClassification?.isStable ? 'LOCKED' : 'SAMPLING'}
          </span>
        </div>
        <div>
          <span className="text-neutral-400">Frames:</span>{' '}
          <span className="text-neutral-200">{currentClassification?.stableFramesCount || 0}</span>
        </div>
      </div>

      {/* 3x3 Live Sticker Matrix */}
      <div>
        <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-1 flex items-center gap-1">
          <Eye className="w-3 h-3" />
          <span>3x3 Sticker Cell Inspection</span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {stickers.map((sample) => (
            <div
              key={sample.index}
              className="bg-neutral-900/90 border border-neutral-800 p-1.5 rounded flex flex-col gap-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-neutral-400">#{sample.index}</span>
                <div
                  className="w-3 h-3 rounded-[2px] border border-white/40"
                  style={{ backgroundColor: COLOR_HEX[sample.predictedColor] }}
                />
              </div>

              <div className="text-[10px] font-bold text-white capitalize truncate">
                {sample.predictedColor}
              </div>

              <div className="text-[9px] text-neutral-400 space-y-0.5">
                <div>RGB: {sample.rgb.r},{sample.rgb.g},{sample.rgb.b}</div>
                <div>HSV: {Math.round(sample.hsv.h)}°,{Math.round(sample.hsv.s)}%</div>
                <div>Conf: {Math.round(sample.confidence * 100)}%</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
