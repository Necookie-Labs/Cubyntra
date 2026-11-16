'use client';

/**
 * Cubyntra - Main Application View
 * Necookie Labs (c) 2026
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { warmUpSolver } from '@/solver/client';
import { CubeMove, CubeState, Face } from '@/cube/types';
import { Header } from '@/components/branding/Header';
import { CubeVisualizer, CubeVisualizerRef } from '@/components/cube/CubeVisualizer';
import { CameraScanner } from '@/components/camera/CameraScanner';
import { SolveControls } from '@/components/solver/SolveControls';
import { CVDebugger } from '@/components/scanner/CVDebugger';
import { ErrorRecoveryModal } from '@/components/scanner/ErrorRecoveryModal';
import { MobilePairingModal } from '@/components/sync/MobilePairingModal';
import { CompanionScanPanel } from '@/components/sync/CompanionScanPanel';
import { ScanReview } from '@/components/review/ScanReview';
import { CompanionSyncProvider, useCompanion } from '@/sync/CompanionSyncProvider';
import { usePlaybackSync } from '@/sync/usePlaybackSync';
import { BlockButton, Chip, Panel, stickerColor } from '@/components/ui';
import { CubeColor } from '@/cube/types';
import { Camera, Sparkles, Shield, Cpu, Layers, Smartphone } from 'lucide-react';

const PILLARS: Array<{ Icon: typeof Shield; sticker: CubeColor; title: string; body: string }> = [
  {
    Icon: Shield,
    sticker: 'yellow',
    title: 'Private by design',
    body: 'Webcam frames never leave your browser. Phone photos are held in memory only until you confirm.',
  },
  {
    Icon: Cpu,
    sticker: 'white',
    title: 'Kociemba two-phase',
    body: 'Checks the cube can really exist, then finds a short solution.',
  },
  {
    Icon: Layers,
    sticker: 'orange',
    title: 'Zero-drift 3D twin',
    body: 'A 27-block cube that snaps to exact positions after every turn.',
  },
];

/**
 * 'auto': opened by "Scan with Phone"; steps aside once the phone connects.
 * 'manual': reopened from the progress panel; stays until the user closes it.
 */
type PairingMode = 'closed' | 'auto' | 'manual';

export default function Home() {
  return (
    <CompanionSyncProvider>
      <Workspace />
    </CompanionSyncProvider>
  );
}

