/**
 * Cubyntra - Typed Pairing Code Route Handler
 * POST /api/session/pair
 *
 * For when the phone cannot scan the QR code. Body `{ "code": "ABC-DEF" }` (at most 1 KB).
 * Returns `{ sessionId, secret, token }`, the same credentials the QR carries. A code works once
 * and for ten minutes. Attempts are limited to 10 per minute across all devices.
 * 400 bad body, 404 unknown/used/expired code, 413 too large, 429 rate limited.
 */

import { getPairingToken } from '@/lib/localAuth';
import { readJsonCapped } from '@/lib/readBodyCapped';
import { isPairingCode, normalizePairingCode } from '@/sync/pairingCode';
import { sessionManager } from '@/sync/sessionManager';
import { jsonError, pairingCodeLimiter, rateLimited } from '@/sync/server';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 1024;

export async function POST(req: Request) {
  const limit = pairingCodeLimiter.hit('pair');
  if (!limit.ok) return rateLimited(limit.retryAfterSec);

  const body = await readJsonCapped(req, MAX_BODY_BYTES);
  if (!body.ok) return jsonError(body.status, body.error);

  const raw = (body.value as { code?: unknown } | null)?.code;
  const code = typeof raw === 'string' ? normalizePairingCode(raw) : '';
  if (!isPairingCode(code)) return jsonError(400, 'A pairing code is six letters and numbers');

  const claimed = sessionManager.claimCode(code);
  if (!claimed) return jsonError(404, 'That code is not right, or it has expired. Check the code on your computer.');

  return Response.json(
    { success: true, sessionId: claimed.sessionId, secret: claimed.secret, token: getPairingToken() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
