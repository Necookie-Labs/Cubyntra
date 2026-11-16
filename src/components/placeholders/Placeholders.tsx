'use client';

/**
 * Cubyntra - Screens that arrive in Phase 9
 * Necookie Labs (c) 2026
 *
 * Trainer, Timer and Progress already have their real layout so navigation and the shell
 * can be judged now. Controls that do nothing yet are disabled and say so plainly.
 */

import React from 'react';
import { Box, Play } from 'lucide-react';
import { BlockButton, Chip, Panel, ProgressBlocks } from '@/components/ui';
import { BlockLink } from '@/components/shell/BlockLink';
import { PageContainer, PageHeader, PageSection } from '@/components/shell/Page';
import { useTutorStore } from '@/stores/useTutorStore';
import { METHOD_IDS, METHOD_INFO } from '@/app-shell/methodInfo';

function SoonNote({ children }: { children: React.ReactNode }) {
  return (
    <Panel tone="well" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink">{children}</p>
      <BlockLink href="/solve" size="sm" icon={<Box aria-hidden className="h-4 w-4" />}>
        Go to Solve
      </BlockLink>
    </Panel>
  );
}

const TRAINER_STEPS = [
  { title: 'See it', body: 'The case is set up on the twin.' },
  { title: 'Recognise it', body: 'Name the case before you turn.' },
  { title: 'Do it', body: 'Turn your own cube.' },
  { title: 'Check it', body: 'Show the camera. Missed cases come back sooner.' },
];

export function TrainerView() {
  return (
    <PageContainer width="lg">
      <PageHeader eyebrow={<Chip tone="warn">Coming soon</Chip>} title="Trainer" lede="Practise one case at a time until it is automatic." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel tone="well" aria-hidden className="flex aspect-square items-center justify-center text-sm font-bold text-muted lg:aspect-auto lg:min-h-[400px]">
          The case appears here
        </Panel>
        <ol className="flex flex-col gap-3">
          {TRAINER_STEPS.map((step, i) => (
            <li key={step.title} className="vx-panel flex items-start gap-3 p-4 pb-5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-line bg-well font-mono text-sm font-bold">
                {i + 1}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-ink">{step.title}</span>
                <span className="text-sm text-muted">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <SoonNote>The trainer is not built yet. For now, every case comes up during a guided solve.</SoonNote>
    </PageContainer>
  );
}

export function TimerView() {
  return (
    <PageContainer width="md">
      <PageHeader eyebrow={<Chip tone="warn">Coming soon</Chip>} title="Timer" lede="Fifteen seconds to look, then solve as fast as you can." />
      <Panel className="flex flex-col items-center gap-6 py-12">
        <Chip>15 s inspection</Chip>
        <p aria-label="Time" className="font-mono text-6xl font-bold tabular-nums text-muted sm:text-7xl">
          0.00
        </p>
        <BlockButton variant="primary" size="lg" disabled icon={<Play aria-hidden className="h-5 w-5" />}>
          Start
        </BlockButton>
      </Panel>
      <PageSection title="Personal bests">
        <ul className="grid grid-cols-3 gap-3">
          {['Best', 'Average of 5', 'Average of 12'].map((label) => (
            <li key={label} className="vx-well flex flex-col gap-1 p-3">
              <span className="font-mono text-2xl font-bold text-muted">–</span>
              <span className="text-xs font-bold text-muted">{label}</span>
            </li>
          ))}
        </ul>
      </PageSection>
      <SoonNote>The timer is not built yet.</SoonNote>
    </PageContainer>
  );
}

export function ProgressView() {
  const stats = useTutorStore((s) => s.profile.stats);
  const solve = useTutorStore((s) => s.profile.currentSolve);
  return (
    <PageContainer width="lg">
      <PageHeader title="Progress" lede="Every check you pass is saved on this laptop." />
      <div className="grid grid-cols-3 gap-3">
        {[
          [stats.stepsCompleted, 'Steps done'],
          [stats.checkpointsPassed, 'Checks passed'],
          [stats.solvesCompleted, 'Solves'],
        ].map(([value, label]) => (
          <div key={label} className="vx-panel flex flex-col gap-1 p-4 pb-5">
            <span className="font-display text-4xl leading-none text-ink">{value}</span>
            <span className="text-xs font-bold text-muted">{label}</span>
          </div>
        ))}
      </div>
      <PageSection title="Progress world" aside={<Chip tone="warn">Coming soon</Chip>}>
        <p className="text-sm text-muted">A block for every stage you master. Streaks and your algorithm collection come with it.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {METHOD_IDS.map((id) => {
            const info = METHOD_INFO[id];
            return (
              <Panel key={id} className="flex flex-col gap-3">
                <h3 className="text-base text-ink">{info.name}</h3>
                <ProgressBlocks total={info.stages.length} done={0} current={-1} label={`${info.name} stages mastered`} />
                <p className="text-xs text-muted">
                  {solve?.method === id ? 'Solve in progress.' : `${info.stages.length} stages to master.`}
                </p>
              </Panel>
            );
          })}
        </div>
      </PageSection>
    </PageContainer>
  );
}
