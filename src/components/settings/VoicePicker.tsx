'use client';

/**
 * Cubyntra - Settings: ElevenLabs voice picker (ADR-016)
 * Necookie Labs (c) 2026
 *
 * The curated stock voices (`src/voice/catalog.ts`), one block per voice with its name and a
 * short description, as a radiogroup: arrow keys move the choice and the group is one Tab stop.
 * When the laptop sets its own `ELEVENLABS_VOICE_ID`, it is offered too as "Laptop voice".
 */

import React, { useRef } from 'react';
import { CURATED_VOICES } from '@/voice/catalog';
import { cx } from '@/components/ui';

export interface VoicePickerProps {
  value: string;
  onChange: (voiceId: string) => void;
  /** The laptop's own `ELEVENLABS_VOICE_ID`, when it is not a curated voice. */
  laptopVoiceId?: string;
  disabled?: boolean;
}

export function VoicePicker({ value, onChange, laptopVoiceId, disabled }: VoicePickerProps) {
  const options = [
    ...CURATED_VOICES.map((v) => ({ id: v.id, name: v.name, description: v.description })),
    ...(laptopVoiceId ? [{ id: laptopVoiceId, name: 'Laptop voice', description: 'The voice set in .env.local on the laptop.' }] : []),
  ];
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(
    0,
    options.findIndex((o) => o.id === value)
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    if (!forward && !back) return;
    e.preventDefault();
    const next = (index + (forward ? 1 : -1) + options.length) % options.length;
    onChange(options[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="ElevenLabs voice" onKeyDown={onKeyDown} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((option, i) => {
        const active = i === index;
        return (
          <button
            key={option.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-describedby={`voice-${option.id}-desc`}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            data-variant={active ? 'primary' : 'secondary'}
            onClick={() => onChange(option.id)}
            className={cx('vx-block flex min-h-11 flex-col items-start gap-0.5 px-3 py-2 pb-3 text-left')}
          >
            <span className="text-sm font-bold">{option.name}</span>
            <span id={`voice-${option.id}-desc`} className="text-xs font-normal">
              {option.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
