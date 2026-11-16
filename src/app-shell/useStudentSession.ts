'use client';

/**
 * Cubyntra - Student Session Bootstrap
 * Necookie Labs (c) 2026
 *
 * Run once by the app shell: fetches the app token, loads the student's profile, starts
 * catching the install prompt and applies the display settings that live outside React
 * (reduced motion on <html>).
 */

import { useEffect } from 'react';
import { useTutorStore } from '@/stores/useTutorStore';
import { getAppToken } from './appToken';
import { startInstallCapture } from './install';

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
    void (async () => {
      const token = await getAppToken();
      const store = useTutorStore.getState();
      store.setToken(token);
      await store.loadProfile();
    })();
  }, []);

  useEffect(() => applyMotionSetting(reducedMotion), [reducedMotion]);
}

/** Lets tests boot the session again. */
export function resetStudentSessionForTests(): void {
  started = false;
}
