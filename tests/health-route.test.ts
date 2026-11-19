/**
 * Cubyntra - /api/health (ADR-017)
 * Necookie Labs (c) 2026
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../src/app/api/health/route';
import pkg from '../package.json';

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/health', () => {
  it('answers without auth with ok, mode and version', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mode: 'local', version: pkg.version });
  });

  it('reports the hosted mode', async () => {
    vi.stubEnv('CUBYNTRA_AUTH_MODE', 'passcode');
    expect((await (await GET()).json()).mode).toBe('passcode');
    vi.stubEnv('CUBYNTRA_AUTH_MODE', 'bogus');
    expect((await (await GET()).json()).mode).toBe('invalid');
  });

  it('never reveals whether keys or codes are configured', async () => {
    const without = await (await GET()).text();
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test-secret');
    vi.stubEnv('ELEVENLABS_API_KEY', 'el-test-secret');
    vi.stubEnv('CUBYNTRA_ACCESS_CODE', 'cube-night-2026');
    vi.stubEnv('CF_ACCESS_AUD', 'aud-secret');
    const withKeys = await (await GET()).text();
    expect(withKeys).toBe(without);
    expect(withKeys).not.toMatch(/key|secret|aud|code|cap/i);
  });
});
