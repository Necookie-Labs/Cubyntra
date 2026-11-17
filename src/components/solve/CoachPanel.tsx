'use client';

/**
 * Cubyntra - Coach panel
 * Necookie Labs (c) 2026
 *
 * The step's own notes (goal, what to look for) always show; they come from the tutor engine
 * and need no network. Three hint buttons ask the coach for more: what to look for, why it
 * works, the exact moves. The reply streams into a live region. When the coach answers from
 * its templates (no key, cap reached, offline) a short notice says so.
 *
 * With `voice`, a speaker button in the header turns the tutor's voice on and off, a finished
 * reply is read out with the device voice (only once it is final and passes the move guardrail,
 * ADR-016), and in ElevenLabs mode "Read with ElevenLabs" reads it with ElevenLabs instead.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { AudioLines, Eye, Lightbulb, ListOrdered, MessageSquare, Volume2, VolumeX } from 'lucide-react';
import type { Diagnosis, StepPlan } from '@/tutor/types';
import type { AttemptRecord, HintLevel } from '@/coach/types';
import { useCoach } from '@/coach/useCoach';
import { allowedMoves, buildCoachFacts, guardNames } from '@/coach/facts';
import { BlockButton, Chip, IconButton, Panel, cx } from '@/components/ui';
import { coachSpeech, type MoveSpeech } from '@/voice/speechText';
import type { SpeechItem } from '@/voice/speechQueue';

/** The voice controls the solve screen hands the coach panel. */
export interface CoachVoiceControls {
  /** The voice is on (the speaker button's pressed state). */
  on: boolean;
  onToggle: () => void;
  /** ElevenLabs mode: offer "Read with ElevenLabs" for a finished reply. */
  elevenlabs: boolean;
  /** Another paired device is the one speaking. */
  otherDeviceSpeaks?: boolean;
  moves: MoveSpeech;
  say: (item: SpeechItem) => void;
  replace: (item: SpeechItem) => void;
}

export interface CoachPanelProps {
  plan: StepPlan;
  token: string | null;
  attempts: readonly AttemptRecord[];
  diagnosis?: Diagnosis;
  /** Ask for an explanation as soon as a diagnosis arrives (after a mismatch). */
  explainDiagnosis?: boolean;
  /** Called with the level of every hint the student asks for (mastery counts them). */
  onHint?: (level: HintLevel) => void;
  /** The tutor's voice (solve screen only). */
  voice?: CoachVoiceControls;
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
  voice,
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

  // What the voice may say: the final reply, only if it passes the move guardrail again.
  const step = useMemo(() => {
    const facts = buildCoachFacts(plan, 3, attempts, diagnosis);
    return { allowed: allowedMoves(facts), names: guardNames(facts) };
  }, [plan, attempts, diagnosis]);
  const spoken = voice ? coachSpeech({ text: coach.text, status: coach.status }, step, voice.moves) : null;

  // Read each finished reply once, with the device voice.
  const said = useRef<string | null>(null);
  const say = voice?.say;
  useEffect(() => {
    if (!say || !spoken || said.current === spoken) return;
    said.current = spoken;
    say({ text: spoken, kind: 'reply' });
  }, [say, spoken]);

  return (
    <Panel as="section" aria-labelledby="coach-title" className={cx('flex flex-col gap-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="coach-title" className="flex items-center gap-2 text-lg leading-tight text-ink">
          <MessageSquare aria-hidden className="h-4 w-4" />
          Coach
        </h2>
        <div className="flex items-center gap-2">
          {coach.mode && coach.mode !== 'live' && <Chip tone={coach.mode === 'capped' ? 'warn' : 'neutral'}>{coach.mode === 'capped' ? 'Cap reached' : 'Templates'}</Chip>}
          {voice && (
            <IconButton label="Voice" size="md" aria-pressed={voice.on} onClick={voice.onToggle}>
              {voice.on ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </IconButton>
          )}
        </div>
      </div>
      {voice?.on && voice.otherDeviceSpeaks && <p className="text-xs text-muted">Your other device is speaking.</p>}

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
          <span className="flex items-center gap-3">
            <span aria-hidden className="vx-loader">
              <span />
              <span />
              <span />
            </span>
            <span className="text-sm text-muted">The coach is thinking…</span>
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

      {voice?.on && voice.elevenlabs && spoken && (
        <BlockButton
          size="sm"
          variant="ghost"
          className="self-start"
          icon={<AudioLines aria-hidden className="h-4 w-4" />}
          onClick={() => voice.replace({ text: spoken, kind: 'reply', premium: true })}
        >
          Read with ElevenLabs
        </BlockButton>
      )}

      <div role="group" aria-label="Hints" className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
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
