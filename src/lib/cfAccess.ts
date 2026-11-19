/**
 * Cubyntra - Cloudflare Access JWT verification (server only)
 * Necookie Labs (c) 2026
 *
 * In `cloudflare-access` mode Cloudflare adds the signed Access token to every request it
 * forwards through the tunnel, in the `Cf-Access-Jwt-Assertion` header. Following Cloudflare's
 * "Validate JWTs" guide, the token must be RS256-signed by a key from
 * `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, its `iss` must be that team
 * domain, its `aud` must contain the application's AUD tag, and `exp` / `nbf` must hold.
 *
 * `jose` does the verification: the JWKS is fetched and cached (with a cooldown before it is
 * fetched again for an unknown key id), and only RS256 is accepted, so `alg: none` and
 * HS256-with-the-public-key tokens are refused.
 *
 * `cloudflared` connects to the app from 127.0.0.1, so a loopback peer proves nothing here: a
 * request without a valid token is refused whatever its Host.
 */

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { allowedEmails, type Env } from './authMode';

export const CF_ACCESS_HEADER = 'cf-access-jwt-assertion';

export interface AccessConfig {
  /** e.g. `necookie.cloudflareaccess.com` (a scheme or trailing slash is tolerated). */
  teamDomain: string;
  /** The Access application's AUD tag. */
  audience: string;
}

export function accessConfig(env: Env = process.env): AccessConfig | null {
  const teamDomain = (env.CF_ACCESS_TEAM_DOMAIN ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const audience = (env.CF_ACCESS_AUD ?? '').trim();
  if (!teamDomain || !audience || !/^[a-z0-9.-]+$/i.test(teamDomain)) return null;
  return { teamDomain, audience };
}

const jwksCache = new Map<string, JWTVerifyGetKey>();

function jwksFor(teamDomain: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`), {
      cacheMaxAge: 10 * 60_000,
      cooldownDuration: 30_000,
    });
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

/** Forgets the cached key sets (tests). */
export function resetAccessJwksCache(): void {
  jwksCache.clear();
}

export interface AccessIdentity {
  email: string;
}

/**
 * Verifies an Access token. Returns the lower-cased email, or null for anything wrong: no or
 * malformed token, bad signature, wrong algorithm, issuer or audience, expired, no email, or an
 * email outside `CUBYNTRA_ALLOWED_EMAILS` (when set).
 */
export async function verifyAccessJwt(
  token: string | null | undefined,
  config: AccessConfig | null = accessConfig(),
  env: Env = process.env
): Promise<AccessIdentity | null> {
  if (!token || !config || token.length > 8192) return null;
  try {
    const { payload } = await jwtVerify(token, jwksFor(config.teamDomain), {
      algorithms: ['RS256'],
      issuer: `https://${config.teamDomain}`,
      audience: config.audience,
      requiredClaims: ['exp'],
      clockTolerance: 5,
    });
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!email || !email.includes('@')) return null;
    const allow = allowedEmails(env);
    if (allow.size && !allow.has(email)) return null;
    return { email };
  } catch {
    return null;
  }
}
