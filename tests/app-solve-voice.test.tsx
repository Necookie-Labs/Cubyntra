// @vitest-environment jsdom
/**
 * Cubyntra - Solve screen voice (fake speech, fake twin playback, fake laptop; no network)
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { planNextStep } from '@/tutor';
import { moveName } from '@/cube/moveNames';
import { defaultStudentProfile, type VoiceMode } from '@/lib/studentProfile';
import { encodeCoachEvent } from '@/coach/sse';
import { spokenMove } from '@/voice/speechText';
import { scrambledState } from './helpers/scrambles';
import { sampleProfile } from './helpers/studentProfile';

const nav = vi.hoisted(() => ({ pathname: '/', push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, refresh: nav.refresh, replace: nav.push, back: vi.fn() }),
}));
vi.mock('@/solver/client', () => ({
  planStepInWorker: vi.fn(async (state, method, grip, stepIndex) => planNextStep(state, method, grip, stepIndex)),
  tutorProgressInWorker: vi.fn(async () => ({ method: 'cfop', stageIndex: 1, stage: 'f2l', withinStage: 0, value: 1000, done: false })),
  warmUpSolver: vi.fn(),
  solveInWorker: vi.fn(),
}));

/** The twin's playback, driven by the test. */
const twin = vi.hoisted(() => {
  type Listener = (snapshot: unknown) => void;
  const listeners = new Set<Listener>();
  let snapshot: unknown = { moves: [], index: 0, total: 0, activeIndex: null, direction: null, playing: false, speed: 1, loop: false };
  const playback = {
    getSnapshot: () => snapshot,
    subscribe: (l: Listener) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    emit: (next: unknown) => {
      snapshot = next;
      listeners.forEach((l) => l(next));
    },
  };
  return { playback, engine: { playback } };
});
vi.mock('@/components/twin/TeachingTwin', async () => {
  const ReactMod = await import('react');
  return {
    TeachingTwin: (props: { plan: { caseName: string } | null; onEngineChange?: (e: unknown) => void }) => {
      const { onEngineChange } = props;
      ReactMod.useEffect(() => {
        onEngineChange?.(twin.engine);
      }, [onEngineChange]);
      return <section aria-label="Teaching twin">{props.plan?.caseName}</section>;
    },
  };
});
vi.mock('@/components/camera/CameraScanner', () => ({
  CameraScanner: () => <div>camera scanner</div>,
}));

const companionListeners = vi.hoisted(() => new Set<(e: unknown) => void>());
const companion = vi.hoisted(() => ({
  value: {
    sessionId: null as string | null,
    qrDataUrl: null as string | null,
    code: null as string | null,
    codeExpiresAt: null as number | null,
    companionUrl: null as string | null,
    companionBaseUrl: null as string | null,
    availableIps: [] as string[],
    isCreating: false,
    isConnected: false,
    sessionEnded: false,
    connections: { desktop: 0, mobile: 0 },
    mobileConnected: false,
    phonePresence: null,
    error: null as string | null,
    faceStatus: {},
    getClientId: () => 'laptop',
    initSession: vi.fn(async () => {}),
    disconnect: vi.fn(),
    selectHost: vi.fn(async () => {}),
    send: vi.fn(async () => ({ ok: true, status: 200 })),
    subscribe: (listener: (e: unknown) => void) => {
      companionListeners.add(listener);
      return () => {
        companionListeners.delete(listener);
      };
    },
    requestRescan: vi.fn(async () => {}),
    confirmScan: vi.fn(async () => {}),
  },
}));
vi.mock('@/sync/CompanionSyncProvider', () => ({
  CompanionSyncProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useCompanion: () => companion.value,
}));

const { useTutorStore } = await import('@/stores/useTutorStore');
const { SolveView } = await import('@/components/solve/SolveView');
const { resetAppTokenCache } = await import('@/app-shell/appToken');
const { resetAudioUnlockForTests, unlockAudio } = await import('@/voice/audioUnlock');

const flush = () =>
  act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });

class FakeUtterance {
  rate = 1;
  lang = '';
  voice = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}
const spoken: string[] = [];
const voicePosts: { text: string; kind: string }[] = [];
const COACH_REPLY = 'Look for the white edge on the top.';

beforeEach(() => {
  nav.pathname = '/';
  resetAppTokenCache();
  resetAudioUnlockForTests();
  spoken.length = 0;
  voicePosts.length = 0;
  companion.value.sessionId = null;
  companionListeners.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/token') return Response.json({ token: 'secret' });
      if (url === '/api/coach') {
        const body = [
          encodeCoachEvent({ type: 'delta', text: COACH_REPLY }),
          encodeCoachEvent({ type: 'done', source: 'live', mode: 'live' }),
        ].join('');
        return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
      }
      if (url === '/api/voice') {
        voicePosts.push(JSON.parse(String(init?.body)));
        return Response.json({ error: 'down', fallback: 'device', reason: 'upstream' }, { status: 502 });
      }
      if (url === '/api/student' && init?.method === 'PUT') return new Response(String(init.body));
      if (url === '/api/student') return Response.json(defaultStudentProfile());
      return new Response('not found', { status: 404 });
    })
  );
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('speechSynthesis', {
    speak: (u: FakeUtterance) => {
      spoken.push(u.text);
      queueMicrotask(() => u.onend?.());
    },
    cancel: () => {},
    getVoices: () => [],
  });
  useTutorStore.setState({
    token: 'secret',
    profile: defaultStudentProfile(),
    profileStatus: 'ready',
    method: null,
    cube: null,
    grip: null,
    stepIndex: 0,
    plan: null,
    phase: 'idle',
    attempts: [],
    observations: [],
    checkpoint: null,
    errorMessage: null,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAudioUnlockForTests();
});

