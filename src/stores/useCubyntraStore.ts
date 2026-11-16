/**
 * Cubyntra - Centralized Application Store
 * Necookie Labs (c) 2026
 *
 * Coordinates scanning workflow, CV telemetry, logical cube states, and solve playback.
 */

import { create } from 'zustand';
import { CubeColor, CubeMove, CubeState, Face, FaceStickers, ScannedFace, ValidationResult } from '../cube/types';
import { CANONICAL_CENTER_COLORS, FACES, createSolvedCubeState, SCAN_SEQUENCE } from '../cube/constants';
import { applyMoves } from '../cube/transforms';
import { validateCubeState } from '../cube/validator';
import { solveInWorker } from '../solver/client';
import { SolveResult } from '../solver/types';
import { FrameClassificationResult, RGBColor, StickerSample } from '../vision/types';
import { buildDynamicPalette, classifyWithDynamicPalette } from '../vision/dynamicCalibration';
import { resolveCubeColors, ResolvedCube } from '../vision/resolveCubeColors';
import { getScrambledMockScan, getSolvedMockScan } from '../vision/mock';

export type AppState =
  | 'ready'
  | 'scanning'
  | 'processing'
  | 'reviewing'
  | 'solution_ready'
  | 'solving'
  | 'solved'
  | 'error';

