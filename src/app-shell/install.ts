'use client';

/**
 * Cubyntra - Install to Home Screen
 * Necookie Labs (c) 2026
 *
 * Android Chrome fires `beforeinstallprompt` once, early, and only that event can open the
 * install dialog later; the app shell starts listening on first load and Settings offers the
 * button. iOS Safari has no such event: Settings shows the "Share, then Add to Home Screen"
 * hint instead. Nothing is shown once the app already runs installed (standalone).
 */

import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState =
  /** Running from the home screen already. */
  | 'installed'
  /** Android/desktop Chrome: the install dialog can be opened. */
  | 'promptable'
  /** iOS Safari: install by hand from the Share menu. */
  | 'ios'
  /** Neither: the browser installs from its own menu, if at all. */
  | 'unavailable';

let deferred: InstallPromptEvent | null = null;
let installed = false;
let listening = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Starts catching the install prompt. Safe to call more than once. */
export function startInstallCapture(win: Window = window): void {
  if (listening) return;
  listening = true;
  win.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  win.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export function isStandalone(win: Window = window): boolean {
  const nav = win.navigator as Navigator & { standalone?: boolean };
  return Boolean(win.matchMedia?.('(display-mode: standalone)').matches || nav.standalone);
}

export function isIosSafari(userAgent: string): boolean {
  const ios = /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && /Mobile/.test(userAgent));
  return ios && /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent);
}

export function installState(win: Window = window): InstallState {
  if (installed || isStandalone(win)) return 'installed';
  if (deferred) return 'promptable';
  if (isIosSafari(win.navigator.userAgent)) return 'ios';
  return 'unavailable';
}

/** Opens the browser's install dialog. Resolves true when the student accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === 'accepted';
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, () => installState(), () => 'unavailable');
}

/** Test hook: forget captured events. */
export function resetInstallForTests(): void {
  deferred = null;
  installed = false;
  listening = false;
  listeners.clear();
}
