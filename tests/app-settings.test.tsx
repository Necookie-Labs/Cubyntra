// @vitest-environment jsdom
/**
 * Cubyntra - Settings screen (mocked navigation, worker, camera and twin)
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
const { SettingsView } = await import('@/components/settings/SettingsView');
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

describe('Settings', () => {
  it('saves switches and shows the coach mode and month spend', async () => {
    render(<SettingsView />);
    await flush();
    fireEvent.click(screen.getByRole('switch', { name: 'Letters on stickers' }));
    expect(useTutorStore.getState().profile.settings.stickerLetters).toBe(true);
    expect(screen.getByText('Templates only')).toBeTruthy();
    expect(screen.getByText('$1.25 of $10.00')).toBeTruthy();
    expect(screen.getByRole('meter', { name: 'Coach spend this month' })).toBeTruthy();
  });

  it('says the coach is offline without a token, and that notes still work', () => {
    useTutorStore.setState({ token: null });
    render(<SettingsView />);
    expect(screen.getByText(/built-in notes for every step still work/)).toBeTruthy();
  });

  it('saves the name on blur', () => {
    render(<SettingsView />);
    const input = screen.getByLabelText('Your name');
    fireEvent.change(input, { target: { value: ' Mia ' } });
    fireEvent.blur(input);
    expect(useTutorStore.getState().profile.name).toBe('Mia');
  });
});
