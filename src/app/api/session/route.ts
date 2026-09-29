/**
 * Cubyntra - Session Creation Route Handler
 * POST /api/session
 */

import { NextRequest, NextResponse } from 'next/server';
import os from 'os';
import { sessionManager } from '@/sync/sessionManager';
import { rankLanAddresses } from '@/sync/network';

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const preferredId = typeof body?.preferredId === 'string' ? body.preferredId : undefined;
    const session = sessionManager.createSession(preferredId);

    const availableIps = getLocalIpAddresses();
    const primaryIp = availableIps[0] || '127.0.0.1';

    // Determine host URL for QR code generation
    const hostHeader = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
    // Match how this server is being reached. Phones only allow the camera on https://,
    // so an HTTPS dev server must hand out an https:// companion link.
    const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '') || 'http';
    const port = hostHeader.includes(':') ? hostHeader.split(':')[1] : '3000';

    // If accessed via localhost/127.0.0.1 on desktop, use the actual LAN IP for the QR code!
    const effectiveHost =
      hostHeader.startsWith('localhost') || hostHeader.startsWith('127.0.0.1')
        ? `${primaryIp}:${port}`
        : hostHeader;

    const companionUrl = `${proto}://${effectiveHost}/companion?session=${session.id}`;

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      companionUrl,
      availableIps,
      primaryIp,
      session,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create session' },
      { status: 500 }
    );
  }
}
