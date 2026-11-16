// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { createSolvedCubeState } from '@/cube/constants';
import { applyMoves, parseAlgorithm } from '@/cube/transforms';

const instances: FakeEngine[] = [];

class FakeEngine {
  syncWithCubeState = vi.fn();
  requestSync = vi.fn();
  setTheme = vi.fn();
  setMoveArrow = vi.fn();
  resize = vi.fn();
  resetCamera = vi.fn();
  dispose = vi.fn();
  animateMove = vi.fn(async () => {});
  constructor() {
    instances.push(this);
  }
}

vi.mock('@/three/engine', () => ({ CubeEngine: FakeEngine }));

const { CubeVisualizer } = await import('@/components/cube/CubeVisualizer');
type Ref = import('@/components/cube/CubeVisualizer').CubeVisualizerRef;

beforeEach(() => {
  instances.length = 0;
  document.documentElement.dataset.theme = 'light';
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

describe('CubeVisualizer', () => {
  it('paints the initial state and follows later states', () => {
    const solved = createSolvedCubeState();
    const { rerender } = render(<CubeVisualizer state={solved} />);
    const engine = instances[0];
    expect(engine.syncWithCubeState).toHaveBeenCalledWith(solved);
    const next = applyMoves(solved, parseAlgorithm('R'));
    rerender(<CubeVisualizer state={next} />);
    expect(engine.requestSync).toHaveBeenLastCalledWith(next);
  });

  it('matches the page theme, and follows theme changes', async () => {
    document.documentElement.dataset.theme = 'dark';
    render(<CubeVisualizer state={createSolvedCubeState()} />);
    const engine = instances[0];
    expect(engine.setTheme).toHaveBeenLastCalledWith('dark');
    await act(async () => {
      document.documentElement.dataset.theme = 'light';
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(engine.setTheme).toHaveBeenLastCalledWith('light');
  });

  it('exposes the engine through the ref and disposes it on unmount', () => {
    const ref = React.createRef<Ref>();
    const { unmount } = render(<CubeVisualizer ref={ref} state={createSolvedCubeState()} />);
    expect(ref.current!.getEngine()).toBe(instances[0]);
    unmount();
    expect(instances[0].dispose).toHaveBeenCalledOnce();
  });
});
