/**
 * Cubyntra - App Token (client)
 * Necookie Labs (c) 2026
 *
 * Routes that touch the student's data or cost money need the per-install app token in the
 * `x-cubyntra-token` header. The laptop's own browser gets it from `GET /api/auth/token`
 * (loopback only). A paired phone receives it through pairing (Phase 8), which stores it under
 * `APP_TOKEN_STORAGE_KEY` for this tab's origin.
 */

export const APP_TOKEN_HEADER = 'x-cubyntra-token';
export const APP_TOKEN_STORAGE_KEY = 'cubyntra.appToken';

let cached: Promise<string | null> | null = null;

function storedToken(): string | null {
  try {
    return window.localStorage.getItem(APP_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The app token, or null when this device has none (a phone that is not paired). */
export function getAppToken(fetcher: typeof fetch = fetch): Promise<string | null> {
  cached ??= (async () => {
    try {
      const res = await fetcher('/api/auth/token', { cache: 'no-store' });
      if (res.ok) {
        const body = (await res.json()) as { token?: unknown };
        if (typeof body.token === 'string' && body.token) return body.token;
      }
    } catch {
      // Offline or not served from this laptop: fall through to a paired token.
    }
    return storedToken();
  })();
  return cached;
}

/** Forgets the cached token (tests, or after pairing changes it). */
export function resetAppTokenCache(): void {
  cached = null;
}
