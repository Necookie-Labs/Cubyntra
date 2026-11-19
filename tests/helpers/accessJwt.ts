/**
 * Cubyntra - Fake Cloudflare Access issuer for tests
 * Necookie Labs (c) 2026
 *
 * A locally generated RSA key pair stands in for the team's signing key, and `fetch` is stubbed
 * so the JWKS URL answers with its public half. No network.
 */

import { SignJWT, exportJWK, exportSPKI, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { vi } from 'vitest';

export const TEAM = 'necookie-test.cloudflareaccess.com';
export const AUD = 'aud-tag-for-tests-0123456789abcdef';
export const CERTS_URL = `https://${TEAM}/cdn-cgi/access/certs`;

export interface FakeIssuer {
  privateKey: CryptoKey;
  publicJwk: JWK;
  publicPem: string;
  fetchMock: ReturnType<typeof vi.fn>;
  sign(claims?: Record<string, unknown>, opts?: { iss?: string; aud?: string; exp?: number | string; kid?: string }): Promise<string>;
}

export async function fakeAccessIssuer(): Promise<FakeIssuer> {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const publicPem = await exportSPKI(publicKey);
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === CERTS_URL) return Response.json({ keys: [publicJwk] });
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    privateKey,
    publicJwk,
    publicPem,
    fetchMock,
    sign: (claims = { email: 'owner@example.com' }, opts = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? 'test-key' })
        .setIssuer(opts.iss ?? `https://${TEAM}`)
        .setAudience(opts.aud ?? AUD)
        .setIssuedAt()
        .setExpirationTime(opts.exp ?? '1h')
        .sign(privateKey),
  };
}

export const ACCESS_ENV = {
  CUBYNTRA_AUTH_MODE: 'cloudflare-access',
  CF_ACCESS_TEAM_DOMAIN: TEAM,
  CF_ACCESS_AUD: AUD,
};
