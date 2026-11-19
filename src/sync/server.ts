/**
 * Cubyntra - Shared guards for the sync routes (server only)
 * Necookie Labs (c) 2026
 */

import { authMode } from '../lib/authMode';
import { SlidingWindowLimiter } from '../lib/localAuth';
import { getRequestUser, type RequestUser } from '../lib/requestUser';

// The pairing link's origin when hosted (ADR-017); lives with the proxy's helpers.
export { publicOrigin } from '../lib/hostedHeaders';
import { SESSION_SECRET_HEADER } from './pairing';
import { LOCAL_OWNER, sessionManager } from './sessionManager';

/** Laptop session creation: generous, but stops a runaway loop. */
export const sessionCreateLimiter = new SlidingWindowLimiter(20, 60_000);
/**
 * Typed-code attempts across all devices (per user in the hosted modes): guessing one of ~600
 * million codes stays hopeless.
 */
export const pairingCodeLimiter = new SlidingWindowLimiter(10, 60_000);
/** Messages per session; playback index reports arrive about twice a second. */
export const messageLimiter = new SlidingWindowLimiter(600, 60_000);

// A deleted session's message count is dropped with it.
sessionManager.setDeleteHook('message-limiter', (id) => messageLimiter.forget(id));

export function resetSyncLimitersForTests(): void {
  sessionCreateLimiter.reset();
  pairingCodeLimiter.reset();
  messageLimiter.reset();
}

export function jsonError(status: number, error: string, headers?: Record<string, string>): Response {
  return Response.json({ success: false, error }, { status, headers });
}

export function rateLimited(retryAfterSec: number): Response {
  return jsonError(429, 'Too many requests, please wait a moment', { 'Retry-After': String(retryAfterSec) });
}

/**
 * Who owns sessions made by this request: `local` in local mode; the signed-in user in the
 * hosted modes (null when nobody is signed in, ADR-017).
 */
export async function sessionOwner(req: Request): Promise<RequestUser | null> {
  if (authMode() === 'local') return { id: LOCAL_OWNER, name: 'Student' };
  return getRequestUser(req);
}

/**
 * Checks the requester and the session secret header. Returns a ready error response (401 not
 * signed in, 404 unknown session or another user's, 403 missing or wrong secret) or null when
 * the request may proceed.
 */
export async function guardSession(req: Request, id: string): Promise<Response | null> {
  const owner = await sessionOwner(req);
  if (!owner) return jsonError(401, 'Sign in first');
  const result = sessionManager.authorize(id, req.headers.get(SESSION_SECRET_HEADER), owner.id);
  if (result.ok) return null;
  return result.status === 404
    ? jsonError(404, 'Session not found or expired')
    : jsonError(403, 'Missing or wrong session secret');
}
