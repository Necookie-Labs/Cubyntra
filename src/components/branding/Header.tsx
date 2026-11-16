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
import { BlockButton, Chip, IconButton } from '@/components/ui';

interface HeaderProps {
  /** Return to the start screen, ending any scan and phone session. */
  onHome: () => void;
  onScanWebcam: () => void;
  onDemo: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onHome, onScanWebcam, onDemo }) => {
  const { isDebugMode, toggleDebugMode, appState } = useCubyntraStore();

  return (
    <header className="relative z-20 w-full border-b-2 border-line bg-panel px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
      {/* Brand Identity: returns to the start screen */}
      <button
        type="button"
        onClick={onHome}
        aria-label="Cubyntra home"
        title="Back to the start screen"
        className="flex items-center gap-3 -m-1 p-1 text-left hover:bg-well"
      >
        <CubeGlyph className="w-10 h-10" />

        <div>
          <div className="flex items-center gap-2">
            <span className="font-display text-2xl leading-none text-ink">Cubyntra</span>
            <span className="border-2 border-line-soft px-1 text-xs font-mono leading-tight text-muted">v1.0</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            <span className="font-bold text-ink">Necookie Labs</span> · See it. Solve it.
          </p>
        </div>
      </button>

      {/* Privacy Guarantee Badge */}
      <Chip tone="leaf" icon={<ShieldCheck className="w-3.5 h-3.5" aria-hidden />} className="hidden md:inline-flex">
        Read on your device · Nothing stored
      </Chip>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {appState !== 'scanning' && (
          <BlockButton variant="primary" size="sm" onClick={onScanWebcam}>
            Scan Cube
          </BlockButton>
        )}

        <BlockButton
          size="sm"
          onClick={onDemo}
          title="Load a scrambled demo cube"
          aria-label="Scramble Demo"
          icon={<Sparkles className="w-3.5 h-3.5" aria-hidden />}
        >
          <span className="hidden sm:inline">Scramble Demo</span>
        </BlockButton>

        <IconButton size="sm" onClick={onHome} label="Start over">
          <RefreshCw className="w-4 h-4" />
        </IconButton>

        <ThemeToggle />

        {/* Developer CV Debugger Toggle */}
        <BlockButton
          size="sm"
          onClick={toggleDebugMode}
          aria-pressed={isDebugMode}
          aria-label="CV Debug"
          title="Toggle CV Telemetry & Debugger"
          className="font-mono"
          icon={<Terminal className="w-3.5 h-3.5" aria-hidden />}
        >
          <span className="hidden lg:inline">CV Debug</span>
        </BlockButton>
      </div>
    </header>
  );
};
