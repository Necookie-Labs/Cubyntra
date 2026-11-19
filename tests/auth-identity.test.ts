/**
 * Cubyntra - Hosted auth modes: identity, per-user tokens, passcode sign-in (ADR-017)
 * Necookie Labs (c) 2026
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getToken } from '../src/app/api/auth/token/route';
import { POST as signIn } from '../src/app/api/auth/signin/route';
import { POST as signOut } from '../src/app/api/auth/signout/route';
import { GET as coachStatus } from '../src/app/api/coach/status/route';
import { resetAccessJwksCache } from '../src/lib/cfAccess';
import { APP_TOKEN_HEADER, SlidingWindowLimiter, getAppSecret } from '../src/lib/localAuth';
import {
  SESSION_COOKIE,
  createSessionValue,
  signInLimiter,
  userFromName,
  verifySessionValue,
} from '../src/lib/passcodeSession';
import { LOCAL_USER, getRequestUser, guardUser, userToken } from '../src/lib/requestUser';
import { ACCESS_ENV, fakeAccessIssuer, type FakeIssuer } from './helpers/accessJwt';
import { useScratchDataDir } from './helpers/scratchData';

let scratch: ReturnType<typeof useScratchDataDir>;
beforeEach(() => {
  scratch = useScratchDataDir();
  signInLimiter.reset();
  resetAccessJwksCache();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  scratch.cleanup();
});

const stubEnv = (vars: Record<string, string>) => {
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
};

/** A request that looks exactly like what cloudflared hands the app: loopback host and peer. */
const loopback = (path: string, headers: Record<string, string> = {}, init: RequestInit = {}) =>
  new Request(`http://localhost:3001${path}`, {
    ...init,
    headers: { host: 'localhost:3001', 'x-forwarded-for': '127.0.0.1', 'x-forwarded-host': 'localhost:3001', ...headers },
  });

describe('local mode (default) is unchanged', () => {
  it('the user is local and the token is the app secret', async () => {
    expect(await getRequestUser(loopback('/api/coach/status'))).toEqual(LOCAL_USER);
    expect(userToken(LOCAL_USER)).toBe(getAppSecret());
    const res = await getToken(loopback('/api/auth/token'));
    expect(await res.json()).toEqual({ token: getAppSecret() });
  });

  it('the sign-in route does not exist', async () => {
    const res = await signIn(loopback('/api/auth/signin', {}, { method: 'POST', body: '{}' }));
    expect(res.status).toBe(404);
  });
});

describe('an unknown CUBYNTRA_AUTH_MODE fails closed', () => {
  it('refuses everyone, even loopback with the app secret', async () => {
    stubEnv({ CUBYNTRA_AUTH_MODE: 'clodflare' });
    expect(await getRequestUser(loopback('/'))).toBeNull();
    expect((await getToken(loopback('/api/auth/token'))).status).toBe(401);
    expect((await coachStatus(loopback('/api/coach/status', { [APP_TOKEN_HEADER]: getAppSecret() }))).status).toBe(401);
  });
});

describe('cloudflare-access mode', () => {
  let issuer: FakeIssuer;
  beforeEach(async () => {
    stubEnv(ACCESS_ENV);
    issuer = await fakeAccessIssuer();
  });

  it('rejects a loopback request without a JWT, even with the old app secret', async () => {
    expect((await getToken(loopback('/api/auth/token'))).status).toBe(401);
    const res = await coachStatus(loopback('/api/coach/status', { [APP_TOKEN_HEADER]: getAppSecret() }));
    expect(res.status).toBe(401);
  });

  it('gives a signed-in user their own token, and that token works only for them', async () => {
    const owner = { 'cf-access-jwt-assertion': await issuer.sign({ email: 'owner@example.com' }) };
    const kiko = { 'cf-access-jwt-assertion': await issuer.sign({ email: 'kiko@example.com' }) };

    const res = await getToken(loopback('/api/auth/token', owner));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('cloudflare-access');
    expect(body.user).toEqual({ name: 'owner' });
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.token).not.toBe(getAppSecret());

    expect((await coachStatus(loopback('/api/coach/status', { ...owner, [APP_TOKEN_HEADER]: body.token }))).status).toBe(200);
    expect((await coachStatus(loopback('/api/coach/status', { ...kiko, [APP_TOKEN_HEADER]: body.token }))).status).toBe(401);
    expect((await coachStatus(loopback('/api/coach/status', owner))).status).toBe(401);
  });

  it('applies the in-app email allowlist', async () => {
    stubEnv({ CUBYNTRA_ALLOWED_EMAILS: 'owner@example.com' });
    const stranger = { 'cf-access-jwt-assertion': await issuer.sign({ email: 'stranger@example.com' }) };
    expect((await getToken(loopback('/api/auth/token', stranger))).status).toBe(401);
  });

  it('rate limits per user, not per process', async () => {
    const limiter = new SlidingWindowLimiter(1, 60_000);
    const as = async (email: string) => {
      const jwt = { 'cf-access-jwt-assertion': await issuer.sign({ email }) };
      const user = (await getRequestUser(loopback('/', jwt)))!;
      return guardUser(loopback('/', { ...jwt, [APP_TOKEN_HEADER]: userToken(user) }), limiter);
    };
    expect((await as('owner@example.com')).ok).toBe(true);
    const second = await as('owner@example.com');
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.response.status).toBe(429);
    expect((await as('kiko@example.com')).ok).toBe(true);
  });
});

