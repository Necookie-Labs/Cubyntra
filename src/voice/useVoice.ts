'use client';

/**
 * Cubyntra - useVoice (client hook, ADR-016)
 * Necookie Labs (c) 2026
 *
 * One speech queue for a screen, speaking through the fallback chain for the student's voice
 * setting (ElevenLabs, then the device voice, or off). Lines are dropped, not queued, while the
 * voice is off, while another paired device is the speaker (`enabled` false), and before the
 * page's first user gesture (browsers block sound until then). Leaving the screen stops it.
 */

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { VoiceMode } from '../lib/studentProfile';
import { installAudioUnlock, isAudioUnlocked, onAudioUnlock } from './audioUnlock';
import { createDeviceSpeaker } from './deviceVoice';
import { createElevenLabsSpeaker, createVoiceSpeaker } from './elevenLabsSpeaker';
import { SILENT_SPEAKER, SpeechQueue, type Speaker, type SpeechItem } from './speechQueue';

export interface UseVoiceOptions {
  mode: VoiceMode;
  rate: number;
  token: string | null;
  /** False while another paired device is the one speaking. Default true. */
  enabled?: boolean;
  /** Builds the speaker (tests pass a fake). */
  createSpeaker?: (mode: VoiceMode, rate: number, token: string | null) => Speaker;
}

export interface VoiceHandle {
  /** The voice is on, this device speaks, and the page has had a gesture. */
  active: boolean;
  /** Adds lines after whatever is being said. */
  say: (...items: SpeechItem[]) => void;
  /** Stops what is being said and says these lines instead. */
  replace: (...items: SpeechItem[]) => void;
  /** The step on screen: a different one stops the voice and drops what was waiting. */
  setStep: (key: string | null) => void;
  interrupt: () => void;
}

export function defaultSpeaker(mode: VoiceMode, rate: number, token: string | null): Speaker {
  if (mode === 'off') return SILENT_SPEAKER;
  return createVoiceSpeaker({
    mode,
    device: createDeviceSpeaker({ rate }),
    elevenlabs: createElevenLabsSpeaker({ token, rate }),
  });
}

const subscribeUnlock = (onChange: () => void) => onAudioUnlock(onChange);

export function useVoice({ mode, rate, token, enabled = true, createSpeaker = defaultSpeaker }: UseVoiceOptions): VoiceHandle {
  const queueRef = useRef<SpeechQueue | null>(null);
  queueRef.current ??= new SpeechQueue(SILENT_SPEAKER);
  const unlocked = useSyncExternalStore(subscribeUnlock, isAudioUnlocked, () => false);
  const active = mode !== 'off' && enabled && unlocked;

  useEffect(() => {
    installAudioUnlock();
  }, []);

  useEffect(() => {
    if (!active) queueRef.current?.interrupt();
  }, [active]);

  const createRef = useRef(createSpeaker);
  useEffect(() => {
    createRef.current = createSpeaker;
  });
  useEffect(() => {
    queueRef.current?.setSpeaker(createRef.current(mode, rate, token));
  }, [mode, rate, token]);

  useEffect(() => () => queueRef.current?.interrupt(), []);

  const on = mode !== 'off' && enabled;
  return useMemo<VoiceHandle>(() => {
    const queue = () => queueRef.current!;
    // Unlock is read when a line comes, so a line said from the unlocking tap itself is heard.
    const may = () => on && isAudioUnlocked();
    return {
      active,
      say: (...items) => {
        if (may()) queue().say(...items);
      },
      replace: (...items) => {
        if (may()) queue().replace(...items);
      },
      setStep: (key) => {
        queue().setStep(key);
      },
      interrupt: () => queue().interrupt(),
    };
  }, [active, on]);
}
