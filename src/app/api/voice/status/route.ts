/**
 * Cubyntra - Voice Status Route (ADR-016)
 * GET /api/voice/status[?preference=off|device|elevenlabs]
 *
 * Header `x-cubyntra-token` must hold the app secret. Returns `VoiceStatus`:
 * `{ mode: 'elevenlabs' | 'device' | 'off', keySet, monthCredits, capCredits, remaining?,
 * accountRemaining?, warning, reason?, month }`. `preference` is the voice the student chose
 * (default: the one saved in the profile); `mode` is what the laptop can give them now.
 */

import { guardUser } from '@/lib/requestUser';
import { readStudentProfile } from '@/lib/studentFile';
import { VOICE_MODES, type VoiceMode } from '@/lib/studentProfile';
import { voiceStatus } from '@/voice/service';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const guard = await guardUser(req);
  if (!guard.ok) return guard.response;
  const asked = new URL(req.url).searchParams.get('preference');
  const preference: VoiceMode = (VOICE_MODES as readonly string[]).includes(asked ?? '')
    ? (asked as VoiceMode)
    : readStudentProfile().settings.voiceMode;
  return Response.json(await voiceStatus(preference), { headers: { 'Cache-Control': 'no-store' } });
}
