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
const { AppShell } = await import('@/components/shell/AppShell');
const { HomeView } = await import('@/components/home/HomeView');
const { TimerView, ProgressView } = await import('@/components/placeholders/Placeholders');
const { PairView } = await import('@/components/pair/PairView');
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
  it('shows the phone companion full screen, without navigation', () => {
    nav.pathname = '/companion';
    render(
      <AppShell>
        <p>camera</p>
      </AppShell>
    );
    expect(screen.queryAllByRole('navigation')).toHaveLength(0);
    expect(screen.getByRole('main').textContent).toBe('camera');
  });

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
    ['Timer', TimerView],
  ])('%s says plainly that it is coming soon', (title, View) => {
    render(<View />);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy();
    expect(screen.getByText('Coming soon')).toBeTruthy();
  });

  it('Progress shows the real counts from the profile', () => {
    useTutorStore.setState({ profile: { ...defaultStudentProfile(), stats: { ...defaultStudentProfile().stats, solvesCompleted: 2, stepsCompleted: 31, checkpointsPassed: 29 } } });
    render(<ProgressView />);
    expect(screen.getByText('31')).toBeTruthy();
    expect(screen.getByText('Coming soon')).toBeTruthy();
  });

  it('Pair shows the QR code and the typed code, and can unpair', () => {
    Object.assign(companion.value, {
      sessionId: 's1',
      qrDataUrl: 'data:image/png;base64,AAAA',
      code: 'ABCDEF',
      codeExpiresAt: Date.now() + 9 * 60_000,
      companionBaseUrl: 'https://192.168.1.20:3000/companion',
      mobileConnected: false,
    });
    render(<PairView />);
    expect(screen.getByRole('img', { name: 'Pairing QR code' })).toBeTruthy();
    expect(screen.getByLabelText('Pairing code A B C D E F')).toBeTruthy();
    expect(screen.getByText('Waiting for your phone')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Unpair' }));
    expect(companion.value.disconnect).toHaveBeenCalled();
    expect(companion.value.initSession).not.toHaveBeenCalled();
  });

  it('Pair makes a code on arrival when none exists', () => {
    Object.assign(companion.value, { sessionId: null, qrDataUrl: null, code: null });
    render(<PairView />);
    expect(companion.value.initSession).toHaveBeenCalled();
  });
});
