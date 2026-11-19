/**
 * Cubyntra - Passcode Sign-In Route (ADR-017)
 * POST /api/auth/signin
 *
 * Only in `passcode` mode (404 otherwise). Body `{ "name": string, "code": string }` (at most
 * 1 KB). The code is compared with `CUBYNTRA_ACCESS_CODE` in constant time; attempts are limited
 * to 10 a minute across everyone. Success sets the signed `cubyntra_session` cookie (HttpOnly,
 * Secure, SameSite=Lax, 7 days) and returns `{ ok: true, user: { name } }`.
 * 400 bad body or name, 401 wrong code, 413 too large, 429 rate limited.
 */

import { authMode } from '@/lib/authMode';
import {
  checkAccessCode,
  createSessionValue,
  sessionCookieHeader,
  signInLimiter,
  userFromName,
} from '@/lib/passcodeSession';
import { readJsonCapped } from '@/lib/readBodyCapped';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 1024;
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(req: Request) {
  if (authMode() !== 'passcode') return Response.json({ error: 'Not found' }, { status: 404 });

  const limit = signInLimiter.hit('signin');
  if (!limit.ok) {
    return Response.json(
      { error: 'Too many tries. Wait a minute and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec), ...NO_STORE } }
    );
  }

  const body = await readJsonCapped(req, MAX_BODY_BYTES);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status, headers: NO_STORE });
  const { name, code } = (body.value ?? {}) as { name?: unknown; code?: unknown };

  const user = userFromName(name);
  if (!user) return Response.json({ error: 'Type your name (letters or numbers, up to 40)' }, { status: 400, headers: NO_STORE });
  if (!checkAccessCode(code)) return Response.json({ error: 'That code is not right' }, { status: 401, headers: NO_STORE });

  return Response.json(
    { ok: true, user: { name: user.name } },
    { headers: { 'Set-Cookie': sessionCookieHeader(createSessionValue(user)), ...NO_STORE } }
  );
}
