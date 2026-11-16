// @vitest-environment jsdom
/**
 * Cubyntra - Screen Wake Lock helper
 * Necookie Labs (c) 2026
 */

import { describe, expect, it, vi } from 'vitest';
import { keepScreenOn } from '../src/app-shell/wakeLock';

function fakeLock() {
  const sentinels: Array<{ released: boolean; release: ReturnType<typeof vi.fn> }> = [];
  const request = vi.fn(async () => {
    const sentinel = {
      released: false,
      release: vi.fn(async () => {
        sentinel.released = true;
      }),
    };
    sentinels.push(sentinel);
    return sentinel;
  });
  return { nav: { wakeLock: { request } } as unknown as Navigator, request, sentinels };
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('keepScreenOn', () => {
  it('does nothing where the API is missing', () => {
    const handle = keepScreenOn(document, {} as Navigator);
    expect(handle.supported).toBe(false);
    expect(() => handle.release()).not.toThrow();
  });

  it('takes a screen lock while the page is visible', async () => {
    setVisibility('visible');
    const { nav, request } = fakeLock();
    const handle = keepScreenOn(document, nav);
    await flush();
    expect(handle.supported).toBe(true);
    expect(request).toHaveBeenCalledWith('screen');
    handle.release();
  });

  it('takes the lock again when the page comes back after the browser released it', async () => {
    setVisibility('visible');
    const { nav, request, sentinels } = fakeLock();
    const handle = keepScreenOn(document, nav);
    await flush();
    // Hiding the page: the browser drops the lock.
    sentinels[0].released = true;
    setVisibility('hidden');
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    handle.release();
  });

  it('releases the lock and stops listening on release', async () => {
    setVisibility('visible');
    const { nav, request, sentinels } = fakeLock();
    const handle = keepScreenOn(document, nav);
    await flush();
    handle.release();
    expect(sentinels[0].release).toHaveBeenCalled();
    setVisibility('visible');
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('ignores a refused request', async () => {
    setVisibility('visible');
    const nav = { wakeLock: { request: vi.fn().mockRejectedValue(new Error('NotAllowedError')) } } as unknown as Navigator;
    const handle = keepScreenOn(document, nav);
    await flush();
    expect(() => handle.release()).not.toThrow();
  });
});
