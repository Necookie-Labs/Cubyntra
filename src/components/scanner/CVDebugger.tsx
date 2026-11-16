'use client';

/**
 * Cubyntra - Computer Vision Telemetry & Diagnostics Inspector
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { Activity, X, Eye } from 'lucide-react';
import { Chip, IconButton, stickerColor } from '@/components/ui';

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className="font-bold text-ink">{children}</span>
    </div>
  );
}

export const CVDebugger: React.FC = () => {
  const { currentClassification, isDebugMode, toggleDebugMode } = useCubyntraStore();

  if (!isDebugMode) return null;

  const stickers = currentClassification?.stickers || [];
  const detection = currentClassification?.detection;

  return (
    <div className="vx-panel vx-place fixed bottom-4 left-4 z-40 flex max-h-[85vh] w-96 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto p-4 pb-5 font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-line-soft pb-2">
        <div className="flex items-center gap-2 text-ink">
          <span
            aria-hidden
            data-variant="primary"
            className="vx-block flex h-6 w-6 items-center justify-center"
          >
            <Activity className="h-4 w-4" />
          </span>
          <span className="font-display text-sm">CV Pipeline Telemetry</span>
        </div>
        <IconButton label="Close CV debugger" variant="ghost" size="sm" onClick={toggleDebugMode}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>

      {/* Global Stability Metrics */}
      <div className="vx-well grid grid-cols-2 gap-x-4 gap-y-1 p-2">
        <Stat label="Target face">{currentClassification?.expectedFace || 'None'}</Stat>
        <Stat label="Avg conf">
          {currentClassification ? `${Math.round(currentClassification.averageConfidence * 100)}%` : '--'}
        </Stat>
        <Stat label="Stability">{currentClassification?.isStable ? 'LOCKED' : 'SAMPLING'}</Stat>
        <Stat label="Frames">{currentClassification?.stableFramesCount || 0}</Stat>
      </div>

      {/* ML Cube vs Face Detector Telemetry */}
      {detection && (
        <div className="vx-well flex flex-col gap-2 p-2">
          <div className="flex items-center justify-between gap-2 border-b-2 border-line-soft pb-2">
            <span className="font-bold uppercase text-ink">ML presence check</span>
            <Chip tone={detection.isCube ? 'leaf' : detection.classification === 'face' ? 'danger' : 'neutral'}>
              {detection.isCube ? 'Cube Verified' : detection.classification === 'face' ? 'Face Detected' : 'No Cube'}
            </Chip>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Stat label="P(cube)">{Math.round(detection.cubeConfidence * 100)}%</Stat>
            <Stat label="P(face)">
              <span className={detection.faceConfidence > 0.4 ? 'bg-danger-soft px-1' : undefined}>
                {Math.round(detection.faceConfidence * 100)}%
              </span>
            </Stat>
            <Stat label="Skin">{Math.round(detection.features.skinFraction * 100)}%</Stat>
            <Stat label="Seams">{Math.round(detection.features.gridSeamContrast * 100)}%</Stat>
          </div>

          <div className="truncate text-muted">{detection.reason}</div>
        </div>
      )}

      {/* 3x3 Live Sticker Matrix */}
      <div>
        <div className="mb-2 flex items-center gap-1 uppercase text-muted">
          <Eye className="h-4 w-4" />
          <span>3x3 sticker cells</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {stickers.map((sample) => (
            <div key={sample.index} className="flex flex-col gap-1 border-2 border-line-soft bg-panel p-2">
              <div className="flex items-center justify-between">
                <span className="text-muted">#{sample.index}</span>
                <span
                  aria-hidden
                  className="h-4 w-4 border-2 border-line"
                  style={{ backgroundColor: stickerColor(sample.predictedColor) }}
                />
              </div>

              <div className="truncate font-bold capitalize text-ink">{sample.predictedColor}</div>

              <div className="flex flex-col text-muted">
                <span>
                  RGB {sample.rgb.r},{sample.rgb.g},{sample.rgb.b}
                </span>
                <span>
                  HSV {Math.round(sample.hsv.h)}°,{Math.round(sample.hsv.s)}%
                </span>
                <span>Conf {Math.round(sample.confidence * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
