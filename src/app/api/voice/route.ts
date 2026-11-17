/**
 * Cubyntra - Voice Route (ADR-016)
 * POST /api/voice
 *
 * Body: `{ "text": string, "kind"?: "phrase" | "reply" }` (JSON, at most 4 KB; no other field).
 * Header `x-cubyntra-token` must hold the app secret. Answers `audio/mpeg` (header
 * `X-Voice-Cache: hit | miss`). A phrase-bank line made before is served from `data/voice/`
 * without spending credits. JSON errors: 400 bad body, 401 bad token, 413 too large, 429 rate
 * limited (with Retry-After); 503 no key or credits used up and 502 ElevenLabs failed, both with
 * `{ fallback: "device", reason }` so the browser speaks with the device voice instead.
 */

import { readJsonCapped } from '@/lib/readBodyCapped';
import { guardRequest, voiceRateLimiter } from '@/lib/localAuth';
import { parseVoiceRequest, speak } from '@/voice/service';
import { MAX_VOICE_REQUEST_BYTES } from '@/voice/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = guardRequest(req, voiceRateLimiter);
  if (denied) return denied;

  const body = await readJsonCapped(req, MAX_VOICE_REQUEST_BYTES);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const parsed = parseVoiceRequest(body.value);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const outcome = await speak(parsed.value, undefined, req.signal);
  if (!outcome.ok) return Response.json(outcome.body, { status: outcome.status, headers: { 'Cache-Control': 'no-store' } });
  return new Response(new Blob([outcome.audio as BlobPart], { type: 'audio/mpeg' }), {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
      'X-Voice-Cache': outcome.cached ? 'hit' : 'miss',
    },
  });
}
