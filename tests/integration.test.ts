/**
 * Cubyntra - End-to-End State & Lifecycle Integration Tests
 * Necookie Labs (c) 2026
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useCubyntraStore } from '../src/stores/useCubyntraStore';
import { isCubeSolved } from '../src/cube/transforms';
import { getScrambledMockScan, getSolvedMockScan } from '../src/vision/mock';
import { SCAN_SEQUENCE } from '../src/cube/constants';

describe('Cubyntra End-to-End Application Workflow', () => {
  beforeEach(() => {
    useCubyntraStore.getState().resetAll();
  });

  it('initializes in ready state with a pristine solved cube', () => {
    const state = useCubyntraStore.getState();
    expect(state.appState).toBe('ready');
    expect(isCubeSolved(state.cubeState)).toBe(true);
    expect(state.currentStepIndex).toBe(0);
    expect(state.solution).toBeNull();
  });

  it('executes complete 6-face scanning sequence and computes solution', async () => {
    const store = useCubyntraStore.getState();
    store.startScanning();
    expect(useCubyntraStore.getState().appState).toBe('scanning');

    // Generate a mock scramble capture
    const { scannedFaces } = getScrambledMockScan("R U R' U'");

    // Simulate capturing each of the 6 faces in sequence
    for (let i = 0; i < SCAN_SEQUENCE.length; i++) {
      const faceSeq = SCAN_SEQUENCE[i];
      const faceData = scannedFaces[faceSeq.face];
      await useCubyntraStore.getState().captureFace(faceData);
    }

    // Validation and solving have completed
    const finalState = useCubyntraStore.getState();
    expect(finalState.appState).toBe('solution_ready');
    expect(finalState.solution).not.toBeNull();
    expect(finalState.solution?.success).toBe(true);
    expect(finalState.solution?.moves.length).toBeGreaterThan(0);
  });

  it('executes full step-by-step playback from scramble to solved', async () => {
    const store = useCubyntraStore.getState();
    await store.loadMockScramble("R U R' U'");

    const stateAfterSolve = useCubyntraStore.getState();
    expect(stateAfterSolve.appState).toBe('solution_ready');
    const totalMoves = stateAfterSolve.solution!.moves.length;

    // Step through every move in the solution
    for (let i = 0; i < totalMoves; i++) {
      const move = useCubyntraStore.getState().stepNext();
      expect(move).not.toBeNull();
    }

    const stateAfterPlay = useCubyntraStore.getState();
    expect(stateAfterPlay.appState).toBe('solved');
    expect(isCubeSolved(stateAfterPlay.cubeState)).toBe(true);
  });

  it('correctly resets to initial scramble state when requested', async () => {
    const store = useCubyntraStore.getState();
    await store.loadMockScramble("R U R' U'");

    // Execute first move
    store.stepNext();
    expect(useCubyntraStore.getState().currentMoveIndex).toBe(0);

    // Reset back to initial scramble
    store.resetToScramble();
    const resetState = useCubyntraStore.getState();
    expect(resetState.currentMoveIndex).toBe(-1);
    expect(resetState.appState).toBe('solution_ready');
  });

  it('gracefully enters error state and supports individual face rescan', () => {
    const store = useCubyntraStore.getState();
    store.startScanning();

    const mockScan = getSolvedMockScan();
    // Tamper with Blue face to simulate bad lighting capture (duplicate yellow)
    mockScan.B.stickers[0] = 'yellow';

    for (let i = 0; i < SCAN_SEQUENCE.length; i++) {
      const faceSeq = SCAN_SEQUENCE[i];
      useCubyntraStore.getState().captureFace(mockScan[faceSeq.face]);
    }

    const errorState = useCubyntraStore.getState();
    expect(errorState.appState).toBe('error');
    expect(errorState.validationResult?.valid).toBe(false);

    // Rescan Blue face
    store.rescanFace('B');
    const rescanState = useCubyntraStore.getState();
    expect(rescanState.appState).toBe('scanning');
    expect(rescanState.currentStepIndex).toBe(3); // Index for B face
  });
});
