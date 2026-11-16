'use client';

/**
 * Cubyntra - Student Session Bootstrap
 * Necookie Labs (c) 2026
 *
 * Run once by the app shell: fetches the app token (the laptop's, or a paired phone's from its
 * pairing), loads the student's profile, starts
 * catching the install prompt and applies the display settings that live outside React
 * (reduced motion on <html>).
 */

import { useEffect } from 'react';
import { useTutorStore } from '@/stores/useTutorStore';
import { getAppToken } from './appToken';
import { startInstallCapture } from './install';
import { getPairingSnapshot, subscribePairing } from '@/sync/pairingStorage';

/** `data-motion="reduce"` on <html> cuts animations like the OS setting does (globals.css). */
export function applyMotionSetting(reduce: boolean, root: HTMLElement = document.documentElement): void {
  if (reduce) root.dataset.motion = 'reduce';
  else delete root.dataset.motion;
}

let started = false;

export function useStudentSession(): void {
  const reducedMotion = useTutorStore((s) => s.profile.settings.reducedMotion);

  useEffect(() => {
    startInstallCapture();
    if (started) return;
    started = true;
    const refresh = async () => {
      const token = await getAppToken();
      const store = useTutorStore.getState();
      if (token === store.token && store.profileStatus !== 'idle') return;
      store.setToken(token);
      await store.loadProfile();
    };
    // A QR link's credentials move from the address bar into sessionStorage first (ADR-015).
    getPairingSnapshot();
    void refresh();
    // Pairing by typed code (or the pairing ending) changes the phone's token.
    subscribePairing(() => void refresh());
  }, []);

  useEffect(() => applyMotionSetting(reducedMotion), [reducedMotion]);
}

/** Lets tests boot the session again. */
export function resetStudentSessionForTests(): void {
  started = false;
}
