// @vitest-environment jsdom
/**
 * Cubyntra - Scan screen (mocked navigation, worker, camera and twin)
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { planNextStep } from '@/tutor';
import { defaultStudentProfile } from '@/lib/studentProfile';
import { createSolvedCubeState } from '@/cube/constants';
import { warmUpSolver } from '@/solver/client';
import type { CubeState } from '@/cube/types';
import { scrambledState } from './helpers/scrambles';

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
const { useCubyntraStore } = await import('@/stores/useCubyntraStore');
const { ScanView } = await import('@/components/scan/ScanView');
const { resetAppTokenCache } = await import('@/app-shell/appToken');

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });

beforeEach(() => {
  nav.pathname = '/';
  nav.push.mockReset();
  resetAppTokenCache();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/token') return Response.json({ token: 'secret' });
      if (url === '/api/coach/status')
        return Response.json({ mode: 'mock', monthSpendUsd: 1.25, capUsd: 10, month: '2026-11' });
      if (url === '/api/student' && init?.method === 'PUT') return new Response(String(init.body));
      if (url === '/api/student') return Response.json(defaultStudentProfile());
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
});

describe('Scan', () => {
  it('starts the camera scan', () => {
    useCubyntraStore.getState().resetAll();
    render(<ScanView />);
    expect(useCubyntraStore.getState().appState).toBe('scanning');
    expect(screen.getByText('camera scanner')).toBeTruthy();
    expect(screen.getByText('Camera not working?')).toBeTruthy();
  });

  it('warms up the solver while the student scans', () => {
    vi.mocked(warmUpSolver).mockClear();
    useCubyntraStore.getState().resetAll();
    render(<ScanView />);
    expect(warmUpSolver).toHaveBeenCalledTimes(1);
  });

  it('lets a paired phone read the faces instead', () => {
    useCubyntraStore.getState().resetAll();
    companion.value.mobileConnected = true;
    companion.value.sessionId = 's1';
    render(<ScanView />);
    fireEvent.click(screen.getByRole('button', { name: 'Scan with the phone' }));
    expect(useCubyntraStore.getState().scanSource).toBe('companion');
    expect(screen.getByRole('heading', { name: 'Scanning with your phone' })).toBeTruthy();
    expect(screen.queryByText('camera scanner')).toBeNull();
    companion.value.mobileConnected = false;
    companion.value.sessionId = null;
  });

  it('rescans one face read by the phone: drops it here and sends the phone back to it', () => {
    useCubyntraStore.getState().resetAll();
    companion.value.mobileConnected = true;
    companion.value.sessionId = 's1';
    vi.mocked(companion.value.requestRescan).mockClear();
    render(<ScanView />);
    fireEvent.click(screen.getByRole('button', { name: 'Scan with the phone' }));
    const solved = createSolvedCubeState();
    act(() => {
      useCubyntraStore.setState({
        scannedFaces: {
          U: { face: 'U', centerColor: 'white', stickers: solved.U, confidences: Array(9).fill(1), capturedAt: 1 },
          F: { face: 'F', centerColor: 'green', stickers: solved.F, confidences: Array(9).fill(1), capturedAt: 2 },
        },
      });
    });

    // Only faces already read offer a rescan.
    expect(screen.getByRole('button', { name: 'Rescan the top face' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rescan the front face' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rescan the right face' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Rescan the front face' }));
    const scan = useCubyntraStore.getState();
    expect(scan.scannedFaces.F).toBeUndefined();
    expect(scan.scannedFaces.U).toBeDefined();
    expect(scan.scanSource).toBe('companion');
    expect(companion.value.requestRescan).toHaveBeenCalledWith('F');
    expect(screen.queryByRole('button', { name: 'Rescan the front face' })).toBeNull();
    companion.value.mobileConnected = false;
    companion.value.sessionId = null;
  });

  it('starts a guided solve and goes to /solve when the demo cube is used', async () => {
    useCubyntraStore.getState().resetAll();
    render(<ScanView />);
    await act(async () => {
      await useCubyntraStore.getState().loadMockScramble();
    });
    await flush();
    expect(nav.push).toHaveBeenCalledWith('/solve');
    expect(useTutorStore.getState().method).toBe('beginner');
  });

  it('"Solve another" after a finished solve starts a new solve with the method chosen on Home', async () => {
    const profile = defaultStudentProfile();
    profile.settings.methodDefault = 'cfop';
    await useTutorStore.getState().startSolve(createSolvedCubeState(), 'beginner');
    expect(useTutorStore.getState().phase).toBe('solved');
    useTutorStore.setState({ profile: { ...useTutorStore.getState().profile, settings: profile.settings } });
    useCubyntraStore.getState().resetAll();
    render(<ScanView />);
    await act(async () => {
      await useCubyntraStore.getState().loadMockScramble();
    });
    await flush();
    const tutor = useTutorStore.getState();
    expect(nav.push).toHaveBeenCalledWith('/solve');
    expect(tutor.method).toBe('cfop');
    expect(tutor.stepIndex).toBe(0);
    expect(tutor.phase).toBe('step');
  });

  it('plans the open solve again only after "Rescan the cube"', async () => {
    const tutorStart = useTutorStore.getState();
    await tutorStart.startSolve(createSolvedCubeState(), 'cfop');
    // A solve in progress at step 3 of CFOP.
    useTutorStore.setState({ phase: 'mismatch', stepIndex: 3, cube: createSolvedCubeState(), grip: { top: 'white', front: 'green' } });
    useTutorStore.getState().requestRescan();
    useCubyntraStore.getState().resetAll();
    render(<ScanView />);
    await act(async () => {
      await useCubyntraStore.getState().loadMockScramble();
    });
    await flush();
    const tutor = useTutorStore.getState();
    expect(tutor.method).toBe('cfop');
    expect(tutor.stepIndex).toBe(3);
    expect(tutor.rescanRequested).toBe(false);
  });

  /** Shows the review, then confirms it, as a scan from `source` of `state`. */
  async function confirmScanOf(state: CubeState, source: 'webcam' | 'companion') {
    useCubyntraStore.getState().resetAll();
    render(<ScanView />);
    act(() => useCubyntraStore.setState({ appState: 'reviewing', scanSource: source, cubeState: state, validationResult: null }));
    act(() => useCubyntraStore.setState({ appState: 'processing', originalScrambleState: state }));
    await flush();
  }

  it('saves a confirmed webcam scan to My cubes before the solve starts', async () => {
    const state = scrambledState(3, 20);
    await confirmScanOf(state, 'webcam');
    const saved = useTutorStore.getState().profile.savedCubes;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ state, source: 'webcam' });
    expect(saved[0].name).toMatch(/^Scan · \d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2}$/);
    expect(useTutorStore.getState().unsavedDemo).toBeNull();
    expect(screen.getByText('Saved to My cubes.')).toBeTruthy();
    expect(nav.push).toHaveBeenCalledWith('/solve');
  });

  it('saves a confirmed phone scan as a phone scan', async () => {
    await confirmScanOf(scrambledState(4, 20), 'companion');
    expect(useTutorStore.getState().profile.savedCubes.map((c) => c.source)).toEqual(['phone']);
  });

  it('does not save a scan of a solved cube', async () => {
    await confirmScanOf(createSolvedCubeState(), 'webcam');
    expect(useTutorStore.getState().profile.savedCubes).toEqual([]);
    expect(screen.queryByText('Saved to My cubes.')).toBeNull();
  });

  it('does not save the demo cube unless the student saves it', async () => {
    useCubyntraStore.getState().resetAll();
    render(<ScanView />);
    await act(async () => {
      await useCubyntraStore.getState().loadMockScramble();
    });
    await flush();
    const tutor = useTutorStore.getState();
    expect(tutor.profile.savedCubes).toEqual([]);
    expect(tutor.unsavedDemo).toEqual(useCubyntraStore.getState().originalScrambleState);
    let id: string | null = null;
    act(() => {
      id = useTutorStore.getState().saveDemoCube();
    });
    const saved = useTutorStore.getState().profile.savedCubes;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id, source: 'demo' });
    expect(saved[0].name).toMatch(/^Demo · /);
    expect(useTutorStore.getState().unsavedDemo).toBeNull();
  });

  it('names colors in the review with letters, never by the swatch alone', () => {
    useCubyntraStore.getState().resetAll();
    const profile = defaultStudentProfile();
    profile.settings.stickerLetters = true;
    useTutorStore.setState({ profile });
    render(<ScanView />);
    act(() => useCubyntraStore.setState({ appState: 'reviewing', cubeState: createSolvedCubeState(), validationResult: null }));
    const counts = screen.getByRole('list', { name: 'Tiles per color' });
    expect(counts.textContent).toBe('Wwhite: 9Yyellow: 9Ggreen: 9Bblue: 9Rred: 9Oorange: 9');
    expect(within(counts).getAllByRole('listitem')[0].textContent).toContain('white:');
    fireEvent.click(screen.getByRole('button', { name: /Front, row 1 column 1/ }));
    const swatches = within(screen.getByRole('radiogroup', { name: 'Tile color' })).getAllByRole('radio');
    expect(swatches.map((s) => s.textContent).join('')).toBe('WYGBRO');
  });

  it('explains an unreadable cube with tips and a retry', () => {
    useCubyntraStore.getState().resetAll();
    render(<ScanView />);
    act(() => useCubyntraStore.setState({ appState: 'error', errorMessage: 'The six faces could not be combined.' }));
    expect(screen.getByRole('alert').textContent).toMatch(/could not be read/);
    fireEvent.click(screen.getByRole('button', { name: 'Scan again' }));
    expect(useCubyntraStore.getState().appState).toBe('scanning');
  });
});
