'use client';

/**
 * Cubyntra - Smart Validation Diagnostics & Error Recovery Modal
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { AlertTriangle, RefreshCw, Sparkles, ArrowRight } from 'lucide-react';
import { Face } from '@/cube/types';

export const ErrorRecoveryModal: React.FC = () => {
  const { validationResult, rescanFace, loadMockScramble, startScanning } = useCubyntraStore();

  if (!validationResult || validationResult.valid) return null;

  const issues = validationResult.issues || [];
  // Find face mentioned in issues to provide smart rescan suggestion
  const suggestedFace: Face = issues.find((i) => i.face)?.face || 'U';

  return (
    <div className="w-full bg-red-950/40 border border-red-800/80 rounded-xl p-5 shadow-2xl flex flex-col gap-3 font-sans">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-red-900/60 border border-red-700/80 text-red-300">
          <AlertTriangle className="w-5 h-5 text-red-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-white tracking-tight">
            Cube State Invariant Check Failed
          </h3>
          <p className="text-xs text-red-300/90 mt-0.5">
            The scanned configuration is physically impossible for a standard Rubik&apos;s Cube.
          </p>
        </div>
      </div>

      {/* Diagnostic Issues List */}
      <div className="bg-neutral-950/70 rounded-lg p-3 border border-neutral-800/80 max-h-36 overflow-y-auto space-y-1.5 font-mono text-xs">
        {issues.map((issue, idx) => (
          <div key={idx} className="flex items-start gap-2 text-red-300/90">
            <span className="text-red-500 font-bold shrink-0">•</span>
            <span>{issue.message}</span>
          </div>
        ))}
      </div>

      {/* Recovery Guidance & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => rescanFace(suggestedFace)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white text-neutral-950 text-xs font-semibold hover:bg-neutral-200 transition-colors shadow-md"
        >
          <RefreshCw className="w-3.5 h-3.5 text-neutral-950" />
          <span>Rescan Face {suggestedFace}</span>
          <ArrowRight className="w-3 h-3 text-neutral-600" />
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={startScanning}
            className="px-3 py-2 rounded-lg bg-neutral-850 hover:bg-neutral-800 text-neutral-300 text-xs font-medium border border-neutral-700 transition-colors"
          >
            Restart Scan
          </button>

          <button
            type="button"
            onClick={() => loadMockScramble()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-950 hover:bg-sky-900 text-sky-300 text-xs font-medium border border-sky-800 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Use Scramble Demo</span>
          </button>
        </div>
      </div>
    </div>
  );
};
