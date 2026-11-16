'use client';

/**
 * Cubyntra - Screens that arrive in Phase 9
 * Necookie Labs (c) 2026
 *
 * Progress already has its real layout so navigation and the shell
 * can be judged now. Controls that do nothing yet are disabled and say so plainly.
 */

import React from 'react';
import { Chip, Panel, ProgressBlocks } from '@/components/ui';
import { PageContainer, PageHeader, PageSection } from '@/components/shell/Page';
import { useTutorStore } from '@/stores/useTutorStore';
import { METHOD_IDS, METHOD_INFO } from '@/app-shell/methodInfo';

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