export type ScanSource = 'webcam' | 'companion';

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

  // Photo pipeline: raw tile measurements per face, resolved together once all six are in
  scanSource: ScanSource | null;
  faceSamples: Partial<Record<Face, StickerSample[]>>;
  resolution: ResolvedCube | null;
  /** Tiles the student set by hand on the review screen; laid back over every re-resolution. */
  manualEdits: Partial<Record<Face, Partial<Record<number, CubeColor>>>>;
  /** Phone readings that arrived during review while hand fixes exist, waiting for a choice. */
  pendingFaces: Partial<Record<Face, StickerSample[]>>;

  // Cube & Solver State
  cubeState: CubeState;
  originalScrambleState: CubeState;
  validationResult: ValidationResult | null;
  /** Readable message for an unexpected failure that is not a cube validation issue. */
  errorMessage: string | null;
  solution: SolveResult | null;

  // Playback State
  currentMoveIndex: number; // -1 = start, 0 = move 1 applied, etc.
  isPlaying: boolean;
  playbackSpeed: number; // 0.5, 1, 2, 4

  // Actions
  startScanning: () => void;
  setClassification: (res: FrameClassificationResult | null) => void;
  captureFace: (scannedFace: ScannedFace) => Promise<void>;
  rescanFace: (face: Face) => void;
  setCameraActive: (active: boolean) => void;
  setCameraError: (error: string | null) => void;

  // Photo pipeline & review
  startCompanionScan: () => void;
  ingestFaceSamples: (face: Face, samples: StickerSample[]) => void;
  setReviewSticker: (face: Face, index: number, color: CubeColor) => void;
  /** Uses the held phone readings; hand fixes on other faces are kept. */
  applyPendingFaces: () => void;
  /** Keeps the review as it is and drops the held phone readings. */
  discardPendingFaces: () => void;
  confirmReview: () => Promise<void>;

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
  /** Jumps to a move position (-1 = the scramble) without animating; pauses. */
  seekToMove: (index: number) => void;
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

  scanSource: null,
  faceSamples: {},
  resolution: null,
  manualEdits: {},
  pendingFaces: {},

  cubeState: createSolvedCubeState(),
  originalScrambleState: createSolvedCubeState(),
  validationResult: null,
  errorMessage: null,
  solution: null,

  currentMoveIndex: -1,
  isPlaying: false,
  playbackSpeed: 1,

  startScanning: () => {
    set({
      appState: 'scanning',
      scanSource: 'webcam',
      errorMessage: null,
      faceSamples: {},
      manualEdits: {},
      pendingFaces: {},
      resolution: null,
      currentStepIndex: 0,
      scannedFaces: {},
      currentClassification: null,
      cameraError: null,
      solution: null,
      currentMoveIndex: -1,
      isPlaying: false,
      // A new scan starts from a blank cube: no state or verdict from the previous one.
      validationResult: null,
      cubeState: createSolvedCubeState(),
      originalScrambleState: createSolvedCubeState(),
    });
  },

  setClassification: (currentClassification) => set({ currentClassification }),

  setCameraActive: (isCameraActive) => set({ isCameraActive }),

  setCameraError: (cameraError) => set({ cameraError }),


  captureFace: async (scannedFace: ScannedFace) => {
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
      await get().validateAndSolve();
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
        const nextSamples = { ...s.faceSamples };
        delete nextSamples[face];
        return {
          appState: 'scanning',
          currentStepIndex: targetIndex,
          scannedFaces: nextFaces,
          faceSamples: nextSamples,
          resolution: null,
          pendingFaces: {},
          scanSource: s.scanSource ?? 'webcam',
        };
      });
    }
  },

  startCompanionScan: () => {
    set({
      appState: 'scanning',
      scanSource: 'companion',
      errorMessage: null,
      faceSamples: {},
      manualEdits: {},
      pendingFaces: {},
      resolution: null,
      currentStepIndex: 0,
      scannedFaces: {},
      currentClassification: null,
      cameraError: null,
      solution: null,
      validationResult: null,
      currentMoveIndex: -1,
      isPlaying: false,
      cubeState: createSolvedCubeState(),
    });
  },

  ingestFaceSamples: (face, samples) => {
    const { appState, manualEdits } = get();
    // A new reading during review must not silently undo the student's hand fixes: hold it
    // and let them choose (applyPendingFaces / discardPendingFaces).
    if (appState === 'reviewing' && hasManualEdits(manualEdits)) {
      set((s) => ({ pendingFaces: { ...s.pendingFaces, [face]: samples } }));
      return;
    }
    ingestNow(face, samples);
  },

  applyPendingFaces: () => {
    const { pendingFaces, manualEdits } = get();
    const faces = FACES.filter((f) => pendingFaces[f]);
    if (faces.length === 0) return;
    // Fixes on a re-read face no longer apply to it; fixes elsewhere are kept.
    const edits = { ...manualEdits };
    for (const f of faces) delete edits[f];
    set({ pendingFaces: {}, manualEdits: edits });
    for (const f of faces) ingestNow(f, pendingFaces[f]!);
  },

  discardPendingFaces: () => set({ pendingFaces: {} }),

  setReviewSticker: (face, index, color) => {
    const { cubeState, resolution, manualEdits } = get();
    if (index === 4 || index < 0 || index > 8) return; // centers are fixed by the mechanism

    const edits = { ...manualEdits, [face]: { ...manualEdits[face], [index]: color } };
    const applied = applyManualEdits(cubeState, resolution, { [face]: { [index]: color } });
    set({ ...applied, manualEdits: edits });
  },

  confirmReview: async () => {
    const { cubeState } = get();
    if (!validateCubeState(cubeState).valid) return;
    set({ originalScrambleState: cubeState });
    await get().validateAndSolve();
  },

  validateAndSolve: async () => {
    const { cubeState } = get();
    set({ appState: 'processing', errorMessage: null });

    // Anything unexpected must land in the error screen, never leave the spinner running.
    try {
      await solveInto(cubeState);
    } catch (err) {
      console.error('[Cubyntra] Solve failed unexpectedly:', err);
      set({
        appState: 'error',
        validationResult: null,
        errorMessage: `Something went wrong while solving. ${err instanceof Error ? err.message : ''}`.trim(),
      });
    }
  },

  loadMockScramble: async (customScramble) => {
    const scramble = customScramble || "R U R' U' R' F R2 U' R' U' R U R' F'";
    try {
      const { state, scannedFaces } = getScrambledMockScan(scramble);
      set({
        // The demo replaces any scan in progress, so its source and readings go too.
        scanSource: null,
        faceSamples: {},
        manualEdits: {},
        pendingFaces: {},
        resolution: null,
        solution: null,
        scannedFaces,
        cubeState: state,
        originalScrambleState: state,
        currentStepIndex: 6,
        currentMoveIndex: -1,
        isPlaying: false,
        appState: 'processing',
        errorMessage: null,
      });
    } catch (err) {
      set({
        appState: 'error',
        validationResult: null,
        errorMessage: `The demo cube could not be loaded. ${err instanceof Error ? err.message : ''}`.trim(),
      });
      return;
    }

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

  seekToMove: (index) => {
    const { solution, originalScrambleState } = get();
    if (!solution || !solution.moves.length) return;
    const last = solution.moves.length - 1;
    const target = Math.max(-1, Math.min(last, Math.trunc(index)));
    set({
      currentMoveIndex: target,
      cubeState: applyMoves(originalScrambleState, solution.moves.slice(0, target + 1)),
      isPlaying: false,
      appState: target === last ? 'solved' : target < 0 ? 'solution_ready' : 'solving',
    });
  },

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
      scanSource: null,
      errorMessage: null,
      cameraError: null,
      faceSamples: {},
      manualEdits: {},
      pendingFaces: {},
      resolution: null,
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

type ManualEdits = Partial<Record<Face, Partial<Record<number, CubeColor>>>>;

function hasManualEdits(edits: ManualEdits): boolean {
  return FACES.some((f) => Object.keys(edits[f] ?? {}).length > 0);
}

/**
 * Lays hand-set tiles over a cube state. A tile the student set by hand is verified, so it stops
 * being flagged.
 */
function applyManualEdits(
  state: CubeState,
  resolution: ResolvedCube | null,
  edits: ManualEdits
): { cubeState: CubeState; resolution: ResolvedCube | null; validationResult: ValidationResult } {
  const next = { ...state };
  let flags = resolution?.flags;
  for (const face of FACES) {
    const faceEdits = edits[face];
    if (!faceEdits) continue;
    const stickers = [...next[face]] as FaceStickers;
    for (const [i, color] of Object.entries(faceEdits)) {
      const index = Number(i);
      if (index === 4 || !color) continue;
      stickers[index] = color;
    }
    next[face] = stickers;
    if (flags) {
      flags = {
        ...flags,
        [face]: flags[face].map((fl, i) => (faceEdits[i] && i !== 4 ? { lowMargin: false, overridden: false } : fl)),
      };
    }
  }
  const nextResolution =
    resolution && flags
      ? {
          ...resolution,
          flags,
          flaggedCount: FACES.reduce((n, f) => n + flags![f].filter((fl) => fl.lowMargin || fl.overridden).length, 0),
        }
      : resolution;
  return { cubeState: next, resolution: nextResolution, validationResult: validateCubeState(next) };
}

/**
 * Records one face's readings. Faces may arrive in any order (the phone lets users jump between
 * steps), so progress is keyed by face. Once all six are in, the cube is resolved and any hand
 * fixes still standing are laid back over it.
 */
function ingestNow(face: Face, samples: StickerSample[]): void {
  const { getState: get, setState: set } = useCubyntraStore;
  const { faceSamples, scannedFaces, cubeState, manualEdits } = get();
  const nextSamples = { ...faceSamples, [face]: samples };

  // Provisional colors for immediate feedback, calibrated on the centers seen so far.
  const centers: Partial<Record<Face, RGBColor>> = {};
  for (const f of FACES) if (nextSamples[f]) centers[f] = nextSamples[f]![4].rgb;
  const palette = buildDynamicPalette(centers);
  const preview = samples.map((s, i) =>
    i === 4 ? CANONICAL_CENTER_COLORS[face] : classifyWithDynamicPalette(s.rgb, palette).predictedColor
  ) as FaceStickers;

  const scanned: ScannedFace = {
    face,
    centerColor: CANONICAL_CENTER_COLORS[face],
    stickers: preview,
    confidences: samples.map((s) => s.confidence),
    capturedAt: Date.now(),
  };
  const nextScanned = { ...scannedFaces, [face]: scanned };
  // A fresh reading of a face replaces any hand fixes on it.
  const edits = { ...manualEdits };
  delete edits[face];

  if (!FACES.every((f) => nextSamples[f])) {
    set({
      faceSamples: nextSamples,
      scannedFaces: nextScanned,
      manualEdits: edits,
      currentStepIndex: SCAN_SEQUENCE.findIndex((step) => !nextSamples[step.face]),
      cubeState: { ...cubeState, [face]: preview },
    });
    return;
  }

  let resolution: ResolvedCube;
  try {
    resolution = resolveCubeColors(nextSamples as Record<Face, StickerSample[]>);
  } catch (err) {
    console.error('[Cubyntra] Color resolution failed:', err);
    set({
      faceSamples: nextSamples,
      scannedFaces: nextScanned,
      appState: 'error',
      validationResult: null,
      errorMessage: 'The six faces could not be combined into a cube. Try scanning again.',
    });
    return;
  }
  set({
    ...applyManualEdits(resolution.state, resolution, edits),
    faceSamples: nextSamples,
    scannedFaces: nextScanned,
    manualEdits: edits,
    currentStepIndex: SCAN_SEQUENCE.length,
    appState: 'reviewing',
  });
}

/** Validates and solves `cubeState`, writing the outcome into the store. */
async function solveInto(cubeState: CubeState): Promise<void> {
  const set = useCubyntraStore.setState;
  const validation = validateCubeState(cubeState);
  if (!validation.valid) {
    set({
      validationResult: validation,
      appState: 'error',
    });
    return;
  }

  // Off the main thread: the worker builds the tables and searches (see src/solver/client.ts).
  const solutionResult = await solveInWorker(cubeState);
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
}
