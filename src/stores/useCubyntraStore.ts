/**
 * Cubyntra - Centralized Application Store
 * Necookie Labs (c) 2026
 *
 * Coordinates scanning workflow, CV telemetry, logical cube states, and solve playback.
 */

import { create } from 'zustand';
import { CubeMove, CubeState, Face, ScannedFace, ValidationResult } from '../cube/types';
import { createSolvedCubeState, SCAN_SEQUENCE } from '../cube/constants';
import { applyMoves } from '../cube/transforms';
import { validateCubeState } from '../cube/validator';
import { solveCube } from '../solver/solver';
import { SolveResult } from '../solver/types';
import { FrameClassificationResult } from '../vision/types';
import { getScrambledMockScan, getSolvedMockScan } from '../vision/mock';

export type AppState =
  | 'ready'
  | 'scanning'
  | 'processing'
  | 'solution_ready'
  | 'solving'
  | 'solved'
  | 'error';

export interface CubyntraStore {
  // Application Stage
  appState: AppState;
  setAppState: (state: AppState) => void;

  // Scanner State
  currentStepIndex: number; // 0 to 5
  scannedFaces: Partial<Record<Face, ScannedFace>>;
  currentClassification: FrameClassificationResult | null;
  isCameraActive: boolean;
  cameraError: string | null;
  isDebugMode: boolean;

  // Cube & Solver State
  cubeState: CubeState;
  originalScrambleState: CubeState;
  validationResult: ValidationResult | null;
  solution: SolveResult | null;

  // Playback State
  currentMoveIndex: number; // -1 = start, 0 = move 1 applied, etc.
  isPlaying: boolean;
  playbackSpeed: number; // 0.5, 1, 2, 4

  // Actions
  startScanning: () => void;
  setClassification: (res: FrameClassificationResult | null) => void;
  captureFace: (scannedFace: ScannedFace) => void;
  rescanFace: (face: Face) => void;
  setCameraActive: (active: boolean) => void;
  setCameraError: (error: string | null) => void;
  toggleDebugMode: () => void;

