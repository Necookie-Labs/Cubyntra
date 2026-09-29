/**
 * Cubyntra - Server-Sent Events (SSE) Real-Time Relay
 * GET /api/session/[id]/events
 */

import { NextRequest } from 'next/server';
import { sessionManager } from '@/sync/sessionManager';
import { SessionEvent } from '@/sync/types';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = sessionManager.getSession(id);

  if (!session) {
    return new Response('Session not found', { status: 404 });
  }

  const role = req.nextUrl.searchParams.get('role') || 'desktop';

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let pingInterval: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Announce client connection
      sessionManager.publish({
        type: 'CLIENT_CONNECTED',
        sessionId: id,
        sender: role === 'mobile' ? 'mobile' : 'desktop',
        timestamp: Date.now(),
      });

      // Send initial state snapshot
      const initialEvent: SessionEvent = {
        type: 'STATE_SYNC',
        sessionId: id,
        sender: 'system',
        payload: sessionManager.getSession(id),
        timestamp: Date.now(),
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialEvent)}\n\n`));

      // Subscribe to subsequent session events
      unsubscribe = sessionManager.subscribe(id, (event: SessionEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream closed or error
        }
      });

      // Periodic ping every 15s keeps the connection alive across proxies and marks the
      // session as in use, so a connected pairing never expires while idle.
      pingInterval = setInterval(() => {
        if (!sessionManager.touch(id)) {
          // The session is gone (expired or deleted): end the stream so the client notices.
          if (pingInterval) clearInterval(pingInterval);
          try {
            controller.close();
          } catch {
            // Already closed
          }
          return;
        }
        try {
          const pingEvent: SessionEvent = {
            type: 'PING',
            sessionId: id,
            sender: 'system',
            timestamp: Date.now(),
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(pingEvent)}\n\n`));
        } catch {
          // Closed
        }
      }, 15000);
    },
    cancel() {
      if (unsubscribe) unsubscribe();
      if (pingInterval) clearInterval(pingInterval);
      sessionManager.publish({
        type: 'CLIENT_DISCONNECTED',
        sessionId: id,
        sender: role === 'mobile' ? 'mobile' : 'desktop',
        timestamp: Date.now(),
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
