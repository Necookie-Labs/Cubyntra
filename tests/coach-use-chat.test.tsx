// @vitest-environment jsdom
/**
 * Cubyntra - useCoachChat and the speech input (fake fetch and a fake SpeechRecognition)
 * Necookie Labs (c) 2026
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { applyMoves, invertAlgorithm, parseAlgorithm } from '../src/cube/transforms';
import { createSolvedCubeState } from '../src/cube/constants';
import { planNextStepIn } from '../src/tutor/engine';
import { CFOP_METHOD } from '../src/tutor/methods/cfop';
import type { StepPlan } from '../src/tutor/types';
import { chatHistory, useCoachChat, type ChatMessage } from '../src/coach/useCoachChat';
import { encodeCoachEvent } from '../src/coach/sse';
import type { CoachStreamEvent } from '../src/coach/types';
import { createSpeechInput, speechErrorMessage, speechRecognitionCtor, type RecognitionLike } from '../src/voice/speechInput';

const yellowTop = applyMoves(createSolvedCubeState(), parseAlgorithm('z2'));
function planFor(alg: string): StepPlan {
  const plan = planNextStepIn(CFOP_METHOD, applyMoves(yellowTop, invertAlgorithm(parseAlgorithm(alg))));
  if (!plan) throw new Error('expected a plan');
  return plan;
}
const SUNE = planFor("R U R' U R U2 R'");
const ANTISUNE = planFor("R U2 R' U' R U' R'");

function sse(events: CoachStreamEvent[]) {
  return new Response(events.map(encodeCoachEvent).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
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

describe('useCoachChat', () => {
  it('posts words only (facts, question, history) and streams the answer', async () => {
    fetchMock.mockResolvedValueOnce(sse([{ type: 'delta', text: 'It twists ' }, { type: 'delta', text: 'the corners.' }, { type: 'done', source: 'live', mode: 'live' }]));
    const { result } = renderHook(() => useCoachChat({ plan: SUNE, token: 'secret' }));
    act(() => result.current.ask('  Why does this work?  '));
    await waitFor(() => expect(result.current.busy).toBe(false));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/coach/chat');
    const body = JSON.parse(String(init.body));
    expect(Object.keys(body).sort()).toEqual(['facts', 'history', 'question']);
    expect(body.question).toBe('Why does this work?');
    expect(body.history).toEqual([]);
    expect(body.facts.hintLevel).toBe(3);
    expect(typeof init.body).toBe('string');
    expect(result.current.messages.map((m) => [m.role, m.text, m.status])).toEqual([
      ['student', 'Why does this work?', 'done'],
      ['coach', 'It twists the corners.', 'done'],
    ]);
  });

  it('sends the earlier turns with the next question and shows a replace', async () => {
    fetchMock
      .mockResolvedValueOnce(sse([{ type: 'delta', text: 'First answer.' }, { type: 'done', source: 'live', mode: 'live' }]))
      .mockResolvedValueOnce(
        sse([
          { type: 'delta', text: 'Bad' },
          { type: 'replace', text: 'Built-in answer.', reason: 'guard' },
          { type: 'done', source: 'template', mode: 'live', reason: 'guard', notice: 'note' },
        ])
      );
    const { result } = renderHook(() => useCoachChat({ plan: SUNE, token: 'secret' }));
    act(() => result.current.ask('One?'));
    await waitFor(() => expect(result.current.busy).toBe(false));
    act(() => result.current.ask('Two?'));
    await waitFor(() => expect(result.current.messages.at(-1)?.status).toBe('done'));
    const body = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
    expect(body.history).toEqual([
      { role: 'student', text: 'One?' },
      { role: 'coach', text: 'First answer.' },
    ]);
    expect(result.current.messages.at(-1)).toMatchObject({ text: 'Built-in answer.', source: 'template', notice: 'note' });
  });

  it('clears the conversation when the step changes and says so', async () => {
    fetchMock.mockResolvedValue(sse([{ type: 'delta', text: 'Answer.' }, { type: 'done', source: 'live', mode: 'live' }]));
    const { result, rerender } = renderHook(({ plan }) => useCoachChat({ plan, token: 'secret' }), { initialProps: { plan: SUNE } });
    act(() => result.current.ask('Why?'));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    rerender({ plan: ANTISUNE });
    expect(result.current.messages).toEqual([]);
    expect(result.current.stepChanged).toBe(true);
    act(() => result.current.ask('And now?'));
    expect(result.current.stepChanged).toBe(false);
  });

  it('stops a streaming answer, keeping what was shown', async () => {
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
    fetchMock.mockResolvedValue(new Response(body));
    const { result } = renderHook(() => useCoachChat({ plan: SUNE, token: 'secret' }));
    act(() => result.current.ask('Why?'));
    act(() => controller.enqueue(encoder.encode(encodeCoachEvent({ type: 'delta', text: 'Part of it ' }))));
    await waitFor(() => expect(result.current.messages[1].text).toBe('Part of it '));
    act(() => result.current.stop());
    expect(result.current.messages[1].status).toBe('stopped');
    expect(result.current.busy).toBe(false);
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it.each([
    [429, 'a lot of questions'],
    [401, 'not paired'],
    [500, 'cannot be reached'],
  ])('shows an error for status %s', async (status, text) => {
    fetchMock.mockResolvedValue(new Response('{}', { status }));
    const { result } = renderHook(() => useCoachChat({ plan: SUNE, token: 'secret' }));
    act(() => result.current.ask('Why?'));
    await waitFor(() => expect(result.current.error).toContain(text));
    expect(result.current.messages[1].status).toBe('error');
  });

  it('says so when offline, without calling the laptop', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = renderHook(() => useCoachChat({ plan: SUNE, token: 'secret' }));
    act(() => result.current.ask('Why?'));
    expect(result.current.error).toContain('offline');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('keeps finished turns only, newest eight, each at most 1,200 characters', () => {
    const msgs: ChatMessage[] = Array.from({ length: 12 }, (_, i) => ({ id: i, role: i % 2 ? 'coach' : 'student', text: 'x'.repeat(1500), status: 'done' }));
    msgs.push({ id: 99, role: 'coach', text: '', status: 'error' });
    const history = chatHistory(msgs);
    expect(history).toHaveLength(8);
    expect(history.every((t) => t.text.length === 1200)).toBe(true);
  });
});

/** A fake SpeechRecognition: tests drive its events. */
class FakeRecognition implements RecognitionLike {
  static last: FakeRecognition | null = null;
  lang = '';
  interimResults = false;
  continuous = true;
  maxAlternatives = 5;
  onresult: RecognitionLike['onresult'] = null;
  onerror: RecognitionLike['onerror'] = null;
  onend: RecognitionLike['onend'] = null;
  started = false;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
  say(...parts: string[]) {
    const results = parts.map((transcript, i) => Object.assign([{ transcript }], { isFinal: i < parts.length - 1 }));
    this.onresult?.({ resultIndex: 0, results });
  }
}

