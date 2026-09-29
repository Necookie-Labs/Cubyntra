/**
 * Cubyntra - Rescan Request Route Handler
 * POST /api/session/[id]/rescan
 *
 * Sent from the desktop review screen to send the phone back to a specific face.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/sync/sessionManager';
import { parseFaceBody } from '@/sync/validation';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!sessionManager.getSession(id)) {
    return NextResponse.json({ success: false, error: 'Session not found or expired' }, { status: 404 });
  }

  const parsed = parseFaceBody(await req.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
  }

  sessionManager.requestRescan(id, parsed.value);
  return NextResponse.json({ success: true });
}
