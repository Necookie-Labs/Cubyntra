// @vitest-environment jsdom
/**
 * Cubyntra - Phone sync hook tests (fake fetch, no network)
 * Necookie Labs (c) 2026
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useMobileSession } from '../src/sync/useMobileSession';
import { SESSION_HEADER } from '../src/sync/syncClient';
import { FaceScannedPayload, StreamEvent, SyncEvent } from '../src/sync/types';

const creds = {
  sessionId: '0f8fad5b-d9cb-469f-a165-70867728950e',
  secret: 'abcdefghijklmnopqrstuv',
  token: 'T'.repeat(43),
};

const face: FaceScannedPayload = {
  face: 'R',
  colors: Array(9).fill('red'),
  confidences: Array(9).fill(0.8),
  tileRgb: Array(9).fill([190, 20, 30]),
  capturedAt: 1,
};

type Call = { url: string; init?: RequestInit };
let calls: Call[];
let stream: ReadableStreamDefaultController<Uint8Array> | null;
let streamSignal: AbortSignal | null;
let messageStatus: number;
let seq: number;

function push(event: StreamEvent) {
  stream!.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
}

function fromLaptop(type: SyncEvent['type'], payload: unknown): StreamEvent {
  return { kind: 'message', event: { type, payload, role: 'desktop', clientId: 'laptop-1234', seq: ++seq, at: 0 } as SyncEvent };
}

beforeEach(() => {
  calls = [];
  stream = null;
  streamSignal = null;
  messageStatus = 200;
  seq = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('/events')) {
        streamSignal = init?.signal ?? null;
        const body = new ReadableStream<Uint8Array>({ start: (c) => void (stream = c) });
        return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
      }
      if (url.endsWith('/messages')) {
        return messageStatus === 200
          ? Response.json({ success: true, seq: ++seq })
          : Response.json({ success: false }, { status: messageStatus });
      }
      return new Response('', { status: 404 });
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const messages = () =>
  calls.filter((c) => c.url.endsWith('/messages')).map((c) => JSON.parse(c.init!.body as string) as Record<string, unknown>);

describe('useMobileSession', () => {
  it('sends a face as colors only, with the secret in a header', async () => {
    const { result } = renderHook(() => useMobileSession(creds));
    await act(() => result.current.sendFace(face));
    const sent = messages().find((m) => m.type === 'face-scanned')!;
    expect(sent).toMatchObject({ type: 'face-scanned', role: 'mobile', payload: face });
    expect(JSON.stringify(sent)).not.toMatch(/data:image|base64|thumbnail|imageDataUrl/);
    const call = calls.find((c) => c.url.endsWith('/messages'))!;
    expect((call.init!.headers as Record<string, string>)[SESSION_HEADER]).toBe(creds.secret);
    expect(result.current.status.R).toBe('accepted');
  });

  it('accepts faces locally when not paired, and sends nothing', async () => {
    const { result } = renderHook(() => useMobileSession(null));
    await act(() => result.current.sendFace(face));
    expect(result.current.status.R).toBe('accepted');
    expect(calls).toHaveLength(0);
  });

  it('forgets a read face so it can be scanned again, without telling the laptop', async () => {
    const { result } = renderHook(() => useMobileSession(creds));
    await act(() => result.current.sendFace(face));
    expect(result.current.status.R).toBe('accepted');
    const sentBefore = messages().length;
    act(() => result.current.redoFace('R'));
    expect(result.current.status.R).toBeUndefined();
    // The new reading replaces the old one on the laptop when it arrives; nothing is sent now.
    expect(messages()).toHaveLength(sentBefore);
    await act(() => result.current.sendFace(face));
    expect(result.current.status.R).toBe('accepted');
    expect(messages().filter((m) => m.type === 'face-scanned')).toHaveLength(2);
  });

  it('reports an ended pairing', async () => {
    messageStatus = 403;
    const onEnded = vi.fn();
    const { result } = renderHook(() => useMobileSession(creds, { onEnded }));
    await act(() => result.current.sendFace(face));
    expect(result.current.status.R).toBe('rejected');
    expect(result.current.ended).toBe(true);
    expect(onEnded).toHaveBeenCalled();
  });

  it('follows the laptop: rescan, confirm, step and playback', async () => {
    const { result } = renderHook(() => useMobileSession(creds));
    await waitFor(() => expect(stream).not.toBeNull());

    act(() => push(fromLaptop('scan-control', { action: 'rescan', face: 'L' })));
    await waitFor(() => expect(result.current.rescanRequest?.face).toBe('L'));

    act(() => push(fromLaptop('scan-control', { action: 'confirmed' })));
    act(() => push(fromLaptop('step', { method: 'solver', stepIndex: 0, planId: 'solve-1', algorithm: "R U R'" })));
    act(() => push(fromLaptop('playback', { action: 'play' })));
    act(() => push(fromLaptop('playback', { action: 'index', index: 1 })));
    await waitFor(() => expect(result.current.playback).toMatchObject({ playing: true, index: 1 }));
    expect(result.current.confirmed).toBe(true);
    expect(result.current.step?.algorithm).toBe("R U R'");
  });

  it('controls playback: applies at once and tells the laptop', async () => {
    const { result } = renderHook(() => useMobileSession(creds));
    act(() => result.current.controlPlayback({ action: 'seek', index: 4 }));
    expect(result.current.playback.index).toBe(4);
    await waitFor(() => expect(messages().some((m) => m.type === 'playback')).toBe(true));
    expect(messages().find((m) => m.type === 'playback')!.payload).toEqual({ action: 'seek', index: 4 });
  });

  it('closes the stream on unmount', async () => {
    const { unmount } = renderHook(() => useMobileSession(creds));
    await waitFor(() => expect(streamSignal).not.toBeNull());
    unmount();
    expect(streamSignal!.aborted).toBe(true);
  });
});
