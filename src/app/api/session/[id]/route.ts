/**
 * Cubyntra - Session Inspection & Deletion Route Handler
 * GET /api/session/[id]
 * DELETE /api/session/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/sync/sessionManager';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = sessionManager.getSession(id);

  if (!session) {
    return NextResponse.json({ success: false, error: 'Session not found or expired' }, { status: 404 });
  }

  return NextResponse.json({ success: true, session });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  sessionManager.deleteSession(id);
  return NextResponse.json({ success: true, message: 'Session deleted' });
}
