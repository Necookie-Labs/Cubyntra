/**
 * Cubyntra - Typed Pairing Code Route Handler
 * POST /api/session/pair
 *
 * For when the phone cannot scan the QR code. Body `{ "code": "ABC-DEF" }` (at most 1 KB).
 * Returns `{ sessionId, secret, token }`, the same credentials the QR carries. A code works once
 * and for ten minutes. Attempts are limited to 10 per minute across all devices (per user in the
 * hosted modes, where only the signed-in user's own sessions can be claimed and the returned
 * token is that user's, ADR-017).
 * 401 not signed in (hosted modes),
 * 400 bad body, 404 unknown/used/expired code, 413 too large, 429 rate limited.
 */

import { readJsonCapped } from '@/lib/readBodyCapped';
import { userToken } from '@/lib/requestUser';
import { isPairingCode, normalizePairingCode } from '@/sync/pairingCode';
import { sessionManager } from '@/sync/sessionManager';
import { jsonError, pairingCodeLimiter, rateLimited, sessionOwner } from '@/sync/server';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 1024;

export async function POST(req: Request) {
  const owner = await sessionOwner(req);
  if (!owner) return jsonError(401, 'Sign in first');
  const limit = pairingCodeLimiter.hit(`pair:${owner.id}`);
  if (!limit.ok) return rateLimited(limit.retryAfterSec);

  const body = await readJsonCapped(req, MAX_BODY_BYTES);
  if (!body.ok) return jsonError(body.status, body.error);

  const raw = (body.value as { code?: unknown } | null)?.code;
  const code = typeof raw === 'string' ? normalizePairingCode(raw) : '';
  if (!isPairingCode(code)) return jsonError(400, 'A pairing code is six letters and numbers');

  const claimed = sessionManager.claimCode(code, Date.now(), owner.id);
  if (!claimed) return jsonError(404, 'That code is not right, or it has expired. Check the code on your computer.');

  return Response.json(
    { success: true, sessionId: claimed.sessionId, secret: claimed.secret, token: userToken(owner) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
