/**
 * Cubyntra - Local Access Control (server only)
 * Necookie Labs (c) 2026
 *
 * The app runs on the student's laptop and is reachable from the home network (so the phone
 * can connect). Routes that cost money or touch the student's data require a per-install app
 * secret in the `x-cubyntra-token` header. The secret is generated on first use and kept in
 * `data/app-secret` (gitignored).
 *
 * The laptop's own browser fetches the secret from `GET /api/auth/token`, which only answers
 * requests addressed to a loopback host. Next.js route handlers do not expose the client's
 * socket address, so "loopback" is judged from the request headers: the Host must be
 * localhost / 127.0.0.1 / [::1], the `x-forwarded-*` headers Next.js adds must name a loopback
 * client and host (other proxy headers are refused), and a browser Origin, if any, must be
 * loopback too. A phone on the network reaches the laptop by its LAN address, so
 * its Host is never loopback. Limitation: a program on the LAN that forges `Host: localhost`
 * could still read the secret; the phone gets it from the pairing QR code or typed code instead (ADR-015).
 */

import fs from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { dataPath, writeFileAtomicSync } from './dataDir';

export const APP_TOKEN_HEADER = 'x-cubyntra-token';

const SECRET_FILE = 'app-secret';
const SECRET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

const secrets = new Map<string, string>();

/** The per-install app secret, created on first use. */
export function getAppSecret(): string {
  const file = dataPath(SECRET_FILE);
  const cached = secrets.get(file);
  if (cached) return cached;
  let secret: string | null = null;
  try {
    const stored = fs.readFileSync(file, 'utf8').trim();
    if (SECRET_PATTERN.test(stored)) secret = stored;
  } catch {
    // Not created yet.
  }
  if (!secret) {
    secret = randomBytes(32).toString('base64url');
    writeFileAtomicSync(file, `${secret}\n`, 0o600);
  }
  secrets.set(file, secret);
  return secret;
}

/**
 * The secret carried by the phone pairing QR code and typed code (ADR-015). Same value as the app token: a
 * paired phone is trusted like the laptop's own browser.
 */
export function getPairingToken(): string {
  return getAppSecret();
}

/** Constant-time check of a presented token against the app secret. */
export function isValidAppToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(getAppSecret());
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The token from a request header, or null. */
export function tokenFromRequest(req: Request): string | null {
  return req.headers.get(APP_TOKEN_HEADER);
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function hostnameOf(host: string): string {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith('[')) return trimmed.slice(0, trimmed.indexOf(']') + 1);
  return trimmed.replace(/:\d+$/, '');
}

const PROXY_HEADERS = ['x-real-ip', 'forwarded'];

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * The Next.js server itself fills `x-forwarded-for` (the socket's remote address) and
 * `x-forwarded-host` (the Host) on every request it hands to a route, so their presence alone
 * does not mean a proxy. They are accepted only when every hop is a loopback address and the
 * forwarded host is loopback too; anything else (a real proxy, a LAN client) is refused.
 */
function forwardedIsLoopback(req: Request): boolean {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor !== null) {
    const hops = forwardedFor.split(',').map((h) => h.trim().toLowerCase());
    if (!hops.every((h) => LOOPBACK_ADDRESSES.has(h))) return false;
  }
  const forwardedHost = req.headers.get('x-forwarded-host');
  if (forwardedHost !== null && !LOOPBACK_HOSTS.has(hostnameOf(forwardedHost))) return false;
  return true;
}

/** True when the request was addressed to this machine's loopback interface (see header). */
export function isLoopbackRequest(req: Request): boolean {
  const host = req.headers.get('host');
  if (!host || !LOOPBACK_HOSTS.has(hostnameOf(host))) return false;
  if (PROXY_HEADERS.some((h) => req.headers.has(h))) return false;
  if (!forwardedIsLoopback(req)) return false;
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      if (!LOOPBACK_HOSTS.has(new URL(origin).hostname.toLowerCase())) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * In-memory sliding-window rate limiter: at most `limit` hits per `windowMs` per key. Keys
 * whose hits have all left the window are dropped (swept at most once per window), so the map
 * holds only keys used recently; `forget` drops a key at once (e.g. a deleted session).
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    readonly limit: number,
    readonly windowMs: number
  ) {}

  /** How many keys are tracked (tests). */
  get size(): number {
    return this.hits.size;
  }

  /** Drops every key with no hit inside the window. */
  prune(now: number = Date.now()): void {
    const since = now - this.windowMs;
    for (const [key, times] of this.hits) {
      if (!times.length || times[times.length - 1] <= since) this.hits.delete(key);
    }
    this.lastSweep = now;
  }

  forget(key: string): void {
    this.hits.delete(key);
  }

  /** Counts a hit. Returns whether it is allowed and, if not, how many seconds to wait. */
  hit(key: string, now: number = Date.now()): { ok: boolean; retryAfterSec: number } {
    if (now - this.lastSweep >= this.windowMs) this.prune(now);
    const since = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000)) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { ok: true, retryAfterSec: 0 };
  }

  reset(): void {
    this.hits.clear();
    this.lastSweep = 0;
  }
}

/** Coach requests: 30 per minute per token. */
export const coachRateLimiter = new SlidingWindowLimiter(30, 60_000);

/** "Ask the coach" questions: 20 per minute per token (per user when hosted), apart from hints. */
export const chatRateLimiter = new SlidingWindowLimiter(20, 60_000);

/**
 * Voice requests: 60 per minute per token. Twice the coach's, because the twin narrates each
 * move (the browser keeps clips it has fetched, so a step's moves are asked for once).
 */
export const voiceRateLimiter = new SlidingWindowLimiter(60, 60_000);

/**
 * Shared guard for token-protected routes: 401 without a valid token, 429 over the rate limit
 * (when a limiter is given), otherwise null.
 */
export function guardRequest(req: Request, limiter?: SlidingWindowLimiter): Response | null {
  const token = tokenFromRequest(req);
  if (!isValidAppToken(token)) {
    return Response.json({ error: 'Missing or invalid app token' }, { status: 401 });
  }
  if (limiter) {
    const { ok, retryAfterSec } = limiter.hit(token!);
    if (!ok) {
      return Response.json(
        { error: 'Too many requests, please wait a moment' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
      );
    }
  }
  return null;
}
