/**
 * Cubyntra - Proxy (Next 16's name for middleware), ADR-017
 * Necookie Labs (c) 2026
 *
 * Local mode: does nothing. Hosted modes: adds the security headers to every response, and in
 * `passcode` mode sends a page request without a valid session cookie to `/signin` (a relative
 * redirect, so it stays on whatever origin the tunnel serves). API routes still authenticate
 * every request themselves; this is only the page-level convenience and the headers.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { authMode } from '@/lib/authMode';
import { SECURITY_HEADERS, pageNeedsSignIn } from '@/lib/hostedHeaders';
import { sessionUserFromRequest } from '@/lib/passcodeSession';

export function proxy(request: NextRequest) {
  const mode = authMode();
  if (mode === 'local') return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  let response: Response;
  if (mode === 'passcode' && pageNeedsSignIn(pathname) && !sessionUserFromRequest(request)) {
    const next = encodeURIComponent(`${pathname}${search}`);
    response = new Response(null, { status: 307, headers: { Location: `/signin?next=${next}`, 'Cache-Control': 'no-store' } });
  } else {
    response = NextResponse.next();
  }
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
  return response;
}

export const config = {
  // Everything except Next's hashed static files and image optimizer.
  matcher: ['/((?!_next/static|_next/image).*)'],
};
