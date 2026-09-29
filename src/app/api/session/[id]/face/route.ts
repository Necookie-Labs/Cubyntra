/**
 * Cubyntra - Face Capture Submission Route Handler
 * POST /api/session/[id]/face          phone submits a face photo (or legacy nine colors)
 * GET  /api/session/[id]/face?face=U   desktop fetches a stored photo for analysis
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/sync/sessionManager';
import { CapturedFacePayload } from '@/sync/types';
import {
  MAX_FACE_IMAGE_BODY_BYTES,
  isFace,
  isFaceImageBody,
  parseFaceImageBody,
} from '@/sync/validation';

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

  // Reject oversized bodies before buffering them when the client declares a length,
  // and again after reading in case the header was absent or wrong.
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_FACE_IMAGE_BODY_BYTES) {
    return NextResponse.json({ success: false, error: 'Photo too large' }, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > MAX_FACE_IMAGE_BODY_BYTES) {
      return NextResponse.json({ success: false, error: 'Photo too large' }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  if (isFaceImageBody(body)) {
    const parsed = parseFaceImageBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const updated = sessionManager.recordFaceImage(id, parsed.value);
    return NextResponse.json({ success: true, face: parsed.value.face, imageFaces: updated?.imageFaces ?? [] });
  }

  // Legacy path: nine pre-classified colors from older companion builds.
  const legacy = body as Partial<CapturedFacePayload>;
  if (!isFace(legacy.face)) {
    return NextResponse.json({ success: false, error: 'Invalid face identifier' }, { status: 400 });
  }
  if (!Array.isArray(legacy.stickers) || legacy.stickers.length !== 9) {
    return NextResponse.json({ success: false, error: 'Expected 9 stickers' }, { status: 400 });
  }

  const payload: CapturedFacePayload = {
    face: legacy.face,
    centerColor: legacy.centerColor || legacy.stickers[4],
    stickers: legacy.stickers,
    confidences: legacy.confidences || Array(9).fill(1.0),
    thumbnail: legacy.thumbnail,
    capturedAt: legacy.capturedAt || Date.now(),
  };

  const updatedSession = sessionManager.recordFace(id, payload);

  return NextResponse.json({
    success: true,
    isComplete: updatedSession?.isComplete ?? false,
    scannedFacesCount: Object.keys(updatedSession?.scannedFaces || {}).length,
    session: updatedSession,
  });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!sessionManager.getSession(id)) {
    return NextResponse.json({ success: false, error: 'Session not found or expired' }, { status: 404 });
  }

  const face = req.nextUrl.searchParams.get('face');
  if (!isFace(face)) {
    return NextResponse.json({ success: false, error: 'Invalid face identifier' }, { status: 400 });
  }

  const image = sessionManager.getFaceImage(id, face);
  if (!image) {
    return NextResponse.json({ success: false, error: 'No photo held for this face' }, { status: 404 });
  }

  return NextResponse.json(
    { success: true, image },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
