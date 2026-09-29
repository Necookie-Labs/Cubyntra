/**
 * Cubyntra - Store Error Handling Tests
 * Necookie Labs (c) 2026
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/solver/solver', () => ({
  solveCube: vi.fn(async () => {
    throw new Error('solver worker crashed');
  }),
}));

const { useCubyntraStore } = await import('../src/stores/useCubyntraStore');
const store = () => useCubyntraStore.getState();

describe('unexpected failures', () => {
  beforeEach(() => {
    store().resetAll();
  });

  it('never leaves the app stuck on the solving spinner', async () => {
    await store().loadMockScramble();

    expect(store().appState).toBe('error');
    expect(store().errorMessage).toMatch(/solver worker crashed/);
    expect(store().validationResult).toBeNull();
  });

  it('clears the error once the user starts again', async () => {
    await store().loadMockScramble();
    store().startScanning();
    expect(store().errorMessage).toBeNull();
    expect(store().appState).toBe('scanning');
  });
});
