// @vitest-environment jsdom
/**
 * Cubyntra - Full-solution walkthrough screen (`/cubes/[id]`): steps grouped by stage, Previous
 * and Next, the keyboard, Play all, the method switch, Fewest moves, errors, copying and an
 * unknown id. The worker runs the real engine and solver on the main thread; the twin is a
 * teaching surface whose turns finish at once.
 * Necookie Labs (c) 2026
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { runGuidedSolve } from '@/tutor';
import { solveCube } from '@/solver/solver';
import { defaultStudentProfile, type SavedCube } from '@/lib/studentProfile';
import { scrambledState } from './helpers/scrambles';

const nav = vi.hoisted(() => ({ pathname: '/cubes/a', push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, refresh: nav.refresh, replace: nav.push, back: vi.fn() }),
}));
vi.mock('@/solver/client', () => ({
  guidedSolveInWorker: vi.fn(async (state, method, grip, options) => runGuidedSolve(state, method, grip, options)),
  solveInWorker: vi.fn(async (state) => solveCube(state)),
  planStepInWorker: vi.fn(),
  warmUpSolver: vi.fn(),
}));
const twin = vi.hoisted(() => ({ animate: null as null | { mock: { calls: unknown[] } } }));
vi.mock('@/components/cube/CubeVisualizer', async () => {
  const ReactModule = await import('react');
  const { fakeTeachingSurface } = await import('./helpers/fakeTeachingSurface');
  return {
    CubeVisualizer: ({ onEngineChange }: { onEngineChange?: (engine: unknown) => void }) => {
      ReactModule.useEffect(() => {
        const fake = fakeTeachingSurface();
        twin.animate = fake.driver.animateMove;
        onEngineChange?.(fake.surface);
        return () => onEngineChange?.(null);
      }, []);
      return <div data-testid="visualizer" />;
    },
  };
});
vi.mock('@/sync/CompanionSyncProvider', () => ({
  CompanionSyncProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useCompanion: () => ({ sessionId: null, subscribe: () => () => {}, getClientId: () => 'laptop' }),
}));

const { useTutorStore, resetPendingProfileOps } = await import('@/stores/useTutorStore');
const { CubeSolutionView } = await import('@/components/cubes/CubeSolutionView');
const client = await import('@/solver/client');
const { resetAudioUnlockForTests, unlockAudio } = await import('@/voice/audioUnlock');
const { movePhrase, stagePhrase } = await import('@/voice/phrases');

const flush = () =>
  act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });

/** Lets the worker job (and the solver's first table build) finish. */
async function settle(check: () => boolean, rounds = 400) {
  for (let i = 0; i < rounds && !check(); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  expect(check()).toBe(true);
}

const STATE = scrambledState(7, 25);

function saved(patch: Partial<SavedCube> = {}): SavedCube {
  return { id: 'a', name: 'Sunday scramble', state: STATE, scannedAt: '2026-11-19T14:32:00.000Z', source: 'webcam', ...patch };
}

function withCube(cube: SavedCube | null, settings: Partial<ReturnType<typeof defaultStudentProfile>['settings']> = {}) {
  const profile = defaultStudentProfile();
  profile.savedCubes = cube ? [cube] : [];
  profile.settings = { ...profile.settings, ...settings };
  useTutorStore.setState({ profile, profileStatus: 'ready', token: null });
}

const stepButtons = () => within(screen.getByRole('region', { name: 'All steps' })).getAllByRole('button');
const currentStep = () => stepButtons().findIndex((b) => b.getAttribute('aria-current') === 'step');
const ready = () => screen.queryByRole('region', { name: 'All steps' }) !== null;

beforeEach(() => {
  resetPendingProfileOps();
  vi.mocked(client.guidedSolveInWorker).mockClear();
  vi.mocked(client.solveInWorker).mockClear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('full-solution walkthrough', () => {
  it('says an unknown cube is not found, with a way back to My cubes', () => {
    withCube(saved());
    render(<CubeSolutionView id="nope" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Cube not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'My cubes' }).getAttribute('href')).toBe('/cubes');
  });

  it('waits for the profile before deciding the cube is missing', () => {
    withCube(null);
    useTutorStore.setState({ profileStatus: 'loading' });
    render(<CubeSolutionView id="a" />);
    expect(screen.getByRole('status').textContent).toContain('Loading your cube');
    expect(screen.queryByText('Cube not found')).toBeNull();
  });

  it("shows the beginner's solution grouped by stage, with totals and the first step selected", async () => {
    withCube(saved());
    render(<CubeSolutionView id="a" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Sunday scramble' })).toBeTruthy();
    expect(screen.getByText(/Working out the Beginner's method solution/)).toBeTruthy();
    await settle(ready);

    const solve = runGuidedSolve(STATE, 'beginner');
    expect(client.guidedSolveInWorker).toHaveBeenCalledWith(STATE, 'beginner');
    const list = screen.getByRole('region', { name: 'All steps' });
    const stageNames = [...new Set(solve.steps.map((s) => s.stageName))];
    expect(within(list).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(
      stageNames.map((name, i) => expect.stringContaining(`Stage ${i + 1}: ${name}`))
    );
    expect(stepButtons()).toHaveLength(solve.steps.length);
    expect(stepButtons()[0].getAttribute('aria-label')).toMatch(new RegExp(`^Step 1: ${solve.steps[0].caseName.replace(/[()]/g, '.')}\\. \\d+ moves?: `));
    expect(currentStep()).toBe(0);

    const summary = screen.getByRole('region', { name: 'Summary' });
    expect(summary.textContent).toContain(`${solve.turnCount} moves · ${solve.steps.length} steps`);
    expect(within(summary).getAllByRole('listitem')).toHaveLength(stageNames.length);
    expect(screen.getByRole('heading', { level: 2, name: solve.steps[0].stageName })).toBeTruthy();
    expect(screen.getByText(solve.steps[0].facts.goal)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Teaching twin' })).toBeTruthy();
  });

  it('moves between steps with Previous and Next, a click in the list, and the arrow keys', async () => {
    withCube(saved());
    render(<CubeSolutionView id="a" />);
    await settle(ready);
    const prev = screen.getByRole('button', { name: 'Previous step' }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(currentStep()).toBe(2);
    expect(screen.getByText(/^Step 3 of \d+$/)).toBeTruthy();
    fireEvent.click(prev);
    expect(currentStep()).toBe(1);

    const buttons = stepButtons();
    fireEvent.click(buttons[4]);
    expect(currentStep()).toBe(4);
    // One Tab stop in the list: the selected step.
    expect(buttons.filter((b) => b.tabIndex === 0)).toEqual([buttons[4]]);
    fireEvent.keyDown(buttons[4], { key: 'ArrowDown' });
    expect(currentStep()).toBe(5);
    expect(document.activeElement).toBe(stepButtons()[5]);
    fireEvent.keyDown(stepButtons()[5], { key: 'End' });
    expect(currentStep()).toBe(buttons.length - 1);
    expect((screen.getByRole('button', { name: 'Next step' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(stepButtons()[buttons.length - 1], { key: 'Home' });
    expect(currentStep()).toBe(0);
  });

  it('Play all plays every step to the end, moving on as each one is played, and stops when solved', async () => {
    withCube(saved());
    render(<CubeSolutionView id="a" />);
    await settle(ready);
    const solve = runGuidedSolve(STATE, 'beginner');
    const total = solve.steps.reduce((n, s) => n + s.setupMoves.length + s.algorithm.length, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }));
    expect(screen.getByRole('button', { name: 'Pause all' })).toBeTruthy();
    await settle(() => screen.queryByText('Solved! That is the whole solution.') !== null, 2000);
    // Every move of every step was played, in turn, then it stopped on the last step.
    expect(currentStep()).toBe(solve.steps.length - 1);
    expect(twin.animate!.mock.calls.length).toBe(total);
    expect(screen.getByRole('button', { name: 'Play all' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    expect(screen.getByText('Solved. Every step has been played.')).toBeTruthy();
  });

  it('pauses, resumes and stops Play all', async () => {
    withCube(saved());
    render(<CubeSolutionView id="a" />);
    await settle(ready);
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause all' }));
    await flush();
    const paused = currentStep();
    expect(screen.getByRole('button', { name: 'Resume all' })).toBeTruthy();
    expect(screen.getByText('Play all is paused.')).toBeTruthy();
    await flush();
    expect(currentStep()).toBe(paused);

    fireEvent.click(screen.getByRole('button', { name: 'Resume all' }));
    expect(screen.getByRole('button', { name: 'Pause all' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await flush();
    expect(screen.getByRole('button', { name: 'Play all' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    const stopped = currentStep();
    await flush();
    expect(currentStep()).toBe(stopped);
  });

  it('pauses Play all when the twin is paused from its own controls', async () => {
    withCube(saved());
    render(<CubeSolutionView id="a" />);
    await settle(ready);
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }));
    const twinRegion = screen.getByRole('region', { name: 'Teaching twin' });
    fireEvent.click(within(twinRegion).getByRole('button', { name: /^Pause/ }));
    await flush();
    expect(screen.getByRole('button', { name: 'Resume all' })).toBeTruthy();
  });

  it('recomputes on a method switch, honours the last-layer setting and remembers the choice', async () => {
    withCube(saved(), { lastLayer: 'full' });
    render(<CubeSolutionView id="a" />);
    await settle(ready);
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));

    const solve = runGuidedSolve(STATE, 'cfop', undefined, { lastLayer: 'full' });
    fireEvent.click(screen.getByRole('radio', { name: 'CFOP' }));
    expect(screen.getByRole('radio', { name: 'CFOP' }).getAttribute('aria-checked')).toBe('true');
    await settle(() => ready() && screen.getByRole('region', { name: 'Summary' }).textContent!.includes('one look'));
    expect(client.guidedSolveInWorker).toHaveBeenLastCalledWith(STATE, 'cfop', undefined, { lastLayer: 'full' });
    expect(stepButtons()).toHaveLength(solve.steps.length);
    expect(currentStep()).toBe(0);
    expect(useTutorStore.getState().profile.savedCubes[0].lastMethod).toBe('cfop');

    // Back to a method already worked out: no new job.
    fireEvent.click(screen.getByRole('radio', { name: "Beginner's" }));
    expect(client.guidedSolveInWorker).toHaveBeenCalledTimes(2);
    expect(stepButtons()).toHaveLength(runGuidedSolve(STATE, 'beginner').steps.length);
  });

  it('shows Fewest moves as an honest computer solution, in parts, that Play all can play', async () => {
    withCube(saved({ lastMethod: 'fewest' }));
    render(<CubeSolutionView id="a" />);
    expect(screen.getByRole('radio', { name: 'Fewest moves' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/A computer solution: the short sequence the solver found, not a method a person follows/)).toBeTruthy();
    await settle(ready, 2000);
    expect(client.solveInWorker).toHaveBeenCalledWith(STATE);
    expect(client.guidedSolveInWorker).not.toHaveBeenCalled();
    const result = await solveCube(STATE);
    const list = screen.getByRole('region', { name: 'All steps' });
    expect(within(list).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      expect.stringContaining('Stage 1: Computer solution'),
    ]);
    expect(stepButtons().length).toBe(Math.ceil(result.moveCount / 8));
    expect(screen.getByRole('region', { name: 'Summary' }).textContent).toContain(`${result.moveCount} moves`);

    fireEvent.click(screen.getByRole('button', { name: 'Play all' }));
    await settle(() => screen.queryByText('Solved! That is the whole solution.') !== null, 2000);
    expect(twin.animate!.mock.calls.length).toBe(result.moveCount);
  });

  it('shows an error with a retry when the solution cannot be worked out', async () => {
    vi.mocked(client.guidedSolveInWorker).mockRejectedValueOnce(new Error('worker crashed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    withCube(saved());
    render(<CubeSolutionView id="a" />);
    await settle(() => screen.queryByRole('alert') !== null);
    expect(screen.getByRole('alert').textContent).toContain('The solution could not be worked out.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await settle(ready);
    expect(client.guidedSolveInWorker).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('copies all moves, grouped by stage', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    withCube(saved());
    render(<CubeSolutionView id="a" />);
    await settle(ready);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy all moves' }));
    });
    const text = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(text.split('\n').slice(0, 2)).toEqual(['Cubyntra: Sunday scramble', expect.stringMatching(/^Beginner's method, \d+ moves in \d+ steps$/)]);
    expect(text).toContain('1. Daisy');
    expect(screen.getByText('Copied, grouped by stage.')).toBeTruthy();
  });

  describe('voice', () => {
    class FakeUtterance {
      rate = 1;
      lang = '';
      voice = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    const spoken: string[] = [];

    beforeEach(() => {
      spoken.length = 0;
      resetAudioUnlockForTests();
      vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
      vi.stubGlobal('speechSynthesis', {
        speak: (u: FakeUtterance) => {
          spoken.push(u.text);
          queueMicrotask(() => u.onend?.());
        },
        cancel: () => {},
        getVoices: () => [],
      });
    });

    it('names each stage and move during Play all, and stays quiet otherwise', async () => {
      withCube(saved(), { voiceMode: 'device' });
      render(<CubeSolutionView id="a" />);
      await settle(ready);
      unlockAudio();
      const solve = runGuidedSolve(STATE, 'beginner');

      // Stepping through by hand is not narrated.
      const twinRegion = screen.getByRole('region', { name: 'Teaching twin' });
      fireEvent.click(within(twinRegion).getByRole('button', { name: 'Step forward' }));
      await flush();
      expect(spoken).toEqual([]);

      fireEvent.click(screen.getByRole('button', { name: 'Play all' }));
      await settle(() => screen.queryByText('Solved! That is the whole solution.') !== null, 2000);
      expect(spoken[0]).toBe(stagePhrase(solve.steps[0].stageName));
      expect(spoken).toContain(movePhrase(solve.steps[0].algorithm.at(-1)!, 'words'));
      expect(spoken).toContain(stagePhrase(solve.steps.at(-1)!.stageName));
    });

    it('says nothing with the voice off', async () => {
      withCube(saved());
      render(<CubeSolutionView id="a" />);
      await settle(ready);
      unlockAudio();
      fireEvent.click(screen.getByRole('button', { name: 'Play all' }));
      await settle(() => screen.queryByText('Solved! That is the whole solution.') !== null, 2000);
      expect(spoken).toEqual([]);
    });
  });
});
