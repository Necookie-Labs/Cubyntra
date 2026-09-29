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
type AppState = 'ready' | 'scanning' | 'processing' | 'reviewing'
              | 'solution_ready' | 'solving' | 'solved' | 'error';
type ScanSource = 'webcam' | 'companion';

interface CubyntraStore {
  appState: AppState;
  scanSource: ScanSource | null;
  currentStepIndex: number;                               // next SCAN_SEQUENCE step still missing
  scannedFaces: Partial<Record<Face, ScannedFace>>;       // provisional colors per face
  faceSamples: Partial<Record<Face, StickerSample[]>>;    // raw tile measurements for resolution
  faceImages: Partial<Record<Face, string>>;              // desktop-local photos for review
  resolution: ResolvedCube | null;                        // flags, rotated faces, duplicates
  cubeState: CubeState;
  originalScrambleState: CubeState;
  validationResult: ValidationResult | null;
  errorMessage: string | null;                            // unexpected failure, shown on the error screen
  solution: SolveResult | null;
  currentMoveIndex: number;                               // -1 = before the first move
  isPlaying: boolean;
  playbackSpeed: number;                                  // 0.5, 1, 2, 4

  startScanning(): void;                                  // webcam
  startCompanionScan(): void;                             // phone
  ingestFaceSamples(face: Face, samples: StickerSample[], imageDataUrl?: string): void;
  setReviewSticker(face: Face, index: number, color: CubeColor): void; // centers locked
  confirmReview(): Promise<void>;                         // solves only a valid cube
  rescanFace(face: Face): void;
  captureFace(face: ScannedFace): Promise<void>;          // legacy nine-color path
  validateAndSolve(): Promise<void>;
  stepNext(): CubeMove | null;
  stepPrevious(): CubeMove | null;
  togglePlay(): void;
  setPlaybackSpeed(speed: number): void;
  resetToScramble(): void;
  resetAll(): void;
}
```

`ingestFaceSamples` is keyed by face, so faces may arrive in any order. When all six are present it calls `resolveCubeColors` and enters `reviewing`.

---

## 5. Photo Pipeline API (`src/vision/`)

| Function | Module | Purpose |
|---|---|---|
| `mapElementRectToVideo(target, videoBox, videoW, videoH): ROIBounds` | `sampling.ts` | Maps the on-screen reticle into camera-frame pixels under `object-fit: cover`. |
| `assessCaptureQuality(input): CaptureQuality` | `captureQuality.ts` | Framing, right face, light, glare, steady; `topHint` is the one fix to show. |
| `measureGlare(ctx, roi): number[]` | `captureQuality.ts` | Share of clipped pixels per tile. |
| `analyzeFaceContext(ctx, w, h, face, knownCenters?): FaceAnalysis` | `faceImageAnalyzer.ts` | Per-face samples, ML verdict, wrong-face check, provisional colors. |
| `analyzeFaceImage(dataUrl, face, knownCenters?): Promise<FaceAnalysis>` | `faceImageAnalyzer.ts` | Browser wrapper: decodes a JPEG data URL, then `analyzeFaceContext`. |
| `resolveCubeColors(samplesByFace): ResolvedCube` | `resolveCubeColors.ts` | Calibrate, nine-per-color assignment, orientation repair, review flags. |

---

## 6. Session Relay API (`src/app/api/session/`)

| Method & path | Caller | Body / query | Effect |
|---|---|---|---|
| `POST /api/session` | desktop | – | Creates a session; returns `sessionId`, `companionUrl` (best LAN address first) and `availableIps`. |
| `GET /api/session/[id]/events?role=desktop\|mobile` | both | – | Server-Sent Events. Initial `STATE_SYNC`, then session events. |
| `POST /api/session/[id]/face` | phone | `{ face, imageDataUrl, capturedAt, quality? }` | Holds the JPEG in memory and broadcasts `FACE_IMAGE`. `413` over 1.5 MB. The legacy `{ face, stickers[9] }` body is still accepted. |
| `GET /api/session/[id]/face?face=X` | desktop | – | Returns the held photo (`Cache-Control: no-store`), or `404`. |
| `POST /api/session/[id]/verdict` | desktop | `{ face, accepted, reason?, previewColors? }` | Broadcasts `FACE_VERDICT` to the phone. |
| `POST /api/session/[id]/rescan` | desktop | `{ face }` | Broadcasts `RESCAN_REQUEST`. |
| `POST /api/session/[id]/confirm` | desktop | – | Deletes every held photo; broadcasts `SCAN_CONFIRMED`. |
| `POST /api/session/[id]/reset` | phone | – | "Scan another cube": clears faces and photos and broadcasts `SESSION_RESET` from `mobile`. The desktop then starts a fresh phone scan on the same pairing. |

Each open event stream's 15 s keep-alive also refreshes the session (`touch`), so a connected pairing never expires while idle; sessions idle for 30 minutes are removed by `purgeExpired`. When a session no longer exists its stream is closed, and the desktop shows "Pairing ended" with a New QR code button.

Photos are kept in a map separate from `SessionState`, so session snapshots and `STATE_SYNC` never contain pixels. Request bodies are parsed by the pure functions in `src/sync/validation.ts`.
