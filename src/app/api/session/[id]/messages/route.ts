/**
 * Cubyntra - Sync Message Route Handler
 * POST /api/session/[id]/messages
 *
 * Either device posts one state message (`SyncMessageInput`, see `src/sync/types.ts`). The body is
 * read with a 16 KB streaming cap and validated field by field; unknown fields are dropped. The
 * server stamps the next sequence number and relays it on the event stream. Returns `{ seq }`.
 * 400 invalid, 403 wrong secret, 404 unknown session, 413 too large, 429 rate limited.
 */

import { readJsonCapped } from '@/lib/readBodyCapped';
import { sessionManager } from '@/sync/sessionManager';
import { guardSession, jsonError, messageLimiter, rateLimited } from '@/sync/server';
import { MAX_SYNC_BODY_BYTES } from '@/sync/types';
import { parseSyncMessage } from '@/sync/validation';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const denied = guardSession(req, id);
  if (denied) return denied;

  const limit = messageLimiter.hit(id);
  if (!limit.ok) return rateLimited(limit.retryAfterSec);

  const body = await readJsonCapped(req, MAX_SYNC_BODY_BYTES);
  if (!body.ok) return jsonError(body.status, body.error);

  const parsed = parseSyncMessage(body.value);
  if (!parsed.ok) return jsonError(400, parsed.error);

  const event = sessionManager.publish(id, parsed.value);
  if (!event) return jsonError(404, 'Session not found or expired');
  return Response.json({ success: true, seq: event.seq });
}
