/**
 * Cubyntra - Request identity (server only)
 * Necookie Labs (c) 2026
 *
 * One identity layer for every guarded route (ADR-017):
 * - `local`: the user is always `local`; the loopback-only app token is the authentication,
 *   exactly as before.
 * - `cloudflare-access`: the verified `email` claim of the Access JWT. Loopback proves nothing
 *   (cloudflared connects from 127.0.0.1).
 * - `passcode`: the signed session cookie.
 * - `invalid` (an unknown `CUBYNTRA_AUTH_MODE`): nobody.
 *
 * In the hosted modes the client still sends `x-cubyntra-token`, now a per-user token (an HMAC
 * of the user id with the app secret, from `GET /api/auth/token`), and the server checks it
 * belongs to the user the request authenticates as. Rate limits are keyed by user.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { authMode, type AuthMode, type Env } from './authMode';
import { CF_ACCESS_HEADER, accessConfig, verifyAccessJwt } from './cfAccess';
import { SlidingWindowLimiter, getAppSecret, isValidAppToken, tokenFromRequest } from './localAuth';
import { sessionUserFromRequest } from './passcodeSession';

export interface RequestUser {
  id: string;
  name: string;
}

export const LOCAL_USER: RequestUser = Object.freeze({ id: 'local', name: 'Student' });

/** Who sent this request, or null when it is not authenticated. */
export async function getRequestUser(req: Request, env: Env = process.env): Promise<RequestUser | null> {
  switch (authMode(env)) {
    case 'local':
      return LOCAL_USER;
    case 'cloudflare-access': {
      const identity = await verifyAccessJwt(req.headers.get(CF_ACCESS_HEADER), accessConfig(env), env);
      if (!identity) return null;
      return { id: identity.email, name: identity.email.split('@')[0] };
    }
    case 'passcode':
      return sessionUserFromRequest(req);
    default:
      return null;
  }
}

/**
 * The `x-cubyntra-token` value for a user. Local mode: the app secret itself (unchanged). Hosted
 * modes: base64url HMAC-SHA256 of the user id, so one person's token never works for another.
 */
export function userToken(user: RequestUser, env: Env = process.env): string {
  if (authMode(env) === 'local') return getAppSecret();
  return createHmac('sha256', getAppSecret()).update(`cubyntra-user-token-v1:${user.id}`).digest('base64url');
}

function tokenMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b) && given.length === expected.length;
}

/** File-safe slug of a user id: `[a-z0-9-]`, at most 57 characters, never `.` or `/`. */
export const USER_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}-[0-9a-f]{8}$/;

/**
 * A slug for per-user files (`data/students/<slug>.json`). The readable part keeps letters and
 * digits only; an 8-hex hash of the full id keeps ids that read alike (a.b@x and a-b@x) apart.
 */
export function userSlug(id: string): string {
  const readable =
    id
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .replace(/-+$/, '') || 'user';
  const hash = createHash('sha256').update(id).digest('hex').slice(0, 8);
  const slug = `${readable}-${hash}`;
  if (!USER_SLUG_PATTERN.test(slug)) throw new Error('Unsafe user slug');
  return slug;
}

/** The profile slug for a user: none (the single `data/student.json`) in local mode. */
export function profileSlugFor(user: RequestUser, env: Env = process.env): string | undefined {
  return authMode(env) === 'local' ? undefined : userSlug(user.id);
}

export type GuardResult = { ok: true; user: RequestUser; mode: AuthMode } | { ok: false; response: Response };

const deny = (status: number, error: string, headers?: Record<string, string>): GuardResult => ({
  ok: false,
  response: Response.json({ error }, { status, headers }),
});

/**
 * Authenticates a request, checks its `x-cubyntra-token` belongs to that user and counts it
 * against `limiter` (per token in local mode, per user in the hosted modes).
 * 401 not signed in or wrong token, 429 over the limit.
 */
export async function guardUser(req: Request, limiter?: SlidingWindowLimiter, env: Env = process.env): Promise<GuardResult> {
  const mode = authMode(env);
  const token = tokenFromRequest(req);
  let user: RequestUser;
  let key: string;
  if (mode === 'local') {
    if (!isValidAppToken(token)) return deny(401, 'Missing or invalid app token');
    user = LOCAL_USER;
    key = token!;
  } else {
    const found = await getRequestUser(req, env);
    if (!found) return deny(401, 'Sign in first');
    if (!tokenMatches(token, userToken(found, env))) return deny(401, 'Missing or invalid app token');
    user = found;
    key = `user:${found.id}`;
  }
  if (limiter) {
    const { ok, retryAfterSec } = limiter.hit(key);
    if (!ok) return deny(429, 'Too many requests, please wait a moment', { 'Retry-After': String(retryAfterSec) });
  }
  return { ok: true, user, mode: mode as AuthMode };
}
