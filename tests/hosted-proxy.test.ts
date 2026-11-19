/**
 * Cubyntra - Hosted-mode proxy: security headers and the passcode page gate (ADR-017)
 * Necookie Labs (c) 2026
 */

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy, config } from '../src/proxy';
import { SECURITY_HEADERS, pageNeedsSignIn } from '../src/lib/hostedHeaders';
import { SESSION_COOKIE, createSessionValue, userFromName } from '../src/lib/passcodeSession';
import { safeNext } from '../src/components/auth/SignInForm';
import { useScratchDataDir } from './helpers/scratchData';

let scratch: ReturnType<typeof useScratchDataDir>;
beforeEach(() => {
  scratch = useScratchDataDir();
});
afterEach(() => {
  vi.unstubAllEnvs();
  scratch.cleanup();
});

const req = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(new URL(path, 'http://localhost:3001'), { headers });

describe('security headers', () => {
  it('are not added on the laptop (local mode)', () => {
    const res = proxy(req('/'));
    expect(res.headers.get('strict-transport-security')).toBeNull();
  });

  it('are added in the hosted modes', () => {
    for (const mode of ['cloudflare-access', 'passcode']) {
      vi.stubEnv('CUBYNTRA_AUTH_MODE', mode);
      const res = proxy(req('/api/health'));
      expect(res.headers.get('strict-transport-security')).toMatch(/^max-age=\d{7,}/);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      const policy = res.headers.get('permissions-policy')!;
      expect(policy).toContain('camera=(self)');
      expect(policy).toContain('microphone=(self)');
      expect(policy).toContain('geolocation=()');
    }
  });

  it('cover every path except hashed static files', () => {
    expect(config.matcher).toEqual(['/((?!_next/static|_next/image).*)']);
    expect(Object.keys(SECURITY_HEADERS)).toHaveLength(5);
  });
});

describe('passcode page gate', () => {
  beforeEach(() => {
    vi.stubEnv('CUBYNTRA_AUTH_MODE', 'passcode');
    vi.stubEnv('CUBYNTRA_ACCESS_CODE', 'cube-night-2026');
  });

  it('sends a page without a session to /signin on PUBLIC_ORIGIN, with next', () => {
    vi.stubEnv('PUBLIC_ORIGIN', 'https://cubyntra.necookie.dev');
    const res = proxy(req('/solve?x=1'));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location')!);
    expect(location.origin).toBe('https://cubyntra.necookie.dev');
    expect(location.pathname).toBe('/signin');
    expect(location.searchParams.get('next')).toBe('/solve?x=1');
    expect(res.headers.get('strict-transport-security')).toBeTruthy();
  });

  it('falls back to the request origin without PUBLIC_ORIGIN (an absolute URL either way)', () => {
    const location = proxy(req('/')).headers.get('location')!;
    expect(location).toBe('http://localhost:3001/signin?next=%2F');
  });

  it('lets a signed-in page, the sign-in page, assets and the API through', () => {
    const cookie = `${SESSION_COOKIE}=${createSessionValue(userFromName('Kiko')!)}`;
    expect(proxy(req('/solve', { cookie })).status).toBe(200);
    for (const path of ['/signin', '/api/health', '/api/student', '/manifest.webmanifest', '/favicon.ico']) {
      expect(proxy(req(path)).status).toBe(200);
    }
  });

  it('a forged cookie still redirects', () => {
    expect(proxy(req('/', { cookie: `${SESSION_COOKIE}=abc.def` })).status).toBe(307);
  });

  it('pageNeedsSignIn', () => {
    expect(pageNeedsSignIn('/')).toBe(true);
    expect(pageNeedsSignIn('/companion')).toBe(true);
    expect(pageNeedsSignIn('/signin')).toBe(false);
    expect(pageNeedsSignIn('/_next/data/x')).toBe(false);
    expect(pageNeedsSignIn('/icon-192.png')).toBe(false);
  });
});

describe('safeNext', () => {
  it('follows only same-site paths', () => {
    expect(safeNext('/solve')).toBe('/solve');
    expect(safeNext(undefined)).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext(String.raw`/\evil.example`)).toBe('/');
  });
});
