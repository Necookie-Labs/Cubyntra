/**
 * Cubyntra - Typed pairing code format (shared by server and phone)
 * Necookie Labs (c) 2026
 */

/** No 0/O, 1/I/L or U/V look-alikes, so a code read off a screen types back correctly. */
export const PAIRING_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTWXYZ';
export const PAIRING_CODE_LENGTH = 6;

const CODE_PATTERN = new RegExp(`^[${PAIRING_CODE_ALPHABET}]{${PAIRING_CODE_LENGTH}}$`);

/** Upper-cases and drops spaces and dashes, so "abc-def" and "ABC DEF" both work. */
export function normalizePairingCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function isPairingCode(value: unknown): value is string {
  return typeof value === 'string' && CODE_PATTERN.test(value);
}

/** "ABCDEF" shown as "ABC-DEF". */
export function formatPairingCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}
