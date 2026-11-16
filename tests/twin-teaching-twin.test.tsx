// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { moveName } from '@/cube/moveNames';
import { runGuidedSolve } from '@/tutor';
import { stepMoves } from '@/twin/teaching';
import { scrambledState } from './helpers/scrambles';
import { fakeTeachingSurface } from './helpers/fakeTeachingSurface';

const engines: ReturnType<typeof fakeTeachingSurface>['surface'][] = [];

class FakeEngine {
  syncWithCubeState = vi.fn();
  requestSync = vi.fn();
  setTheme = vi.fn();
  resize = vi.fn();
  resetCamera = vi.fn();
  dispose = vi.fn();
  constructor() {
    const { surface } = fakeTeachingSurface();
    Object.assign(this, surface);
    engines.push(this as unknown as typeof surface);
  }
}

vi.mock('@/three/engine', () => ({ CubeEngine: FakeEngine }));
const { TeachingTwin } = await import('@/components/twin/TeachingTwin');

const steps = runGuidedSolve(scrambledState(32, 0), 'cfop').steps;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });

beforeEach(() => {
  engines.length = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TeachingTwin', () => {
  it('hides the controls and the move chips while the moves are hidden', async () => {
    const { rerender } = render(<TeachingTwin plan={steps[0]} movesHidden />);
    await flush();
    expect(screen.queryByRole('list', { name: 'Moves' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'After' })).toBeNull();
    rerender(<TeachingTwin plan={steps[0]} />);
    await flush();
    expect(screen.getByRole('list', { name: 'Moves' })).toBeTruthy();
  });

  it("shows the step's moves as chips and plays them with the controls", async () => {
    const onStepPlayed = vi.fn();
    const plan = steps[0];
    render(<TeachingTwin plan={plan} onStepPlayed={onStepPlayed} />);
    await flush();
    const chips = within(screen.getByRole('list', { name: 'Moves' })).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(stepMoves(plan).map((m) => m.notation));
    expect(chips[0].getAttribute('aria-current')).toBe('step');
    expect(engines[0].setGrip).toHaveBeenCalledWith(plan.grip);

    fireEvent.click(screen.getByRole('button', { name: 'Step forward' }));
    await flush();
    expect(engines[0].playback.getSnapshot().index).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await flush();
    expect(engines[0].playback.getSnapshot().state).toEqual(plan.expectedState);
    expect(onStepPlayed).toHaveBeenCalledWith(plan);
    const done = within(screen.getByRole('list', { name: 'Moves' })).getAllByRole('button');
    expect(done.every((c) => c.dataset.state === 'done')).toBe(true);
  });

  it('seeks when a chip is chosen, and switches cleanly to the next plan', async () => {
    const { rerender } = render(<TeachingTwin plan={steps[0]} />);
    await flush();
    const chips = within(screen.getByRole('list', { name: 'Moves' })).getAllByRole('button');
    fireEvent.click(chips[chips.length - 1]);
    await flush();
    expect(engines[0].playback.getSnapshot().index).toBe(chips.length - 1);

    rerender(<TeachingTwin plan={steps[1]} />);
    await flush();
    const next = within(screen.getByRole('list', { name: 'Moves' })).getAllByRole('button');
    expect(next.map((c) => c.textContent)).toEqual(stepMoves(steps[1]).map((m) => m.notation));
    expect(engines[0].playback.getSnapshot().index).toBe(0);
  });

  it('toggles the "after" preview', async () => {
    render(<TeachingTwin plan={steps[0]} showGhost />);
    await flush();
    const toggle = screen.getByRole('button', { name: 'After' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(engines[0].setGhostState).toHaveBeenLastCalledWith(steps[0].expectedState);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(engines[0].setGhostState).toHaveBeenLastCalledWith(null);
  });

  it('spells out the current move when plain language is on', async () => {
    render(<TeachingTwin plan={steps[0]} plainLanguage />);
    await flush();
    expect(screen.getByText(moveName(stepMoves(steps[0])[0]))).toBeTruthy();
  });

  it('disables playback without a plan', async () => {
    render(<TeachingTwin plan={null} />);
    await flush();
    expect(screen.queryByRole('list', { name: 'Moves' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'After' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
