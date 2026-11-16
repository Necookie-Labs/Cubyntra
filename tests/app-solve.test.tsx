// @vitest-environment jsdom
/**
 * Cubyntra - Solve screen (mocked navigation, worker, camera and twin)
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { planNextStep } from '@/tutor';
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
    expect(within(dialog).getByRole('img', { name: /Show the/ })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'It matches' }));
    expect(screen.getByRole('dialog', { name: 'Step done' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    await flush();
    expect(useTutorStore.getState().stepIndex).toBe(4);
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
