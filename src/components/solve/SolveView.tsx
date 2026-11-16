'use client';

/**
 * Cubyntra - Guided solve screen
 * Necookie Labs (c) 2026
 *
 * Phone (portrait), top to bottom: stage header, teaching twin with its move chips and
 * playback, the coach, then "I did it". Desktop: the twin large on the left, everything else
 * in a column on the right. The screen stays awake while a solve is open, and an interrupted
 * solve resumes from the student's profile.
 */

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Home, RefreshCw, ScanLine, Shuffle } from 'lucide-react';
import { useTutorStore } from '@/stores/useTutorStore';
import type { CubeEngine } from '@/three/engine';
import { useSolveSyncTarget } from '@/sync/useSolveSyncTarget';
import { useTutorSync } from '@/sync/useTutorSync';
import { TeachingTwin } from '@/components/twin/TeachingTwin';
import { BlockButton, Panel } from '@/components/ui';
import { BlockLink } from '@/components/shell/BlockLink';
import { Busy, PageContainer, PageHeader } from '@/components/shell/Page';
import { useWakeLock } from '@/app-shell/wakeLock';
import { toCoachDiagnosis } from '@/app-shell/checkpointAdapter';
import { demoCube } from '@/app-shell/demoCube';
import { METHOD_INFO } from '@/app-shell/methodInfo';
import { StageHeader } from './StageHeader';
import { CoachPanel } from './CoachPanel';
import { CheckpointSheet } from './CheckpointSheet';
import { MismatchPanel } from './MismatchPanel';
import { BlockPlaced } from './BlockPlaced';

function NoSolve() {
  const method = useTutorStore((s) => s.profile.settings.methodDefault);
  const startSolve = useTutorStore((s) => s.startSolve);
  return (
    <PageContainer width="md">
      <PageHeader title="No solve in progress" lede="Scan your cube to start, or practise on a demo cube." />
      <div className="flex flex-wrap gap-3">
        <BlockLink href="/scan" variant="primary" size="lg" icon={<ScanLine aria-hidden className="h-5 w-5" />}>
          Scan my cube
        </BlockLink>
        <BlockButton
          size="lg"
          variant="ghost"
          icon={<Shuffle aria-hidden className="h-5 w-5" />}
          onClick={() => void startSolve(demoCube(), method)}
        >
          Demo cube ({METHOD_INFO[method].name})
        </BlockButton>
      </div>
    </PageContainer>
  );
}

function PlanError() {
  const message = useTutorStore((s) => s.errorMessage);
  const loadPlan = useTutorStore((s) => s.loadPlan);
  const requestRescan = useTutorStore((s) => s.requestRescan);
  return (
    <PageContainer width="md">
      <Panel role="alert" className="flex flex-col gap-4 p-6 pb-7">
        <div className="flex items-start gap-3">
          <span aria-hidden data-variant="danger" className="vx-block flex h-10 w-10 shrink-0 items-center justify-center pb-1">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl leading-tight text-ink">The next step did not load</h1>
            <p className="text-sm text-muted">{message}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <BlockButton variant="primary" onClick={() => void loadPlan()} icon={<RefreshCw aria-hidden className="h-4 w-4" />}>
            Try again
          </BlockButton>
          {/* A rescan of this solve's cube: the solve plans again from it. */}
          <BlockLink href="/scan" onClick={requestRescan} icon={<ScanLine aria-hidden className="h-4 w-4" />}>
            Scan again
          </BlockLink>
        </div>
      </Panel>
    </PageContainer>
  );
}

/** A wait on the solve screen: still one heading for the page. */
function SolveBusy({ label }: { label: string }) {
  return (
    <>
      <h1 className="sr-only">Solve</h1>
      <Busy label={label} />
    </>
  );
}

