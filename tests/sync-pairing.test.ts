/**
 * Cubyntra - Pairing secret and code tests
 * Necookie Labs (c) 2026
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isSessionSecretShape,
  newPairingCode,
  newSessionId,
  newSessionSecret,
  secretsMatch,
} from '../src/sync/pairing';
import {
  PAIRING_CODE_ALPHABET,
  formatPairingCode,
  isPairingCode,
  normalizePairingCode,
} from '../src/sync/pairingCode';

afterEach(() => vi.restoreAllMocks());

describe('pairing secrets', () => {
  it('never uses Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    newSessionId();
    newSessionSecret();
    newPairingCode();
    expect(spy).not.toHaveBeenCalled();
  });

  it('makes 128-bit base64url secrets that do not repeat', () => {
    const secrets = new Set(Array.from({ length: 200 }, newSessionSecret));
    expect(secrets.size).toBe(200);
    for (const s of secrets) {
      expect(isSessionSecretShape(s)).toBe(true);
      expect(Buffer.from(s, 'base64url')).toHaveLength(16);
    }
  });

  it('makes UUID session ids', () => {
    expect(newSessionId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('compares secrets in constant time and rejects near misses', () => {
    const secret = newSessionSecret();
    expect(secretsMatch(secret, secret)).toBe(true);
    expect(secretsMatch(secret.slice(0, -1) + (secret.endsWith('A') ? 'B' : 'A'), secret)).toBe(false);
    expect(secretsMatch(secret.slice(0, 10), secret)).toBe(false);
    expect(secretsMatch('', secret)).toBe(false);
    expect(secretsMatch(null, secret)).toBe(false);
    expect(secretsMatch('x'.repeat(10_000), secret)).toBe(false);
  });
});

describe('typed pairing codes', () => {
  it('are six characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 500; i++) {
      const code = newPairingCode();
      expect(isPairingCode(code)).toBe(true);
      expect(code).not.toMatch(/[01OILUV]/);
    }
  });

  it('use every letter of the alphabet', () => {
    const seen = new Set(Array.from({ length: 400 }, newPairingCode).join(''));
    expect(seen.size).toBe(PAIRING_CODE_ALPHABET.length);
  });

  it('normalize what the student types', () => {
    expect(normalizePairingCode(' abc-def ')).toBe('ABCDEF');
    expect(formatPairingCode('ABCDEF')).toBe('ABC-DEF');
    expect(isPairingCode('ABCDE')).toBe(false);
    expect(isPairingCode('ABCDE0')).toBe(false);
  });
});
