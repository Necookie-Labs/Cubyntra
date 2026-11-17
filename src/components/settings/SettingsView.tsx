'use client';

/**
 * Cubyntra - Settings
 * Necookie Labs (c) 2026
 *
 * Name, default method (and CFOP's last layer), how moves and stickers are shown, theme and motion, the voice, the coach's mode
 * and spend this month, and installing the app on a phone. Every change saves to the
 * student's profile on the laptop.
 */

import React, { useState, useSyncExternalStore } from 'react';
import { Download, Monitor, Moon, Share, Sun } from 'lucide-react';
import { BlockButton, Chip, Panel, SegmentedControl, StickerGrid, Switch } from '@/components/ui';
import { PageContainer, PageHeader, PageSection } from '@/components/shell/Page';
import { useTutorStore } from '@/stores/useTutorStore';
import { METHOD_IDS, METHOD_INFO } from '@/app-shell/methodInfo';
import { useCoachStatus } from '@/app-shell/useCoachStatus';
import { promptInstall, useInstallState } from '@/app-shell/install';
import { MAX_NAME_LENGTH, type ThemeSetting } from '@/lib/studentProfile';
import { THEME_CHANGE_EVENT, readThemePreference, setThemePreference, type ThemePreference } from '@/lib/theme';
import type { CoachMode } from '@/coach/types';
import type { LastLayerMode, MethodId } from '@/tutor/types';
import { VoiceSettings } from './VoiceSettings';

function subscribeTheme(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function NameField() {
  const saved = useTutorStore((s) => s.profile.name);
  const setName = useTutorStore((s) => s.setName);
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? saved;
  const commit = () => {
    if (draft !== null && draft.trim() !== saved) setName(draft.trim());
    setDraft(null);
  };
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="student-name" className="text-sm font-bold text-ink">
        Your name
      </label>
      <input
        id="student-name"
        value={value}
        maxLength={MAX_NAME_LENGTH}
        autoComplete="given-name"
        placeholder="So the coach can greet you"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        className="h-11 w-full max-w-sm border-2 border-line bg-well px-3 text-sm text-ink placeholder:text-muted lg:h-10"
      />
    </div>
  );
}

const MODE_TEXT: Record<CoachMode, { chip: string; tone: 'leaf' | 'warn' | 'neutral'; body: string }> = {
  live: { chip: 'Live', tone: 'leaf', body: 'Claude explains each step in plain words.' },
  mock: {
    chip: 'Templates only',
    tone: 'neutral',
    body: 'No API key is set on this laptop, so the coach uses its built-in notes. Every step still has them.',
  },
  capped: {
    chip: 'Monthly cap reached',
    tone: 'warn',
    body: 'This month’s budget is used up. The built-in notes keep working until the 1st.',
  },
};

function CoachStatusPanel() {
  const token = useTutorStore((s) => s.token);
  const state = useCoachStatus(token);
  if (state.kind === 'loading') {
    return (
      <Panel tone="well" role="status">
        <p className="text-sm text-muted">Checking the coach…</p>
      </Panel>
    );
  }
  if (state.kind === 'offline') {
    return (
      <Panel tone="well" className="flex flex-col gap-2">
        <Chip className="w-fit">Offline</Chip>
        <p className="text-sm text-ink">
          The coach cannot be reached from this device. The built-in notes for every step still work.
        </p>
      </Panel>
    );
  }
  const { status } = state;
  const text = MODE_TEXT[status.mode];
  const share = Math.min(1, status.capUsd > 0 ? status.monthSpendUsd / status.capUsd : 0);
  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chip tone={text.tone}>{text.chip}</Chip>
        <span className="font-mono text-xs text-muted">{status.month}</span>
      </div>
      <p className="text-sm text-ink">{text.body}</p>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-bold text-ink">Spent this month</span>
          <span className="font-mono tabular-nums text-ink">
            ${status.monthSpendUsd.toFixed(2)} of ${status.capUsd.toFixed(2)}
          </span>
        </div>
        <div
          role="meter"
          aria-label="Coach spend this month"
          aria-valuemin={0}
          aria-valuemax={status.capUsd}
          aria-valuenow={Number(status.monthSpendUsd.toFixed(2))}
          className="h-4 w-full border-2 border-line bg-well"
        >
          <div
            className={share >= 1 ? 'h-full bg-warn' : 'h-full bg-leaf'}
            style={{ width: `${Math.max(share > 0 ? 2 : 0, share * 100)}%` }}
          />
        </div>
      </div>
    </Panel>
  );
}

