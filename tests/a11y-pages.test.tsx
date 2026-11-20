// @vitest-environment jsdom
/**
 * Cubyntra - Automated accessibility check of every screen
 * Necookie Labs (c) 2026
 *
 * Renders each screen inside the app shell (navigation, worker, camera, twin and pairing
 * mocked, as in the other app tests) and runs axe-core over the whole document. Any serious or
 * critical violation fails. Each screen must also have exactly one h1, one main landmark and
 * only phone-sized tap targets (tests/helpers/tapTargets.ts). jsdom has no layout, so color
 * contrast is checked from the tokens instead (tests/a11y-contrast.test.ts) and axe's contrast
 * rule is off here.
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { planNextStep, runGuidedSolve } from '@/tutor';
import { defaultStudentProfile } from '@/lib/studentProfile';
import { createSolvedCubeState } from '@/cube/constants';
import { sampleProfile } from './helpers/studentProfile';
import { scrambledState } from './helpers/scrambles';
import { smallTapTargets } from './helpers/tapTargets';

const nav = vi.hoisted(() => ({ pathname: '/', push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, refresh: nav.refresh, replace: nav.push, back: vi.fn() }),
}));
vi.mock('@/solver/client', () => ({
  planStepInWorker: vi.fn(async (state, method, grip, stepIndex) => planNextStep(state, method, grip, stepIndex)),
  tutorProgressInWorker: vi.fn(async () => ({ method: 'cfop', stageIndex: 1, stage: 'f2l', withinStage: 0, value: 1000, done: false })),
  guidedSolveInWorker: vi.fn(async (state, method, grip, options) => runGuidedSolve(state, method, grip, options)),
  warmUpSolver: vi.fn(),
  solveInWorker: vi.fn(),
}));
// The WebGL twin cannot run in jsdom; a labelled stand-in keeps the twin's own controls real.
vi.mock('@/components/cube/CubeVisualizer', () => ({
  CubeVisualizer: () => <div role="img" aria-label="3D cube" />,
}));
vi.mock('@/components/camera/CameraScanner', () => ({
  CameraScanner: () => <p>camera scanner</p>,
}));
const companion = vi.hoisted(() => ({
  value: {
    sessionId: 's1' as string | null,
    qrDataUrl: 'data:image/png;base64,AAAA' as string | null,
    code: 'ABCDEF' as string | null,
    codeExpiresAt: null as number | null,
    companionUrl: null as string | null,
    companionBaseUrl: 'https://192.168.1.20:3000/companion' as string | null,
    availableIps: ['192.168.1.20'] as string[],
    isCreating: false,
    isConnected: true,
    sessionEnded: false,
    connections: { desktop: 1, mobile: 0 },
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

// The phone camera screen: no camera in jsdom (it shows how to allow one) and no pairing.
vi.mock('@/vision/camera', () => ({
  initializeCameraStream: vi.fn(async () => {
    throw new Error('No camera here.');
  }),
  terminateCameraStream: vi.fn(),
  lockWhiteBalance: vi.fn(async () => {}),
  toggleCameraTorch: vi.fn(async () => false),
}));
vi.mock('@/sync/useMobileSession', () => ({
  useMobileSession: () => ({
    confirmed: false,
    connected: false,
    controlPlayback: vi.fn(),
    ended: false,
    reset: vi.fn(),
    playback: { playing: false, index: -1, speed: 1 },
    reasons: {},
    rejectFace: vi.fn(),
    rescanRequest: null,
    sendFace: vi.fn(),
    startOver: vi.fn(),
    status: {},
    step: null,
  }),
}));
// axe probes canvas support; jsdom has none and would only log about it.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

const { useTutorStore } = await import('@/stores/useTutorStore');
const { useCubyntraStore } = await import('@/stores/useCubyntraStore');
const { AppShell } = await import('@/components/shell/AppShell');
const { resetAppTokenCache } = await import('@/app-shell/appToken');
const { HomeView } = await import('@/components/home/HomeView');
const { ScanView } = await import('@/components/scan/ScanView');
const { SolveView } = await import('@/components/solve/SolveView');
const { TrainerView } = await import('@/components/trainer/TrainerView');
const { TimerView, setFirstScrambleForTests } = await import('@/components/timer/TimerView');
const { ProgressView } = await import('@/components/progress/ProgressView');
const { PairView } = await import('@/components/pair/PairView');
const { SettingsView } = await import('@/components/settings/SettingsView');
const { CubesView } = await import('@/components/cubes/CubesView');
const { CubeSolutionView } = await import('@/components/cubes/CubeSolutionView');
const NotFound = (await import('@/app/not-found')).default;
const CompanionPage = (await import('@/app/(app)/companion/page')).default;

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });

/** Serious and critical axe violations in the document, one line each. */
async function violations(): Promise<string[]> {
  const result = await axe.run(document, {
    resultTypes: ['violations'],
    rules: { 'color-contrast': { enabled: false } },
  });
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/** Everything a screen must get right, as one list of problems (empty when it passes). */
async function audit(): Promise<string[]> {
  const problems = await violations();
  const h1 = document.querySelectorAll('h1').length;
  if (h1 !== 1) problems.push(`${h1} h1 elements`);
  const mains = document.querySelectorAll('main, [role="main"]').length;
  if (mains !== 1) problems.push(`${mains} main landmarks`);
  if (!document.documentElement.lang) problems.push('no lang on <html>');
  return [...problems, ...smallTapTargets().map((t) => `small tap target: ${t}`)];
}

function renderInShell(pathname: string, page: React.ReactNode) {
  nav.pathname = pathname;
  return render(<AppShell>{page}</AppShell>);
}

beforeEach(() => {
  document.documentElement.lang = 'en';
  document.title = 'Cubyntra';
  resetAppTokenCache();
  setFirstScrambleForTests("R U R' U'");
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/token') return Response.json({ token: 'secret' });
      if (url === '/api/coach/status')
        return Response.json({ mode: 'mock', monthSpendUsd: 1.25, capUsd: 10, month: '2026-11' });
      if (url === '/api/student' && init?.method === 'PUT') return new Response(String(init.body));
      if (url === '/api/student') return Response.json(useTutorStore.getState().profile);
      return new Response('not found', { status: 404 });
    })
  );
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
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
  setFirstScrambleForTests(null);
});

