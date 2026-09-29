'use client';

/**
 * Cubyntra - Application Header & Branding
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { ShieldCheck, Terminal, Sparkles, RefreshCw } from 'lucide-react';
import { CubeGlyph } from './CubeGlyph';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  /** Return to the start screen, ending any scan and phone session. */
  onHome: () => void;
  onScanWebcam: () => void;
  onDemo: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onHome, onScanWebcam, onDemo }) => {
  const { isDebugMode, toggleDebugMode, appState } = useCubyntraStore();

  return (
    <header className="relative z-20 w-full border-b border-neutral-800/80 bg-raised/90 backdrop-blur-md px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
      {/* Brand Identity: returns to the start screen */}
      <button
        type="button"
        onClick={onHome}
        aria-label="Cubyntra home"
        title="Back to the start screen"
        className="flex items-center gap-3 rounded-lg -m-1 p-1 text-left hover:bg-white/5 transition-colors focus-visible:outline-2 focus-visible:outline-sky-400"
      >
        <CubeGlyph />

        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">Cubyntra</span>
            <span className="text-[10px] uppercase tracking-widest font-mono text-neutral-400 bg-neutral-800/80 px-1.5 py-0.5 rounded border border-neutral-700/60">
              v1.0
            </span>
          </div>
          <p className="text-xs text-neutral-400 font-medium">
            <span className="text-neutral-300">Necookie Labs</span> • <span className="italic text-neutral-400">See it. Solve it.</span>
          </p>
        </div>
      </button>

      {/* Privacy Guarantee Badge */}
      <div className="hidden md:flex items-center gap-2 text-xs font-mono text-emerald-400/90 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded-full">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span>Read on your device • Nothing stored</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {appState !== 'scanning' && (
          <button
            type="button"
            onClick={onScanWebcam}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white text-neutral-900 hover:bg-neutral-200 transition-colors shadow-sm"
          >
            <span>Scan Cube</span>
          </button>
        )}

        <button
          type="button"
          onClick={onDemo}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-800/90 text-neutral-200 hover:bg-neutral-700/90 border border-neutral-700/80 transition-colors"
          title="Load a scrambled demo cube"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Scramble Demo</span>
        </button>

        <button
          type="button"
          onClick={onHome}
          className="p-1.5 text-xs rounded-lg bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800 border border-neutral-800 transition-colors"
          title="Start over"
          aria-label="Start over"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        <ThemeToggle />

        {/* Developer CV Debugger Toggle */}
        <button
          type="button"
          onClick={toggleDebugMode}
          aria-pressed={isDebugMode}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono rounded-lg border transition-colors ${
            isDebugMode
              ? 'bg-sky-950/80 text-sky-300 border-sky-700/80'
              : 'bg-neutral-900/60 text-neutral-400 hover:text-neutral-200 border-neutral-800'
          }`}
          title="Toggle CV Telemetry & Debugger"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">CV Debug</span>
        </button>
      </div>
    </header>
  );
};
