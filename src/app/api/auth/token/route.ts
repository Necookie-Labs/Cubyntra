/**
 * Cubyntra - App Token Route
 * GET /api/auth/token
 *
 * Returns `{ token }` (the per-install app secret) only to requests addressed to a loopback
 * host from the laptop itself; everything else gets 403. See `src/lib/localAuth.ts` for how
 * loopback is judged and its limits. The phone receives the token through the pairing QR.
 */

import { getAppSecret, isLoopbackRequest } from '@/lib/localAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isLoopbackRequest(req)) {
    return Response.json({ error: 'The app token is only available on this computer' }, { status: 403 });
  }
  return Response.json({ token: getAppSecret() }, { headers: { 'Cache-Control': 'no-store' } });
}
