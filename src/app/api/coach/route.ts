/**
 * Cubyntra - Coach Route
 * POST /api/coach
 *
 * Body: `{ "facts": CoachFacts }` (JSON, at most 8 KB). Header `x-cubyntra-token` must hold the
 * app secret. Answers with Server-Sent Events (`text/event-stream`, see `src/coach/sse.ts`):
 * `delta` events append text, a `replace` event swaps the reply for a template, and one `done`
 * event ends it. Errors before streaming are JSON: 400 bad body, 401 bad token, 413 too large,
 * 429 rate limited (with Retry-After).
 */

import { parseCoachFacts } from '@/coach/facts';
import { coachReply } from '@/coach/service';
import { encodeCoachEvent } from '@/coach/sse';
import { MAX_REQUEST_BYTES } from '@/coach/types';
import { coachRateLimiter, guardRequest } from '@/lib/localAuth';

export const dynamic = 'force-dynamic';

const tooLarge = () => Response.json({ error: 'Request body too large' }, { status: 413 });

export async function POST(req: Request) {
  const denied = guardRequest(req, coachRateLimiter);
  if (denied) return denied;

  if (Number(req.headers.get('content-length') ?? 0) > MAX_REQUEST_BYTES) return tooLarge();
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_REQUEST_BYTES) return tooLarge();

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Body must be JSON' }, { status: 400 });
  }
  const parsed = parseCoachFacts((body as { facts?: unknown } | null)?.facts);
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
