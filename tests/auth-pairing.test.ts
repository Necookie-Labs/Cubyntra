/**
 * Cubyntra - Pairing per person and PUBLIC_ORIGIN (ADR-017)
 * Necookie Labs (c) 2026
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as createSession } from '../src/app/api/session/route';
import { POST as pair } from '../src/app/api/session/pair/route';
import { GET as getSession } from '../src/app/api/session/[id]/route';
import { POST as postMessage } from '../src/app/api/session/[id]/messages/route';
import { APP_TOKEN_HEADER, getAppSecret } from '../src/lib/localAuth';
import { SESSION_COOKIE, createSessionValue, userFromName } from '../src/lib/passcodeSession';
import { userToken } from '../src/lib/requestUser';
import { SESSION_SECRET_HEADER } from '../src/sync/pairing';
import { parsePairingFragment } from '../src/sync/pairingLink';
import { sessionManager } from '../src/sync/sessionManager';
import { publicOrigin, resetSyncLimitersForTests } from '../src/sync/server';
import { useScratchDataDir } from './helpers/scratchData';

let scratch: ReturnType<typeof useScratchDataDir>;
beforeEach(() => {
  scratch = useScratchDataDir();
  sessionManager.clearAll();
  resetSyncLimitersForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  sessionManager.clearAll();
  scratch.cleanup();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const BASE = 'http://localhost:3001';
const loopbackHeaders = { host: 'localhost:3001', 'x-forwarded-for': '127.0.0.1' };

const cookieFor = (name: string) => `${SESSION_COOKIE}=${createSessionValue(userFromName(name)!)}`;
const signedIn = (name: string, extra: Record<string, string> = {}) => ({
  ...loopbackHeaders,
  cookie: cookieFor(name),
  [APP_TOKEN_HEADER]: userToken(userFromName(name)!),
  ...extra,
});

async function createAs(name: string) {
  const res = await createSession(new Request(`${BASE}/api/session`, { method: 'POST', headers: signedIn(name) }));
  expect(res.status).toBe(200);
  return res.json() as Promise<{ sessionId: string; secret: string; code: string; companionUrl: string; availableIps: string[] }>;
}

describe('publicOrigin', () => {
  it('accepts an http(s) origin and ignores anything else', () => {
    expect(publicOrigin({ PUBLIC_ORIGIN: 'https://cubyntra.necookie.dev/' })).toBe('https://cubyntra.necookie.dev');
    expect(publicOrigin({ PUBLIC_ORIGIN: 'https://cubyntra.necookie.dev/some/path?q=1' })).toBe('https://cubyntra.necookie.dev');
    expect(publicOrigin({ PUBLIC_ORIGIN: 'javascript:alert(1)' })).toBeNull();
    expect(publicOrigin({ PUBLIC_ORIGIN: 'not a url' })).toBeNull();
    expect(publicOrigin({})).toBeNull();
  });
});

describe('companionUrl', () => {
  it('uses PUBLIC_ORIGIN when set, and hides the LAN addresses', async () => {
    vi.stubEnv('PUBLIC_ORIGIN', 'https://cubyntra.necookie.dev');
    const res = await createSession(
      new Request('http://localhost:3000/api/session', {
        method: 'POST',
        headers: { host: 'localhost:3000', [APP_TOKEN_HEADER]: getAppSecret() },
      })
    );
    const body = await res.json();
    const url = new URL(body.companionUrl);
    expect(url.origin).toBe('https://cubyntra.necookie.dev');
    expect(url.pathname).toBe('/companion');
    expect(body.availableIps).toEqual([]);
  });
});

describe('passcode mode: a pairing belongs to its user', () => {
  beforeEach(() => {
    vi.stubEnv('CUBYNTRA_AUTH_MODE', 'passcode');
    vi.stubEnv('CUBYNTRA_ACCESS_CODE', 'cube-night-2026');
    vi.stubEnv('PUBLIC_ORIGIN', 'https://cubyntra.necookie.dev');
  });

  it('puts the owner’s own token in the QR link', async () => {
    const s = await createAs('Owner');
    const creds = parsePairingFragment(new URL(s.companionUrl).hash)!;
    expect(creds.token).toBe(userToken(userFromName('Owner')!));
    expect(creds.token).not.toBe(getAppSecret());
  });

  it('only the owner can use the session, even with the secret', async () => {
    const s = await createAs('Owner');
    const as = (name: string) => ({ cookie: cookieFor(name), [SESSION_SECRET_HEADER]: s.secret });

    expect((await getSession(new Request(`${BASE}/api/session/${s.sessionId}`, { headers: as('Owner') }), ctx(s.sessionId))).status).toBe(200);
    expect((await getSession(new Request(`${BASE}/api/session/${s.sessionId}`, { headers: as('Kiko') }), ctx(s.sessionId))).status).toBe(404);
    const anonymous = { [SESSION_SECRET_HEADER]: s.secret };
    expect((await getSession(new Request(`${BASE}/api/session/${s.sessionId}`, { headers: anonymous }), ctx(s.sessionId))).status).toBe(401);

    const msg = JSON.stringify({ type: 'presence', role: 'mobile', payload: { visible: true, screen: 'scan' } });
    const post = (headers: Record<string, string>) =>
      postMessage(new Request(`${BASE}/api/session/${s.sessionId}/messages`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: msg }), ctx(s.sessionId));
    expect((await post(as('Kiko'))).status).toBe(404);
  });

  it('only the owner can claim the typed code, and gets their own token', async () => {
    const s = await createAs('Owner');
    const claim = (name: string | null) =>
      pair(
        new Request(`${BASE}/api/session/pair`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(name ? { cookie: cookieFor(name) } : {}) },
          body: JSON.stringify({ code: s.code }),
        })
      );
    expect((await claim(null)).status).toBe(401);
    expect((await claim('Kiko')).status).toBe(404);
    const ok = await claim('Owner');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ sessionId: s.sessionId, token: userToken(userFromName('Owner')!) });
  });

  it('creating a session needs a signed-in user with their token', async () => {
    const res = await createSession(
      new Request(`${BASE}/api/session`, { method: 'POST', headers: { ...loopbackHeaders, [APP_TOKEN_HEADER]: getAppSecret() } })
    );
    expect(res.status).toBe(401);
  });
});
