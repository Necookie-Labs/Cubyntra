// @vitest-environment jsdom
/**
 * Cubyntra - App shell, home and placeholder screens (mocked navigation, worker, camera and twin)
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { planNextStep } from '@/tutor';
import { defaultStudentProfile } from '@/lib/studentProfile';
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
vi.mock('@/components/sync/MobilePairingModal', () => ({
  MobilePairingModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog" aria-label="Pairing" /> : null),
}));
vi.mock('@/sync/CompanionSyncProvider', () => ({
  CompanionSyncProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { useTutorStore } = await import('@/stores/useTutorStore');
const { AppShell } = await import('@/components/shell/AppShell');
const { HomeView } = await import('@/components/home/HomeView');
const { TrainerView, TimerView, ProgressView } = await import('@/components/placeholders/Placeholders');
const { PairView } = await import('@/components/placeholders/PairView');
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

describe('AppShell', () => {
  it('has a skip link, main landmark and marks the current page in the navigation', () => {
    nav.pathname = '/solve';
    render(
      <AppShell>
        <p>page</p>
      </AppShell>
    );
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#content');
    expect(screen.getByRole('main').id).toBe('content');
    const navs = screen.getAllByRole('navigation', { name: 'Main' });
    expect(navs).toHaveLength(2); // side nav (desktop) and tab bar (phone)
    for (const n of navs) {
      const current = within(n).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page');
      expect(current.map((l) => l.textContent)).toEqual(['Solve']);
    }
    const tabs = within(navs[1]).getAllByRole('link').map((l) => l.textContent);
    expect(tabs).toEqual(['Home', 'Scan', 'Solve', 'Progress', 'Settings']);
  });
});

describe('Home', () => {
  it('offers the method picker, a scan and a demo when no solve is saved', async () => {
    render(<HomeView />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/solve your cube/);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    fireEvent.click(radios[1]);
    expect(useTutorStore.getState().profile.settings.methodDefault).toBe('cfop');
    expect(screen.getByRole('link', { name: 'Scan my cube' }).getAttribute('href')).toBe('/scan');
    fireEvent.click(screen.getByRole('button', { name: /demo cube/ }));
    expect(nav.push).toHaveBeenCalledWith('/solve');
    await flush();
  });

  it('puts "Continue" first when a solve is saved, with its stage progress', async () => {
    useTutorStore.setState({ profile: sampleProfile() });
    render(<HomeView />);
    await flush();
    expect(screen.getByRole('link', { name: 'Continue' }).getAttribute('href')).toBe('/solve');
    expect(screen.getByText('Working on: First two layers')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Scan my cube' })).toBeNull();
  });
});

describe('placeholder screens', () => {
  it.each([
    ['Trainer', TrainerView],
    ['Timer', TimerView],
  ])('%s says plainly that it is coming soon', (title, View) => {
    render(<View />);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy();
    expect(screen.getByText('Coming soon')).toBeTruthy();
  });

  it('Progress shows the real counts from the profile', () => {
    useTutorStore.setState({ profile: { ...defaultStudentProfile(), stats: { solvesCompleted: 2, stepsCompleted: 31, checkpointsPassed: 29, lastSolveAt: null } } });
    render(<ProgressView />);
    expect(screen.getByText('31')).toBeTruthy();
    expect(screen.getByText('Coming soon')).toBeTruthy();
  });

  it('Pair opens the existing pairing dialog', () => {
    render(<PairView />);
    fireEvent.click(screen.getByRole('button', { name: 'Show pairing code' }));
    expect(screen.getByRole('dialog', { name: 'Pairing' })).toBeTruthy();
  });
});
