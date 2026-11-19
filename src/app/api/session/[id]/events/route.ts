/**
 * Cubyntra - Sync Event Stream
 * GET /api/session/[id]/events?role=desktop|mobile
 *
 * Server-Sent Events. Requires the session secret in `x-cubyntra-session` (clients read the stream
 * with `fetch`, not `EventSource`, so the secret travels in a header and never in a URL). Each
 * frame is `data: <StreamEvent JSON>`: first a `snapshot`, then `message`, `connections`, a `ping`
 * every 15 s (which also keeps the session alive), and `ended` before the stream closes when the
 * session is deleted or expires.
 *
 * Cleanup (unsubscribe, stop the ping, release the connection count) runs exactly once, on
 * whichever comes first: the client cancelling the stream, the request's abort signal, or the
 * session ending.
 */

import { sessionManager } from '@/sync/sessionManager';
import { guardSession, jsonError } from '@/sync/server';
import { DeviceRole, PING_INTERVAL_MS, StreamEvent } from '@/sync/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const denied = await guardSession(req, id);
  if (denied) return denied;

  const roleParam = new URL(req.url).searchParams.get('role');
  if (roleParam !== 'desktop' && roleParam !== 'mobile') return jsonError(400, 'role must be desktop or mobile');
  const role: DeviceRole = roleParam;

  const encoder = new TextEncoder();
  let finish: () => void = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let done = false;
      let ping: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: () => void = () => {};
      let release: () => void = () => {};

      finish = () => {
        if (done) return;
        done = true;
        if (ping) clearInterval(ping);
        unsubscribe();
        release();
        req.signal?.removeEventListener('abort', finish);
        try {
          controller.close();
        } catch {
          // Already closed or cancelled.
        }
      };

      const send = (event: StreamEvent) => {
        if (done) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          finish();
        }
      };

      // Count this stream before listening, so its own connect notice is not echoed to it; the
      // snapshot below already carries the new counts.
      release = sessionManager.connect(id, role);
      unsubscribe = sessionManager.subscribe(id, (event) => {
        send(event);
        if (event.kind === 'ended') finish();
      });

      const snapshot = sessionManager.snapshot(id);
      if (!snapshot) {
        send({ kind: 'ended', reason: 'expired' });
        finish();
        return;
      }
      send({ kind: 'snapshot', snapshot });

      ping = setInterval(() => {
        if (!sessionManager.touch(id)) {
          send({ kind: 'ended', reason: 'expired' });
          finish();
          return;
        }
        send({ kind: 'ping', at: Date.now() });
      }, PING_INTERVAL_MS);

      if (req.signal?.aborted) finish();
      else req.signal?.addEventListener('abort', finish, { once: true });
    },
    cancel() {
      finish();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
