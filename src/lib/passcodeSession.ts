/**
 * Cubyntra - Passcode sign-in session (server only)
 * Necookie Labs (c) 2026
 *
 * The `passcode` auth mode (ADR-017) is the fallback for hosting without Cloudflare Access. The
 * sign-in page posts a name and the shared `CUBYNTRA_ACCESS_CODE`; on success the server sets a
 * session cookie:
 *
 *   cubyntra_session = base64url(JSON { v, id, name, exp }) "." base64url(HMAC-SHA256)
 *
 * signed with a key derived from the per-install app secret (`data/app-secret`), HttpOnly,
 * Secure, SameSite=Lax, 7 days. Deleting `data/app-secret` signs everyone out. The code is
 * compared in constant time and sign-in attempts are rate limited (in the route).
 *
 * The name is the identity: anyone who knows the code can sign in under any name. The code is
 * the one secret, so this mode suits two trusted people, not strangers.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { SlidingWindowLimiter, getAppSecret } from './localAuth';
import type { Env } from './authMode';

export const SESSION_COOKIE = 'cubyntra_session';
export const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;
export const MIN_ACCESS_CODE_LENGTH = 8;
export const MAX_NAME_LENGTH = 40;

/**
 * Sign-in attempts: 10 a minute across everyone. Behind a tunnel every request comes from
 * 127.0.0.1, so there is no trustworthy per-client key; a global limit keeps guessing a code of
 * 8+ characters hopeless, at the cost of a minute's wait if someone hammers the page.
 */
export const signInLimiter = new SlidingWindowLimiter(10, 60_000);

export interface SessionUser {
  id: string;
  name: string;
}

function signingKey(): Buffer {
  return createHmac('sha256', getAppSecret()).update('cubyntra-session-cookie-v1').digest();
}

function sign(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  // Hash both sides so lengths never leak and timingSafeEqual always gets equal-length input.
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

/**
 * The user for a typed name: the trimmed name for display and a lower-case id made of letters,
 * digits and dashes. Null for an empty, too long or symbol-only name.
 */
export function userFromName(raw: unknown): SessionUser | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  const id = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return id ? { id, name } : null;
}

/** Constant-time check of a typed code. Always false when no (or too short a) code is set. */
export function checkAccessCode(given: unknown, env: Env = process.env): boolean {
  const expected = env.CUBYNTRA_ACCESS_CODE ?? '';
  if (expected.length < MIN_ACCESS_CODE_LENGTH || typeof given !== 'string' || given.length > 256) return false;
  return safeEqual(given, expected);
}

export function createSessionValue(user: SessionUser, now: number = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ v: 1, id: user.id, name: user.name, exp: Math.floor(now / 1000) + SESSION_MAX_AGE_SEC })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** Verifies a cookie value: signature, version, expiry and that the id still matches the name. */
export function verifySessionValue(value: string | null | undefined, now: number = Date.now()): SessionUser | null {
  if (!value || value.length > 1024) return null;
  const dot = value.indexOf('.');
  if (dot <= 0 || dot !== value.lastIndexOf('.')) return null;
  const payload = value.slice(0, dot);
  if (!safeEqual(value.slice(dot + 1), sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (data.v !== 1 || typeof data.exp !== 'number' || data.exp * 1000 <= now) return null;
    const user = userFromName(data.name);
    if (!user || user.id !== data.id) return null;
    return user;
  } catch {
    return null;
  }
}

/** The value of one cookie from a request's Cookie header. */
export function cookieFromRequest(req: Request, name: string = SESSION_COOKIE): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export function sessionUserFromRequest(req: Request, now: number = Date.now()): SessionUser | null {
  return verifySessionValue(cookieFromRequest(req), now);
}

export function sessionCookieHeader(value: string): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SEC}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
