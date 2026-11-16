// @vitest-environment jsdom
/**
 * Cubyntra - Solve screen: one twin (one WebGL context) for the whole solve
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { planNextStep } from '@/tutor';
import { defaultStudentProfile } from '@/lib/studentProfile';
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
const twin = vi.hoisted(() => ({ created: 0, disposed: 0 }));
vi.mock('@/components/cube/CubeVisualizer', async () => {
  const ReactModule = await import('react');
  const { fakeTeachingSurface } = await import('./helpers/fakeTeachingSurface');
  return {
    // One fake engine per mounted visualizer, as the real one makes one WebGL context.
    CubeVisualizer: ({ onEngineChange }: { onEngineChange?: (engine: unknown) => void }) => {
      ReactModule.useEffect(() => {
        twin.created++;
        onEngineChange?.(fakeTeachingSurface().surface);
        return () => {
          twin.disposed++;
          onEngineChange?.(null);
        };
      }, []);
      return <div data-testid="visualizer" />;
    },
  };
});
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
  twin.created = 0;
  twin.disposed = 0;
  resetAppTokenCache();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/token') return Response.json({ token: 'secret' });
      if (url === '/api/coach/status') return Response.json({ mode: 'mock', monthSpendUsd: 0, capUsd: 10, month: '2026-11' });
      if (url === '/api/student') return Response.json(defaultStudentProfile());
      return new Response('ok');
    })
  );
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  useTutorStore.setState({ token: 'secret', profile: defaultStudentProfile(), profileStatus: 'ready' });
  useTutorStore.getState().abandonSolve();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Solve twin', () => {
  it('keeps one engine while stepping through several plans, and disposes it once', async () => {
    const { unmount } = render(<SolveView />);
    await act(async () => {
      await useTutorStore.getState().startSolve(scrambledState(5, 3), 'beginner');
    });
    await flush();
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      expect(useTutorStore.getState().phase).toBe('step');
      act(() => {
        useTutorStore.getState().beginCheckpoint();
        useTutorStore.getState().confirmByHand();
      });
      let advancing: Promise<void> = Promise.resolve();
      act(() => {
        advancing = useTutorStore.getState().advance();
      });
      // While the next step is planned the twin stays, under the overlay.
      if (useTutorStore.getState().phase === 'loading') expect(screen.getByText('Planning the next step')).toBeTruthy();
      expect(screen.getByTestId('visualizer')).toBeTruthy();
      await act(async () => {
        await advancing;
      });
      await flush();
    }
    expect(useTutorStore.getState().stepIndex).toBe(steps);
    expect(twin.created).toBe(1);
    unmount();
    expect(twin.disposed).toBe(1);
  });
});
