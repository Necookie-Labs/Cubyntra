/**
 * Cubyntra - Sign-Out Route (ADR-017)
 * POST /api/auth/signout
 *
 * Clears the `cubyntra_session` cookie (passcode mode). Always 200: signing out twice, or in a
 * mode without the cookie, is harmless. In `cloudflare-access` mode the client signs out of
 * Access itself at `/cdn-cgi/access/logout`.
 */

import { clearSessionCookieHeader } from '@/lib/passcodeSession';

export const dynamic = 'force-dynamic';

export async function POST() {
  return Response.json(
    { ok: true },
    { headers: { 'Set-Cookie': clearSessionCookieHeader(), 'Cache-Control': 'no-store' } }
  );
}
