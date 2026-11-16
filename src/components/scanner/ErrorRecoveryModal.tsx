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
import { BlockButton, Panel } from '@/components/ui';

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
    <Panel role="alert" className="vx-place w-full max-w-lg mx-auto lg:mx-0 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div aria-hidden data-variant="danger" className="vx-block flex h-10 w-10 shrink-0 items-center justify-center pb-1">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg leading-tight text-ink">{title}</h3>
          <p className="text-sm text-muted mt-1 leading-relaxed">{summary}</p>
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="bg-danger-soft border-2 border-danger p-3 max-h-36 overflow-y-auto flex flex-col gap-1 text-sm text-ink">
          {issues.map((issue, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 bg-danger" />
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canReview && (
          <BlockButton
            variant="primary"
            size="sm"
            onClick={() => setAppState('reviewing')}
            icon={<ArrowLeft className="w-3.5 h-3.5" aria-hidden />}
          >
            Back to review
          </BlockButton>
        )}
        {namedFaces.map((face) => (
          <BlockButton
            key={face}
            size="sm"
            onClick={() => onRescanFace(face)}
            icon={<RefreshCw className="w-3.5 h-3.5" aria-hidden />}
          >
            Rescan {FACE_LABEL[face]}
          </BlockButton>
        ))}
        <BlockButton size="sm" onClick={onStartOver}>
          Start over
        </BlockButton>
        <BlockButton variant="ghost" size="sm" onClick={onDemo} icon={<Sparkles className="w-3.5 h-3.5" aria-hidden />}>
          Try the demo cube
        </BlockButton>
      </div>
    </Panel>
  );
};
