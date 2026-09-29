'use client';

/**
 * Cubyntra - Error Recovery Panel
 * Necookie Labs (c) 2026
 *
 * Shown when a cube cannot be solved or something unexpected failed. It always explains what
 * happened and always offers a way forward.
 */

import React from 'react';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { AlertTriangle, ArrowLeft, RefreshCw, Sparkles } from 'lucide-react';
import { Face } from '@/cube/types';

const FACE_LABEL: Record<Face, string> = {
  U: 'Top',
  F: 'Front',
  R: 'Right',
  B: 'Back',
  L: 'Left',
  D: 'Bottom',
};

interface ErrorRecoveryModalProps {
  /** Return to the start screen. */
  onStartOver: () => void;
  /** Rescan one face; also tells the phone during a phone scan. */
  onRescanFace: (face: Face) => void;
  /** Load the demo cube instead. */
  onDemo: () => void;
}

export const ErrorRecoveryModal: React.FC<ErrorRecoveryModalProps> = ({ onStartOver, onRescanFace, onDemo }) => {
  const validationResult = useCubyntraStore((s) => s.validationResult);
  const errorMessage = useCubyntraStore((s) => s.errorMessage);
  const resolution = useCubyntraStore((s) => s.resolution);
  const setAppState = useCubyntraStore((s) => s.setAppState);

  const issues = validationResult && !validationResult.valid ? validationResult.issues : [];
  // Only suggest rescanning faces an issue actually names; never guess one.
  const namedFaces = [...new Set(issues.map((i) => i.face).filter((f): f is Face => Boolean(f)))];
  const canReview = Boolean(resolution);

  const title = issues.length > 0 ? 'This cube can’t be solved as scanned' : 'Something went wrong';
  const summary =
    issues.length > 0
      ? 'A real cube could not look like this, so at least one tile was probably misread.'
      : errorMessage ?? 'An unexpected error stopped the solve. Your scan was not lost.';

  return (
    <div
      role="alert"
      className="w-full max-w-lg mx-auto lg:mx-0 bg-rose-950/30 border border-rose-800/70 rounded-2xl p-5 shadow-2xl flex flex-col gap-4"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-rose-900/50 border border-rose-700/70">
          <AlertTriangle className="w-5 h-5 text-rose-300" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
          <p className="text-sm text-rose-200/90 mt-1 leading-relaxed">{summary}</p>
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="bg-neutral-950/70 rounded-lg p-3 border border-neutral-800/80 max-h-36 overflow-y-auto space-y-1.5 text-xs">
          {issues.map((issue, idx) => (
            <li key={idx} className="flex items-start gap-2 text-rose-200/90">
              <span className="text-rose-400 font-bold shrink-0" aria-hidden>
                •
              </span>
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {canReview && (
          <button
            type="button"
            onClick={() => setAppState('reviewing')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white text-neutral-950 text-xs font-bold hover:bg-neutral-200 transition-colors shadow-md"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to review
          </button>
        )}
        {namedFaces.map((face) => (
          <button
            key={face}
            type="button"
            onClick={() => onRescanFace(face)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs font-medium border border-neutral-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Rescan {FACE_LABEL[face]}
          </button>
        ))}
        <button
          type="button"
          onClick={onStartOver}
          className="px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-medium border border-neutral-700 transition-colors"
        >
          Start over
        </button>
        <button
          type="button"
          onClick={onDemo}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          Try the demo cube
        </button>
      </div>
    </div>
  );
};
