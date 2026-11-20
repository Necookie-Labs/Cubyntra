// @vitest-environment jsdom
/**
 * Cubyntra - Settings: Voice (mocked laptop status, no network, no real speech)
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { planNextStep } from '@/tutor';
import { defaultStudentProfile } from '@/lib/studentProfile';

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
vi.mock('@/components/twin/TeachingTwin', () => ({
  TeachingTwin: (props: { plan: { caseName: string } | null; stickerLetters?: boolean }) => (
    <section aria-label="Teaching twin" data-letters={String(props.stickerLetters)}>
      {props.plan?.caseName}
    </section>
  ),
}));
vi.mock('@/components/camera/CameraScanner', () => ({
  CameraScanner: () => <div>camera scanner</div>,
}));
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
    subscribe: vi.fn(() => () => {}),
    requestRescan: vi.fn(async () => {}),
    confirmScan: vi.fn(async () => {}),
  },
}));
vi.mock('@/sync/CompanionSyncProvider', () => ({
  CompanionSyncProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useCompanion: () => companion.value,
}));

const { useTutorStore } = await import('@/stores/useTutorStore');
const { SettingsView } = await import('@/components/settings/SettingsView');
const { resetAppTokenCache } = await import('@/app-shell/appToken');
const { resetAudioUnlockForTests } = await import('@/voice/audioUnlock');

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });

const voiceStatus = vi.hoisted(() => ({
  value: { mode: 'device', keySet: false, monthCredits: 0, capCredits: 20000, warning: false, reason: 'no-key', month: '2026-11' } as Record<string, unknown>,
}));

class FakeUtterance {
  rate = 1;
  lang = '';
  voice = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}
const spoken: string[] = [];

beforeEach(() => {
  resetAppTokenCache();
  resetAudioUnlockForTests();
  spoken.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/token') return Response.json({ token: 'secret' });
      if (url === '/api/coach/status') return Response.json({ mode: 'mock', monthSpendUsd: 0, capUsd: 10, month: '2026-11' });
      if (url.startsWith('/api/voice/status')) return Response.json(voiceStatus.value);
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
  useTutorStore.setState({ token: 'secret', profile: defaultStudentProfile(), profileStatus: 'ready', phase: 'idle', plan: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const voiceGroup = () => screen.getByRole('radiogroup', { name: 'Voice' });

describe('Settings: Voice', () => {
  it('is off by default and saves the voice, speed and move style', async () => {
    render(<SettingsView />);
    await flush();
    expect(within(voiceGroup()).getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(voiceGroup()).getByRole('radio', { name: 'Device voice' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Speaking speed' })).getByRole('radio', { name: 'Fast' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Say moves' })).getByRole('radio', { name: 'As letters' }));
    expect(useTutorStore.getState().profile.settings).toMatchObject({ voiceMode: 'device', voiceRate: 1.25, voiceMoves: 'notation' });
  });

  it('disables ElevenLabs with an explanation when the laptop has no key', async () => {
    render(<SettingsView />);
    await flush();
    const eleven = within(voiceGroup()).getByRole('radio', { name: 'ElevenLabs' }) as HTMLButtonElement;
    expect(eleven.disabled).toBe(true);
    expect(screen.getByText(/add ELEVENLABS_API_KEY to .env.local/)).toBeTruthy();
    expect(screen.queryByRole('meter', { name: 'ElevenLabs credits this month' })).toBeNull();
  });

  it('offers ElevenLabs with a key and shows the month credits and the 80% notice', async () => {
    voiceStatus.value = { mode: 'elevenlabs', keySet: true, monthCredits: 16500, capCredits: 20000, remaining: 3500, accountRemaining: 90000, warning: true, month: '2026-11' };
    render(<SettingsView />);
    await flush();
    const eleven = within(voiceGroup()).getByRole('radio', { name: 'ElevenLabs' }) as HTMLButtonElement;
    expect(eleven.disabled).toBe(false);
    fireEvent.click(eleven);
    expect(useTutorStore.getState().profile.settings.voiceMode).toBe('elevenlabs');
    await flush();
    expect(screen.getByText('16,500 of 20,000')).toBeTruthy();
    expect(screen.getByRole('meter', { name: 'ElevenLabs credits this month' })).toBeTruthy();
    expect(screen.getByText('80% used')).toBeTruthy();
    expect(screen.getByText(/3,500 credits left/)).toBeTruthy();
  });

  it('says when the cap is reached', async () => {
    voiceStatus.value = { mode: 'device', keySet: true, monthCredits: 20000, capCredits: 20000, remaining: 0, warning: true, reason: 'capped', month: '2026-11' };
    useTutorStore.setState({ profile: { ...defaultStudentProfile(), settings: { ...defaultStudentProfile().settings, voiceMode: 'elevenlabs' } } });
    render(<SettingsView />);
    await flush();
    expect(screen.getByText('Cap reached')).toBeTruthy();
    expect(screen.getAllByText(/device voice speaks/).length).toBeGreaterThan(0);
  });

  it('offers the five curated voices and both qualities in ElevenLabs mode, and saves the choice', async () => {
    voiceStatus.value = { mode: 'elevenlabs', keySet: true, monthCredits: 0, capCredits: 20000, remaining: 20000, warning: false, month: '2026-11' };
    useTutorStore.setState({ profile: { ...defaultStudentProfile(), settings: { ...defaultStudentProfile().settings, voiceMode: 'elevenlabs' } } });
    render(<SettingsView />);
    await flush();
    const voices = screen.getByRole('radiogroup', { name: 'ElevenLabs voice' });
    const radios = within(voices).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Alice'),
      expect.stringContaining('Matilda'),
      expect.stringContaining('Jessica'),
      expect.stringContaining('Will'),
      expect.stringContaining('George'),
    ]);
    expect(within(voices).getByRole('radio', { name: /Alice/ }).getAttribute('aria-checked')).toBe('true');
    expect(within(voices).getByRole('radio', { name: /Alice/ }).getAttribute('aria-describedby')).toBeTruthy();
    fireEvent.click(within(voices).getByRole('radio', { name: /Jessica/ }));
    // Arrow keys move the choice.
    fireEvent.keyDown(within(voices).getByRole('radio', { name: /Jessica/ }), { key: 'ArrowDown' });
    expect(useTutorStore.getState().profile.settings.voiceId).toBe('bIHbv24MWmeRgasZH58o');
    const quality = screen.getByRole('radiogroup', { name: 'Voice quality' });
    expect(within(quality).getByRole('radio', { name: 'High quality' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/One credit per character/)).toBeTruthy();
    fireEvent.click(within(quality).getByRole('radio', { name: 'Faster, half the credits' }));
    expect(useTutorStore.getState().profile.settings.voiceQuality).toBe('fast');
    expect(screen.getByText(/Half a credit per character/)).toBeTruthy();
  });

  it('hides the voice picker unless ElevenLabs is chosen and available', async () => {
    voiceStatus.value = { mode: 'device', keySet: false, monthCredits: 0, capCredits: 20000, warning: false, reason: 'no-key', month: '2026-11' };
    render(<SettingsView />);
    await flush();
    expect(screen.queryByRole('radiogroup', { name: 'ElevenLabs voice' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Voice quality' })).toBeNull();
  });

  it('offers the laptop voice when ELEVENLABS_VOICE_ID names another', async () => {
    voiceStatus.value = { mode: 'elevenlabs', keySet: true, monthCredits: 0, capCredits: 20000, remaining: 20000, warning: false, month: '2026-11', laptopVoiceId: 'abcdefghij12' };
    useTutorStore.setState({ profile: { ...defaultStudentProfile(), settings: { ...defaultStudentProfile().settings, voiceMode: 'elevenlabs' } } });
    render(<SettingsView />);
    await flush();
    fireEvent.click(screen.getByRole('radio', { name: /Laptop voice/ }));
    expect(useTutorStore.getState().profile.settings.voiceId).toBe('abcdefghij12');
  });

  it('Test voice asks ElevenLabs for a sample in the chosen voice and quality', async () => {
    voiceStatus.value = { mode: 'elevenlabs', keySet: true, monthCredits: 0, capCredits: 20000, remaining: 20000, warning: false, month: '2026-11' };
    const settings = { ...defaultStudentProfile().settings, voiceMode: 'elevenlabs' as const, voiceId: 'XrExE9yKIg1WjnnlVkGX', voiceQuality: 'fast' as const };
    useTutorStore.setState({ profile: { ...defaultStudentProfile(), settings } });
    render(<SettingsView />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Test voice' }));
    await flush();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const voiceCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/voice');
    expect(voiceCalls.length).toBeGreaterThan(0);
    expect(JSON.parse(String((voiceCalls[0][1] as RequestInit).body))).toEqual({
      text: 'Hi! I am your cube coach. Let us solve it together.',
      kind: 'phrase',
      voiceId: 'XrExE9yKIg1WjnnlVkGX',
      quality: 'fast',
    });
    // The laptop answered "not found" here, so the device voice said the sample instead.
    expect(spoken[0]).toBe('Hi! I am your cube coach. Let us solve it together.');
  });

  it('tests the device voice with the chosen move style', async () => {
    voiceStatus.value = { mode: 'device', keySet: false, monthCredits: 0, capCredits: 20000, warning: false, reason: 'no-key', month: '2026-11' };
    render(<SettingsView />);
    await flush();
    const button = screen.getByRole('button', { name: 'Test voice' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(within(voiceGroup()).getByRole('radio', { name: 'Device voice' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Say moves' })).getByRole('radio', { name: 'As letters' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Test voice' }));
    await flush();
    expect(spoken).toEqual(['Hi! I am your cube coach. Let us solve it together.', 'R']);
  });
});

describe('Settings: Talk to the coach', () => {
  it('is off by default, says the browser turns speech into text and no audio is kept, and saves both switches', async () => {
    render(<SettingsView />);
    await flush();
    const talk = screen.getByRole('switch', { name: 'Talk to the coach' });
    expect(talk.getAttribute('aria-checked')).toBe('false');
    const hint = document.getElementById(talk.getAttribute('aria-describedby')!)!;
    expect(hint.textContent).toMatch(/browser.s own speech service turns what you say into text/);
    expect(hint.textContent).toMatch(/never records or stores audio/);
    const autoSend = screen.getByRole('switch', { name: 'Send when I stop talking' }) as HTMLButtonElement;
    expect(autoSend.getAttribute('aria-checked')).toBe('true');
    expect(autoSend.disabled).toBe(true);
    fireEvent.click(talk);
    expect(useTutorStore.getState().profile.settings.talkToCoach).toBe(true);
    // jsdom has no speech recognition: the mic will be hidden, and Settings says so.
    expect(screen.getByText(/cannot turn speech into text/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Send when I stop talking' }));
    expect(useTutorStore.getState().profile.settings.chatAutoSend).toBe(false);
  });
});
