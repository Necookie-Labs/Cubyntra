/**
 * Cubyntra - Scan Confirmation Route Handler
 * POST /api/session/[id]/confirm
 *
 * The user confirmed all 54 stickers on the desktop. Photos are dropped from memory
 * and the phone is told the scan is complete.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/sync/sessionManager';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!sessionManager.confirmScan(id)) {
    return NextResponse.json({ success: false, error: 'Session not found or expired' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
