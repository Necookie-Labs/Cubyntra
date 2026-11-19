// @vitest-environment jsdom
/**
 * Cubyntra - Solve screen (mocked navigation, worker, camera and twin)
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { planNextStep } from '@/tutor';
import { showFaceInstruction } from '@/tutor/checkpoint';
import { defaultStudentProfile } from '@/lib/studentProfile';
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
const { SolveView } = await import('@/components/solve/SolveView');
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

describe('Solve', () => {
  it('offers a scan or a demo when nothing is in progress', () => {
    render(<SolveView />);
    expect(screen.getByRole('heading', { name: 'No solve in progress' })).toBeTruthy();
  });

  it('offers to save a demo cube to My cubes, and only a demo cube', async () => {
    render(<SolveView />);
    fireEvent.click(screen.getByRole('button', { name: /^Demo cube/ }));
    await flush();
    expect(useTutorStore.getState().profile.savedCubes).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Save this cube' }));
    const saved = useTutorStore.getState().profile.savedCubes;
    expect(saved.map((c) => c.source)).toEqual(['demo']);
    expect(screen.getByRole('status').textContent).toContain('Saved to My cubes.');
    expect(screen.getByRole('link', { name: 'See its full solution' }).getAttribute('href')).toBe(`/cubes/${saved[0].id}`);
    expect(screen.queryByRole('button', { name: 'Save this cube' })).toBeNull();

    // A scanned cube was saved already: nothing to offer.
    await act(async () => {
      await useTutorStore.getState().startSolve(scrambledState(5, 3), 'beginner');
    });
    expect(useTutorStore.getState().unsavedDemo).toBeNull();
  });

  it('keeps one page heading while it waits and once solved', () => {
    useTutorStore.setState({ profileStatus: 'loading' });
    const { unmount } = render(<SolveView />);
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Solve']);
    unmount();
    useTutorStore.setState({ profileStatus: 'ready', phase: 'solved', method: 'beginner' });
    render(<SolveView />);
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Solved']);
  });

  it('resumes the saved solve and lays out header, twin, coach and "I did it"', async () => {
    const profile = sampleProfile();
    profile.currentSolve!.state = scrambledState(5, 3);
    profile.currentSolve!.grip = { top: 'white', front: 'green' };
    profile.settings.stickerLetters = true;
    useTutorStore.setState({ profile });
    render(<SolveView />);
    await flush();
    const plan = useTutorStore.getState().plan!;
    expect(plan.stepIndex).toBe(3);
    expect(screen.getByRole('heading', { level: 1, name: plan.stageName })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: /stages/ })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Teaching twin' }).getAttribute('data-letters')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Coach' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Hints' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'I did it' }));
    const dialog = screen.getByRole('dialog', { name: 'Show me your cube' });
    expect(within(dialog).getByRole('img', { name: /Show the .* at the top of the picture\./ })).toBeTruthy();
    // The instruction says exactly how to hold the face, and which edge goes at the top.
    const shownPlan = useTutorStore.getState().plan!;
    expect(within(dialog).getByText(showFaceInstruction(shownPlan.gripAfter, shownPlan.checkpoint.facesToShow[0]))).toBeTruthy();
    expect(dialog.querySelector('[data-picture-top]')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'It matches' }));
    expect(screen.getByRole('dialog', { name: 'Step done' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    await flush();
    expect(useTutorStore.getState().stepIndex).toBe(4);
  });

  it('puts focus on the new step, the mismatch or the way forward, never on the page', async () => {
    await act(async () => {
      await useTutorStore.getState().startSolve(scrambledState(5, 3), 'beginner');
    });
    const { unmount } = render(<SolveView />);
    await flush();
    const first = useTutorStore.getState().plan!;
    fireEvent.click(screen.getByRole('button', { name: 'I did it' }));
    fireEvent.click(screen.getByRole('button', { name: 'It matches' }));
    const next = screen.getByRole('button', { name: 'Next step' });
    next.focus();
    fireEvent.click(next);
    await flush();
    expect(useTutorStore.getState().plan!.stepIndex).toBe(first.stepIndex + 1);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));

    // A mismatch closes the sheet: its heading takes the focus.
    const plan = useTutorStore.getState().plan!;
    const ref = plan.checkpoint.stickers[0];
    const didIt = screen.getByRole('button', { name: 'I did it' });
    didIt.focus(); // a click focuses the button in a browser
    fireEvent.click(didIt);
    act(() => {
      for (const face of plan.checkpoint.facesToShow) {
        useTutorStore.getState().submitObservation({
          face,
          stickers: plan.expectedState[face].map((color, i) => ({
            color: face === ref.face && i === ref.index ? (color === 'red' ? 'blue' : 'red') : color,
            confidence: 1,
          })),
        });
      }
    });
    await flush();
    expect(useTutorStore.getState().phase).toBe('mismatch');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Not quite yet' }));
    unmount();

    // Solved: "Solve another" is focused.
    document.body.focus();
    useTutorStore.setState({ phase: 'solved', plan: null, method: 'beginner' });
    render(<SolveView />);
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Solve another' }));
  });

  it('says a scanned cube is already solved, without counting a solve', async () => {
    const { createSolvedCubeState } = await import('@/cube/constants');
    await act(async () => {
      await useTutorStore.getState().startSolve(createSolvedCubeState(), 'beginner');
    });
    const state = useTutorStore.getState();
    expect(state.phase).toBe('solved');
    expect(state.alreadySolved).toBe(true);
    expect(state.profile.stats.solvesCompleted).toBe(0);
    expect(state.profile.currentSolve).toBeNull();
    render(<SolveView />);
    expect(screen.getByRole('heading', { level: 1, name: 'Your cube is already solved' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Scan again' }).getAttribute('href')).toBe('/scan');
    expect(screen.queryByText('Solved!')).toBeNull();
  });

  it('keeps the camera square in the sheet while the camera is off', async () => {
    await act(async () => {
      await useTutorStore.getState().startSolve(scrambledState(5, 3), 'beginner');
    });
    render(<SolveView />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'I did it' }));
    const box = screen.getByRole('dialog', { name: 'Show me your cube' }).querySelector('video')!.parentElement!;
    // The sheet scrolls (a flex column): without shrink-0 an empty video collapses to a line
    // and hides the "camera is blocked" message with its Try again.
    expect(box.className).toMatch(/\baspect-square\b/);
    expect(box.className).toMatch(/\bshrink-0\b/);
  });

  it('shows the diagnosis and the ways forward after a mismatch', async () => {
    await act(async () => {
      await useTutorStore.getState().startSolve(scrambledState(5, 3), 'beginner');
    });
    const plan = useTutorStore.getState().plan!;
    const ref = plan.checkpoint.stickers[0];
    const tiles = plan.expectedState[ref.face].map((color, i) => ({
      color: i === ref.index ? (color === 'red' ? 'blue' : 'red') : color,
      confidence: 1,
    }));
    act(() => {
      useTutorStore.getState().beginCheckpoint();
      for (const face of plan.checkpoint.facesToShow) {
        useTutorStore.getState().submitObservation({
          face,
          stickers: face === ref.face ? tiles : plan.expectedState[face].map((color) => ({ color, confidence: 1 })),
        });
      }
    });
    render(<SolveView />);
    await flush();
    expect(useTutorStore.getState().phase).toBe('mismatch');
    const alert = screen.getByRole('region', { name: 'Not quite yet' });
    // The result is a polite live region; the buttons sit outside it.
    expect(within(alert).getByRole('status').textContent).toMatch(/^Not quite yet/);
    expect(within(within(alert).getByRole('status')).queryAllByRole('button')).toHaveLength(0);
    for (const name of ['Replay the step', 'Rescan the cube', 'It actually matches']) {
      expect(within(alert).getByRole('button', { name })).toBeTruthy();
    }
    fireEvent.click(within(alert).getByRole('button', { name: 'Replay the step' }));
    expect(useTutorStore.getState().phase).toBe('step');
  });

  it('counts the highest hint asked for on the stage', async () => {
    await act(async () => {
      await useTutorStore.getState().startSolve(scrambledState(5, 3), 'cfop');
    });
    render(<SolveView />);
    await flush();
    const hints = screen.getByRole('group', { name: 'Hints' });
    fireEvent.click(within(hints).getByRole('button', { name: /Show the moves/ }));
    // While the coach works, the polite region says so in words.
    expect(screen.getByText('The coach is thinking…').closest('[aria-live="polite"]')).not.toBeNull();
    await flush();
    expect(useTutorStore.getState().stageHint).toBe(3);
  });

  it('explains a planning failure with a retry', () => {
    useTutorStore.setState({ phase: 'error', errorMessage: 'The tutor could not find a step.' });
    render(<SolveView />);
    expect(screen.getByRole('alert').textContent).toMatch(/could not find a step/);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
