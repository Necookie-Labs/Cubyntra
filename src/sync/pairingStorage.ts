/**
 * Cubyntra - Where the phone keeps its pairing (browser only)
 * Necookie Labs (c) 2026
 *
 * The QR link brings the session id, the session secret and the app token in the URL fragment.
 * On arrival they move into **sessionStorage** and the fragment is removed from the address bar
 * with `history.replaceState`, so they are not left in the URL, in history entries that could be
 * shared, or in a bookmark.
 *
 * Why sessionStorage: it survives a reload of the tab (a dropped Wi-Fi or a phone screen lock
 * must not lose the pairing) but is scoped to that one tab and cleared when the tab closes, so a
 * pairing does not outlive the lesson. It is never sent to a server. localStorage would keep the
 * app token on the phone indefinitely, which a single lesson does not need.
 */

import { isPairingCredentials, PairingCredentials, parsePairingFragment } from './pairingLink';

export const PAIRING_STORAGE_KEY = 'cubyntra.pairing';

type Win = Pick<Window, 'location' | 'history' | 'sessionStorage'>;

export function loadPairing(win: Win): PairingCredentials | null {
  try {
    const raw = win.sessionStorage.getItem(PAIRING_STORAGE_KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    return isPairingCredentials(value) ? value : null;
  } catch {
    return null;
  }
}

export function savePairing(win: Win, creds: PairingCredentials | null): void {
  try {
    if (creds) win.sessionStorage.setItem(PAIRING_STORAGE_KEY, JSON.stringify(creds));
    else win.sessionStorage.removeItem(PAIRING_STORAGE_KEY);
  } catch {
    // Private mode or storage disabled: the pairing still works until the tab reloads.
  }
}

/**
 * Takes credentials from the URL fragment (saving them and stripping the fragment), or falls
 * back to the ones saved earlier in this tab.
 */
export function takePairingFromLocation(win: Win): PairingCredentials | null {
  const hash = win.location.hash;
  if (hash && /(^#|&)(s|k|t)=/.test(hash)) {
    const fromLink = parsePairingFragment(hash);
    // Strip it even when malformed: a secret-looking fragment never stays in the address bar.
    win.history.replaceState(win.history.state, '', win.location.pathname + win.location.search);
    if (fromLink) {
      savePairing(win, fromLink);
      return fromLink;
    }
  }
  return loadPairing(win);
}

// A tiny external store so React can read the pairing without a hydration mismatch.
let current: PairingCredentials | null | undefined;
const listeners = new Set<() => void>();

export function subscribePairing(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPairingSnapshot(): PairingCredentials | null {
  if (current === undefined) current = takePairingFromLocation(window);
  return current;
}

export function getServerPairingSnapshot(): PairingCredentials | null {
  return null;
}

/** Replaces the pairing (after typing a code) or forgets it (`null`, when the session ended). */
export function setPairing(creds: PairingCredentials | null): void {
  current = creds;
  savePairing(window, creds);
  for (const listener of [...listeners]) listener();
}

/** Test helper. */
export function resetPairingStoreForTests(): void {
  current = undefined;
  listeners.clear();
}
