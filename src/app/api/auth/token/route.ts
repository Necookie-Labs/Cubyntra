/**
 * Cubyntra - App Token Route
 * GET /api/auth/token
 *
 * Local mode (default): returns `{ token }` (the per-install app secret) only to requests
 * addressed to a loopback host from the laptop itself; everything else gets 403. See
 * `src/lib/localAuth.ts` for how loopback is judged and its limits. The phone receives the token
 * through the pairing QR.
 *
 * Hosted modes (ADR-017): returns `{ token, user: { name }, mode }` to a signed-in user (Access
 * JWT or session cookie), where `token` is that user's own HMAC token. Loopback is never trusted
 * here: cloudflared connects from 127.0.0.1. 401 when not signed in.
 */

import { authMode } from '@/lib/authMode';
import { getAppSecret, isLoopbackRequest } from '@/lib/localAuth';
import { getRequestUser, userToken } from '@/lib/requestUser';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: Request) {
  const mode = authMode();
  if (mode === 'local') {
    if (!isLoopbackRequest(req)) {
      return Response.json({ error: 'The app token is only available on this computer' }, { status: 403 });
    }
    return Response.json({ token: getAppSecret() }, { headers: NO_STORE });
  }
  const user = await getRequestUser(req);
  if (!user) return Response.json({ error: 'Sign in first' }, { status: 401, headers: NO_STORE });
  return Response.json({ token: userToken(user), user: { name: user.name }, mode }, { headers: NO_STORE });
}
