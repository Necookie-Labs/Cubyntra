/**
 * Cubyntra - Session Creation Route Handler
 * POST /api/session
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/sync/sessionManager';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const preferredId = typeof body?.preferredId === 'string' ? body.preferredId : undefined;
    const session = sessionManager.createSession(preferredId);

    // Determine host URL for QR code generation
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
    const proto = req.headers.get('x-forwarded-proto') || 'http';
    const companionUrl = `${proto}://${host}/companion?session=${session.id}`;

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      companionUrl,
      session,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create session' },
      { status: 500 }
    );
  }
}
