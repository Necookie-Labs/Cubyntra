/**
 * Cubyntra - Coach Status Route
 * GET /api/coach/status
 *
 * Header `x-cubyntra-token` must hold the app secret. Returns `CoachStatus`:
 * `{ mode: 'live' | 'mock' | 'capped', monthSpendUsd, capUsd, month }`.
 */

import { coachStatus } from '@/coach/service';
import { guardRequest } from '@/lib/localAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = guardRequest(req);
  if (denied) return denied;
  return Response.json(coachStatus(), { headers: { 'Cache-Control': 'no-store' } });
}
