/**
 * Cubyntra - Health Route (ADR-017)
 * GET /api/health
 *
 * No auth. Returns `{ ok: true, mode, version }`: the auth mode (`local`, `cloudflare-access`,
 * `passcode` or `invalid`) and the app version. It says nothing about which keys or caps are
 * configured, the data directory or the user. For uptime checks and the deploy smoke test.
 */

import { authMode } from '@/lib/authMode';
import pkg from '../../../../package.json';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ ok: true, mode: authMode(), version: pkg.version }, { headers: { 'Cache-Control': 'no-store' } });
}
