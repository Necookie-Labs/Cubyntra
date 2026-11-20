'use client';

/**
 * Cubyntra - Voice for the full-solution walkthrough (ADR-016)
 * Necookie Labs (c) 2026
 *
 * While "Play all" runs, and only then, the voice says each stage as it starts and each move as
 * it turns, with the student's voice settings (off, device or ElevenLabs; words or notation).
 * Pausing or stopping cuts the voice. It follows the one-speaker rule: while a paired phone is
 * driving a solve, this device stays quiet. All lines are phrase-bank lines.
 */

import { useEffect, useRef } from 'react';
import type { PlaybackController, PlaybackSnapshot } from '@/three/playback';
import type { StepPlan } from '@/tutor/types';
import { useTutorStore } from '@/stores/useTutorStore';
import { useCompanion } from '@/sync/CompanionSyncProvider';
import { narratedMove, stageIntro } from '@/voice/narration';
import { useOneSpeaker } from '@/voice/useOneSpeaker';
import { useVoice } from '@/voice/useVoice';

export function useWalkthroughVoice(playback: PlaybackController | null, plan: StepPlan | null, active: boolean): void {
  const settings = useTutorStore((s) => s.profile.settings);
  const token = useTutorStore((s) => s.token);
  const isSpeaker = useOneSpeaker(useCompanion());
  // Off while not playing all: a line still queued is dropped when Play all pauses or stops.
  const voice = useVoice({ mode: settings.voiceMode, rate: settings.voiceRate, voiceId: settings.voiceId, quality: settings.voiceQuality, token, enabled: isSpeaker && active });

  const latest = useRef({ voice, moves: settings.voiceMoves, active });
  useEffect(() => {
    latest.current = { voice, moves: settings.voiceMoves, active };
  });
  const lastWasMove = useRef(false);
  const lastStage = useRef<string | null>(null);

  // Each step of Play all: a new stage is introduced; the first move waits for the intro.
  const stepKey = plan ? `${plan.stage}-${plan.stepIndex}-${plan.caseId}` : null;
  useEffect(() => {
    lastWasMove.current = false;
    if (!active) {
      lastStage.current = null;
      return;
    }
    if (!plan) return;
    const intro = stageIntro(lastStage.current, plan.stage, plan.stageName);
    lastStage.current = plan.stage;
    if (intro) latest.current.voice.say({ text: intro, kind: 'phrase' });
    // Only a new step or the start of Play all matters, not every new plan object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, active]);

  // Each move's name as it starts turning; the next move cuts the last one short.
  useEffect(() => {
    if (!playback) return;
    let prev: PlaybackSnapshot | null = playback.getSnapshot();
    return playback.subscribe((next) => {
      const line = narratedMove(prev, next, latest.current.moves);
      prev = next;
      if (!line || !latest.current.active) return;
      const item = { text: line, kind: 'phrase' as const };
      if (lastWasMove.current) latest.current.voice.replace(item);
      else latest.current.voice.say(item);
      lastWasMove.current = true;
    });
  }, [playback]);
}
