'use client';

/**
 * Cubyntra - Settings: Voice (ADR-016)
 * Necookie Labs (c) 2026
 *
 * Who speaks (off, the device voice, ElevenLabs), how fast, and whether moves are said in words
 * or as letters, with a "Test voice" button and this month's ElevenLabs credits. ElevenLabs can
 * only be chosen when the laptop has a key; at 80% of the credits a notice says so, and at the
 * cap the device voice takes over until the next month.
 */

import React, { useSyncExternalStore } from 'react';
import { AlertTriangle, Volume2 } from 'lucide-react';
import { BlockButton, Chip, Panel, SegmentedControl } from '@/components/ui';
import { useTutorStore } from '@/stores/useTutorStore';
import { VOICE_RATES, type VoiceMode, type VoiceMoves, type VoiceRate } from '@/lib/studentProfile';
import { isDeviceVoiceAvailable } from '@/voice/deviceVoice';
import { LINES, movePhrase } from '@/voice/phrases';
import { parseMove } from '@/cube/transforms';
import { unlockAudio } from '@/voice/audioUnlock';
import { useVoice } from '@/voice/useVoice';
import { useVoiceStatus } from '@/voice/useVoiceStatus';
import type { VoiceStatus } from '@/voice/types';

const RATE_LABEL: Record<VoiceRate, string> = { 0.75: 'Slow', 1: 'Normal', 1.25: 'Fast' };

const MOVES_OPTIONS = [
  { value: 'words', label: 'In words' },
  { value: 'notation', label: 'As letters' },
] as const;

const noSubscribe = () => () => {};

const formatCredits = (n: number) => Math.round(n).toLocaleString('en-US');

function CreditsPanel({ status }: { status: VoiceStatus }) {
  const limit = Math.max(1, status.monthCredits + (status.remaining ?? 0));
  const share = Math.min(1, status.monthCredits / Math.max(1, Math.min(status.capCredits, limit)));
  const capped = status.reason === 'capped';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-bold text-ink">ElevenLabs credits this month</span>
        <span className="font-mono tabular-nums text-ink">
          {formatCredits(status.monthCredits)} of {formatCredits(status.capCredits)}
        </span>
      </div>
      <div
        role="meter"
        aria-label="ElevenLabs credits this month"
        aria-valuemin={0}
        aria-valuemax={status.capCredits}
        aria-valuenow={Math.round(status.monthCredits)}
        className="h-4 w-full border-2 border-line bg-well"
      >
        <div
          className={status.warning ? 'h-full bg-warn' : 'h-full bg-leaf'}
          style={{ width: `${Math.max(share > 0 ? 2 : 0, share * 100)}%` }}
        />
      </div>
      {status.remaining !== undefined && (
        <p className="text-xs text-muted">
          {formatCredits(status.remaining)} credits left
          {status.accountRemaining !== undefined && status.accountRemaining < status.capCredits - status.monthCredits
            ? ' (your ElevenLabs account has less than the cap allows).'
            : '.'}{' '}
          Step narration uses saved clips, so it is free after the first time.
        </p>
      )}
      {(status.warning || capped) && (
        <div role="status" className="flex items-start gap-2">
          <Chip tone="warn" icon={<AlertTriangle aria-hidden className="h-3 w-3" />}>
            {capped ? 'Cap reached' : '80% used'}
          </Chip>
          <p className="text-sm text-ink">
            {capped
              ? 'This month’s ElevenLabs credits are used up. The device voice speaks until the 1st.'
              : 'Most of this month’s ElevenLabs credits are used. At the cap the device voice takes over.'}
          </p>
        </div>
      )}
    </div>
  );
}

export function VoiceSettings() {
  const settings = useTutorStore((s) => s.profile.settings);
  const token = useTutorStore((s) => s.token);
  const updateSettings = useTutorStore((s) => s.updateSettings);
  const state = useVoiceStatus(token, settings.voiceMode);
  const deviceVoice = useSyncExternalStore(noSubscribe, isDeviceVoiceAvailable, () => true);
  const voice = useVoice({ mode: settings.voiceMode, rate: settings.voiceRate, voiceId: settings.voiceId, quality: settings.voiceQuality, token });

  const status = state.kind === 'ready' ? state.status : null;
  const keySet = status?.keySet ?? false;
  const modeOptions: { value: VoiceMode; label: string; disabled?: boolean }[] = [
    { value: 'off', label: 'Off' },
    { value: 'device', label: 'Device voice' },
    { value: 'elevenlabs', label: 'ElevenLabs', disabled: !keySet && settings.voiceMode !== 'elevenlabs' },
  ];

  const test = () => {
    unlockAudio();
    voice.replace(
      { text: LINES.testVoice, kind: 'phrase' },
      { text: movePhrase(parseMove('R'), settings.voiceMoves), kind: 'phrase' }
    );
    if (settings.voiceMode === 'elevenlabs') window.setTimeout(state.refresh, 1500);
  };

  let explanation: string;
  if (settings.voiceMode === 'off') explanation = 'The tutor does not speak. Turn the voice on here or with the speaker button on the solve screen.';
  else if (settings.voiceMode === 'device') explanation = 'The browser’s own voice: free, works offline, no key needed.';
  else if (status?.reason === 'no-key') explanation = 'No ElevenLabs key is set on this laptop, so the device voice speaks instead.';
  else if (status?.reason === 'capped') explanation = 'The credits are used up this month, so the device voice speaks instead.';
  else explanation = 'Step narration and checkpoints use ElevenLabs. Coach replies use the device voice unless you tap “Read with ElevenLabs”.';

  return (
    <Panel className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold text-ink">Voice</span>
        <SegmentedControl<VoiceMode>
          label="Voice"
          value={settings.voiceMode}
          options={modeOptions}
          onChange={(voiceMode) => updateSettings({ voiceMode })}
        />
        <p className="text-xs text-muted">{explanation}</p>
        {!keySet && (
          <p className="text-xs text-muted">
            {state.kind === 'offline'
              ? 'The laptop cannot be reached, so ElevenLabs cannot be chosen from this device.'
              : 'To use ElevenLabs, add ELEVENLABS_API_KEY to .env.local on the laptop and restart it.'}
          </p>
        )}
        {!deviceVoice && settings.voiceMode !== 'off' && (
          <p className="text-xs text-ink">This browser has no built-in voice, so only ElevenLabs can speak here.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold text-ink">Speed</span>
        <SegmentedControl<string>
          label="Speaking speed"
          value={String(settings.voiceRate)}
          options={VOICE_RATES.map((rate) => ({ value: String(rate), label: RATE_LABEL[rate] }))}
          onChange={(value) => updateSettings({ voiceRate: Number(value) as VoiceRate })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold text-ink">Moves</span>
        <SegmentedControl<VoiceMoves>
          label="Say moves"
          value={settings.voiceMoves}
          options={MOVES_OPTIONS}
          onChange={(voiceMoves) => updateSettings({ voiceMoves })}
        />
        <p className="text-xs text-muted">
          {settings.voiceMoves === 'words' ? 'For example “Turn the right side up”.' : 'For example “R prime”.'}
        </p>
      </div>

      <BlockButton
        className="self-start"
        disabled={settings.voiceMode === 'off'}
        onClick={test}
        icon={<Volume2 aria-hidden className="h-4 w-4" />}
      >
        Test voice
      </BlockButton>

      {status && status.keySet && <CreditsPanel status={status} />}
    </Panel>
  );
}
