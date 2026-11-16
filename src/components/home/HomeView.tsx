'use client';

/**
 * Cubyntra - Home
 * Necookie Labs (c) 2026
 *
 * Continue the solve in progress, pick a method, glance at progress. One primary action per
 * state: "Continue" when a solve is saved, otherwise "Scan my cube".
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ScanLine, Shuffle, Smartphone, Target, Timer } from 'lucide-react';
import { BlockButton, Chip, Panel, ProgressBlocks, cx } from '@/components/ui';
import { BlockLink } from '@/components/shell/BlockLink';
import { PageContainer, PageHeader, PageSection } from '@/components/shell/Page';
import { useTutorStore } from '@/stores/useTutorStore';
import { METHOD_IDS, METHOD_INFO } from '@/app-shell/methodInfo';
import { useStageProgress } from '@/app-shell/useStageProgress';
import { demoCube } from '@/app-shell/demoCube';
import type { MethodId } from '@/tutor/types';

function ContinueCard() {
  const solve = useTutorStore((s) => s.profile.currentSolve);
  const abandonSolve = useTutorStore((s) => s.abandonSolve);
  const progress = useStageProgress(solve?.state ?? null, solve?.method ?? null);
  if (!solve) return null;
  const info = METHOD_INFO[solve.method];
  const stageName = progress && !progress.done ? info.stages[progress.stageIndex]?.name : null;

  return (
    <Panel as="section" aria-labelledby="continue-title" className="vx-place flex flex-col gap-4 p-6 pb-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chip tone="leaf">In progress</Chip>
        <span className="font-mono text-xs text-muted">Step {solve.stepIndex + 1}</span>
      </div>
      <div className="flex flex-col gap-1">
        <h2 id="continue-title" className="text-2xl leading-tight text-ink">
          {info.name}
        </h2>
        <p className="text-sm text-muted">{stageName ? `Working on: ${stageName}` : 'Your cube is saved where you left it.'}</p>
      </div>
      {progress && (
        <ProgressBlocks
          total={info.stages.length}
          done={progress.done ? info.stages.length : progress.stageIndex}
          label={`${info.name} stages done`}
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <BlockLink href="/solve" variant="primary" size="lg" icon={<ArrowRight aria-hidden className="h-5 w-5" />}>
          Continue
        </BlockLink>
        <BlockButton variant="ghost" onClick={abandonSolve}>
          Discard this solve
        </BlockButton>
      </div>
    </Panel>
  );
}

function MethodPicker() {
  const method = useTutorStore((s) => s.profile.settings.methodDefault);
  const updateSettings = useTutorStore((s) => s.updateSettings);

  return (
    <div role="radiogroup" aria-labelledby="section-method" className="grid gap-4 sm:grid-cols-2">
      {METHOD_IDS.map((id) => {
        const info = METHOD_INFO[id];
        const active = id === method;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => updateSettings({ methodDefault: id })}
            className={cx(
              'vx-panel flex flex-col items-start gap-3 p-4 pb-5 text-left',
              active ? 'bg-leaf-soft' : 'hover:bg-well'
            )}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="font-display text-xl leading-none text-ink">{info.name}</span>
              <span
                aria-hidden
                className={cx('h-5 w-5 border-2 border-line', active ? 'bg-leaf shadow-[inset_0_-3px_0_0_var(--vx-leaf-edge)]' : 'bg-well')}
              />
            </span>
            <span className="text-sm font-bold text-ink">{info.summary}</span>
            <span className="text-sm text-muted">{info.detail}</span>
            <span className="mt-auto flex items-center gap-2 pt-1 text-xs text-muted">
              <span aria-hidden className="flex gap-1">
                {info.stages.map((s) => (
                  <span key={s.id} className="h-2 w-2 border border-line-soft bg-well" />
                ))}
              </span>
              {info.stages.length} stages
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="vx-well flex flex-col gap-1 p-3">
      <span className="font-display text-3xl leading-none text-ink">{value}</span>
      <span className="text-xs font-bold text-muted">{label}</span>
    </div>
  );
}

const PRACTICE = [
  { href: '/trainer', label: 'Trainer', blurb: 'Drill the cases you miss.', Icon: Target, soon: true },
  { href: '/timer', label: 'Timer', blurb: 'Time solves with inspection.', Icon: Timer, soon: true },
  { href: '/pair', label: 'Pair phone', blurb: 'Use your phone as the camera.', Icon: Smartphone, soon: false },
] as const;

export function HomeView() {
  const router = useRouter();
  const name = useTutorStore((s) => s.profile.name);
  const stats = useTutorStore((s) => s.profile.stats);
  const hasSolve = useTutorStore((s) => s.profile.currentSolve !== null);
  const method = useTutorStore((s) => s.profile.settings.methodDefault);
  const startSolve = useTutorStore((s) => s.startSolve);

  const tryDemo = (m: MethodId) => {
    void startSolve(demoCube(), m);
    router.push('/solve');
  };

  return (
    <PageContainer width="lg" className="gap-10">
      <PageHeader
        eyebrow={name ? `Hi, ${name}` : 'Cubyntra'}
        title={hasSolve ? 'Ready when you are.' : 'Let’s solve your cube.'}
        lede="Scan your cube, pick a method, and the twin shows every turn. After each step the camera checks you are on track."
      />

      <ContinueCard />

      <PageSection title="Method" aside={<span className="text-xs text-muted">You can switch any time</span>}>
        <MethodPicker />
        {!hasSolve && (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <BlockLink href="/scan" variant="primary" size="lg" icon={<ScanLine aria-hidden className="h-5 w-5" />}>
              Scan my cube
            </BlockLink>
            <BlockButton variant="ghost" icon={<Shuffle aria-hidden className="h-4 w-4" />} onClick={() => tryDemo(method)}>
              Try a demo cube
            </BlockButton>
          </div>
        )}
      </PageSection>

      <PageSection
        title="Progress"
        aside={
          <BlockLink href="/progress" variant="ghost" size="sm">
            See all
          </BlockLink>
        }
      >
        <div className="grid grid-cols-3 gap-3">
          <Stat value={stats.stepsCompleted} label="Steps done" />
          <Stat value={stats.checkpointsPassed} label="Checks passed" />
          <Stat value={stats.solvesCompleted} label="Solves" />
        </div>
      </PageSection>

      <PageSection title="More">
        <ul className="grid gap-3 sm:grid-cols-3">
          {PRACTICE.map(({ href, label, blurb, Icon, soon }) => (
            <li key={href}>
              <BlockLink
                href={href}
                className="h-auto w-full justify-start gap-3 whitespace-normal px-3 py-3 pb-4 text-left"
                icon={<Icon aria-hidden className="h-5 w-5 shrink-0" />}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center justify-between gap-2 text-sm">
                    {label}
                    {soon && <Chip>Soon</Chip>}
                  </span>
                  <span className="text-xs font-normal text-muted">{blurb}</span>
                </span>
              </BlockLink>
            </li>
          ))}
        </ul>
      </PageSection>
    </PageContainer>
  );
}
