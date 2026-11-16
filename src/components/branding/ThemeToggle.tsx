'use client';

/**
 * Cubyntra - Theme Switch
 * Necookie Labs (c) 2026
 *
 * Cycles Light -> Dark -> System. System follows the OS setting, including live changes.
 */

import React, { useEffect, useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  ThemePreference,
  applyTheme,
  readThemePreference,
  setThemePreference,
} from '@/lib/theme';
import { IconButton } from '@/components/ui';

const NEXT: Record<ThemePreference, ThemePreference> = { light: 'dark', dark: 'system', system: 'light' };
const LABEL: Record<ThemePreference, string> = { light: 'Light', dark: 'Dark', system: 'System' };

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) {
      applyTheme(readThemePreference());
      onChange();
    }
  };
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage); // another tab changed it
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export const ThemeToggle: React.FC = () => {
  // The server has no stored preference; it renders "System" and the client corrects it.
  const pref = useSyncExternalStore(subscribe, readThemePreference, () => 'system' as ThemePreference);

  // While following the OS, re-apply when the OS switches between light and dark.
  useEffect(() => {
    if (pref !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [pref]);

  const next = NEXT[pref];
  const Icon = pref === 'light' ? Sun : pref === 'dark' ? Moon : Monitor;

  return (
    <IconButton
      size="sm"
      onClick={() => setThemePreference(next)}
      label={`Theme: ${LABEL[pref]}. Switch to ${LABEL[next]}.`}
      title={`Theme: ${LABEL[pref]} (click for ${LABEL[next]})`}
    >
      <Icon className="w-4 h-4" />
    </IconButton>
  );
};
