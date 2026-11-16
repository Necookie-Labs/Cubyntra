// @vitest-environment jsdom
/**
 * Cubyntra - Client app token: the laptop's loopback route, else the phone's pairing
 * Necookie Labs (c) 2026
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAppToken, pairedToken, resetAppTokenCache } from '../src/app-shell/appToken';
import { PAIRING_STORAGE_KEY, savePairing } from '../src/sync/pairingStorage';

const CREDS = {
  sessionId: '0f8fad5b-d9cb-469f-a165-70867728950e',
  secret: 'abcdefghijklmnopqrstuv',
  token: 'T'.repeat(43),
};

afterEach(() => {
  resetAppTokenCache();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

const refuse = () => vi.fn(async () => Response.json({ error: 'no' }, { status: 403 }));

describe('getAppToken', () => {
  it('uses the loopback token route on the laptop, once', async () => {
    const fetcher = vi.fn(async () => Response.json({ token: 'abc' }));
    expect(await getAppToken(fetcher as unknown as typeof fetch)).toBe('abc');
    expect(await getAppToken(fetcher as unknown as typeof fetch)).toBe('abc');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("uses the paired phone's token from Phase 8's sessionStorage pairing", async () => {
    savePairing(window, CREDS);
    expect(window.sessionStorage.getItem(PAIRING_STORAGE_KEY)).toContain(CREDS.token);
    expect(pairedToken()).toBe(CREDS.token);
    expect(await getAppToken(refuse() as unknown as typeof fetch)).toBe(CREDS.token);
  });

  it('never reads a token from localStorage', async () => {
    window.localStorage.setItem('cubyntra.appToken', 'stale');
    expect(await getAppToken(refuse() as unknown as typeof fetch)).toBeNull();
  });

  it('picks up a pairing made after the first lookup', async () => {
    const fetcher = refuse();
    expect(await getAppToken(fetcher as unknown as typeof fetch)).toBeNull();
    savePairing(window, CREDS);
    expect(await getAppToken(fetcher as unknown as typeof fetch)).toBe(CREDS.token);
  });

  it('is null on an unpaired phone that is offline', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('offline');
    });
    expect(await getAppToken(fetcher as unknown as typeof fetch)).toBeNull();
  });
});
