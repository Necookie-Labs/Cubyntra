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

describe('loadMockScramble', () => {
  it('drops the scan in progress: source, samples and resolution', async () => {
    store().startCompanionScan();
    const sample = {
      row: 0, col: 0, index: 0,
      rgb: { r: 240, g: 240, b: 240 },
      hsv: { h: 0, s: 0, v: 94 },
      lab: { l: 95, a: 0, b: 0 },
      predictedColor: 'white' as const,
      confidence: 1,
      colorScores: { white: 1, yellow: 0, green: 0, blue: 0, red: 0, orange: 0 },
    };
    store().ingestFaceSamples('U', Array.from({ length: 9 }, (_, index) => ({ ...sample, index })));
    expect(store().scanSource).toBe('companion');
    expect(store().faceSamples.U).toBeDefined();

    await store().loadMockScramble("R U R' U'");
    expect(store().scanSource).toBeNull();
    expect(store().faceSamples).toEqual({});
    expect(store().resolution).toBeNull();
    expect(store().appState).toBe('solution_ready');
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
