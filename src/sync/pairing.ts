/**
 * Cubyntra - Pairing secrets (server only)
 * Necookie Labs (c) 2026
 *
 * Every value here comes from the platform's cryptographic RNG. Math.random is never used.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { PAIRING_CODE_ALPHABET, PAIRING_CODE_LENGTH } from './pairingCode';

/** Header that carries a session's secret on every sync request. */
export const SESSION_SECRET_HEADER = 'x-cubyntra-session';

const SECRET_BYTES = 16; // 128 bits
const SECRET_PATTERN = /^[A-Za-z0-9_-]{22}$/;

function randomBytes(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

/** A session id: a random UUID. Not a credential, but still unguessable. */
export function newSessionId(): string {
  return globalThis.crypto.randomUUID();
}

/** A 128-bit session secret, base64url (22 characters). */
export function newSessionSecret(): string {
  return Buffer.from(randomBytes(SECRET_BYTES)).toString('base64url');
}

export function isSessionSecretShape(value: unknown): value is string {
  return typeof value === 'string' && SECRET_PATTERN.test(value);
}

/**
 * A six-character code from the unambiguous alphabet, uniformly distributed (bytes that would
 * bias the modulo are rejected and redrawn).
 */
export function newPairingCode(): string {
  const n = PAIRING_CODE_ALPHABET.length;
  const limit = 256 - (256 % n);
  let code = '';
  while (code.length < PAIRING_CODE_LENGTH) {
    for (const byte of randomBytes(PAIRING_CODE_LENGTH * 2)) {
      if (byte < limit && code.length < PAIRING_CODE_LENGTH) code += PAIRING_CODE_ALPHABET[byte % n];
    }
  }
  return code;
}

/**
 * Constant-time comparison. Both sides are hashed first so inputs of different lengths take
 * the same time and `timingSafeEqual` always gets equal-length buffers.
 */
export function secretsMatch(given: string | null | undefined, expected: string): boolean {
  if (typeof given !== 'string' || given.length === 0 || given.length > 256) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
