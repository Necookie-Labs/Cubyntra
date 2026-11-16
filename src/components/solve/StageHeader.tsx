/**
 * Cubyntra - Stage header for the solve screen
 * Necookie Labs (c) 2026
 */

import React from 'react';
import type { StepPlan } from '@/tutor/types';
import { ProgressBlocks } from '@/components/ui';
import { METHOD_INFO } from '@/app-shell/methodInfo';

export function StageHeader({ plan }: { plan: StepPlan }) {
  const info = METHOD_INFO[plan.method];
  const total = info.stages.length;
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-muted">
        <span>
          {info.name} · Stage {plan.stageIndex + 1} of {total}
        </span>
        <span className="font-mono">Step {plan.stepIndex + 1}</span>
      </div>
      <ProgressBlocks total={total} done={plan.stageIndex} label={`${info.name} stages`} />
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl leading-none text-ink">{plan.stageName}</h1>
        <p className="text-sm text-muted">{plan.caseName}</p>
      </div>
    </header>
  );
}
