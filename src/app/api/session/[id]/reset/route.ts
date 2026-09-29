/**
 * Cubyntra - Session Reset Route Handler
 * POST /api/session/[id]/reset
 *
 * The phone's "Scan another cube": clears every face and photo, and tells the desktop to
 * start a fresh phone scan on the same pairing, so no new QR code is needed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/sync/sessionManager';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!sessionManager.resetSession(id, 'mobile')) {
    return NextResponse.json({ success: false, error: 'Session not found or expired' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