describe('accessibility (axe, serious and critical)', () => {
  it('Home, with a saved solve and letters on', async () => {
    const profile = sampleProfile();
    profile.settings.stickerLetters = true;
    useTutorStore.setState({ profile });
    renderInShell('/', <HomeView />);
    await flush();
    expect(await audit()).toEqual([]);
  });

  it('Scan', async () => {
    renderInShell('/scan', <ScanView />);
    await flush();
    expect(await audit()).toEqual([]);
  });

  it('Solve, with the step, coach and the checkpoint sheet open', async () => {
    const profile = sampleProfile();
    profile.currentSolve!.state = scrambledState(5, 3);
    profile.currentSolve!.grip = { top: 'white', front: 'green' };
    useTutorStore.setState({ profile });
    renderInShell('/solve', <SolveView />);
    await flush();
    expect(await audit()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'I did it' }));
    expect(await audit()).toEqual([]);
  });

  it('Trainer', async () => {
    renderInShell('/trainer', <TrainerView />);
    await flush();
    expect(await audit()).toEqual([]);
  });

  it('Timer', async () => {
    renderInShell('/timer', <TimerView />);
    await flush();
    expect(await audit()).toEqual([]);
  });

  it('Progress', async () => {
    renderInShell('/progress', <ProgressView />);
    await flush();
    expect(await audit()).toEqual([]);
  });

  it('Pair', async () => {
    renderInShell('/pair', <PairView />);
    await flush();
    expect(await audit()).toEqual([]);
  });

  it('Settings', async () => {
    renderInShell('/settings', <SettingsView />);
    await flush();
    expect(await audit()).toEqual([]);
  });

  it('My cubes, with letters on, and renaming one', async () => {
    const profile = defaultStudentProfile();
    profile.settings.stickerLetters = true;
    profile.savedCubes = [
      { id: 'b', name: 'Scan · 19 Nov, 14:32', state: scrambledState(5, 20), scannedAt: '2026-11-19T14:32:00.000Z', source: 'phone' },
      { id: 'a', name: 'Demo · 18 Nov, 09:10', state: scrambledState(6, 20), scannedAt: '2026-11-18T09:10:00.000Z', source: 'demo' },
    ];
    useTutorStore.setState({ profile });
    renderInShell('/cubes', <CubesView />);
    await flush();
    expect(await audit()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Scan · 19 Nov, 14:32' }));
    expect(await audit()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Demo · 18 Nov, 09:10' }));
    expect(await audit()).toEqual([]);
  });

  it('My cubes, empty', async () => {
    renderInShell('/cubes', <CubesView />);
    await flush();
    expect(await audit()).toEqual([]);
  });

  it('Full solution of a saved cube', async () => {
    const profile = defaultStudentProfile();
    profile.savedCubes = [
      { id: 'a', name: 'Scan · 19 Nov, 14:32', state: scrambledState(5, 20), scannedAt: '2026-11-19T14:32:00.000Z', source: 'webcam' },
    ];
    useTutorStore.setState({ profile });
    renderInShell('/cubes/a', <CubeSolutionView id="a" />);
    await flush();
    await flush();
    expect(screen.getByRole('region', { name: 'All steps' })).toBeTruthy();
    expect(await audit()).toEqual([]);
  });

  it('Full solution of a cube that is not saved', async () => {
    renderInShell('/cubes/nope', <CubeSolutionView id="nope" />);
    await flush();
    expect(await audit()).toEqual([]);
  });

  it('Phone camera, first run over a camera that would not start', async () => {
    renderInShell('/companion', <CompanionPage />);
    await flush();
    expect(await audit()).toEqual([]);
  });

  it('Not found', async () => {
    render(<NotFound />);
    expect(await audit()).toEqual([]);
  });

  it('Scan review, with letters on', async () => {
    const profile = defaultStudentProfile();
    profile.settings.stickerLetters = true;
    useTutorStore.setState({ profile });
    renderInShell('/scan', <ScanView />);
    act(() => useCubyntraStore.setState({ appState: 'reviewing', cubeState: createSolvedCubeState(), validationResult: null }));
    // The unfolded net's 24px tiles cannot reach 44px at phone width (four faces side by side);
    // they meet WCAG 2.2 AA (24px) and every tile is also reachable with Tab and the 1-6 keys.
    const problems = (await audit()).filter((p) => !/small tap target: button "(Top|Left|Front|Right|Back|Bottom), row/.test(p));
    expect(problems).toEqual([]);
  });

  it('Solve, with Ask the coach open, a conversation and the mic', async () => {
    const profile = sampleProfile();
    profile.currentSolve!.state = scrambledState(5, 3);
    profile.currentSolve!.grip = { top: 'white', front: 'green' };
    profile.settings.talkToCoach = true;
    useTutorStore.setState({ profile });
    vi.stubGlobal('webkitSpeechRecognition', class {
      start() {}
      stop() {}
      abort() {}
    });
    renderInShell('/solve', <SolveView />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Ask the coach' }));
    expect(screen.getByRole('button', { name: 'Talk to the coach' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Why does this work?' }));
    await flush();
    expect(screen.getByRole('list', { name: 'Conversation with the coach' })).toBeTruthy();
    expect(await audit()).toEqual([]);
  });

  it('Trainer, with the coach and Ask the coach open', async () => {
    renderInShell('/trainer', <TrainerView />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Show the coach' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask the coach' }));
    expect(screen.getByRole('textbox', { name: 'Your question' })).toBeTruthy();
    expect(await audit()).toEqual([]);
  });

  it('Full solution of a saved cube, with Ask the coach open', async () => {
    const profile = defaultStudentProfile();
    profile.savedCubes = [
      { id: 'a', name: 'Scan · 19 Nov, 14:32', state: scrambledState(5, 20), scannedAt: '2026-11-19T14:32:00.000Z', source: 'webcam' },
    ];
    useTutorStore.setState({ profile });
    renderInShell('/cubes/a', <CubeSolutionView id="a" />);
    await flush();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Ask the coach' }));
    fireEvent.click(screen.getByRole('button', { name: 'How do I spot this case?' }));
    await flush();
    expect(await audit()).toEqual([]);
  });

  it('Settings, with ElevenLabs voices and Talk to the coach on', async () => {
    const profile = defaultStudentProfile();
    profile.settings.voiceMode = 'elevenlabs';
    profile.settings.talkToCoach = true;
    useTutorStore.setState({ profile });
    const base = globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) =>
        url.startsWith('/api/voice/status')
          ? Response.json({ mode: 'elevenlabs', keySet: true, monthCredits: 0, capCredits: 20000, remaining: 20000, warning: false, month: '2026-11' })
          : base(url, init)
      )
    );
    renderInShell('/settings', <SettingsView />);
    await flush();
    expect(screen.getByRole('radiogroup', { name: 'ElevenLabs voice' })).toBeTruthy();
    expect(await audit()).toEqual([]);
  });

  it('Settings in the dark theme with the coach offline', async () => {
    document.documentElement.dataset.theme = 'dark';
    renderInShell('/settings', <SettingsView />);
    await flush();
    expect(await audit()).toEqual([]);
    delete document.documentElement.dataset.theme;
  });
});