  // Solving Actions
  validateAndSolve: () => Promise<void>;
  loadMockScramble: (scramble?: string) => Promise<void>;
  loadMockSolved: () => Promise<void>;
  stepNext: () => CubeMove | null;
  stepPrevious: () => CubeMove | null;
  togglePlay: () => void;
  setPlaying: (isPlaying: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  resetToScramble: () => void;
  resetAll: () => void;
}

export const useCubyntraStore = create<CubyntraStore>((set, get) => ({
  appState: 'ready',
  setAppState: (appState) => set({ appState }),

  currentStepIndex: 0,
  scannedFaces: {},
  currentClassification: null,
  isCameraActive: false,
  cameraError: null,
  isDebugMode: false,

  cubeState: createSolvedCubeState(),
  originalScrambleState: createSolvedCubeState(),
  validationResult: null,
  solution: null,

  currentMoveIndex: -1,
  isPlaying: false,
  playbackSpeed: 1,

  startScanning: () => {
    set({
      appState: 'scanning',
      currentStepIndex: 0,
      scannedFaces: {},
      currentClassification: null,
      cameraError: null,
      solution: null,
      currentMoveIndex: -1,
      isPlaying: false,
    });
  },

  setClassification: (currentClassification) => set({ currentClassification }),

  setCameraActive: (isCameraActive) => set({ isCameraActive }),

  setCameraError: (cameraError) => set({ cameraError }),

  toggleDebugMode: () => set((s) => ({ isDebugMode: !s.isDebugMode })),

  captureFace: (scannedFace: ScannedFace) => {
    const { scannedFaces, currentStepIndex } = get();
    const nextScannedFaces = {
      ...scannedFaces,
      [scannedFace.face]: scannedFace,
    };

    const nextIndex = currentStepIndex + 1;
    const isCompleted = nextIndex >= SCAN_SEQUENCE.length;

    if (isCompleted) {
      // Reconstruct complete CubeState from all 6 scanned faces
      const reconstructedState: CubeState = {
        U: nextScannedFaces.U!.stickers,
        R: nextScannedFaces.R!.stickers,
        F: nextScannedFaces.F!.stickers,
        D: nextScannedFaces.D!.stickers,
        L: nextScannedFaces.L!.stickers,
        B: nextScannedFaces.B!.stickers,
      };

      set({
        scannedFaces: nextScannedFaces,
        currentStepIndex: nextIndex,
        cubeState: reconstructedState,
        originalScrambleState: reconstructedState,
        appState: 'processing',
      });

      // Automatically validate and solve
      get().validateAndSolve();
    } else {
      set({
        scannedFaces: nextScannedFaces,
        currentStepIndex: nextIndex,
      });
    }
  },

  rescanFace: (face: Face) => {
    const targetIndex = SCAN_SEQUENCE.findIndex((s) => s.face === face);
    if (targetIndex !== -1) {
      set((s) => {
        const nextFaces = { ...s.scannedFaces };
        delete nextFaces[face];
        return {
          appState: 'scanning',
          currentStepIndex: targetIndex,
          scannedFaces: nextFaces,
        };
      });
    }
  },

  validateAndSolve: async () => {
    const { cubeState } = get();
    set({ appState: 'processing' });

    const validation = validateCubeState(cubeState);
    if (!validation.valid) {
      set({
        validationResult: validation,
        appState: 'error',
      });
      return;
    }

    const solutionResult = await solveCube(cubeState);
    if (!solutionResult.success) {
      set({
        validationResult: {
          valid: false,
          status: 'invalid',
          issues: [
            {
              code: 'PERMUTATION_PARITY',
              message: solutionResult.error || 'Failed to solve cube state.',
            },
          ],
        },
        appState: 'error',
      });
      return;
    }

    set({
      validationResult: validation,
      solution: solutionResult,
      currentMoveIndex: -1,
      appState: solutionResult.moveCount === 0 ? 'solved' : 'solution_ready',
    });
  },

  loadMockScramble: async (customScramble) => {
    const scramble = customScramble || "R U R' U' R' F R2 U' R' U' R U R' F'";
    const { state, scannedFaces } = getScrambledMockScan(scramble);

    set({
      scannedFaces,
      cubeState: state,
      originalScrambleState: state,
      currentStepIndex: 6,
      currentMoveIndex: -1,
      isPlaying: false,
      appState: 'processing',
    });

    await get().validateAndSolve();
  },

  loadMockSolved: async () => {
    const scannedFaces = getSolvedMockScan();
    const solved = createSolvedCubeState();

    set({
      scannedFaces,
      cubeState: solved,
      originalScrambleState: solved,
      currentStepIndex: 6,
      currentMoveIndex: -1,
      isPlaying: false,
      appState: 'solved',
      solution: {
        success: true,
        moves: [],
        notation: '',
        moveCount: 0,
        durationMs: 0,
      },
      validationResult: { valid: true, status: 'valid', issues: [] },
    });
  },

  stepNext: () => {
    const { solution, currentMoveIndex, originalScrambleState } = get();
    if (!solution || !solution.moves.length) return null;

    if (currentMoveIndex >= solution.moves.length - 1) {
      set({ isPlaying: false, appState: 'solved' });
      return null;
    }

    const nextIndex = currentMoveIndex + 1;
    const move = solution.moves[nextIndex];

    // Compute updated state by applying moves up to nextIndex
    const movesToApply = solution.moves.slice(0, nextIndex + 1);
    const nextState = applyMoves(originalScrambleState, movesToApply);

    set({
      currentMoveIndex: nextIndex,
      cubeState: nextState,
      appState: nextIndex === solution.moves.length - 1 ? 'solved' : 'solving',
    });

    return move;
  },

  stepPrevious: () => {
    const { solution, currentMoveIndex, originalScrambleState } = get();
    if (!solution || currentMoveIndex < 0) return null;

    const prevIndex = currentMoveIndex - 1;
    const movesToApply = prevIndex >= 0 ? solution.moves.slice(0, prevIndex + 1) : [];
    const prevState = applyMoves(originalScrambleState, movesToApply);

    set({
      currentMoveIndex: prevIndex,
      cubeState: prevState,
      appState: 'solving',
      isPlaying: false,
    });

    return null;
  },

  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),

  setPlaying: (isPlaying: boolean) => set({ isPlaying }),

  setPlaybackSpeed: (playbackSpeed: number) => set({ playbackSpeed }),

  resetToScramble: () => {
    const { originalScrambleState } = get();
    set({
      cubeState: originalScrambleState,
      currentMoveIndex: -1,
      isPlaying: false,
      appState: 'solution_ready',
    });
  },

  resetAll: () => {
    const solved = createSolvedCubeState();
    set({
      appState: 'ready',
      currentStepIndex: 0,
      scannedFaces: {},
      currentClassification: null,
      cubeState: solved,
      originalScrambleState: solved,
      validationResult: null,
      solution: null,
      currentMoveIndex: -1,
      isPlaying: false,
    });
  },
}));
