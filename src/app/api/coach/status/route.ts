/**
 * Cubyntra - Coach Status Route
 * GET /api/coach/status
 *
 * Header `x-cubyntra-token` must hold the app secret. Returns `CoachStatus`:
 * `{ mode: 'live' | 'mock' | 'capped', monthSpendUsd, capUsd, month }`.
 */

import { coachStatus } from '@/coach/service';
import { guardUser } from '@/lib/requestUser';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const guard = await guardUser(req);
  if (!guard.ok) return guard.response;
  return Response.json(coachStatus(), { headers: { 'Cache-Control': 'no-store' } });
}
