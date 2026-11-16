// @vitest-environment jsdom
/**
 * Cubyntra - Client app token lookup
 * Necookie Labs (c) 2026
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_TOKEN_STORAGE_KEY, getAppToken, resetAppTokenCache } from '../src/app-shell/appToken';

afterEach(() => {
  resetAppTokenCache();
  window.localStorage.clear();
});

describe('getAppToken', () => {
  it('uses the loopback token route on the laptop, once', async () => {
    const fetcher = vi.fn(async () => Response.json({ token: 'abc' }));
    expect(await getAppToken(fetcher as unknown as typeof fetch)).toBe('abc');
    expect(await getAppToken(fetcher as unknown as typeof fetch)).toBe('abc');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('falls back to a token stored by pairing when the route refuses', async () => {
    window.localStorage.setItem(APP_TOKEN_STORAGE_KEY, 'paired');
    const fetcher = vi.fn(async () => Response.json({ error: 'no' }, { status: 403 }));
    expect(await getAppToken(fetcher as unknown as typeof fetch)).toBe('paired');
  });

  it('is null on an unpaired phone that is offline', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('offline');
    });
    expect(await getAppToken(fetcher as unknown as typeof fetch)).toBeNull();
  });
});
