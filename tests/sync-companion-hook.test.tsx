// @vitest-environment jsdom
/**
 * Cubyntra - Laptop sync hook tests (fake fetch, no network)
 * Necookie Labs (c) 2026
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useCompanionSync } from '../src/sync/useCompanionSync';
import { SESSION_HEADER } from '../src/sync/syncClient';
import { StreamEvent } from '../src/sync/types';
import { useCubyntraStore } from '../src/stores/useCubyntraStore';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'qr:fake') } }));

const SESSION = {
  success: true,
  sessionId: '0f8fad5b-d9cb-469f-a165-70867728950e',
  secret: 'abcdefghijklmnopqrstuv',
  code: 'ABCDEF',
  codeExpiresAt: 1,
  companionUrl: 'https://192.168.1.20:3000/companion#s=x&k=y&t=z',
  availableIps: ['192.168.1.20'],
};

type Call = { url: string; init?: RequestInit };

let calls: Call[];
let streamController: ReadableStreamDefaultController<Uint8Array> | null;
let releaseSession: (() => void) | null;
let holdSession: boolean;

function push(event: StreamEvent) {
  streamController!.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
}

beforeEach(() => {
  calls = [];
  streamController = null;
  releaseSession = null;
  holdSession = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === '/api/auth/token') return Response.json({ token: 't'.repeat(43) });
      if (url === '/api/session' && init?.method === 'POST') {
        if (holdSession) await new Promise<void>((resolve) => (releaseSession = resolve));
        return Response.json(SESSION);
      }
      if (url.includes('/events')) {
        const body = new ReadableStream<Uint8Array>({ start: (c) => void (streamController = c) });
        return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
      }
      if (init?.method === 'DELETE') return Response.json({ success: true });
      if (url.endsWith('/messages')) return Response.json({ success: true, seq: 1 });
      return new Response('not found', { status: 404 });
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const creates = () => calls.filter((c) => c.url === '/api/session' && c.init?.method === 'POST');
const deletes = () => calls.filter((c) => c.init?.method === 'DELETE');

describe('useCompanionSync', () => {
  it('creates one session even when initSession is called twice', async () => {
    const { result } = renderHook(() => useCompanionSync());
    await act(async () => {
      const a = result.current.initSession();
      const b = result.current.initSession();
      expect(a).toBe(b);
      await a;
    });
    expect(creates()).toHaveLength(1);
    expect(result.current.sessionId).toBe(SESSION.sessionId);
    expect(result.current.code).toBe('ABCDEF');
    expect(result.current.companionBaseUrl).toBe('https://192.168.1.20:3000/companion');
  });

  it('sends the app token to create a session and the secret to open the stream', async () => {
    const { result } = renderHook(() => useCompanionSync());
    await act(() => result.current.initSession());
    expect((creates()[0].init!.headers as Record<string, string>)['x-cubyntra-token']).toBe('t'.repeat(43));
    await waitFor(() => expect(calls.some((c) => c.url.includes('/events'))).toBe(true));
    const stream = calls.find((c) => c.url.includes('/events'))!;
    expect(stream.url).not.toContain(SESSION.secret);
    expect((stream.init!.headers as Record<string, string>)[SESSION_HEADER]).toBe(SESSION.secret);
  });

  it('cancels a pairing still being created on unmount and deletes it on the server', async () => {
    holdSession = true;
    const { result, unmount } = renderHook(() => useCompanionSync());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.initSession();
    });
    await waitFor(() => expect(releaseSession).not.toBeNull());
    unmount();
    releaseSession!();
    await pending;
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(deletes()[0].url).toBe(`/api/session/${SESSION.sessionId}`);
    expect(calls.some((c) => c.url.includes('/events'))).toBe(false);
  });

  it('disconnect() deletes the session with its secret', async () => {
    const { result } = renderHook(() => useCompanionSync());
    await act(() => result.current.initSession());
    act(() => result.current.disconnect());
    expect(deletes()).toHaveLength(1);
    expect((deletes()[0].init!.headers as Record<string, string>)[SESSION_HEADER]).toBe(SESSION.secret);
    expect(result.current.sessionId).toBeNull();
  });

  it('feeds phone faces into the store and tracks connections by count', async () => {
    useCubyntraStore.getState().resetAll();
    useCubyntraStore.getState().startCompanionScan();
    const { result } = renderHook(() => useCompanionSync());
    await act(() => result.current.initSession());
    await waitFor(() => expect(streamController).not.toBeNull());

    act(() => push({ kind: 'connections', connections: { desktop: 1, mobile: 2 } }));
    await waitFor(() => expect(result.current.mobileConnected).toBe(true));
    act(() => push({ kind: 'connections', connections: { desktop: 1, mobile: 1 } }));
    await waitFor(() => expect(result.current.connections.mobile).toBe(1));
    expect(result.current.mobileConnected).toBe(true);

    act(() =>
      push({
        kind: 'message',
        event: {
          type: 'face-scanned',
          payload: {
            face: 'F',
            colors: Array(9).fill('green'),
            confidences: Array(9).fill(0.9),
            tileRgb: Array(9).fill([20, 160, 60]),
            capturedAt: 1,
          },
          role: 'mobile',
          clientId: 'phone-123456',
          seq: 1,
          at: 1,
        },
      })
    );
    await waitFor(() => expect(useCubyntraStore.getState().faceSamples.F).toBeDefined());
    expect(result.current.faceStatus.F).toBe('accepted');
  });

  it('shows the pairing as ended when the server ends it', async () => {
    const { result } = renderHook(() => useCompanionSync());
    await act(() => result.current.initSession());
    await waitFor(() => expect(streamController).not.toBeNull());
    act(() => push({ kind: 'ended', reason: 'expired' }));
    await waitFor(() => expect(result.current.sessionEnded).toBe(true));
  });
});
