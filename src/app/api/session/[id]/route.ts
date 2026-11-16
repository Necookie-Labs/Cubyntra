/**
 * Cubyntra - Session Inspection & Deletion Route Handler
 * GET    /api/session/[id]   the session snapshot (no secret, no images)
 * DELETE /api/session/[id]   ends the pairing; open streams receive `ended` and close
 *
 * Both require the session secret in `x-cubyntra-session`: 404 unknown session, 403 wrong secret.
 */

import { sessionManager } from '@/sync/sessionManager';
import { guardSession } from '@/sync/server';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(req: Request, context: Context) {
  const { id } = await context.params;
  const denied = guardSession(req, id);
  if (denied) return denied;
  return Response.json(
    { success: true, snapshot: sessionManager.snapshot(id) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function DELETE(req: Request, context: Context) {
  const { id } = await context.params;
  const denied = guardSession(req, id);
  if (denied) return denied;
  sessionManager.deleteSession(id);
  return Response.json({ success: true });
}
