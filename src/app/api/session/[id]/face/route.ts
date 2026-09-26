/**
 * Cubyntra - Face Capture Submission Route Handler
 * POST /api/session/[id]/face
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/sync/sessionManager';
import { CapturedFacePayload } from '@/sync/types';
import { FACES } from '@/cube/constants';
import { Face } from '@/cube/types';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = sessionManager.getSession(id);

  if (!session) {
    return NextResponse.json({ success: false, error: 'Session not found or expired' }, { status: 404 });
  }

  try {
    const body = (await req.json()) as Partial<CapturedFacePayload>;

    if (!body.face || !FACES.includes(body.face as Face)) {
      return NextResponse.json({ success: false, error: 'Invalid face identifier' }, { status: 400 });
    }

    if (!Array.isArray(body.stickers) || body.stickers.length !== 9) {
      return NextResponse.json({ success: false, error: 'Expected 9 stickers' }, { status: 400 });
    }

    const payload: CapturedFacePayload = {
      face: body.face as Face,
      centerColor: body.centerColor || body.stickers[4],
      stickers: body.stickers,
      confidences: body.confidences || Array(9).fill(1.0),
      thumbnail: body.thumbnail,
      capturedAt: body.capturedAt || Date.now(),
    };

    const updatedSession = sessionManager.recordFace(id, payload);

    return NextResponse.json({
      success: true,
      isComplete: updatedSession?.isComplete ?? false,
      scannedFacesCount: Object.keys(updatedSession?.scannedFaces || {}).length,
      session: updatedSession,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Invalid request body' },
      { status: 400 }
    );
  }
}
