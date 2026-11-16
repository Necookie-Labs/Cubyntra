// @vitest-environment jsdom
/**
 * Cubyntra - useCoach Hook Tests (fake fetch, no network)
 * Necookie Labs (c) 2026
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { applyMoves, invertAlgorithm, parseAlgorithm } from '../src/cube/transforms';
import { createSolvedCubeState } from '../src/cube/constants';
import { planNextStepIn } from '../src/tutor/engine';
import { CFOP_METHOD } from '../src/tutor/methods/cfop';
import { StepPlan } from '../src/tutor/types';
import { APP_TOKEN_HEADER, useCoach } from '../src/coach/useCoach';
import { APP_TOKEN_HEADER as SERVER_HEADER } from '../src/lib/localAuth';
import { encodeCoachEvent } from '../src/coach/sse';
import { CoachStreamEvent } from '../src/coach/types';

const yellowTop = applyMoves(createSolvedCubeState(), parseAlgorithm('z2'));
function planFor(alg: string): StepPlan {
  const plan = planNextStepIn(CFOP_METHOD, applyMoves(yellowTop, invertAlgorithm(parseAlgorithm(alg))));
  if (!plan) throw new Error('expected a plan');
  return plan;
}
const SUNE = planFor("R U R' U R U2 R'");
const ANTISUNE = planFor("R U2 R' U' R U' R'");

/** A streaming response whose chunks are released one by one by calling `next()`. */
function controlledResponse(events: CoachStreamEvent[]) {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  let i = 0;
  return {
    response: new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    next: () => {
      if (i < events.length) controller.enqueue(encoder.encode(encodeCoachEvent(events[i++])));
      if (i === events.length) controller.close();
    },
    rest: () => {
      while (i < events.length) controller.enqueue(encoder.encode(encodeCoachEvent(events[i++])));
      controller.close();
    },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useCoach', () => {
  it('uses the same token header as the server', () => {
    expect(APP_TOKEN_HEADER).toBe(SERVER_HEADER);
  });

  it('posts the facts with the token and streams text into state', async () => {
    const reply = controlledResponse([
      { type: 'delta', text: 'Find the ' },
      { type: 'delta', text: 'yellow corner.' },
      { type: 'done', source: 'live', mode: 'live' },
    ]);
    fetchMock.mockResolvedValue(reply.response);
    const { result } = renderHook(() => useCoach({ plan: SUNE, token: 'secret' }));

    act(() => result.current.requestHint(1));
    expect(result.current.status).toBe('loading');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/coach');
    expect(init.headers[APP_TOKEN_HEADER]).toBe('secret');
    const sent = JSON.parse(init.body).facts;
    expect(sent).toMatchObject({ caseId: 'oll-corners-sune', hintLevel: 1 });
    expect(sent).not.toHaveProperty('startState');

    await act(async () => reply.next());
    await waitFor(() => expect(result.current.text).toBe('Find the '));
    expect(result.current.status).toBe('streaming');
    await act(async () => reply.rest());
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current).toMatchObject({ text: 'Find the yellow corner.', source: 'live', hintLevel: 1 });
  });

  it('shows the template from a replace event with its notice', async () => {
    const reply = controlledResponse([
      { type: 'delta', text: 'Do F ' },
      { type: 'replace', text: 'Template hint.', reason: 'guard' },
      { type: 'done', source: 'template', mode: 'live', reason: 'guard', notice: 'Built-in hint.' },
    ]);
    fetchMock.mockResolvedValue(reply.response);
    const { result } = renderHook(() => useCoach({ plan: SUNE, token: 'secret' }));
    act(() => result.current.requestHint(3));
    await act(async () => reply.rest());
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current).toMatchObject({ text: 'Template hint.', source: 'template', reason: 'guard', notice: 'Built-in hint.' });
  });

  it('reports 401 and 429 as friendly errors', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({}, { status: 429 }));
    const { result } = renderHook(() => useCoach({ plan: SUNE, token: 'secret' }));
    act(() => result.current.requestHint(1));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toContain('short break');

    const noToken = renderHook(() => useCoach({ plan: SUNE, token: null }));
    act(() => noToken.result.current.requestHint(1));
    expect(noToken.result.current.status).toBe('error');
    expect(noToken.result.current.error).toContain('not paired');
  });

  it('aborts and clears when the step changes', async () => {
    const reply = controlledResponse([{ type: 'delta', text: 'Old step ' }, { type: 'done', source: 'live', mode: 'live' }]);
    fetchMock.mockResolvedValue(reply.response);
    const { result, rerender } = renderHook(({ plan }) => useCoach({ plan, token: 'secret' }), {
      initialProps: { plan: SUNE },
    });
    act(() => result.current.requestHint(2));
    const signal: AbortSignal = fetchMock.mock.calls[0][1].signal;
    await act(async () => reply.next());
    await waitFor(() => expect(result.current.text).toBe('Old step '));

    rerender({ plan: ANTISUNE });
    expect(signal.aborted).toBe(true);
    expect(result.current).toMatchObject({ text: '', status: 'idle', hintLevel: null });
  });

  it('aborts on unmount', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { result, unmount } = renderHook(() => useCoach({ plan: SUNE, token: 'secret' }));
    act(() => result.current.requestHint(1));
    const signal: AbortSignal = fetchMock.mock.calls[0][1].signal;
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('flags a stream that ends without finishing', async () => {
    const reply = controlledResponse([{ type: 'delta', text: 'Half ' }]);
    fetchMock.mockResolvedValue(reply.response);
    const { result } = renderHook(() => useCoach({ plan: SUNE, token: 'secret' }));
    act(() => result.current.requestHint(1));
    await act(async () => reply.rest());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.text).toBe('Half ');
  });
});
