/**
 * Cubyntra - Coach Route
 * POST /api/coach
 *
 * Body: `{ "facts": CoachFacts }` (JSON, at most 8 KB). Header `x-cubyntra-token` must hold the
 * app secret (hosted modes: the signed-in user's token, ADR-017). Answers with Server-Sent Events (`text/event-stream`, see `src/coach/sse.ts`):
 * `delta` events append text, a `replace` event swaps the reply for a template, and one `done`
 * event ends it. Errors before streaming are JSON: 400 bad body, 401 bad token, 413 too large,
 * 429 rate limited (with Retry-After).
 */

import { parseCoachFacts } from '@/coach/facts';
import { coachReply } from '@/coach/service';
import { encodeCoachEvent } from '@/coach/sse';
import { MAX_REQUEST_BYTES } from '@/coach/types';
import { coachRateLimiter } from '@/lib/localAuth';
import { readJsonCapped } from '@/lib/readBodyCapped';
import { guardUser } from '@/lib/requestUser';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const guard = await guardUser(req, coachRateLimiter);
  if (!guard.ok) return guard.response;

  // Read in chunks and stop at the cap, so a chunked body with no Content-Length is never
  // buffered in full.
  const body = await readJsonCapped(req, MAX_REQUEST_BYTES);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const parsed = parseCoachFacts((body.value as { facts?: unknown } | null)?.facts);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const abort = new AbortController();
  // Stop the Claude call if the student leaves (the request is aborted or the stream cancelled).
  req.signal?.addEventListener('abort', () => abort.abort());
  const encoder = new TextEncoder();
  const events = coachReply(parsed.value, { signal: abort.signal });

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await events.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(encodeCoachEvent(value)));
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      abort.abort();
      await events.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
