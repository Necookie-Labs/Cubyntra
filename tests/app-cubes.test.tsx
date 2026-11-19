// @vitest-environment jsdom
/**
 * Cubyntra - My cubes: the list, rename, delete with a confirmation, the empty state and
 * "Solve it with me"
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { planNextStep } from '@/tutor';
import { defaultStudentProfile, type SavedCube } from '@/lib/studentProfile';
import { scrambledState } from './helpers/scrambles';

const nav = vi.hoisted(() => ({ pathname: '/cubes', push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, refresh: nav.refresh, replace: nav.push, back: vi.fn() }),
}));
vi.mock('@/solver/client', () => ({
  planStepInWorker: vi.fn(async (state, method, grip, stepIndex) => planNextStep(state, method, grip, stepIndex)),
  warmUpSolver: vi.fn(),
  solveInWorker: vi.fn(),
}));

const { useTutorStore, resetPendingProfileOps } = await import('@/stores/useTutorStore');
const { CubesView } = await import('@/components/cubes/CubesView');

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });

function cube(id: string, name: string, minute: number, source: SavedCube['source'] = 'webcam'): SavedCube {
  return { id, name, state: scrambledState(minute, 20), scannedAt: new Date(2026, 10, 19, 14, minute).toISOString(), source };
}

function withCubes(cubes: SavedCube[], letters = false) {
  const profile = defaultStudentProfile();
  profile.savedCubes = cubes;
  profile.settings.stickerLetters = letters;
  profile.settings.methodDefault = 'cfop';
  useTutorStore.setState({ profile, profileStatus: 'ready', token: null });
}

beforeEach(() => {
  nav.push.mockReset();
  resetPendingProfileOps();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
  useTutorStore.getState().abandonSolve();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('My cubes', () => {
  it('lists the saved cubes newest first with a net, the name, the date and the source', () => {
    withCubes([cube('b', 'Scan · 19 Nov, 14:32', 32, 'phone'), cube('a', 'Scan · 19 Nov, 14:05', 5)], true);
    render(<CubesView />);
    expect(screen.getByRole('heading', { level: 1, name: 'My cubes' })).toBeTruthy();
    const items = within(screen.getByRole('list', { name: 'Saved cubes' })).getAllByRole('article');
    expect(items.map((i) => within(i).getByRole('heading').textContent)).toEqual(['Scan · 19 Nov, 14:32', 'Scan · 19 Nov, 14:05']);
    expect(items[0].textContent).toContain('19 Nov, 14:32 · Phone scan');
    expect(items[1].textContent).toContain('Webcam scan');
    const net = within(items[0]).getByRole('img', { name: 'Flat view of Scan · 19 Nov, 14:32' });
    // Letters on: every one of the 54 stickers carries its letter.
    expect(net.textContent).toHaveLength(54);
    expect(within(items[0]).getByRole('link', { name: 'Show the solution' }).getAttribute('href')).toBe('/cubes/b');
  });

  it('draws the net without letters when that setting is off', () => {
    withCubes([cube('a', 'One', 5)]);
    render(<CubesView />);
    expect(screen.getByRole('img', { name: 'Flat view of One' }).textContent).toBe('');
  });

  it('shows an empty state that leads to the scan', () => {
    withCubes([]);
    render(<CubesView />);
    expect(screen.getByRole('heading', { name: 'No saved cubes yet' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Scan my cube' }).getAttribute('href')).toBe('/scan');
    expect(screen.queryByRole('list', { name: 'Saved cubes' })).toBeNull();
  });

  it('waits for the profile before saying there are none', () => {
    withCubes([]);
    useTutorStore.setState({ profileStatus: 'loading' });
    render(<CubesView />);
    expect(screen.getByRole('status').textContent).toContain('Loading your cubes');
    expect(screen.queryByText('No saved cubes yet')).toBeNull();
  });

  it('renames a cube in place, and gives the focus back to Rename', () => {
    withCubes([cube('a', 'Scan · 19 Nov, 14:05', 5)]);
    render(<CubesView />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Scan · 19 Nov, 14:05' }));
    const input = screen.getByRole('textbox', { name: 'New name' }) as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.maxLength).toBe(40);
    fireEvent.change(input, { target: { value: '  Sunday scramble  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(useTutorStore.getState().profile.savedCubes[0].name).toBe('Sunday scramble');
    expect(screen.getByRole('heading', { level: 2, name: 'Sunday scramble' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Rename Sunday scramble' }));
  });

  it('cancels a rename with Escape, keeping the old name', () => {
    withCubes([cube('a', 'Old name', 5)]);
    render(<CubesView />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Old name' }));
    const input = screen.getByRole('textbox', { name: 'New name' });
    fireEvent.change(input, { target: { value: 'Something else' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(useTutorStore.getState().profile.savedCubes[0].name).toBe('Old name');
  });

  it('asks before deleting, and keeps the cube on "Keep it"', () => {
    withCubes([cube('b', 'Second', 9), cube('a', 'First', 5)]);
    render(<CubesView />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Second' }));
    let dialog = screen.getByRole('dialog', { name: 'Delete this cube?' });
    expect(dialog.textContent).toContain('“Second” is removed from My cubes.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(useTutorStore.getState().profile.savedCubes).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Second' }));
    dialog = screen.getByRole('dialog', { name: 'Delete this cube?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(useTutorStore.getState().profile.savedCubes.map((c) => c.id)).toEqual(['a']);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Second' })).toBeNull();
  });

  it('"Solve it with me" starts a guided solve of that cube with the Home method', async () => {
    const saved = cube('a', 'First', 5);
    withCubes([saved]);
    render(<CubesView />);
    fireEvent.click(screen.getByRole('button', { name: 'Solve it with me' }));
    await flush();
    expect(nav.push).toHaveBeenCalledWith('/solve');
    const tutor = useTutorStore.getState();
    expect(tutor.method).toBe('cfop');
    expect(tutor.plan?.startState).toEqual(saved.state);
    // Already saved: the solve screen does not offer to save it again.
    expect(tutor.unsavedDemo).toBeNull();
  });
});
