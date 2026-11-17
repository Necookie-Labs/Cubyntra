'use client';

/**
 * Cubyntra - Voice on the solve screen (ADR-016)
 * Necookie Labs (c) 2026
 *
 * Narrates the guided solve: a stage intro when a step opens a new stage, each move's name as
 * the twin plays it, and every checkpoint result (match and praise, show it again, the wrong
 * face, a mismatch). All of these are phrase-bank lines. A new step interrupts whatever is still
 * being said. When paired, only the device driving the solve speaks.
 *
 * The speaker button turns the voice off, or back on with the voice used last (the device voice
 * the first time); its tap is also the gesture that lets the browser play sound.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { PlaybackController, PlaybackSnapshot } from '@/three/playback';
import type { TutorSyncTarget } from '@/sync/useTutorSync';
import { useTutorStore } from '@/stores/useTutorStore';
import { faceToShowNext } from '@/app-shell/checkpointAdapter';
import type { VoiceMode, VoiceMoves } from '@/lib/studentProfile';
import { unlockAudio } from '@/voice/audioUnlock';
import { narratedMove, stageIntro } from '@/voice/narration';
import { LINES, checkpointLines } from '@/voice/phrases';
import { useOneSpeaker } from '@/voice/useOneSpeaker';
import { useVoice, type VoiceHandle } from '@/voice/useVoice';
import { askedFace } from './CheckpointSheet';

const LAST_MODE_KEY = 'cubyntra.voice.lastMode';

function lastOnMode(): VoiceMode {
  try {
    const saved = window.localStorage.getItem(LAST_MODE_KEY);
    return saved === 'elevenlabs' || saved === 'device' ? saved : 'device';
  } catch {
    return 'device';
  }
}

function rememberMode(mode: VoiceMode): void {
  try {
    window.localStorage.setItem(LAST_MODE_KEY, mode);
  } catch {
    // A remembered choice is a convenience; the device voice is used without it.
  }
}

export interface SolveVoice {
  voice: VoiceHandle;
  mode: VoiceMode;
  moves: VoiceMoves;
  /** The student has the voice on (whether or not this device is the one speaking). */
  on: boolean;
  /** This device is the paired speaker (always true unpaired). */
  isSpeaker: boolean;
  toggle: () => void;
}

export function useSolveVoice(target: TutorSyncTarget, playback: PlaybackController | null): SolveVoice {
  const settings = useTutorStore((s) => s.profile.settings);
  const token = useTutorStore((s) => s.token);
  const plan = useTutorStore((s) => s.plan);
  const updateSettings = useTutorStore((s) => s.updateSettings);
  const isSpeaker = useOneSpeaker(target);
  const voice = useVoice({ mode: settings.voiceMode, rate: settings.voiceRate, token, enabled: isSpeaker });
  const moves = settings.voiceMoves;

  // The latest values for the subscriptions below, which live as long as the playback.
  const latest = useRef({ voice, moves });
  useEffect(() => {
    latest.current = { voice, moves };
  });
  const lastWasMove = useRef(false);

  // A new step interrupts; a step that opens a new stage is introduced.
  const lastStage = useRef<string | null>(null);
  const stepKey = plan ? `${plan.method}-${plan.stepIndex}-${plan.caseId}` : null;
  useEffect(() => {
    const { voice: v } = latest.current;
    v.setStep(stepKey);
    lastWasMove.current = false;
    if (!plan) return;
    const intro = stageIntro(lastStage.current, plan.stage, plan.stageName);
    lastStage.current = plan.stage;
    if (intro) v.say({ text: intro, kind: 'phrase' });
    // Only a new step matters here, not every new plan object for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey]);

  // Each move's name as it starts turning; the next move cuts the last one short.
  useEffect(() => {
    if (!playback) return;
    let prev: PlaybackSnapshot | null = playback.getSnapshot();
    return playback.subscribe((next) => {
      const line = narratedMove(prev, next, latest.current.moves);
      prev = next;
      if (!line) return;
      const item = { text: line, kind: 'phrase' as const };
      if (lastWasMove.current) latest.current.voice.replace(item);
      else latest.current.voice.say(item);
      lastWasMove.current = true;
    });
  }, [playback]);

  // Checkpoint results and the solved cube.
  useEffect(
    () =>
      useTutorStore.subscribe((s, before) => {
        const v = latest.current.voice;
        if (s.phase === 'solved' && before.phase !== 'solved') {
          v.setStep('solved');
          v.say({ text: LINES.solved, kind: 'phrase' });
          return;
        }
        const outcome = s.checkpoint;
        if (!outcome || outcome === before.checkpoint || !s.plan) return;
        const status = outcome.result.status;
        const lines = checkpointLines({
          status,
          manual: outcome.result.manual,
          askFace: status === 'match' ? null : status === 'mismatch' ? faceToShowNext(outcome) : askedFace(s.plan, outcome),
          rotationUnclear: Boolean(outcome.result.rotationUnclear),
          oneMoreFace: Boolean(faceToShowNext(outcome)),
          praiseIndex: s.profile.stats.checkpointsPassed,
        });
        lastWasMove.current = false;
        v.replace(...lines.map((text) => ({ text, kind: 'phrase' as const })));
      }),
    []
  );

  const toggle = useCallback(() => {
    unlockAudio();
    const mode = useTutorStore.getState().profile.settings.voiceMode;
    if (mode === 'off') {
      updateSettings({ voiceMode: lastOnMode() });
    } else {
      rememberMode(mode);
      updateSettings({ voiceMode: 'off' });
    }
  }, [updateSettings]);

  return { voice, mode: settings.voiceMode, moves, on: settings.voiceMode !== 'off', isSpeaker, toggle };
}
