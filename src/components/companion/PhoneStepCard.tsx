'use client';

/**
 * Cubyntra - The step on the phone after a scan
 * Necookie Labs (c) 2026
 *
 * Once the scan is confirmed the laptop runs the guided solve. The phone shows the same step
 * the way the solve screen does: method and step number, the step's moves as move chips (the
 * current one lit, following the laptop's twin), the move in words and playback controls that
 * drive the laptop's twin. "Solve on this phone" opens the full solve screen here, with the
 * checkpoint camera; its verdicts and grip go back to the laptop.
 */

import React from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { parseAlgorithm } from '@/cube/transforms';
import { moveName } from '@/cube/moveNames';
import type { Move } from '@/cube/types';
import type { PlaybackView } from '@/sync/playbackSync';
import type { PlaybackPayload, StepPayload } from '@/sync/types';
import { METHOD_INFO } from '@/app-shell/methodInfo';
import { MoveChips } from '@/components/twin/MoveChips';
import { BlockLink } from '@/components/shell/BlockLink';
import { IconButton, Panel } from '@/components/ui';

function movesOf(step: StepPayload): Move[] {
  try {
    return step.algorithm ? parseAlgorithm(step.algorithm) : [];
  } catch {
    return [];
  }
}

export interface PhoneStepCardProps {
  step: StepPayload & { method: 'beginner' | 'cfop' };
  playback: PlaybackView;
  onControl: (payload: PlaybackPayload) => void;
}

export function PhoneStepCard({ step, playback, onControl }: PhoneStepCardProps) {
  const moves = movesOf(step);
  // On the wire -1 is "before the first move" and i is "move i done", so the next move is i + 1.
  const next = Math.min(moves.length, playback.index + 1);
  const atEnd = next >= moves.length;
  const focus = moves[next] ?? null;

  return (
    <Panel as="section" aria-labelledby="phone-step-title" className="flex w-full max-w-sm flex-col gap-4 text-left">
      <div className="flex items-center justify-between gap-2 text-xs font-bold text-muted">
        <span>{METHOD_INFO[step.method].name}</span>
        <span className="font-mono">Step {step.stepIndex + 1}</span>
      </div>
      <h2 id="phone-step-title" className="text-2xl leading-tight text-ink">
        Follow the twin
      </h2>
      {moves.length > 0 && (
        <MoveChips moves={moves} current={next} plainLanguageToggle={false} onSelect={(i) => onControl({ action: 'seek', index: i - 1 })} />
      )}
      <p role="status" className="text-sm font-bold text-ink">
        {focus ? `Next: ${moveName(focus)}` : 'All moves done. Check the cube on your computer, or here.'}
      </p>
      <div className="flex items-center justify-center gap-3">
        <IconButton label="Previous move" disabled={playback.index < 0} onClick={() => onControl({ action: 'seek', index: playback.index - 1 })}>
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
        <IconButton
          label={playback.playing ? 'Pause' : 'Play'}
          variant="primary"
          size="lg"
          disabled={!playback.playing && atEnd}
          onClick={() => onControl({ action: playback.playing ? 'pause' : 'play' })}
        >
          {playback.playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
        </IconButton>
        <IconButton label="Next move" disabled={atEnd} onClick={() => onControl({ action: 'seek', index: playback.index + 1 })}>
          <ChevronRight className="h-5 w-5" />
        </IconButton>
      </div>
      <BlockLink href="/solve" variant="primary" fullWidth icon={<ArrowRight aria-hidden className="h-4 w-4" />}>
        Solve on this phone
      </BlockLink>
    </Panel>
  );
}
