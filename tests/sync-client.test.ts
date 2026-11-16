/**
 * Cubyntra - Browser sync transport tests (fake fetch, no network)
 * Necookie Labs (c) 2026
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_HEADER,
  createSseParser,
  deleteSyncSession,
  openSyncStream,
  postSyncMessage,
} from '../src/sync/syncClient';
import { SESSION_SECRET_HEADER } from '../src/sync/pairing';
import { StreamEvent } from '../src/sync/types';

afterEach(() => vi.useRealTimers());

function sseResponse(events: StreamEvent[], keepOpen = false): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      if (!keepOpen) controller.close();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createSseParser', () => {
  it('reassembles frames split across chunks', () => {
    const got: string[] = [];
    const push = createSseParser((d) => got.push(d));
    push('data: {"a"');
    push(':1}\n');
    push('\ndata: 2\r\n\r\n: comment\n\n');
    expect(got).toEqual(['{"a":1}', '2']);
  });
});

describe('openSyncStream', () => {
  it('uses the same secret header as the server', () => {
    expect(SESSION_HEADER).toBe(SESSION_SECRET_HEADER);
  });

  it('sends the secret in a header, never in the URL', async () => {
    const fetchImpl = vi.fn(async () => sseResponse([{ kind: 'ping', at: 1 }], true));
    const stream = openSyncStream({ sessionId: 'sid', secret: 'SECRET', role: 'mobile', onEvent: () => {}, fetchImpl });
    await flush();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/session/sid/events?role=mobile');
    expect(url).not.toContain('SECRET');
    expect((init.headers as Record<string, string>)[SESSION_HEADER]).toBe('SECRET');
    stream.close();
  });

  it('delivers events and stops on ended', async () => {
    const events: StreamEvent[] = [];
    const onEnded = vi.fn();
    const fetchImpl = vi.fn(async () =>
      sseResponse([
        { kind: 'ping', at: 1 },
        { kind: 'ended', reason: 'deleted' },
      ])
    );
    openSyncStream({ sessionId: 's', secret: 'k', role: 'desktop', onEvent: (e) => events.push(e), onEnded, fetchImpl });
    await vi.waitFor(() => expect(onEnded).toHaveBeenCalledWith('deleted'));
    expect(events).toEqual([{ kind: 'ping', at: 1 }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gives up on 403/404 and reconnects after a dropped stream', async () => {
    const onEnded = vi.fn();
    const gone = vi.fn(async () => new Response('{}', { status: 403 }));
    openSyncStream({ sessionId: 's', secret: 'k', role: 'mobile', onEvent: () => {}, onEnded, fetchImpl: gone });
    await vi.waitFor(() => expect(onEnded).toHaveBeenCalledWith('gone'));

    const statuses: string[] = [];
    const dropping = vi.fn(async () => sseResponse([{ kind: 'ping', at: 1 }]));
    const stream = openSyncStream({
      sessionId: 's',
      secret: 'k',
      role: 'mobile',
      onEvent: () => {},
      onStatus: (s) => statuses.push(s),
      retryDelaysMs: [1],
      fetchImpl: dropping,
    });
    await vi.waitFor(() => expect(dropping.mock.calls.length).toBeGreaterThanOrEqual(2));
    stream.close();
    expect(statuses).toContain('retrying');
  });

  it('close() aborts the request and stops retrying', async () => {
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return sseResponse([], true);
    });
    const stream = openSyncStream({ sessionId: 's', secret: 'k', role: 'mobile', onEvent: () => {}, fetchImpl: fetchImpl as unknown as typeof fetch });
    await flush();
    stream.close();
    expect(signal?.aborted).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('postSyncMessage and deleteSyncSession', () => {
  it('posts JSON with the secret header and returns the sequence number', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ success: true, seq: 7 }));
    const result = await postSyncMessage(
      's',
      'k',
      { type: 'presence', payload: { visible: true }, role: 'mobile', clientId: 'c-12345678' },
      fetchImpl as unknown as typeof fetch
    );
    expect(result).toEqual({ ok: true, seq: 7 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/session/s/messages');
    expect((init.headers as Record<string, string>)[SESSION_HEADER]).toBe('k');
  });

  it('reports failures without throwing', async () => {
    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(
      await postSyncMessage('s', 'k', { type: 'presence', payload: { visible: true }, role: 'mobile', clientId: 'c-12345678' }, failing)
    ).toEqual({ ok: false, status: 0 });
  });

  it('DELETE uses keepalive so it survives page unload', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ success: true }));
    await deleteSyncSession('s', 'k', fetchImpl as unknown as typeof fetch);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/session/s');
    expect(init).toMatchObject({ method: 'DELETE', keepalive: true });
  });
});
