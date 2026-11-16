// @vitest-environment jsdom
/**
 * Cubyntra - Scan screen (mocked navigation, worker, camera and twin)
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
vi.mock('@/components/sync/MobilePairingModal', () => ({
  MobilePairingModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog" aria-label="Pairing" /> : null),
}));
vi.mock('@/sync/CompanionSyncProvider', () => ({
  CompanionSyncProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

  it('explains an unreadable cube with tips and a retry', () => {
    useCubyntraStore.getState().resetAll();
    render(<ScanView />);
    act(() => useCubyntraStore.setState({ appState: 'error', errorMessage: 'The six faces could not be combined.' }));
    expect(screen.getByRole('alert').textContent).toMatch(/could not be read/);
    fireEvent.click(screen.getByRole('button', { name: 'Scan again' }));
    expect(useCubyntraStore.getState().appState).toBe('scanning');
  });
});
