'use client';

/**
 * Cubyntra - Desktop Progress Panel for a Phone Scan
 * Necookie Labs (c) 2026
 *
 * Shows each face as its photo lands from the phone and whether the desktop could read it.
 */

import React from 'react';
import { useCompanion } from '@/sync/CompanionSyncProvider';
import { FaceScanStatus } from '@/sync/useCompanionSync';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { COLOR_HEX, SCAN_SEQUENCE } from '@/cube/constants';
import { Face } from '@/cube/types';
import { CheckCircle2, Loader2, QrCode, RotateCcw, Camera, Smartphone } from 'lucide-react';

const FACE_LABEL: Record<Face, string> = {
  U: 'Top',
  F: 'Front',
  R: 'Right',
  B: 'Back',
  L: 'Left',
  D: 'Bottom',
};

interface CompanionScanPanelProps {
  onShowQr: () => void;
  onUseWebcam: () => void;
  /** End the phone scan and return to the start screen. */
  onCancel: () => void;
}

export const CompanionScanPanel: React.FC<CompanionScanPanelProps> = ({ onShowQr, onUseWebcam, onCancel }) => {
  const { mobileConnected, faceStatus, faceReasons, lastPhotos } = useCompanion();
  const scannedFaces = useCubyntraStore((s) => s.scannedFaces);

  // Older phones send colors instead of photos; count those as read too.
  const statusOf = (face: Face): FaceScanStatus | undefined =>
    faceStatus[face] ?? (scannedFaces[face] ? 'accepted' : undefined);

  const doneCount = SCAN_SEQUENCE.filter((s) => statusOf(s.face) === 'accepted').length;
  const nextStep = SCAN_SEQUENCE.find((s) => statusOf(s.face) !== 'accepted');

  return (
    <div className="flex flex-col gap-5 w-full max-w-lg mx-auto lg:mx-0 bg-[#0d0f12]/95 backdrop-blur-md border border-neutral-800 p-5 rounded-2xl shadow-2xl">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div
            className={`inline-flex w-fit items-center gap-2 px-2.5 py-1 rounded-full border text-[11px] font-mono ${
              mobileConnected
                ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-400'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400'
            }`}
            role="status"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                mobileConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse motion-reduce:animate-none'
              }`}
            />
            {mobileConnected ? 'Phone connected' : 'Waiting for your phone'}
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">Scanning with your phone</h2>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Take each photo on your phone. It shows up here within a second and is read on this computer.
          </p>
        </div>
        <button
          type="button"
          onClick={onShowQr}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-800 bg-neutral-900 text-xs font-semibold text-neutral-200 hover:bg-neutral-800 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          <QrCode className="w-3.5 h-3.5" />
          Show QR
        </button>
      </header>

      <div className="flex items-center gap-3">
        <div
          className="flex-1 h-1.5 rounded-full bg-neutral-800 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={6}
          aria-valuenow={doneCount}
          aria-label="Faces read"
        >
          <div
            className="h-full bg-emerald-400 transition-[width] duration-300 ease-out"
            style={{ width: `${(doneCount / 6) * 100}%` }}
          />
        </div>
        <span className="text-xs font-mono text-neutral-400 tabular-nums">{doneCount}/6</span>
      </div>

      <ol className="grid grid-cols-3 gap-3">
        {SCAN_SEQUENCE.map((step) => {
          const status = statusOf(step.face);
          const photo = lastPhotos[step.face];
          const isNext = nextStep?.face === step.face;
          const hex = COLOR_HEX[step.centerColor];

          return (
            <li key={step.face} className="flex flex-col gap-1.5">
              <div
                className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-colors duration-200 ${
                  status === 'accepted'
                    ? 'border-emerald-500/70'
                    : status === 'rejected'
                    ? 'border-amber-400/80'
                    : status === 'analyzing' || isNext
                    ? 'border-sky-500/70'
                    : 'border-neutral-800'
                }`}
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo}
                    alt={`${FACE_LABEL[step.face]} face photo`}
                    className={`w-full h-full object-cover ${status === 'rejected' ? 'opacity-50' : ''}`}
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center bg-neutral-900/70">
                    <span
                      className="w-7 h-7 rounded-md border border-black/40 shadow-inner"
                      style={{ backgroundColor: hex, opacity: isNext ? 1 : 0.35 }}
                    />
                  </div>
                )}

                <span className="absolute top-1.5 right-1.5">
                  {status === 'accepted' && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 drop-shadow" aria-label="Read" />
                  )}
                  {status === 'analyzing' && (
                    <Loader2
                      className="w-5 h-5 text-sky-300 animate-spin motion-reduce:animate-none drop-shadow"
                      aria-label="Reading"
                    />
                  )}
                  {status === 'rejected' && (
                    <RotateCcw className="w-5 h-5 text-amber-300 drop-shadow" aria-label="Needs a retake" />
                  )}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full border border-black/40" style={{ backgroundColor: hex }} />
                <span className={isNext ? 'text-white font-semibold' : 'text-neutral-400'}>
                  {FACE_LABEL[step.face]}
                </span>
              </div>
              {status === 'rejected' && faceReasons[step.face] && (
                <p className="text-[11px] leading-snug text-amber-300/90">{faceReasons[step.face]}</p>
              )}
            </li>
          );
        })}
      </ol>

      <footer className="flex items-center justify-between gap-3 pt-4 border-t border-neutral-800/80">
        <p className="flex items-center gap-2 text-xs text-neutral-400 min-w-0">
          <Smartphone className="w-3.5 h-3.5 shrink-0 text-sky-400" />
          <span className="truncate">
            {nextStep ? (
              <>
                Next on your phone: <span className="text-neutral-200">{FACE_LABEL[nextStep.face]}</span>{' '}
                ({nextStep.centerColor} center)
              </>
            ) : (
              'All six faces read'
            )}
          </span>
        </p>
        <div className="shrink-0 flex items-center gap-3">
          <button
            type="button"
            onClick={onUseWebcam}
            className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors underline-offset-4 hover:underline"
          >
            <Camera className="w-3.5 h-3.5" />
            Use webcam
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-2.5 py-1.5 rounded-lg text-xs text-neutral-300 border border-neutral-800 hover:bg-neutral-800 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </footer>
    </div>
  );
};
