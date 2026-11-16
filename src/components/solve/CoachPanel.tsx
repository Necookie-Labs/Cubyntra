'use client';

/**
 * Cubyntra - Coach panel
 * Necookie Labs (c) 2026
 *
 * The step's own notes (goal, what to look for) always show; they come from the tutor engine
 * and need no network. Three hint buttons ask the coach for more: what to look for, why it
 * works, the exact moves. The reply streams into a live region. When the coach answers from
 * its templates (no key, cap reached, offline) a short notice says so.
 */

import React, { useEffect, useRef } from 'react';
import { Eye, Lightbulb, ListOrdered, MessageSquare } from 'lucide-react';
import type { Diagnosis, StepPlan } from '@/tutor/types';
import type { AttemptRecord, HintLevel } from '@/coach/types';
import { useCoach } from '@/coach/useCoach';
import { BlockButton, Chip, Panel, cx } from '@/components/ui';

export interface CoachPanelProps {
  plan: StepPlan;
  token: string | null;
  attempts: readonly AttemptRecord[];
  diagnosis?: Diagnosis;
  /** Ask for an explanation as soon as a diagnosis arrives (after a mismatch). */
  explainDiagnosis?: boolean;
  /** Called with the level of every hint the student asks for (mastery counts them). */
  onHint?: (level: HintLevel) => void;
  className?: string;
}

const HINTS: { level: HintLevel; label: string; Icon: typeof Eye }[] = [
  { level: 1, label: 'What to look for', Icon: Eye },
  { level: 2, label: 'Why it works', Icon: Lightbulb },
  { level: 3, label: 'Show the moves', Icon: ListOrdered },
];

export function CoachPanel({
  plan,
  token,
  attempts,
  diagnosis,
  explainDiagnosis = false,
  onHint,
  className,
}: CoachPanelProps) {
  const coach = useCoach({ plan, token, attempts, diagnosis });
  const { requestHint } = coach;
  const busy = coach.status === 'loading' || coach.status === 'streaming';

  // One explanation per diagnosis, not one per render.
  const explained = useRef<Diagnosis | undefined>(undefined);
  useEffect(() => {
    if (!explainDiagnosis || !diagnosis || explained.current === diagnosis) return;
    explained.current = diagnosis;
    requestHint(1);
  }, [explainDiagnosis, diagnosis, requestHint]);

  return (
    <Panel as="section" aria-labelledby="coach-title" className={cx('flex flex-col gap-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="coach-title" className="flex items-center gap-2 text-lg leading-tight text-ink">
          <MessageSquare aria-hidden className="h-4 w-4" />
          Coach
        </h2>
        {coach.mode && coach.mode !== 'live' && <Chip tone={coach.mode === 'capped' ? 'warn' : 'neutral'}>{coach.mode === 'capped' ? 'Cap reached' : 'Templates'}</Chip>}
      </div>

      <div className="flex flex-col gap-2 text-sm leading-relaxed">
        <p className="text-ink">{plan.facts.goal}</p>
        <p className="text-muted">{plan.facts.lookFor}</p>
      </div>

      <div
        aria-live="polite"
        aria-busy={busy}
        className="flex flex-col gap-2 empty:hidden"
      >
        {coach.status === 'loading' && (
          <span className="vx-loader" aria-label="The coach is thinking">
            <span />
            <span />
            <span />
          </span>
        )}
        {coach.text && (
          <p className="vx-well whitespace-pre-line p-3 text-sm leading-relaxed text-ink">{coach.text}</p>
        )}
        {coach.status === 'done' && coach.notice && <p className="text-xs text-muted">{coach.notice}</p>}
        {coach.status === 'error' && (
          <p className="text-sm text-ink">
            {coach.error} The step notes above still work.
          </p>
        )}
      </div>

      <div role="group" aria-label="Hints" className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        {HINTS.map(({ level, label, Icon }) => (
          <BlockButton
            key={level}
            size="sm"
            aria-pressed={coach.hintLevel === level && coach.status !== 'idle'}
            disabled={busy}
            onClick={() => {
              requestHint(level);
              onHint?.(level);
            }}
            icon={<Icon aria-hidden className="h-4 w-4" />}
            className="justify-start"
          >
            <span className="font-mono text-muted">{level}</span>
            {label}
          </BlockButton>
        ))}
      </div>
    </Panel>
  );
}
