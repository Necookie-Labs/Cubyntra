'use client';

/**
 * Cubyntra - A voice for "Ask the coach" answers (ADR-016)
 * Necookie Labs (c) 2026
 *
 * For screens without a voice of their own for the coach (the walkthrough, whose voice only
 * narrates Play all, and the trainer): one speech queue with the student's voice settings. When
 * paired (`target`), only the device driving the solve speaks (one-speaker rule).
 */

import { useMemo } from 'react';
import type { TutorSyncTarget } from '@/sync/useTutorSync';
import { useTutorStore } from '@/stores/useTutorStore';
import { useOneSpeaker } from '@/voice/useOneSpeaker';
import { useVoice } from '@/voice/useVoice';
import type { ChatVoiceControls } from './CoachChat';

type SyncTarget = Pick<TutorSyncTarget, 'sessionId' | 'subscribe' | 'getClientId'>;

const NOT_PAIRED: SyncTarget = { sessionId: null, subscribe: () => () => {}, getClientId: () => '' };

export function useChatVoice(target: SyncTarget | null): ChatVoiceControls {
  const settings = useTutorStore((s) => s.profile.settings);
  const token = useTutorStore((s) => s.token);
  const isSpeaker = useOneSpeaker(target ?? NOT_PAIRED);
  const voice = useVoice({
    mode: settings.voiceMode,
    rate: settings.voiceRate,
    voiceId: settings.voiceId,
    quality: settings.voiceQuality,
    token,
    enabled: isSpeaker,
  });
  const on = settings.voiceMode !== 'off' && isSpeaker;
  const elevenlabs = settings.voiceMode === 'elevenlabs';
  const moves = settings.voiceMoves;
  return useMemo(
    () => ({ on, elevenlabs, moves, replace: (item) => voice.replace(item), interrupt: () => voice.interrupt() }),
    [on, elevenlabs, moves, voice]
  );
}
