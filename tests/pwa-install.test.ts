// @vitest-environment jsdom
/**
 * Cubyntra - Install prompt capture and the iOS hint
 * Necookie Labs (c) 2026
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installState,
  isIosSafari,
  promptInstall,
  resetInstallForTests,
  startInstallCapture,
} from '../src/app-shell/install';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

beforeEach(() => {
  resetInstallForTests();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => vi.unstubAllGlobals());

describe('install', () => {
  it('recognises iOS Safari only', () => {
    expect(isIosSafari(IPHONE_SAFARI)).toBe(true);
    expect(isIosSafari(IPHONE_CHROME)).toBe(false);
    expect(isIosSafari(ANDROID_CHROME)).toBe(false);
  });

  it('keeps the Android install prompt and opens it on request', async () => {
    startInstallCapture(window);
    expect(installState(window)).toBe('unavailable');
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(async () => {}),
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(installState(window)).toBe('promptable');
    expect(await promptInstall()).toBe(true);
    expect(event.prompt).toHaveBeenCalled();
    expect(installState(window)).toBe('unavailable');
  });

  it('reports installed when running standalone or after appinstalled', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(display-mode: standalone)' }));
    expect(installState(window)).toBe('installed');
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    startInstallCapture(window);
    window.dispatchEvent(new Event('appinstalled'));
    expect(installState(window)).toBe('installed');
  });
});