function InstallPanel() {
  const state = useInstallState();
  const [declined, setDeclined] = useState(false);
  if (state === 'installed') {
    return (
      <Panel tone="well">
        <p className="text-sm text-ink">Installed. Cubyntra opens from your home screen like an app.</p>
      </Panel>
    );
  }
  if (state === 'promptable') {
    return (
      <Panel className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink">Add Cubyntra to this device’s home screen. It opens full screen.</p>
        <BlockButton
          variant="primary"
          icon={<Download aria-hidden className="h-4 w-4" />}
          onClick={async () => setDeclined(!(await promptInstall()))}
        >
          Install
        </BlockButton>
      </Panel>
    );
  }
  if (state === 'ios') {
    return (
      <Panel className="flex items-start gap-3">
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-line bg-well">
          <Share className="h-4 w-4" />
        </span>
        <p className="text-sm text-ink">
          In Safari, tap <span className="font-bold">Share</span>, then <span className="font-bold">Add to Home Screen</span>.
        </p>
      </Panel>
    );
  }
  return (
    <Panel tone="well">
      <p className="text-sm text-ink">
        {declined
          ? 'No problem. You can install later from the browser menu.'
          : 'On a phone, open this page in Chrome (Android) or Safari (iPhone) to add it to the home screen.'}
      </p>
    </Panel>
  );
}

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: <Sun aria-hidden className="h-4 w-4" /> },
  { value: 'dark', label: 'Dark', icon: <Moon aria-hidden className="h-4 w-4" /> },
  { value: 'system', label: 'System', icon: <Monitor aria-hidden className="h-4 w-4" /> },
] as const;

const LAST_LAYER_OPTIONS = [
  { value: '2-look', label: '2-look' },
  { value: 'full', label: 'Full OLL and PLL' },
] as const;

const SAMPLE_FACE =['green', 'white', 'red', 'orange', 'blue', 'yellow', 'red', 'green', 'white'] as const;

export function SettingsView() {
  const settings = useTutorStore((s) => s.profile.settings);
  const profileStatus = useTutorStore((s) => s.profileStatus);
  const updateSettings = useTutorStore((s) => s.updateSettings);
  const theme = useSyncExternalStore(subscribeTheme, readThemePreference, () => 'system' as ThemePreference);

  const setTheme = (value: ThemeSetting) => {
    setThemePreference(value);
    updateSettings({ theme: value });
  };

  return (
    <PageContainer width="md" className="gap-10">
      <PageHeader
        title="Settings"
        lede={
          profileStatus === 'unsaved'
            ? 'Changes apply on this device for now. Pair it with the laptop to keep them.'
            : 'Changes are saved on this laptop straight away.'
        }
      />

      <PageSection title="You">
        <Panel className="flex flex-col gap-6">
          <NameField />
          <div className="flex flex-col gap-2">
            <span id="method-default-label" className="text-sm font-bold text-ink">
              Method to start with
            </span>
            <SegmentedControl<MethodId>
              label="Method to start with"
              value={settings.methodDefault}
              options={METHOD_IDS.map((id) => ({ value: id, label: METHOD_INFO[id].name }))}
              onChange={(methodDefault) => updateSettings({ methodDefault })}
            />
          </div>
          {settings.methodDefault === 'cfop' && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-bold text-ink">CFOP last layer</span>
              <SegmentedControl<LastLayerMode>
                label="CFOP last layer"
                value={settings.lastLayer}
                options={LAST_LAYER_OPTIONS}
                onChange={(lastLayer) => updateSettings({ lastLayer })}
              />
              <p className="text-xs text-muted">
                {settings.lastLayer === 'full'
                  ? 'One OLL step and one PLL step: 57 and 21 cases. Practise them in the trainer.'
                  : 'Four short steps with 16 cases in all. The way CFOP is first taught.'}
              </p>
            </div>
          )}
        </Panel>
      </PageSection>

      <PageSection title="Moves and stickers">
        <Panel className="flex flex-col gap-6">
          <Switch
            label="Moves in words"
            hint="Show “turn the right side up” as well as R."
            checked={settings.plainLanguage}
            onChange={(plainLanguage) => updateSettings({ plainLanguage })}
          />
          <div className="flex flex-col gap-3">
            <Switch
              label="Letters on stickers"
              hint="For telling colors apart: W Y R O B G on the twin and in every sticker grid."
              checked={settings.stickerLetters}
              onChange={(stickerLetters) => updateSettings({ stickerLetters })}
            />
            <StickerGrid tiles={SAMPLE_FACE} label="Preview" letters={settings.stickerLetters} className="self-start" />
          </div>
        </Panel>
      </PageSection>

      <PageSection title="Display">
        <Panel className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold text-ink">Theme</span>
            <SegmentedControl<ThemeSetting> label="Theme" value={theme} options={THEME_OPTIONS} onChange={setTheme} />
          </div>
          <Switch
            label="Reduce motion"
            hint="Keep animations to a minimum, whatever the device setting says."
            checked={settings.reducedMotion}
            onChange={(reducedMotion) => updateSettings({ reducedMotion })}
          />
        </Panel>
      </PageSection>

      <PageSection title="Voice">
        <VoiceSettings />
      </PageSection>

      <PageSection title="Coach">
        <CoachStatusPanel />
      </PageSection>

      <PageSection title="Install">
        <InstallPanel />
      </PageSection>
    </PageContainer>
  );
}
