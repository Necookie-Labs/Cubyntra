/**
 * Cubyntra - Hosted-mode response headers and page gate (ADR-017)
 * Necookie Labs (c) 2026
 *
 * Used by `src/proxy.ts` (Next 16's name for middleware). Only the hosted auth modes get these
 * headers: on the laptop, HSTS would pin `localhost` to HTTPS and break `npm run dev:http`.
 */

/** Sent on every response in the hosted modes. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  // The scanner and checkpoints need the camera; microphone stays allowed on this origin only.
  // Everything else Cubyntra never uses is switched off.
  'Permissions-Policy':
    'camera=(self), microphone=(self), screen-wake-lock=(self), autoplay=(self), fullscreen=(self), ' +
    'geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), midi=(), ' +
    'magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), browsing-topics=()',
});

/**
 * Whether a path is a page that needs a signed-in person in `passcode` mode. API routes answer
 * 401 themselves; the sign-in page, Next.js assets and files with an extension (manifest,
 * icons) stay open so the sign-in page can load.
 */
export function pageNeedsSignIn(pathname: string): boolean {
  if (pathname === '/signin' || pathname.startsWith('/signin/')) return false;
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/')) return false;
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  return !last.includes('.');
}