function Workspace() {
  // Build the solver tables in the worker while the student scans, so solving is instant.
  useEffect(() => warmUpSolver(), []);

  const {
    appState,
    scanSource,
    cubeState,
    solution,
    currentMoveIndex,
    startScanning,
    startCompanionScan,
    loadMockScramble,
    rescanFace,
    resetAll,
  } = useCubyntraStore();
  const companion = useCompanion();
  const { disconnect: disconnectPhone, requestRescan, confirmScan } = companion;
  // A paired phone mirrors the solve and can play, pause and step it.
  usePlaybackSync(companion);

  const visualizerRef = useRef<CubeVisualizerRef>(null);

  const [pairingMode, setPairingMode] = useState<PairingMode>('closed');
  const isPairingOpen = pairingMode === 'manual' || (pairingMode === 'auto' && !companion.mobileConnected);

  const scanWithPhone = useCallback(() => {
    startCompanionScan();
    setPairingMode('auto');
  }, [startCompanionScan]);

  // The old pairing ended: make a new QR code, keeping the faces already read here.
  const { initSession } = companion;
  const newPairing = useCallback(() => {
    void initSession();
    setPairingMode('manual');
  }, [initSession]);

  const scanWithWebcam = useCallback(() => {
    disconnectPhone();
    setPairingMode('closed');
    startScanning();
  }, [disconnectPhone, startScanning]);

  const rescanFromReview = useCallback(
    (face: Face) => {
      rescanFace(face);
      if (scanSource === 'companion') void requestRescan(face);
    },
    [rescanFace, requestRescan, scanSource]
  );

  // Tell the phone right away so it shows its done screen and the server drops the photos,
  // without waiting for the solve to finish.
  const onReviewConfirmed = useCallback(() => {
    if (scanSource === 'companion') void confirmScan();
  }, [confirmScan, scanSource]);

  // Back to the start screen from anywhere: ends any scan and phone session.
  const goHome = useCallback(() => {
    disconnectPhone();
    setPairingMode('closed');
    resetAll();
  }, [disconnectPhone, resetAll]);

  const loadDemo = useCallback(() => {
    disconnectPhone();
    setPairingMode('closed');
    void loadMockScramble();
  }, [disconnectPhone, loadMockScramble]);

  const activeMove =
    solution && currentMoveIndex >= 0 && currentMoveIndex < solution.moves.length
      ? solution.moves[currentMoveIndex]
      : null;

  const handleAnimateMove = useCallback(
    async (move: CubeMove, targetState: CubeState, durationMs: number) => {
      await visualizerRef.current?.animateMove(move, targetState, durationMs);
    },
    []
  );

  return (
    <div className="relative min-h-screen flex flex-col bg-ground text-ink overflow-x-hidden">
      {/* Mobile Pairing QR Modal */}
      <MobilePairingModal
        isOpen={isPairingOpen}
        onClose={() => setPairingMode('closed')}
        onSwitchToWebcam={scanWithWebcam}
      />

      {/* Main Header */}
      <Header onHome={goHome} onScanWebcam={scanWithWebcam} onDemo={loadDemo} />

      {/* Telemetry Debugger (Toggleable) */}
      <CVDebugger />

      {/* Main Responsive Workspace */}
      <main className="relative flex-1 flex flex-col lg:flex-row p-4 sm:p-6 lg:p-8 gap-6 lg:gap-8 max-w-7xl mx-auto w-full">
        {/* Left Interactive Panel */}
        <section className="flex-1 flex flex-col justify-center min-w-0">
          {/* 1. Ready / Hero State */}
          {appState === 'ready' && (
            <div className="vx-place flex flex-col gap-6 max-w-lg mx-auto lg:mx-0 py-6">
              <div className="flex flex-col items-start gap-4">
                <Chip tone="leaf" icon={<Shield className="w-3.5 h-3.5" aria-hidden />}>
                  Runs in your browser
                </Chip>
                <h1 className="text-5xl sm:text-6xl leading-none text-ink">
                  See it.
                  <span className="block text-leaf-edge">Solve it.</span>
                </h1>
                <p className="text-base text-muted leading-relaxed max-w-md">
                  Show your cube to the camera, check the colors, then follow the 3D twin one turn at a time.
                  Colors are read on your device and nothing is stored.
                </p>
              </div>

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-3">
                <BlockButton
                  variant="primary"
                  size="lg"
                  onClick={scanWithPhone}
                  icon={<Smartphone className="w-5 h-5" aria-hidden />}
                >
                  Scan with Phone
                </BlockButton>
                <BlockButton size="lg" onClick={scanWithWebcam} icon={<Camera className="w-5 h-5" aria-hidden />}>
                  Webcam Scan
                </BlockButton>
                <BlockButton
                  variant="ghost"
                  size="lg"
                  onClick={loadDemo}
                  icon={<Sparkles className="w-5 h-5" aria-hidden />}
                >
                  Load Demo
                </BlockButton>
              </div>

              {/* Feature pillars */}
              <ul className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t-2 border-line-soft">
                {PILLARS.map(({ Icon, sticker, title, body }) => (
                  <li key={title} className="vx-panel p-4 pb-5 flex flex-col gap-2">
                    <span
                      aria-hidden
                      className="flex h-8 w-8 items-center justify-center border-2 border-line text-sticker-core"
                      style={{ backgroundColor: stickerColor(sticker) }}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="text-sm font-bold text-ink">{title}</span>
                    <span className="text-xs text-muted leading-relaxed">{body}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 2. Camera Scanning Workflow */}
          {appState === 'scanning' &&
            (scanSource === 'companion' ? (
              <CompanionScanPanel
                onShowQr={() => setPairingMode('manual')}
                onUseWebcam={scanWithWebcam}
                onCancel={goHome}
                onNewPairing={newPairing}
              />
            ) : (
              <CameraScanner onBack={goHome} />
            ))}

          {/* 2b. Review the scan before solving */}
          {appState === 'reviewing' && (
            <ScanReview onRescanFace={rescanFromReview} onConfirmed={onReviewConfirmed} onStartOver={goHome} />
          )}

          {/* 3. Processing State */}
          {appState === 'processing' && (
            <Panel className="vx-place flex flex-col items-center justify-center p-8 text-center gap-4" role="status">
              <span aria-hidden className="vx-loader">
                <span />
                <span />
                <span />
              </span>
              <h2 className="text-xl text-ink">Finding the solution</h2>
              <p className="text-sm text-muted">Checking that the cube is solvable, then working out the turns.</p>
            </Panel>
          )}

          {/* 4. Solution & Solve Controls */}
          {(appState === 'solution_ready' || appState === 'solving' || appState === 'solved') && (
            <SolveControls onAnimateMove={handleAnimateMove} onNewScan={goHome} />
          )}

          {/* 5. Error & Diagnostic Recovery State */}
          {appState === 'error' && (
            <ErrorRecoveryModal onStartOver={goHome} onRescanFace={rescanFromReview} onDemo={loadDemo} />
          )}
        </section>

        {/* Right 3D Digital Twin Panel */}
        <section className="flex-1 flex flex-col items-center justify-center min-h-[384px] lg:min-h-[560px]">
          <CubeVisualizer
            ref={visualizerRef}
            state={cubeState}
            activeMove={activeMove}
            className="w-full h-full min-h-[400px] lg:min-h-[560px]"
          />
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full border-t-2 border-line bg-panel px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between text-xs text-muted gap-2">
        <div>
          <span className="font-bold text-ink">Cubyntra</span> · <span>Necookie Labs © 2026</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/Necookie-Labs/Cubyntra"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 decoration-2 hover:text-ink"
          >
            GitHub Repository
          </a>
          <span aria-hidden>·</span>
          <span>MIT License</span>
        </div>
      </footer>
    </div>
  );
}
