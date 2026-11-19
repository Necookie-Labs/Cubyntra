/**
 * Cubyntra - Cloudflare Access JWT verification
 * Necookie Labs (c) 2026
 */

import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authMode } from '../src/lib/authMode';
import { accessConfig, resetAccessJwksCache, verifyAccessJwt } from '../src/lib/cfAccess';
import { AUD, CERTS_URL, TEAM, fakeAccessIssuer, type FakeIssuer } from './helpers/accessJwt';

const config = { teamDomain: TEAM, audience: AUD };
const env = {};
let issuer: FakeIssuer;

beforeEach(async () => {
  resetAccessJwksCache();
  issuer = await fakeAccessIssuer();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

describe('authMode', () => {
  it('defaults to local and fails closed on unknown values', () => {
    expect(authMode({})).toBe('local');
    expect(authMode({ CUBYNTRA_AUTH_MODE: 'passcode' })).toBe('passcode');
    expect(authMode({ CUBYNTRA_AUTH_MODE: 'Cloudflare-Access' })).toBe('cloudflare-access');
    expect(authMode({ CUBYNTRA_AUTH_MODE: 'cloudflare' })).toBe('invalid');
  });

  it('reads the Access config, tolerating a scheme on the team domain', () => {
    expect(accessConfig({ CF_ACCESS_TEAM_DOMAIN: `https://${TEAM}/`, CF_ACCESS_AUD: AUD })).toEqual(config);
    expect(accessConfig({ CF_ACCESS_TEAM_DOMAIN: TEAM })).toBeNull();
  });
});

describe('verifyAccessJwt', () => {
  it('accepts a valid token and returns the lower-cased email', async () => {
    const token = await issuer.sign({ email: 'Owner@Example.com' });
    expect(await verifyAccessJwt(token, config, env)).toEqual({ email: 'owner@example.com' });
    expect(issuer.fetchMock).toHaveBeenCalledWith(CERTS_URL, expect.anything());
  });

  it('caches the key set between requests', async () => {
    const token = await issuer.sign();
    await verifyAccessJwt(token, config, env);
    await verifyAccessJwt(token, config, env);
    expect(issuer.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses an expired token', async () => {
    const token = await issuer.sign(undefined, { exp: Math.floor(Date.now() / 1000) - 60 });
    expect(await verifyAccessJwt(token, config, env)).toBeNull();
  });

  it('refuses the wrong audience', async () => {
    expect(await verifyAccessJwt(await issuer.sign(undefined, { aud: 'someone-else' }), config, env)).toBeNull();
  });

  it('refuses the wrong issuer', async () => {
    expect(await verifyAccessJwt(await issuer.sign(undefined, { iss: 'https://evil.cloudflareaccess.com' }), config, env)).toBeNull();
  });

  it('refuses a missing token or missing config', async () => {
    expect(await verifyAccessJwt(null, config, env)).toBeNull();
    expect(await verifyAccessJwt('', config, env)).toBeNull();
    expect(await verifyAccessJwt(await issuer.sign(), null, env)).toBeNull();
  });

  it('refuses alg=none', async () => {
    const payload = { email: 'owner@example.com', iss: `https://${TEAM}`, aud: AUD, exp: Math.floor(Date.now() / 1000) + 600 };
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;
    expect(await verifyAccessJwt(token, config, env)).toBeNull();
  });

  it('refuses an HS256 token signed with the public key (algorithm confusion)', async () => {
    const token = await new SignJWT({ email: 'owner@example.com' })
      .setProtectedHeader({ alg: 'HS256', kid: 'test-key' })
      .setIssuer(`https://${TEAM}`)
      .setAudience(AUD)
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(issuer.publicPem));
    expect(await verifyAccessJwt(token, config, env)).toBeNull();
  });

  it('refuses a token signed by another key', async () => {
    const other = await fakeAccessIssuer(); // re-stubs fetch with its own key
    const token = await issuer.sign();
    resetAccessJwksCache();
    expect(await verifyAccessJwt(token, config, env)).toBeNull();
    expect(other.fetchMock).toHaveBeenCalled();
  });

  it('refuses a token with no email', async () => {
    expect(await verifyAccessJwt(await issuer.sign({ sub: 'service-token' }), config, env)).toBeNull();
  });

  it('applies CUBYNTRA_ALLOWED_EMAILS as a second allowlist', async () => {
    const allow = { CUBYNTRA_ALLOWED_EMAILS: ' owner@example.com , kiko@example.com ' };
    expect(await verifyAccessJwt(await issuer.sign({ email: 'kiko@example.com' }), config, allow)).toEqual({ email: 'kiko@example.com' });
    expect(await verifyAccessJwt(await issuer.sign({ email: 'stranger@example.com' }), config, allow)).toBeNull();
  });
});
