/**
 * Cubyntra - App Token (client)
 * Necookie Labs (c) 2026
 *
 * Routes that touch the student's data or cost money need the per-install app token in the
 * `x-cubyntra-token` header. There is one source of truth per device:
 * - the laptop's own browser asks `GET /api/auth/token` (answered on loopback only);
 * - a paired phone uses the token from its pairing (`t` in the QR link, or returned by the typed
 *   code), which Phase 8 keeps in **sessionStorage** under `cubyntra.pairing`
 *   (`src/sync/pairingStorage.ts`, ADR-015). Nothing else stores the token.
 */

import { loadPairing } from '@/sync/pairingStorage';

export const APP_TOKEN_HEADER = 'x-cubyntra-token';

let cached: Promise<string | null> | null = null;

/** The token from this tab's pairing, if the phone is paired. */
export function pairedToken(win: Window | undefined = typeof window === 'undefined' ? undefined : window): string | null {
  if (!win) return null;
  return loadPairing(win)?.token ?? null;
}

/**
 * The app token, or null when this device has none (a phone that is not paired yet). A laptop
 * token is cached; a missing one is not, so pairing later is picked up on the next call.
 */
export function getAppToken(fetcher: typeof fetch = fetch): Promise<string | null> {
  if (cached) return cached;
  const attempt = (async () => {
    try {
      const res = await fetcher('/api/auth/token', { cache: 'no-store' });
      if (res.ok) {
        const body = (await res.json()) as { token?: unknown };
        if (typeof body.token === 'string' && body.token) return body.token;
      }
    } catch {
      // Offline, or not served from this laptop: fall through to the pairing.
    }
    return null;
  })();
  const laptop = attempt.then((token) => {
    if (!token) cached = null;
    return token;
  });
  cached = laptop;
  return laptop.then((token) => token ?? pairedToken());
}

/** Forgets the cached token (tests, or after pairing changes it). */
export function resetAppTokenCache(): void {
  cached = null;
}
