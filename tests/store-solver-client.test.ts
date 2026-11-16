/**
 * The store solves through the worker client, never by calling the solver on the main thread.
 */

import { describe, expect, it, vi } from 'vitest';

const solveInWorker = vi.fn(async () => ({ success: true, moves: [], notation: '', moveCount: 0, durationMs: 1 }));
vi.mock('../src/solver/client', () => ({ solveInWorker, warmUpSolver: vi.fn() }));
vi.mock('../src/solver/solver', () => ({
  solveCube: vi.fn(() => {
    throw new Error('the main-thread solver must not be called');
  }),
}));

const { useCubyntraStore } = await import('../src/stores/useCubyntraStore');

describe('store solve path', () => {
  it('hands the cube state to the worker client', async () => {
    await useCubyntraStore.getState().loadMockScramble();
    expect(solveInWorker).toHaveBeenCalledOnce();
    expect(solveInWorker).toHaveBeenCalledWith(useCubyntraStore.getState().cubeState);
    expect(useCubyntraStore.getState().appState).not.toBe('error');
  });
});
