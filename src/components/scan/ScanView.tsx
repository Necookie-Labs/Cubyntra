'use client';

/**
 * Cubyntra - Scan screen
 * Necookie Labs (c) 2026
 *
 * Full scan of the student's cube: six faces with this device's camera, or with the paired
 * phone (only colors travel, ADR-015), then the review. When the scan
 * is confirmed the student's color palette is built from the raw samples (for checkpoint
 * scans later), saved, and a guided solve starts on /solve with the default method, unless the
 * student asked to rescan the cube in the middle of a solve (`rescanRequested`): then that solve
 * plans again from the scan. Every confirmed scan, from the webcam or the phone, is also saved to
 * My cubes first (a solved cube is not). The demo scramble from the scanner takes the same path
 * without a palette and is not saved: the solve screen offers to save it.
 */

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw, Shuffle, Smartphone } from 'lucide-react';
import type { Face } from '@/cube/types';
import { FACES } from '@/cube/constants';
import { isCubeSolved } from '@/cube/transforms';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { useTutorStore } from '@/stores/useTutorStore';
import { CameraScanner } from '@/components/camera/CameraScanner';
import { CameraHelp, READING_TIPS } from '@/components/camera/CameraHelp';
import { ScanReview } from '@/components/review/ScanReview';
import { CompanionScanPanel } from '@/components/sync/CompanionScanPanel';
import { useCompanion } from '@/sync/CompanionSyncProvider';
import { BlockButton, Panel } from '@/components/ui';
import { Busy, PageContainer } from '@/components/shell/Page';
import { buildStudentPalette } from '@/vision/palette';
import { warmUpSolver } from '@/solver/client';

/** Scan states after which the cube is known and the solve can start. */
const CONFIRMED = new Set(['processing', 'solution_ready', 'solving', 'solved']);

export function ScanView() {
  const router = useRouter();
  const appState = useCubyntraStore((s) => s.appState);
  const errorMessage = useCubyntraStore((s) => s.errorMessage);
  const startScanning = useCubyntraStore((s) => s.startScanning);
  const rescanFace = useCubyntraStore((s) => s.rescanFace);
  const loadMockScramble = useCubyntraStore((s) => s.loadMockScramble);
  const scanSource = useCubyntraStore((s) => s.scanSource);
  const startCompanionScan = useCubyntraStore((s) => s.startCompanionScan);
  const stickerLetters = useTutorStore((s) => s.profile.settings.stickerLetters);
  const { mobileConnected, requestRescan, confirmScan } = useCompanion();
  const byPhone = scanSource === 'companion';
  // A confirmed scan (not the demo) of an unsolved cube was saved to My cubes.
  const scrambled = useCubyntraStore((s) => !isCubeSolved(s.originalScrambleState));
  const savedToCubes = scanSource !== null && scrambled;

  // Armed once this visit has shown the scanner or the review, so a finished scan from an
  // earlier visit does not start a solve on arrival.
  const armed = useRef(false);
  const handled = useRef(false);

  // Build the solver tables in the worker while the student scans, so checking the finished
  // scan does not wait for them.
  useEffect(() => {
    warmUpSolver();
  }, []);

  useEffect(() => {
    const state = useCubyntraStore.getState().appState;
    if (state !== 'scanning' && state !== 'reviewing') startScanning();
  }, [startScanning]);

  useEffect(() => {
    if (appState === 'scanning' || appState === 'reviewing') armed.current = true;
    if (!armed.current || handled.current || !CONFIRMED.has(appState)) return;
    handled.current = true;

    const scan = useCubyntraStore.getState();
    const tutor = useTutorStore.getState();
    const samples = scan.faceSamples;
    if (scan.resolution && FACES.every((f) => samples[f]?.length === 9)) {
      try {
        tutor.savePalette(buildStudentPalette(samples as Record<Face, NonNullable<(typeof samples)[Face]>>, scan.resolution));
      } catch (error) {
        // Checkpoints fall back to the standard color reader without a palette.
        console.warn('[Cubyntra] Could not build the color palette:', error);
      }
    }
    // A scanned cube is saved to My cubes before the solve starts; the demo cube (no scan
    // source) is not, unless the student saves it from the solve screen.
    const scanned = scan.originalScrambleState;
    const source = scan.scanSource;
    if (source) tutor.saveCube(scanned, source === 'companion' ? 'phone' : 'webcam');
    // Only "Rescan the cube" during a solve plans again from the scanned cube (same method,
    // grip and step count). Any other scan, "Solve another" included, starts a new solve with
    // the method chosen on Home. Both plan in the worker.
    if (tutor.rescanRequested && tutor.method && tutor.cube) void tutor.replanFromRescan(scanned);
    else void tutor.startSolve(scanned, tutor.profile.settings.methodDefault, { demo: !source });
    router.push('/solve');
  }, [appState, router]);

  const scanAgain = () => {
    handled.current = false;
    startScanning();
  };

  return (
    <PageContainer width="md">
      <h1 className="sr-only">Scan your cube</h1>

      {appState === 'scanning' && byPhone && (
        <CompanionScanPanel
          onShowQr={() => router.push('/pair')}
          onUseWebcam={startScanning}
          onCancel={() => router.push('/')}
          onNewPairing={() => router.push('/pair')}
          onRescanFace={(face) => {
            rescanFace(face);
            void requestRescan(face);
          }}
        />
      )}

      {appState === 'scanning' && !byPhone && (
        <>
          {mobileConnected && (
            <Panel tone="well" className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink">Your phone is paired. It can read the faces instead.</p>
              <BlockButton size="sm" onClick={startCompanionScan} icon={<Smartphone aria-hidden className="h-4 w-4" />}>
                Scan with the phone
              </BlockButton>
            </Panel>
          )}
          <CameraScanner onBack={() => router.push('/')} />
          <CameraHelp />
        </>
      )}

      {appState === 'reviewing' && (
        <ScanReview
          onRescanFace={(face) => {
            rescanFace(face);
            if (byPhone) void requestRescan(face);
          }}
          // The phone shows its done screen; the relay keeps only cube states (ADR-015).
          onConfirmed={() => {
            if (byPhone) void confirmScan();
          }}
          onStartOver={scanAgain}
          stickerLetters={stickerLetters}
        />
      )}

      {CONFIRMED.has(appState) && (
        <>
          <Busy label="Getting your first step ready" />
          {savedToCubes && <p className="text-center text-sm text-muted">Saved to My cubes.</p>}
        </>
      )}

      {appState === 'error' && (
        <Panel role="alert" className="vx-place flex flex-col gap-4 p-6 pb-7">
          <div className="flex items-start gap-3">
            <span aria-hidden data-variant="danger" className="vx-block flex h-10 w-10 shrink-0 items-center justify-center pb-1">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="text-xl leading-tight text-ink">The cube could not be read</h2>
              <p className="text-sm text-muted">{errorMessage ?? 'Some colors did not add up to a real cube.'}</p>
            </div>
          </div>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink">
            {READING_TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <BlockButton variant="primary" onClick={scanAgain} icon={<RefreshCw aria-hidden className="h-4 w-4" />}>
              Scan again
            </BlockButton>
            <BlockButton variant="ghost" onClick={() => void loadMockScramble()} icon={<Shuffle aria-hidden className="h-4 w-4" />}>
              Use a demo cube
            </BlockButton>
          </div>
        </Panel>
      )}
    </PageContainer>
  );
}