function Solved() {
  const method = useTutorStore((s) => s.method);
  const solves = useTutorStore((s) => s.profile.stats.solvesCompleted);
  return (
    <PageContainer width="md">
      <h1 className="sr-only">Solved</h1>
      <Panel role="status" className="vx-place flex flex-col items-center gap-4 p-8 text-center">
        <BlockPlaced earned={Math.max(0, solves - 1)} title="Solved!" detail={method ? `${METHOD_INFO[method].name}, every step checked.` : undefined} />
        <div className="flex flex-wrap justify-center gap-3">
          <BlockLink href="/scan" variant="primary" icon={<ScanLine aria-hidden className="h-4 w-4" />}>
            Solve another
          </BlockLink>
          <BlockLink href="/" variant="ghost" icon={<Home aria-hidden className="h-4 w-4" />}>
            Home
          </BlockLink>
        </div>
      </Panel>
    </PageContainer>
  );
}

export function SolveView() {
  const phase = useTutorStore((s) => s.phase);
  const plan = useTutorStore((s) => s.plan);
  const token = useTutorStore((s) => s.token);
  const attempts = useTutorStore((s) => s.attempts);
  const checkpoint = useTutorStore((s) => s.checkpoint);
  const settings = useTutorStore((s) => s.profile.settings);
  const profileStatus = useTutorStore((s) => s.profileStatus);
  const hasSaved = useTutorStore((s) => s.profile.currentSolve !== null);
  const beginCheckpoint = useTutorStore((s) => s.beginCheckpoint);
  const noteHint = useTutorStore((s) => s.noteHint);
  const [watched, setWatched] = useState<string | null>(null);
  const [engine, setEngine] = useState<CubeEngine | null>(null);

  // The paired device mirrors the step, the grip and the twin's playback, and can drive them;
  // on a paired phone the same messages go the other way, so the laptop mirrors the phone.
  useTutorSync(useSolveSyncTarget(), engine?.playback ?? null);

  useWakeLock(phase !== 'idle' && phase !== 'solved');

  // Pick up an interrupted solve once the profile has loaded.
  const resumed = useRef(false);
  const profileLoaded = profileStatus === 'ready' || profileStatus === 'unsaved';
  useEffect(() => {
    if (resumed.current || !profileLoaded || phase !== 'idle' || !hasSaved) return;
    resumed.current = true;
    void useTutorStore.getState().resumeSolve();
  }, [profileLoaded, phase, hasSaved]);

  if (phase === 'idle') {
    if (!profileLoaded || hasSaved) return <SolveBusy label="Loading your cube" />;
    return <NoSolve />;
  }
  if (phase === 'error') return <PlanError />;
  if (phase === 'solved') return <Solved />;
  if (phase === 'loading' || !plan) return <SolveBusy label="Planning the next step" />;

  const stepKey = `${plan.method}-${plan.stepIndex}-${plan.caseId}`;
  const mismatch = phase === 'mismatch';

  return (
    <PageContainer width="xl" className="gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-8">
      <div className="lg:col-start-2 lg:row-start-1">
        <StageHeader plan={plan} />
      </div>

      <TeachingTwin
        plan={plan}
        plainLanguage={settings.plainLanguage}
        stickerLetters={settings.stickerLetters}
        onStepPlayed={() => setWatched(stepKey)}
        onEngineChange={setEngine}
        className="lg:sticky lg:top-8 lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:min-h-[560px]"
      />

      <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-2">
        {mismatch && <MismatchPanel />}
        <CoachPanel
          plan={plan}
          token={token}
          attempts={attempts}
          diagnosis={mismatch ? toCoachDiagnosis(checkpoint?.diagnosis ?? null) : undefined}
          explainDiagnosis={mismatch}
          onHint={noteHint}
        />
      </div>

      {!mismatch && (
        <div className="sticky bottom-20 z-20 -mx-4 border-t-2 border-line-soft bg-ground px-4 py-3 lg:static lg:col-start-2 lg:row-start-3 lg:mx-0 lg:border-0 lg:p-0">
          <BlockButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={beginCheckpoint}
            icon={<CheckCircle2 aria-hidden className="h-5 w-5" />}
          >
            I did it
          </BlockButton>
          <p className="mt-2 text-center text-xs text-muted">
            {watched === stepKey ? 'Do the moves on your cube, then show it to the camera.' : 'Watch the twin, do the moves on your cube, then check.'}
          </p>
        </div>
      )}

      <CheckpointSheet plan={plan} />
    </PageContainer>
  );
}
