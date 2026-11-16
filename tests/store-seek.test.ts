/**
 * Cubyntra - Store seek tests (remote playback jumps)
 * Necookie Labs (c) 2026
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { useCubyntraStore } from '../src/stores/useCubyntraStore';
import { applyMoves } from '../src/cube/transforms';

const store = () => useCubyntraStore.getState();

describe('seekToMove', () => {
  beforeAll(async () => {
    store().resetAll();
    await store().loadMockScramble("R U R' U'");
  });

  it('jumps to a move, showing the cube after it, and pauses', () => {
    const { solution, originalScrambleState } = store();
    expect(solution!.moves.length).toBeGreaterThan(2);
    store().setPlaying(true);
    store().seekToMove(1);
    expect(store().currentMoveIndex).toBe(1);
    expect(store().isPlaying).toBe(false);
    expect(store().appState).toBe('solving');
    expect(store().cubeState).toEqual(applyMoves(originalScrambleState, solution!.moves.slice(0, 2)));
  });

  it('clamps to the scramble and to the last move', () => {
    store().seekToMove(-5);
    expect(store().currentMoveIndex).toBe(-1);
    expect(store().appState).toBe('solution_ready');
    expect(store().cubeState).toEqual(store().originalScrambleState);

    store().seekToMove(999);
    expect(store().currentMoveIndex).toBe(store().solution!.moves.length - 1);
    expect(store().appState).toBe('solved');
  });
});