describe('speech input', () => {
  it('is feature-detected, prefixed or not', () => {
    expect(speechRecognitionCtor({})).toBeNull();
    expect(speechRecognitionCtor({ webkitSpeechRecognition: FakeRecognition })).toBe(FakeRecognition);
    expect(speechRecognitionCtor({ SpeechRecognition: FakeRecognition })).toBe(FakeRecognition);
    expect(speechRecognitionCtor(undefined)).toBeNull();
  });

  it('listens in en-US and hands over the transcript when speech ends', () => {
    const heard: string[] = [];
    const ended: string[] = [];
    const input = createSpeechInput(FakeRecognition, { onTranscript: (t) => heard.push(t), onEnd: (t) => ended.push(t), onError: () => {} });
    expect(input.start()).toBe(true);
    const rec = FakeRecognition.last!;
    expect(rec).toMatchObject({ lang: 'en-US', interimResults: true, continuous: false, started: true });
    expect(input.listening).toBe(true);
    rec.say('what does ', 'are prime mean');
    input.stop();
    expect(heard.at(-1)).toBe('what does are prime mean');
    expect(ended).toEqual(['what does are prime mean']);
    expect(input.listening).toBe(false);
  });

  it('explains a blocked microphone and stays quiet when aborted', () => {
    const errors: string[] = [];
    const input = createSpeechInput(FakeRecognition, { onTranscript: () => {}, onEnd: () => {}, onError: (m) => errors.push(m) });
    input.start();
    FakeRecognition.last!.onerror?.({ error: 'not-allowed' });
    FakeRecognition.last!.onerror?.({ error: 'aborted' });
    expect(errors).toEqual([speechErrorMessage('not-allowed')]);
    expect(errors[0]).toContain('microphone is blocked');
  });

  it('cannot start without a recognition constructor', () => {
    expect(createSpeechInput(null, { onTranscript: () => {}, onEnd: () => {}, onError: () => {} }).start()).toBe(false);
  });
});
