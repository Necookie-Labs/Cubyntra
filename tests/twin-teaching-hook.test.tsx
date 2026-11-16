// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { applyMoves } from '@/cube/transforms';
import { runGuidedSolve } from '@/tutor';
import { useTeachingTwin } from '@/components/twin/useTeachingTwin';
import { stepMoves } from '@/twin/teaching';
import { piecePosition } from '@/twin/mapping';
import { scrambledState } from './helpers/scrambles';
import { fakeTeachingSurface } from './helpers/fakeTeachingSurface';

afterEach(cleanup);

const steps = runGuidedSolve(scrambledState(31, 0), 'beginner').steps;

/** Lets the controller's queued playback commands run. */
const flush = () => act(async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
});

describe('useTeachingTwin', () => {
  it('loads the plan, holds its grip and spotlights its pieces', async () => {
    const { surface } = fakeTeachingSurface();
    const plan = steps[0];
    const { result } = renderHook(() => useTeachingTwin(surface, plan));
    await flush();
    expect(result.current.snapshot?.moves).toEqual(stepMoves(plan));
    expect(result.current.snapshot?.state).toEqual(plan.startState);
    expect(surface.setGrip).toHaveBeenCalledWith(plan.grip);
    expect(surface.setSpotlight).toHaveBeenLastCalledWith(
      plan.highlightPieces.map((p) => ({ position: piecePosition(plan.startState, p) }))
    );
    expect(surface.setGhostState).toHaveBeenLastCalledWith(null);
  });

  it('reports the step played, follows the next plan and keeps the latest callback', async () => {
    const { surface } = fakeTeachingSurface();
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ plan, cb }) => useTeachingTwin(surface, plan, { onStepPlayed: cb }), {
      initialProps: { plan: steps[0], cb: first },
    });
    await flush();
    rerender({ plan: steps[0], cb: second });
    await act(() => surface.playback.play());
    expect(result.current.snapshot?.index).toBe(stepMoves(steps[0]).length);
    expect(result.current.snapshot?.state).toEqual(applyMoves(steps[0].startState, stepMoves(steps[0])));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(steps[0]);
    expect(surface.getGrip()).toEqual(steps[0].gripAfter);

    rerender({ plan: steps[1], cb: second });
    await flush();
    expect(result.current.snapshot?.index).toBe(0);
    expect(result.current.snapshot?.moves).toEqual(stepMoves(steps[1]));
    expect(result.current.snapshot?.state).toEqual(steps[1].startState);
  });

  it('toggles the "after" preview', async () => {
    const { surface } = fakeTeachingSurface();
    const { result } = renderHook(() => useTeachingTwin(surface, steps[0], { showGhost: true }));
    await flush();
    expect(result.current.ghost).toBe(true);
    expect(surface.setGhostState).toHaveBeenLastCalledWith(steps[0].expectedState);
    act(() => result.current.setGhost(false));
    expect(result.current.ghost).toBe(false);
    expect(surface.setGhostState).toHaveBeenLastCalledWith(null);
  });

  it('waits for the engine, and clears the aids on unmount', async () => {
    const { surface } = fakeTeachingSurface();
    const { result, rerender, unmount } = renderHook(({ engine }) => useTeachingTwin(engine, steps[0]), {
      initialProps: { engine: null as typeof surface | null },
    });
    expect(result.current.snapshot).toBeNull();
    rerender({ engine: surface });
    await flush();
    expect(result.current.snapshot?.moves).toEqual(stepMoves(steps[0]));
    unmount();
    expect(surface.setSpotlight).toHaveBeenLastCalledWith(null);
    expect(surface.setSlotOutline).toHaveBeenLastCalledWith(null);
  });
});
