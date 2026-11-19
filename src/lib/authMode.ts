/**
 * Cubyntra - Auth Mode (server only)
 * Necookie Labs (c) 2026
 *
 * `CUBYNTRA_AUTH_MODE` picks how requests are authenticated (ADR-017):
 * - `local` (default): the laptop install. A loopback-only app token, one profile.
 * - `cloudflare-access`: hosted behind Cloudflare Tunnel + Access. Every API request carries a
 *   Cloudflare Access JWT in `Cf-Access-Jwt-Assertion`; the identity is its `email` claim.
 * - `passcode`: hosted without Access. A sign-in page takes a name and `CUBYNTRA_ACCESS_CODE`
 *   and sets a signed session cookie.
 *
 * Any other value is `invalid`: every guarded route refuses (fail closed) and `/api/health`
 * reports it, so a typo never silently falls back to the loopback-trusting local mode.
 */

/** Environment variables (a loose shape, so tests can pass plain objects). */
export type Env = Record<string, string | undefined>;

export type AuthMode = 'local' | 'cloudflare-access' | 'passcode';

export const AUTH_MODES: readonly AuthMode[] = ['local', 'cloudflare-access', 'passcode'];

export function authMode(env: Env = process.env): AuthMode | 'invalid' {
  const raw = (env.CUBYNTRA_AUTH_MODE ?? '').trim().toLowerCase();
  if (!raw) return 'local';
  return (AUTH_MODES as readonly string[]).includes(raw) ? (raw as AuthMode) : 'invalid';
}

/** True for the two hosted modes (and for `invalid`, which must never be treated as local). */
export function isHostedMode(env: Env = process.env): boolean {
  return authMode(env) !== 'local';
}

/** `CUBYNTRA_ALLOWED_EMAILS`, lower-cased; empty means "no extra allowlist". */
export function allowedEmails(env: Env = process.env): Set<string> {
  return new Set(
    (env.CUBYNTRA_ALLOWED_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}
