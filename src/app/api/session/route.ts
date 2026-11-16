/**
 * Cubyntra - Session Creation Route Handler
 * POST /api/session
 *
 * Laptop only: requires the app token (`x-cubyntra-token`, from `GET /api/auth/token`). The body
 * is ignored; the session id, its 128-bit secret and the typed code all come from the crypto RNG.
 * Returns `{ sessionId, secret, code, codeExpiresAt, companionUrl, availableIps, primaryIp }`.
 * `companionUrl` is the QR link, with the credentials in its fragment (`src/sync/pairingLink.ts`).
 * 401 bad token, 429 rate limited, 503 when every session slot is in use.
 */

import os from 'os';
import { getPairingToken, guardRequest } from '@/lib/localAuth';
import { sessionManager } from '@/sync/sessionManager';
import { rankLanAddresses } from '@/sync/network';
import { buildPairingUrl } from '@/sync/pairingLink';
import { jsonError, sessionCreateLimiter } from '@/sync/server';

export const dynamic = 'force-dynamic';

function getLocalIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  // Prioritize Wi-Fi and physical Ethernet
  for (const name of Object.keys(interfaces)) {
    if (/loopback|pseudo|vEthernet|wsl/i.test(name)) continue;
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }

  return addresses.length > 0 ? rankLanAddresses(addresses) : ['127.0.0.1'];
}

export async function POST(req: Request) {
  const denied = guardRequest(req, sessionCreateLimiter);
  if (denied) return denied;

  const created = sessionManager.createSession();
  if (!created) return jsonError(503, 'Too many pairings are open. Close one and try again.');

  const availableIps = getLocalIpAddresses();
  const primaryIp = availableIps[0] || '127.0.0.1';

  const url = new URL(req.url);
  const hostHeader = req.headers.get('host') || url.host || 'localhost:3000';
  // Match how this server is being reached. Phones only allow the camera on https://.
  const proto = url.protocol.replace(':', '') || 'http';
  const port = hostHeader.includes(':') ? hostHeader.split(':').pop() : '3000';

  // Opened on the laptop as localhost: the phone needs the LAN address instead.
  const effectiveHost =
    hostHeader.startsWith('localhost') || hostHeader.startsWith('127.0.0.1') || hostHeader.startsWith('[::1]')
      ? `${primaryIp}:${port}`
      : hostHeader;

  const companionUrl = buildPairingUrl(`${proto}://${effectiveHost}`, {
    sessionId: created.id,
    secret: created.secret,
    token: getPairingToken(),
  });

  return Response.json(
    {
      success: true,
      sessionId: created.id,
      secret: created.secret,
      code: created.code,
      codeExpiresAt: created.codeExpiresAt,
      companionUrl,
      availableIps,
      primaryIp,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
