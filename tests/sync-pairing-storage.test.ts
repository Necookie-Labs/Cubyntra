// @vitest-environment jsdom
/**
 * Cubyntra - Phone pairing storage tests
 * Necookie Labs (c) 2026
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { buildPairingUrl, parsePairingFragment } from '../src/sync/pairingLink';
import {
  PAIRING_STORAGE_KEY,
  getPairingSnapshot,
  resetPairingStoreForTests,
  setPairing,
  takePairingFromLocation,
} from '../src/sync/pairingStorage';

const creds = {
  sessionId: '0f8fad5b-d9cb-469f-a165-70867728950e',
  secret: 'abcdefghijklmnopqrstuv',
  token: 'T'.repeat(43),
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, '', '/companion');
  resetPairingStoreForTests();
});

describe('pairing link', () => {
  it('round-trips through the URL fragment', () => {
    const url = new URL(buildPairingUrl('https://192.168.1.20:3000/', creds));
    expect(url.pathname).toBe('/companion');
    expect(url.search).toBe('');
    expect(parsePairingFragment(url.hash)).toEqual(creds);
  });

  it('rejects malformed fragments', () => {
    expect(parsePairingFragment('#s=1&k=2&t=3')).toBeNull();
    expect(parsePairingFragment('')).toBeNull();
  });
});

describe('takePairingFromLocation', () => {
  it('moves the credentials into sessionStorage and strips them from the address bar', () => {
    const url = new URL(buildPairingUrl('https://localhost', creds));
    window.history.replaceState(null, '', `/companion${url.hash}`);

    expect(takePairingFromLocation(window)).toEqual(creds);
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(creds.secret);
    expect(window.location.href).not.toContain(creds.token);
    expect(JSON.parse(sessionStorage.getItem(PAIRING_STORAGE_KEY)!)).toEqual(creds);
    expect(localStorage.length).toBe(0);
  });

  it('strips a malformed secret-looking fragment too', () => {
    window.history.replaceState(null, '', '/companion#s=x&k=leaked');
    expect(takePairingFromLocation(window)).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('falls back to the pairing saved earlier in this tab (a reload)', () => {
    sessionStorage.setItem(PAIRING_STORAGE_KEY, JSON.stringify(creds));
    expect(takePairingFromLocation(window)).toEqual(creds);
  });

  it('ignores garbage in storage', () => {
    sessionStorage.setItem(PAIRING_STORAGE_KEY, '{"sessionId":1}');
    expect(takePairingFromLocation(window)).toBeNull();
  });
});

describe('pairing store', () => {
  it('reads once, then follows setPairing', () => {
    expect(getPairingSnapshot()).toBeNull();
    setPairing(creds);
    expect(getPairingSnapshot()).toEqual(creds);
    setPairing(null);
    expect(getPairingSnapshot()).toBeNull();
    expect(sessionStorage.getItem(PAIRING_STORAGE_KEY)).toBeNull();
  });
});
