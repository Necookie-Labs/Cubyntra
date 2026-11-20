/**
 * Cubyntra - Stage header for the solve screen
 * Necookie Labs (c) 2026
 */

import React, { useEffect, useRef } from 'react';
import type { StepPlan } from '@/tutor/types';
import { ProgressBlocks } from '@/components/ui';
import { focusIfLost } from '@/components/ui/focus';
import { METHOD_INFO, methodStages } from '@/app-shell/methodInfo';

export function StageHeader({ plan }: { plan: StepPlan }) {
  const info = METHOD_INFO[plan.method];
  const total = methodStages(plan.method, plan.options?.lastLayer).length;
  // A new step replaces the controls the student last used ("Next step", "I did it"): the
  // step's heading takes the lost focus, so the next Tab starts from the new step.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => focusIfLost(headingRef.current), [plan.stepIndex]);
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
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-black leading-tight tracking-tight text-ink outline-none">
          {plan.stageName}
        </h1>
        <p className="text-sm text-muted">{plan.caseName}</p>
      </div>
    </header>
  );
}
