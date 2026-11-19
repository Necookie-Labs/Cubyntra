/**
 * Cubyntra - Proxy (Next 16's name for middleware), ADR-017
 * Necookie Labs (c) 2026
 *
 * Local mode: does nothing. Hosted modes: adds the security headers to every response, and in
 * `passcode` mode sends a page request without a valid session cookie to `/signin` on
 * `PUBLIC_ORIGIN` (or the request's own origin when that is unset; Next needs an absolute URL). API routes still authenticate
 * every request themselves; this is only the page-level convenience and the headers.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { authMode } from '@/lib/authMode';
import { SECURITY_HEADERS, pageNeedsSignIn, publicOrigin } from '@/lib/hostedHeaders';
import { sessionUserFromRequest } from '@/lib/passcodeSession';

export function proxy(request: NextRequest) {
  const mode = authMode();
  if (mode === 'local') return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  let response: NextResponse;
  if (mode === 'passcode' && pageNeedsSignIn(pathname) && !sessionUserFromRequest(request)) {
    const target = new URL('/signin', publicOrigin() ?? request.nextUrl.origin);
    target.searchParams.set('next', `${pathname}${search}`);
    response = NextResponse.redirect(target, 307);
    response.headers.set('Cache-Control', 'no-store');
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
