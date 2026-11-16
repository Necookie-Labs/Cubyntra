/**
 * Cubyntra - Pairing link format (shared by laptop and phone)
 * Necookie Labs (c) 2026
 *
 * The QR code holds `<origin>/companion#s=<sessionId>&k=<sessionSecret>&t=<appToken>`. The
 * credentials sit in the URL fragment, which browsers never send to a server, so they do not
 * appear in request lines or logs. The phone moves them into sessionStorage on arrival and strips
 * the fragment from the address bar (see `pairingStorage.ts`).
 */

export interface PairingCredentials {
  sessionId: string;
  secret: string;
  /** The app token for `/api/coach` (`getPairingToken()` on the server). */
  token: string;
}

const SESSION_ID = /^[0-9a-f-]{36}$/;
const SECRET = /^[A-Za-z0-9_-]{22}$/;
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;

export function isPairingCredentials(value: unknown): value is PairingCredentials {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sessionId === 'string' &&
    SESSION_ID.test(v.sessionId) &&
    typeof v.secret === 'string' &&
    SECRET.test(v.secret) &&
    typeof v.token === 'string' &&
    TOKEN.test(v.token)
  );
}

/** The link to encode in the QR code. `origin` is e.g. `https://192.168.1.20:3000`. */
export function buildPairingUrl(origin: string, creds: PairingCredentials): string {
  const fragment = new URLSearchParams({ s: creds.sessionId, k: creds.secret, t: creds.token });
  return `${origin.replace(/\/+$/, '')}/companion#${fragment.toString()}`;
}

/** Reads credentials from a `location.hash` (with or without the leading `#`). */
export function parsePairingFragment(hash: string): PairingCredentials | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const creds = { sessionId: params.get('s') ?? '', secret: params.get('k') ?? '', token: params.get('t') ?? '' };
  return isPairingCredentials(creds) ? creds : null;
}
