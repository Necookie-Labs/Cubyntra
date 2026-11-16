'use client';

/**
 * Cubyntra - Scan screen
 * Necookie Labs (c) 2026
 *
 * Full scan of the student's cube: six faces with the camera, then the review. When the scan
 * is confirmed the student's color palette is built from the raw samples (for checkpoint
 * scans later), saved, and a guided solve starts on /solve with the default method. The demo
 * scramble from the scanner takes the same path without a palette.
 */

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw, Shuffle } from 'lucide-react';
import type { Face } from '@/cube/types';
import { FACES } from '@/cube/constants';
import { useCubyntraStore } from '@/stores/useCubyntraStore';
import { useTutorStore } from '@/stores/useTutorStore';
import { CameraScanner } from '@/components/camera/CameraScanner';
import { CameraHelp, READING_TIPS } from '@/components/camera/CameraHelp';
import { ScanReview } from '@/components/review/ScanReview';
import { BlockButton, Panel } from '@/components/ui';
import { Busy, PageContainer } from '@/components/shell/Page';
import { buildStudentPalette } from '@/vision/palette';

/** Scan states after which the cube is known and the solve can start. */
const CONFIRMED = new Set(['processing', 'solution_ready', 'solving', 'solved']);

export function ScanView() {
  const router = useRouter();
  const appState = useCubyntraStore((s) => s.appState);
  const errorMessage = useCubyntraStore((s) => s.errorMessage);
  const startScanning = useCubyntraStore((s) => s.startScanning);
  const rescanFace = useCubyntraStore((s) => s.rescanFace);
  const loadMockScramble = useCubyntraStore((s) => s.loadMockScramble);
  const stickerLetters = useTutorStore((s) => s.profile.settings.stickerLetters);

  // Armed once this visit has shown the scanner or the review, so a finished scan from an
  // earlier visit does not start a solve on arrival.
  const armed = useRef(false);
  const handled = useRef(false);

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
    // A rescan in the middle of a solve keeps its method; a new solve uses the default.
    void tutor.startSolve(scan.originalScrambleState, tutor.method ?? tutor.profile.settings.methodDefault);
    router.push('/solve');
  }, [appState, router]);

  const scanAgain = () => {
    handled.current = false;
    startScanning();
  };

  return (
    <PageContainer width="md">
      <h1 className="sr-only">Scan your cube</h1>

      {appState === 'scanning' && (
        <>
          <CameraScanner onBack={() => router.push('/')} />
          <CameraHelp />
        </>
      )}

      {appState === 'reviewing' && (
        <ScanReview
          onRescanFace={rescanFace}
          onConfirmed={() => {}}
          onStartOver={scanAgain}
          stickerLetters={stickerLetters}
        />
      )}

      {CONFIRMED.has(appState) && <Busy label="Getting your first step ready" />}

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
