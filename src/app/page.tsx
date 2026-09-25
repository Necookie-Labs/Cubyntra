'use client';

/**
 * Cubyntra - Main Application View
 * Necookie Labs (c) 2026
 */

import React, { useRef, useCallback } from 'react';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { Header } from '@/components/branding/Header';
import { HexagonBackground } from '@/components/visual/HexagonBackground';
import { CubeVisualizer, CubeVisualizerRef } from '@/components/cube/CubeVisualizer';
import { CameraScanner } from '@/components/camera/CameraScanner';
import { SolveControls } from '@/components/solver/SolveControls';
import { CVDebugger } from '@/components/scanner/CVDebugger';
import { ErrorRecoveryModal } from '@/components/scanner/ErrorRecoveryModal';
import { Camera, Sparkles, Shield, Cpu, Layers } from 'lucide-react';

export default function Home() {
  const {
    appState,
    cubeState,
    solution,
    currentMoveIndex,
    startScanning,
    loadMockScramble,
  } = useCubyntraStore();

  const visualizerRef = useRef<CubeVisualizerRef>(null);

  const activeMove =
    solution && currentMoveIndex >= 0 && currentMoveIndex < solution.moves.length
      ? solution.moves[currentMoveIndex]
      : null;

  const handleExecuteMove = useCallback(
    async (stepIndex: number) => {
      if (!solution || !visualizerRef.current) return;
      const move = solution.moves[stepIndex];
      const targetState = useCubyntraStore.getState().cubeState;
      if (move) {
        await visualizerRef.current.animateMove(move, targetState, 260);
      }
    },
    [solution]
  );

  return (
    <div className="relative min-h-screen flex flex-col bg-[#0a0b0d] text-neutral-100 overflow-x-hidden">
      {/* Dynamic Procedural Background */}
      <HexagonBackground />

      {/* Main Header */}
      <Header />

      {/* Telemetry Debugger (Toggleable) */}
      <CVDebugger />

      {/* Main Responsive Workspace */}
      <main className="relative z-10 flex-1 flex flex-col lg:flex-row p-4 sm:p-6 lg:p-8 gap-6 max-w-7xl mx-auto w-full">
        {/* Left Interactive Panel */}
        <section className="flex-1 flex flex-col justify-center min-w-0">
          {/* 1. Ready / Hero State */}
          {appState === 'ready' && (
            <div className="flex flex-col gap-6 max-w-lg mx-auto lg:mx-0 py-6">
              <div>
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-sky-950/60 border border-sky-800/50 text-[11px] font-mono text-sky-400 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                  <span>V1 CLIENT-SIDE COMPUTER VISION</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
                  See it. <span className="text-neutral-400 font-light">Solve it.</span>
                </h2>
                <p className="mt-3 text-sm sm:text-base text-neutral-400 leading-relaxed">
                  Real-time browser-based computer vision scanning and deterministic Kociemba two-phase solving.
                  Zero video uploads, zero floating-point drift, and 100% on-device execution.
                </p>
              </div>

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={startScanning}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-neutral-950 font-bold text-sm hover:bg-neutral-200 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                >
                  <Camera className="w-4 h-4" />
                  <span>Scan Physical Cube</span>
                </button>

                <button
                  type="button"
                  onClick={() => loadMockScramble()}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl bg-neutral-900/90 text-neutral-200 font-semibold text-sm hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 transition-all"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Load Scramble Demo</span>
                </button>
              </div>

              {/* Architecture Feature Pillars */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-neutral-800/80">
                <div className="p-3 rounded-xl bg-neutral-900/40 border border-neutral-800/60 flex flex-col gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <div className="text-xs font-bold text-white">Client-Side Privacy</div>
                  <div className="text-[11px] text-neutral-400">Frames never leave your local browser sandbox.</div>
                </div>

                <div className="p-3 rounded-xl bg-neutral-900/40 border border-neutral-800/60 flex flex-col gap-1.5">
                  <Cpu className="w-4 h-4 text-sky-400" />
                  <div className="text-xs font-bold text-white">Kociemba Two-Phase</div>
                  <div className="text-[11px] text-neutral-400">Mathematical parity verification and efficient HTM solutions.</div>
                </div>

                <div className="p-3 rounded-xl bg-neutral-900/40 border border-neutral-800/60 flex flex-col gap-1.5">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <div className="text-xs font-bold text-white">Zero Drift 3D Twin</div>
                  <div className="text-[11px] text-neutral-400">Interactive 27-cubie mesh with orthogonal matrix snapping.</div>
                </div>
              </div>
            </div>
          )}

          {/* 2. Camera Scanning Workflow */}
          {appState === 'scanning' && <CameraScanner />}

          {/* 3. Processing State */}
          {appState === 'processing' && (
            <div className="flex flex-col items-center justify-center p-8 text-center gap-3">
              <div className="w-10 h-10 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
              <div className="text-sm font-bold text-white font-mono">
                COMPUTING OPTIMAL TWO-PHASE SOLUTION...
              </div>
              <div className="text-xs text-neutral-400">
                Verifying permutation parity and solving scramble sequence
              </div>
            </div>
          )}

          {/* 4. Solution & Solve Controls */}
          {(appState === 'solution_ready' || appState === 'solving' || appState === 'solved') && (
            <SolveControls onExecuteMove={handleExecuteMove} />
          )}

          {/* 5. Error & Diagnostic Recovery State */}
          {appState === 'error' && <ErrorRecoveryModal />}
        </section>

        {/* Right 3D Digital Twin Panel */}
        <section className="flex-1 flex flex-col items-center justify-center min-h-[380px] lg:min-h-[560px]">
          <CubeVisualizer
            ref={visualizerRef}
            state={cubeState}
            activeMove={activeMove}
            className="w-full h-full min-h-[400px] lg:min-h-[560px]"
          />
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-neutral-800/80 bg-[#0d0f12]/80 px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between text-xs text-neutral-400 font-mono gap-2">
        <div>
          <span>Cubyntra</span> • <span>Necookie Labs © 2026</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/Necookie-Labs/Cubyntra"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            GitHub Repository
          </a>
          <span>•</span>
          <span>MIT License</span>
        </div>
      </footer>
    </div>
  );
}
