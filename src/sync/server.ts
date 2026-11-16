/**
 * Cubyntra - Shared guards for the sync routes (server only)
 * Necookie Labs (c) 2026
 */

import { SlidingWindowLimiter } from '../lib/localAuth';
import { SESSION_SECRET_HEADER } from './pairing';
import { sessionManager } from './sessionManager';

/** Laptop session creation: generous, but stops a runaway loop. */
export const sessionCreateLimiter = new SlidingWindowLimiter(20, 60_000);
/** Typed-code attempts across all devices: guessing one of ~600 million codes stays hopeless. */
export const pairingCodeLimiter = new SlidingWindowLimiter(10, 60_000);
/** Messages per session; playback index reports arrive about twice a second. */
export const messageLimiter = new SlidingWindowLimiter(600, 60_000);

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
 * Checks the session secret header. Returns a ready error response (404 unknown session, 403
 * missing or wrong secret) or null when the request may proceed.
 */
export function guardSession(req: Request, id: string): Response | null {
  const result = sessionManager.authorize(id, req.headers.get(SESSION_SECRET_HEADER));
  if (result.ok) return null;
  return result.status === 404
    ? jsonError(404, 'Session not found or expired')
    : jsonError(403, 'Missing or wrong session secret');
}
