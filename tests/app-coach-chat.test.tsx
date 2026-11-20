// @vitest-environment jsdom
/**
 * Cubyntra - Ask the coach (CoachChat): chips, typing, Stop, Clear, a new step, push-to-talk
 * with a fake SpeechRecognition, and answers read aloud (fake fetch and fake voice)
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { applyMoves, invertAlgorithm, parseAlgorithm } from '@/cube/transforms';
import { createSolvedCubeState } from '@/cube/constants';
import { planNextStepIn } from '@/tutor/engine';
import { CFOP_METHOD } from '@/tutor/methods/cfop';
import type { StepPlan } from '@/tutor/types';
import { encodeCoachEvent } from '@/coach/sse';
import type { CoachStreamEvent } from '@/coach/types';
import { defaultStudentProfile } from '@/lib/studentProfile';
import { useTutorStore } from '@/stores/useTutorStore';
import { CoachChat, type ChatVoiceControls } from '@/components/coach/CoachChat';
import type { RecognitionLike } from '@/voice/speechInput';

const yellowTop = applyMoves(createSolvedCubeState(), parseAlgorithm('z2'));
function planFor(alg: string): StepPlan {
  const plan = planNextStepIn(CFOP_METHOD, applyMoves(yellowTop, invertAlgorithm(parseAlgorithm(alg))));
  if (!plan) throw new Error('expected a plan');
  return plan;
}
const SUNE = planFor("R U R' U R U2 R'");
const ANTISUNE = planFor("R U2 R' U' R U' R'");

const sse = (events: CoachStreamEvent[]) =>
  new Response(events.map(encodeCoachEvent).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
const answer = (text: string, extra: Partial<Extract<CoachStreamEvent, { type: 'done' }>> = {}) =>
  sse([{ type: 'delta', text }, { type: 'done', source: 'live', mode: 'live', ...extra }]);

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });

class FakeRecognition implements RecognitionLike {
  static last: FakeRecognition | null = null;
  static failWith: string | null = null;
  lang = '';
  interimResults = false;
  continuous = true;
  maxAlternatives = 1;
  onresult: RecognitionLike['onresult'] = null;
  onerror: RecognitionLike['onerror'] = null;
  onend: RecognitionLike['onend'] = null;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    if (FakeRecognition.failWith) {
      const error = FakeRecognition.failWith;
      queueMicrotask(() => {
        this.onerror?.({ error });
        this.onend?.();
      });
    }
  }
  stop() {
    this.onend?.();
  }
  abort() {}
  hear(text: string) {
    this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });
  }
}

let fetchMock: ReturnType<typeof vi.fn>;
const questions = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).question);

function fakeVoice(on = true, elevenlabs = false): ChatVoiceControls & { said: { text: string; premium?: boolean }[]; stops: number } {
  const v = {
    on,
    elevenlabs,
    moves: 'words' as const,
    said: [] as { text: string; premium?: boolean }[],
    stops: 0,
    replace: (item: { text: string; premium?: boolean }) => v.said.push(item),
    interrupt: () => void v.stops++,
  };
  return v;
}

function setSettings(patch: Partial<ReturnType<typeof defaultStudentProfile>['settings']>) {
  const profile = defaultStudentProfile();
  useTutorStore.setState({ profile: { ...profile, settings: { ...profile.settings, ...patch } } });
}

beforeEach(() => {
  fetchMock = vi.fn(async () => answer('It twists the corners.'));
  vi.stubGlobal('fetch', fetchMock);
  FakeRecognition.last = null;
  FakeRecognition.failWith = null;
  useTutorStore.setState({ token: 'secret', profile: defaultStudentProfile(), profileStatus: 'ready' });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CoachChat', () => {
  it('is collapsed under "Ask the coach" until opened', () => {
    render(<CoachChat plan={SUNE} token="secret" collapsible recognition={null} />);
    const toggle = screen.getByRole('button', { name: 'Ask the coach' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('textbox', { name: 'Your question' })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('textbox', { name: 'Your question' })).toBeTruthy();
  });

  it('offers the suggested questions, with a move of the step', async () => {
    render(<CoachChat plan={SUNE} token="secret" recognition={null} />);
    const chips = within(screen.getByRole('group', { name: 'Suggested questions' })).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['Why does this work?', 'How do I spot this case?', "What does R' mean?", 'What if I mess up?']);
    fireEvent.click(chips[2]);
    await flush();
    expect(questions()).toEqual(["What does R' mean?"]);
    const list = screen.getByRole('list', { name: 'Conversation with the coach' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(["You asked: What does R' mean?", 'Coach: It twists the corners.']);
  });

  it('sends with Enter, keeps Shift+Enter for a new line, and announces the answer politely', async () => {
    render(<CoachChat plan={SUNE} token="secret" recognition={null} />);
    const field = screen.getByRole('textbox', { name: 'Your question' }) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Why the corners?' } });
    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: 'Enter' });
    await flush();
    expect(questions()).toEqual(['Why the corners?']);
    expect(field.value).toBe('');
    const live = document.querySelector('[aria-live="polite"]')!;
    expect(live.textContent).toBe('It twists the corners.');
  });

  it('shows Stop while an answer streams, and Clear empties the conversation', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    fetchMock.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) })));
    render(<CoachChat plan={SUNE} token="secret" recognition={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Why does this work?' }));
    await flush();
    act(() => controller.enqueue(new TextEncoder().encode(encodeCoachEvent({ type: 'delta', text: 'It twists ' }))));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.getByText('Stopped.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('list', { name: 'Conversation with the coach' })).toBeNull();
  });

  it('starts a new conversation on a new step and says so', async () => {
    const { rerender } = render(<CoachChat plan={SUNE} token="secret" recognition={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Why does this work?' }));
    await flush();
    rerender(<CoachChat plan={ANTISUNE} token="secret" recognition={null} />);
    expect(screen.queryByRole('list', { name: 'Conversation with the coach' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('New step, new conversation.');
  });

  it('shows the error and offline states', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 429 }));
    render(<CoachChat plan={SUNE} token="secret" recognition={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Why does this work?' }));
    await flush();
    expect(screen.getByText(/a lot of questions/)).toBeTruthy();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(screen.getByText(/You are offline/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Why does this work?' }) as HTMLButtonElement).disabled).toBe(true);
    online.mockRestore();
  });

  it('reads a finished answer aloud with the voice, with ElevenLabs in ElevenLabs mode', async () => {
    const voice = fakeVoice(true, true);
    render(<CoachChat plan={SUNE} token="secret" voice={voice} recognition={null} />);
    fireEvent.click(screen.getByRole('button', { name: "What does R' mean?" }));
    await flush();
    expect(voice.stops).toBe(1); // the new question stopped what was being said
    expect(voice.said).toEqual([{ text: 'It twists the corners.', kind: 'reply', premium: true }]);
  });

  it('never reads an answer that fails the chat guardrail, and stays quiet with the voice off', async () => {
    fetchMock.mockResolvedValueOnce(answer("Do F R U R' U' F'."));
    const voice = fakeVoice(true, false);
    const { unmount } = render(<CoachChat plan={SUNE} token="secret" voice={voice} recognition={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Why does this work?' }));
    await flush();
    expect(voice.said).toEqual([]);
    unmount();
    const off = fakeVoice(false);
    render(<CoachChat plan={SUNE} token="secret" voice={off} recognition={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Why does this work?' }));
    await flush();
    expect(off.said).toEqual([]);
  });
});

describe('Talk to the coach', () => {
  it('hides the mic until Talk to the coach is on, and where the browser has no speech recognition', () => {
    const { unmount } = render(<CoachChat plan={SUNE} token="secret" recognition={FakeRecognition} />);
    expect(screen.queryByRole('button', { name: 'Talk to the coach' })).toBeNull();
    unmount();
    setSettings({ talkToCoach: true });
    const second = render(<CoachChat plan={SUNE} token="secret" recognition={null} />);
    expect(screen.queryByRole('button', { name: 'Talk to the coach' })).toBeNull();
    second.unmount();
    render(<CoachChat plan={SUNE} token="secret" recognition={FakeRecognition} />);
    expect(screen.getByRole('button', { name: 'Talk to the coach' })).toBeTruthy();
  });

  it('tap to talk: the transcript fills the field and is sent when speech ends (auto-send on)', async () => {
    setSettings({ talkToCoach: true });
    render(<CoachChat plan={SUNE} token="secret" recognition={FakeRecognition} />);
    const mic = screen.getByRole('button', { name: 'Talk to the coach' });
    fireEvent.pointerDown(mic);
    fireEvent.pointerUp(mic);
    expect(screen.getByRole('button', { name: 'Stop listening' }).getAttribute('aria-pressed')).toBe('true');
    expect(FakeRecognition.last!.lang).toBe('en-US');
    act(() => FakeRecognition.last!.hear('how do I spot this case'));
    expect((screen.getByRole('textbox', { name: 'Your question' }) as HTMLTextAreaElement).value).toBe('how do I spot this case');
    act(() => FakeRecognition.last!.stop());
    await flush();
    expect(questions()).toEqual(['how do I spot this case']);
  });

  it('hold to talk: letting go stops listening; with auto-send off the question waits in the field', async () => {
    setSettings({ talkToCoach: true, chatAutoSend: false });
    const now = vi.spyOn(Date, 'now');
    render(<CoachChat plan={SUNE} token="secret" recognition={FakeRecognition} />);
    const mic = screen.getByRole('button', { name: 'Talk to the coach' });
    now.mockReturnValue(1000);
    fireEvent.pointerDown(mic);
    act(() => FakeRecognition.last!.hear('why does this work'));
    now.mockReturnValue(2000);
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Stop listening' }));
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((screen.getByRole('textbox', { name: 'Your question' }) as HTMLTextAreaElement).value).toBe('why does this work');
    expect(screen.getByRole('button', { name: 'Talk to the coach' }).getAttribute('aria-pressed')).toBe('false');
    now.mockRestore();
  });

  it('explains a blocked microphone', async () => {
    setSettings({ talkToCoach: true });
    FakeRecognition.failWith = 'not-allowed';
    render(<CoachChat plan={SUNE} token="secret" recognition={FakeRecognition} />);
    fireEvent.click(screen.getByRole('button', { name: 'Talk to the coach' }), { detail: 0 });
    await flush();
    expect(screen.getByText(/microphone is blocked/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
