/**
 * Cubyntra - Store reset behaviour tests
 * Necookie Labs (c) 2026
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useCubyntraStore } from '../src/stores/useCubyntraStore';
import { createSolvedCubeState } from '../src/cube/constants';

const store = () => useCubyntraStore.getState();

beforeEach(() => store().resetAll());

describe('resetAll', () => {
  it('clears a camera error', () => {
    store().setCameraError('Camera permission denied');
    store().resetAll();
    expect(store().cameraError).toBeNull();
  });
});

describe('startScanning', () => {
  it('clears the previous cube and its validation', async () => {
    await store().loadMockScramble("R U R' U'");
    expect(store().cubeState).not.toEqual(createSolvedCubeState());
    expect(store().validationResult).not.toBeNull();

    store().startScanning();
    expect(store().cubeState).toEqual(createSolvedCubeState());
    expect(store().originalScrambleState).toEqual(createSolvedCubeState());
    expect(store().validationResult).toBeNull();
    expect(store().solution).toBeNull();
  });
});
