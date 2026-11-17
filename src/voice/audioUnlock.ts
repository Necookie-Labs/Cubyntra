/**
 * Cubyntra - Audio unlock (browser, ADR-016)
 * Necookie Labs (c) 2026
 *
 * Browsers block sound until the page has had a user gesture, and the tutor must never try to
 * talk before one. The first tap, click or key press on the page unlocks the voice for the rest
 * of the page's life; until then every line is dropped, not queued.
 */

let unlocked = false;
let installed = false;
const listeners = new Set<() => void>();

const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;

function onGesture() {
  unlockAudio();
}

/** True once the page has had a user gesture. */
export function isAudioUnlocked(): boolean {
  return unlocked;
}

/** Marks the voice as unlocked (called from a gesture). */
export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
  if (typeof window !== 'undefined') {
    for (const type of GESTURES) window.removeEventListener(type, onGesture, true);
  }
  for (const listener of [...listeners]) listener();
}

/** Watches for the first gesture (once per page). Safe to call many times and on the server. */
export function installAudioUnlock(): void {
  if (installed || unlocked || typeof window === 'undefined') return;
  installed = true;
  for (const type of GESTURES) window.addEventListener(type, onGesture, { capture: true, passive: true });
}

/** Calls `listener` when the voice unlocks. Returns the unsubscribe. */
export function onAudioUnlock(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test hook: lock again. */
export function resetAudioUnlockForTests(): void {
  unlocked = false;
  installed = false;
  if (typeof window !== 'undefined') {
    for (const type of GESTURES) window.removeEventListener(type, onGesture, true);
  }
}
