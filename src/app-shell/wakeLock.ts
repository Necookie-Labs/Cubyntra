/**
 * Cubyntra - Screen Wake Lock
 * Necookie Labs (c) 2026
 *
 * Keeps the phone's screen on while the student solves, so it does not dim between turns.
 * Feature-detected: browsers without the Screen Wake Lock API simply do nothing. The browser
 * releases the lock whenever the page is hidden, so it is taken again when the page becomes
 * visible.
 */

import { useEffect } from 'react';

/** The parts of `WakeLockSentinel` used here. */
interface Sentinel {
  released: boolean;
  release(): Promise<void>;
}

interface WakeLockApi {
  request(type: 'screen'): Promise<Sentinel>;
}

export interface WakeLockHandle {
  /** True when the browser offers the Screen Wake Lock API. */
  supported: boolean;
  /** Releases the lock and stops re-taking it. */
  release(): void;
}

function wakeLockApi(nav: Navigator | undefined): WakeLockApi | null {
  const api = (nav as (Navigator & { wakeLock?: WakeLockApi }) | undefined)?.wakeLock;
  return api && typeof api.request === 'function' ? api : null;
}

/**
 * Takes a screen wake lock now and again each time the document becomes visible, until
 * `release()` is called. Failures (low battery, a hidden page, a denied policy) are ignored:
 * the screen just dims as usual.
 */
export function keepScreenOn(doc: Document = document, nav: Navigator | undefined = globalThis.navigator): WakeLockHandle {
  const api = wakeLockApi(nav);
  if (!api) return { supported: false, release: () => {} };

  let sentinel: Sentinel | null = null;
  let active = true;

  const acquire = async () => {
    if (!active || doc.visibilityState !== 'visible') return;
    if (sentinel && !sentinel.released) return;
    try {
      const next = await api.request('screen');
      if (active) sentinel = next;
      else void next.release().catch(() => {});
    } catch {
      sentinel = null;
    }
  };

  const onVisibility = () => {
    if (doc.visibilityState === 'visible') void acquire();
  };

  doc.addEventListener('visibilitychange', onVisibility);
  void acquire();

  return {
    supported: true,
    release: () => {
      active = false;
      doc.removeEventListener('visibilitychange', onVisibility);
      const held = sentinel;
      sentinel = null;
      if (held && !held.released) void held.release().catch(() => {});
    },
  };
}

/** Keeps the screen on while `enabled` and the component is mounted. */
export function useWakeLock(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const handle = keepScreenOn();
    return () => handle.release();
  }, [enabled]);
}