describe('passcode mode', () => {
  const CODE = 'cube-night-2026';
  beforeEach(() => stubEnv({ CUBYNTRA_AUTH_MODE: 'passcode', CUBYNTRA_ACCESS_CODE: CODE }));

  const post = (body: unknown) =>
    signIn(loopback('/api/auth/signin', { 'Content-Type': 'application/json' }, { method: 'POST', body: JSON.stringify(body) }));
  const cookieOf = (res: Response) => /cubyntra_session=([^;]*)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';

  it('signs in with the right code and sets a hardened 7-day cookie', async () => {
    const res = await post({ name: 'Kiko', code: CODE });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, user: { name: 'Kiko' } });
    const header = res.headers.get('set-cookie')!;
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Secure');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Max-Age=604800');
    expect(header).toContain('Path=/');

    const cookie = { cookie: `${SESSION_COOKIE}=${cookieOf(res)}` };
    const token = await (await getToken(loopback('/api/auth/token', cookie))).json();
    expect(token.user).toEqual({ name: 'Kiko' });
    expect((await coachStatus(loopback('/api/coach/status', { ...cookie, [APP_TOKEN_HEADER]: token.token }))).status).toBe(200);
  });

  it('refuses a wrong code, a bad name, and any code when none (or a short one) is set', async () => {
    expect((await post({ name: 'Kiko', code: 'nope' })).status).toBe(401);
    expect((await post({ name: 'Kiko', code: `${CODE}x` })).status).toBe(401);
    expect((await post({ name: '   ', code: CODE })).status).toBe(400);
    expect((await post({ name: '../..', code: CODE })).status).toBe(400);
    vi.stubEnv('CUBYNTRA_ACCESS_CODE', 'short');
    expect((await post({ name: 'Kiko', code: 'short' })).status).toBe(401);
  });

  it('rejects a tampered, re-signed or expired cookie', async () => {
    const good = cookieOf(await post({ name: 'Kiko', code: CODE }));
    const [payload, sig] = good.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), id: 'owner', name: 'Owner' })).toString('base64url');
    for (const value of [`${forged}.${sig}`, `${payload}.${sig.slice(0, -2)}AA`, `${payload}`, `${payload}.${sig}.x`, '']) {
      expect((await getToken(loopback('/api/auth/token', { cookie: `${SESSION_COOKIE}=${value}` }))).status).toBe(401);
    }
    const old = createSessionValue(userFromName('Kiko')!, Date.now() - 8 * 24 * 3600 * 1000);
    expect(verifySessionValue(old)).toBeNull();
    expect(verifySessionValue(createSessionValue(userFromName('Kiko')!))).toEqual({ id: 'kiko', name: 'Kiko' });
  });

  it('a loopback request with no cookie is refused', async () => {
    expect((await getToken(loopback('/api/auth/token'))).status).toBe(401);
    expect((await coachStatus(loopback('/api/coach/status', { [APP_TOKEN_HEADER]: getAppSecret() }))).status).toBe(401);
  });

  it('rate limits sign-in attempts', async () => {
    for (let i = 0; i < 10; i++) expect((await post({ name: 'Kiko', code: 'wrong-guess' })).status).toBe(401);
    const limited = await post({ name: 'Kiko', code: CODE });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });

  it('signs out by clearing the cookie', async () => {
    const res = await signOut();
    expect(res.status).toBe(200);
    const header = res.headers.get('set-cookie')!;
    expect(header).toMatch(/^cubyntra_session=;/);
    expect(header).toContain('Max-Age=0');
    expect(header).toContain('HttpOnly');
  });
});
