/**
 * Cubyntra - Local Access Control Tests
 * Necookie Labs (c) 2026
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  APP_TOKEN_HEADER,
  SlidingWindowLimiter,
  getAppSecret,
  getPairingToken,
  guardRequest,
  isLoopbackRequest,
  isValidAppToken,
} from '../src/lib/localAuth';
import { useScratchDataDir } from './helpers/scratchData';

let scratch: ReturnType<typeof useScratchDataDir>;
beforeEach(() => {
  scratch = useScratchDataDir();
});
afterEach(() => scratch.cleanup());

const req = (headers: Record<string, string>) => new Request('http://localhost:3000/api/x', { headers });

describe('app secret', () => {
  it('is generated once and stored in the data directory', () => {
    const secret = getAppSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fs.readFileSync(path.join(scratch.dir, 'app-secret'), 'utf8').trim()).toBe(secret);
    expect(getAppSecret()).toBe(secret);
    expect(getPairingToken()).toBe(secret);
  });

  it('reuses a secret already on disk', () => {
    const stored = 'a'.repeat(43);
    fs.writeFileSync(path.join(scratch.dir, 'app-secret'), `${stored}\n`);
    expect(getAppSecret()).toBe(stored);
  });

  it('accepts only the exact secret', () => {
    const secret = getAppSecret();
    expect(isValidAppToken(secret)).toBe(true);
    expect(isValidAppToken(`${secret}x`)).toBe(false);
    expect(isValidAppToken(secret.slice(1))).toBe(false);
    expect(isValidAppToken('')).toBe(false);
    expect(isValidAppToken(null)).toBe(false);
  });
});

describe('isLoopbackRequest', () => {
  it.each([
    [{ host: 'localhost:3000' }],
    [{ host: '127.0.0.1:3000' }],
    [{ host: '[::1]:3000' }],
    [{ host: 'localhost', origin: 'https://localhost:3000' }],
    // What `next start` / `next dev` add to every request from the laptop's own browser.
    [{ host: 'localhost:3000', 'x-forwarded-for': '::1', 'x-forwarded-host': 'localhost:3000' }],
    [{ host: '127.0.0.1:3000', 'x-forwarded-for': '::ffff:127.0.0.1', 'x-forwarded-host': '127.0.0.1:3000' }],
  ])('accepts %j', (headers) => {
    expect(isLoopbackRequest(req(headers))).toBe(true);
  });

  it.each([
    [{ host: '192.168.1.20:3000' }],
    [{ host: 'evil.example' }],
    [{ host: 'localhost.evil.example' }],
    [{ host: 'localhost:3000', 'x-forwarded-for': '10.0.0.5' }],
    [{ host: 'localhost:3000', 'x-forwarded-for': '127.0.0.1, 10.0.0.5' }],
    [{ host: 'localhost:3000', 'x-forwarded-for': '::1', 'x-forwarded-host': '192.168.1.20:3000' }],
    [{ host: 'localhost:3000', 'x-real-ip': '127.0.0.1' }],
    [{ host: 'localhost:3000', origin: 'https://evil.example' }],
    [{ host: 'localhost:3000', origin: 'null' }],
  ])('rejects %j', (headers) => {
    expect(isLoopbackRequest(req(headers))).toBe(false);
  });
});

describe('SlidingWindowLimiter', () => {
  it('allows the limit per window, then asks to wait', () => {
    const limiter = new SlidingWindowLimiter(3, 60_000);
    expect([0, 1000, 2000].map((t) => limiter.hit('a', t).ok)).toEqual([true, true, true]);
    expect(limiter.hit('a', 3000)).toEqual({ ok: false, retryAfterSec: 57 });
    expect(limiter.hit('b', 3000).ok).toBe(true);
    expect(limiter.hit('a', 60_001).ok).toBe(true);
  });

  it('drops keys whose hits have all left the window', () => {
    const limiter = new SlidingWindowLimiter(3, 60_000);
    for (let i = 0; i < 500; i++) limiter.hit(`key-${i}`, i);
    expect(limiter.size).toBe(500);
    // One window later, the next hit sweeps every stale key away.
    limiter.hit('fresh', 60_000 + 500);
    expect(limiter.size).toBe(1);
    // A key still inside the window survives a sweep.
    limiter.hit('recent', 100_000);
    limiter.hit('fresh', 120_600);
    expect(limiter.size).toBe(2);
    limiter.prune(180_601);
    expect(limiter.size).toBe(0);
  });

  it('forgets a key on request, resetting its count', () => {
    const limiter = new SlidingWindowLimiter(1, 60_000);
    expect(limiter.hit('a', 0).ok).toBe(true);
    expect(limiter.hit('a', 1).ok).toBe(false);
    limiter.forget('a');
    expect(limiter.size).toBe(0);
    expect(limiter.hit('a', 2).ok).toBe(true);
  });
});

describe('guardRequest', () => {
  it('returns 401 without a valid token and 429 past the limit', async () => {
    const secret = getAppSecret();
    expect(guardRequest(req({}))?.status).toBe(401);
    expect(guardRequest(req({ [APP_TOKEN_HEADER]: 'wrong' }))?.status).toBe(401);
    const limiter = new SlidingWindowLimiter(1, 60_000);
    expect(guardRequest(req({ [APP_TOKEN_HEADER]: secret }), limiter)).toBeNull();
    const limited = guardRequest(req({ [APP_TOKEN_HEADER]: secret }), limiter);
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get('Retry-After')).toBe('60');
  });
});
