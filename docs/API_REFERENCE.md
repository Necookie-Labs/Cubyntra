# Cubyntra TypeScript API & Domain Model Reference

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Status**: Implemented  
**Scope**: Public TypeScript Interfaces and Function Contracts

---

## 1. Cube Domain API (`src/cube/`)

### 1.1 Types & Interfaces (`src/cube/types.ts`)

```typescript
export type FaceName = 'U' | 'D' | 'F' | 'B' | 'L' | 'R';

export type ColorName = 'white' | 'yellow' | 'green' | 'blue' | 'orange' | 'red';

export type FaceletColor = 'U' | 'D' | 'F' | 'B' | 'L' | 'R';

export type StickerGrid = [
  [FaceletColor, FaceletColor, FaceletColor],
  [FaceletColor, FaceletColor, FaceletColor],
  [FaceletColor, FaceletColor, FaceletColor]
];

export interface CubeState {
  U: StickerGrid;
  D: StickerGrid;
  F: StickerGrid;
  B: StickerGrid;
  L: StickerGrid;
  R: StickerGrid;
}

export type MoveNotation =
  | 'U' | "U'" | 'U2'
  | 'D' | "D'" | 'D2'
  | 'F' | "F'" | 'F2'
  | 'B' | "B'" | 'B2'
  | 'L' | "L'" | 'L2'
  | 'R' | "R'" | 'R2';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  faceCounts: Record<FaceletColor, number>;
  problemPieces?: Array<{ face: FaceName; row: number; col: number }>;
}
```

### 1.2 Transformations (`src/cube/transforms.ts`)

- `createSolvedCube(): CubeState`  
  Returns a pristine, fully solved 6-face cube state.
- `rotateFace(state: CubeState, move: MoveNotation): CubeState`  
  Applies a single discrete face rotation and returns a new immutable `CubeState`.
- `applyMoveSequence(state: CubeState, moves: MoveNotation[]): CubeState`  
  Applies a sequential series of rotations to a cube state.
- `generateScramble(length?: number): MoveNotation[]`  
  Generates a mathematically valid random scramble sequence (default: 20 moves).
- `cubeStateToFaceletString(state: CubeState): string`  
  Converts a 6-face grid state into standard 54-character Kociemba notation (`UUU...RRR...FFF...DDD...LLL...BBB...`).
- `faceletStringToCubeState(str: string): CubeState`  
  Parses a 54-character string back into a structured `CubeState`.

### 1.3 State Validation (`src/cube/validator.ts`)

- `validateCubeState(state: CubeState): ValidationResult`  
  Validates piece counts, physical piece integrity, center colors, and mathematical parity.
- `validateFaceletString(str: string): ValidationResult`  
  Validates a 54-character string against format and group invariants.

---

## 2. Computer Vision API (`src/vision/`)

### 2.1 Types & Interfaces (`src/vision/types.ts`)

```typescript
export interface RGBColor {
  r: number; // [0, 255]
  g: number; // [0, 255]
  b: number; // [0, 255]
}

export interface HSVColor {
  h: number; // [0, 360]
  s: number; // [0, 1]
  v: number; // [0, 1]
}

export interface LABColor {
  L: number; // [0, 100]
  a: number; // [-128, 127]
  b: number; // [-128, 127]
}

export interface ClassifiedSticker {
  color: FaceletColor;
  confidence: number; // [0, 1]
  rgb: RGBColor;
  lab: LABColor;
}

export interface TemporalTracker {
  history: FaceletColor[][];
  stableCount: number;
  isLocked: boolean;
}
```

### 2.2 Color & Sampling Functions (`src/vision/`)

- `rgbToHsv(rgb: RGBColor): HSVColor`  
  Converts standard sRGB coordinates into cylindrical HSV coordinates.
- `rgbToLab(rgb: RGBColor): LABColor`  
  Converts sRGB to CIELAB under CIE Standard Illuminant D65.
- `deltaE76(lab1: LABColor, lab2: LABColor): number`  
  Calculates Euclidean perceptual distance in CIELAB color space.
- `classifyColor(rgb: RGBColor): ClassifiedSticker`  
  Classifies an arbitrary RGB pixel against calibrated cube reference swatches.
- `sampleGridColors(ctx: CanvasRenderingContext2D, width: number, height: number): ClassifiedSticker[][]`  
  Samples a $3 \times 3$ grid of circular kernels from the active video canvas.
- `updateStabilityTracker(tracker: TemporalTracker, currentGrid: ClassifiedSticker[][]): TemporalTracker`  
  Updates frame-by-frame stability buffer and determines locking threshold.

---

## 3. Solver API (`src/solver/`)

### 3.1 Types & Interfaces (`src/solver/types.ts`)

```typescript
export interface SolveResult {
  success: boolean;
  moves: MoveNotation[];
  moveCount: number;
  solveTimeMs: number;
  error?: string;
}

export interface SolverConfig {
  maxDepth?: number;
  timeoutMs?: number;
}
```

### 3.2 Solver Functions (`src/solver/solver.ts`)

- `solveCubeState(cubeStateOrString: CubeState | string, config?: SolverConfig): Promise<SolveResult>`  
  Computes an optimal or near-optimal move sequence using the two-phase Kociemba engine.
- `parseMoveSequence(moveString: string): MoveNotation[]`  
  Converts space-delimited string (`"R U R' U'"`) into a typed `MoveNotation[]` array.
- `invertMove(move: MoveNotation): MoveNotation`  
  Returns the exact algebraic inverse of a face rotation.
- `invertMoveSequence(moves: MoveNotation[]): MoveNotation[]`  
  Inverts an entire sequence of moves in reverse execution order.
- `verifySolution(initialState: CubeState, moves: MoveNotation[]): boolean`  
  Simulates move sequence and verifies convergence to `SOLVED_CUBE_STATE`.

---

## 4. Application Store API (`src/stores/useCubyntraStore.ts`)

```typescript
export interface CubyntraStore {
  // State
  cubeState: CubeState;
  scanStep: number; // 0 to 5
  scannedFaces: Partial<Record<FaceName, StickerGrid>>;
  validation: ValidationResult | null;
  solveResult: SolveResult | null;
  currentStepIndex: number;
  isPlaying: boolean;
  playbackSpeed: number; // 0.5, 1, 2, 4
  isCameraActive: boolean;

  // Actions
  setCubeState: (state: CubeState) => void;
  startScanning: () => void;
  captureFace: (face: FaceName, grid: StickerGrid) => void;
  resetScanning: () => void;
  scrambleCube: () => void;
  solveCurrentState: () => Promise<void>;
  nextStep: () => void;
  prevStep: () => void;
  togglePlay: () => void;
  setPlaybackSpeed: (speed: number) => void;
  resetPlayback: () => void;
}
```
