/**
 * Cubyntra - Face Verdict Route Handler
 * POST /api/session/[id]/verdict
 *
 * The desktop reports whether a face photo was usable; the phone hears it over SSE.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/sync/sessionManager';
import { parseVerdictBody } from '@/sync/validation';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!sessionManager.getSession(id)) {
    return NextResponse.json({ success: false, error: 'Session not found or expired' }, { status: 404 });
  }

  const parsed = parseVerdictBody(await req.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
  }

  const session = sessionManager.recordVerdict(id, parsed.value);
  return NextResponse.json({ success: true, isComplete: session?.isComplete ?? false });
}