/** Resumes a saved solve with the given voice and waits for its first step. */
async function openSolve(voiceMode: VoiceMode) {
  const profile = sampleProfile();
  profile.currentSolve!.state = scrambledState(5, 3);
  profile.currentSolve!.grip = { top: 'white', front: 'green' };
  profile.settings.voiceMode = voiceMode;
  useTutorStore.setState({ profile });
  render(<SolveView />);
  await flush();
  const plan = useTutorStore.getState().plan!;
  expect(plan).toBeTruthy();
  return plan;
}

const playMove = (moves: readonly unknown[], activeIndex: number) =>
  act(() => {
    twin.playback.emit({ moves, index: activeIndex, total: moves.length, activeIndex, direction: 'forward', playing: true, speed: 1, loop: false });
  });

describe('Solve screen voice', () => {
  it('has a speaker button with a name and pressed state that turns the voice on and off', async () => {
    await openSolve('off');
    const button = screen.getByRole('button', { name: 'Voice' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(useTutorStore.getState().profile.settings.voiceMode).toBe('device');
    expect(screen.getByRole('button', { name: 'Voice' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Voice' }));
    expect(useTutorStore.getState().profile.settings.voiceMode).toBe('off');
  });

  it('says nothing before the first tap, even with the voice on', async () => {
    const plan = await openSolve('device');
    playMove([...plan.setupMoves, ...plan.algorithm], 0);
    await flush();
    expect(spoken).toEqual([]);
  });

  it('introduces the stage, narrates each move as the twin plays it, and speaks the checkpoint', async () => {
    unlockAudio();
    const plan = await openSolve('device');
    await flush();
    expect(spoken[0]).toBe(`Next stage: ${plan.stageName}.`);
    const moves = [...plan.setupMoves, ...plan.algorithm];
    playMove(moves, 0);
    await flush();
    expect(spoken).toContain(moveName(moves[0]));
    act(() => {
      useTutorStore.getState().beginCheckpoint();
      useTutorStore.getState().confirmByHand();
    });
    await flush();
    expect(spoken).toContain('Great. Block placed!');
  });

  it('speaks moves as notation when the student chose it', async () => {
    unlockAudio();
    const plan = await openSolve('device');
    act(() => useTutorStore.getState().updateSettings({ voiceMoves: 'notation' }));
    const moves = [...plan.setupMoves, ...plan.algorithm];
    playMove(moves, 0);
    await flush();
    expect(spoken.at(-1)).toBe(spokenMove(moves[0], 'notation'));
  });

  it('reads a finished coach reply with the device voice, with no ElevenLabs button in device mode', async () => {
    unlockAudio();
    await openSolve('device');
    fireEvent.click(screen.getByRole('button', { name: /What to look for/ }));
    await flush();
    expect(spoken).toContain(COACH_REPLY);
    expect(screen.queryByRole('button', { name: 'Read with ElevenLabs' })).toBeNull();
    expect(voicePosts).toEqual([]);
  });

  it('offers Read with ElevenLabs in ElevenLabs mode, sending only the reply text', async () => {
    unlockAudio();
    await openSolve('elevenlabs');
    fireEvent.click(screen.getByRole('button', { name: /What to look for/ }));
    await flush();
    // Read with the device voice first: no reply went to ElevenLabs.
    expect(voicePosts.filter((b) => b.kind === 'reply')).toEqual([]);
    expect(spoken.filter((t) => t === COACH_REPLY)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Read with ElevenLabs' }));
    await flush();
    // The reply text and the voice choice only (Alice, high quality by default).
    expect(voicePosts).toContainEqual({ text: COACH_REPLY, kind: 'reply', voiceId: 'Xb7hH8MSUJpSbSDYk0k2', quality: 'high' });
    // ElevenLabs failed here, so the device voice read it again.
    expect(spoken.filter((t) => t === COACH_REPLY)).toHaveLength(2);
  });

  it('stays silent while the paired phone drives the solve', async () => {
    unlockAudio();
    companion.value.sessionId = 'session-1';
    const plan = await openSolve('device');
    await flush();
    spoken.length = 0;
    act(() => {
      companionListeners.forEach((l) =>
        l({ type: 'playback', payload: { action: 'play' }, clientId: 'phone', role: 'mobile', seq: 99, at: Date.now() })
      );
    });
    expect(screen.getByText('Your other device is speaking.')).toBeTruthy();
    playMove([...plan.setupMoves, ...plan.algorithm], 0);
    await flush();
    expect(spoken).toEqual([]);
  });
});
