/**
 * Cubyntra - Ask the Coach Route
 * POST /api/coach/chat
 *
 * Body (JSON, at most 24 KB): `{ "facts": CoachFacts, "question": string (1-400 characters),
 * "history": [{ "role": "student" | "coach", "text": string (up to 1,200) }] }`; only the newest
 * eight turns are used. The server recomputes the facts' derived fields (`moveWords`,
 * `caseTip`). Header `x-cubyntra-token` must hold the app secret (hosted modes: the signed-in
 * user's token, ADR-017). 20 questions a minute per token or user, apart from the hint limit.
 *
 * Answers with Server-Sent Events, the same contract as `/api/coach` (`src/coach/sse.ts`):
 * `delta` appends text, `replace` swaps the answer for a built-in one, one `done` ends it. The
 * monthly spend cap is shared with hints. Errors before streaming are JSON: 400 bad body, 401 bad
 * token, 413 too large, 429 rate limited (with Retry-After).
 */

import { parseChatRequest, MAX_CHAT_REQUEST_BYTES } from '@/coach/chat';
import { coachChatReply } from '@/coach/chatService';
import { encodeCoachEvent } from '@/coach/sse';
import { chatRateLimiter } from '@/lib/localAuth';
import { readJsonCapped } from '@/lib/readBodyCapped';
import { guardUser } from '@/lib/requestUser';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const guard = await guardUser(req, chatRateLimiter);
  if (!guard.ok) return guard.response;

  const body = await readJsonCapped(req, MAX_CHAT_REQUEST_BYTES);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const parsed = parseChatRequest(body.value);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const abort = new AbortController();
  // Stop the Claude call if the student leaves or presses Stop (the request is aborted).
  req.signal?.addEventListener('abort', () => abort.abort());
  const encoder = new TextEncoder();
  const events = coachChatReply(parsed.value, { signal: abort.signal });

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
