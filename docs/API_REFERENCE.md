# Cubyntra TypeScript API & Domain Model Reference

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Status**: Implemented  
**Scope**: Public TypeScript Interfaces and Function Contracts

---

## 1. Cube Domain API (`src/cube/`)

### 1.1 Types & Interfaces (`src/cube/types.ts`)

```typescript
export type CubeColor = 'white' | 'yellow' | 'green' | 'blue' | 'red' | 'orange';
export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export type QuarterTurns = 1 | -1 | 2;
export type Slice = 'M' | 'E' | 'S';
export type RotationAxis = 'x' | 'y' | 'z';
export type MoveKind = 'face' | 'wide' | 'slice' | 'rotation';

// Every move also has: quarterTurns: QuarterTurns; notation: string; description: string
export type Move =
  | { kind: 'face'; face: Face }
  | { kind: 'wide'; face: Face }
  | { kind: 'slice'; slice: Slice }
  | { kind: 'rotation'; axis: RotationAxis };
export type CubeMove = Move; // historical name, still used by the solver, store and UI

export type FaceStickers = [CubeColor, /* x9, row-major as seen from outside */];
export interface CubeState { U: FaceStickers; R: FaceStickers; F: FaceStickers; D: FaceStickers; L: FaceStickers; B: FaceStickers }
```

### 1.2 Moves (`src/cube/transforms.ts`)

- `parseMove(notation: string): Move`: face `U R F D L B`, wide `u r f d l b` / `Uw..Bw`, slices `M E S`, rotations `x y z`, each with optional `'` or `2`. Anything else throws.
- `parseAlgorithm(alg: string): Move[]`, `formatMove(move): string`, `formatAlgorithm(moves): string` (canonical, wide moves lower case).
- `applyMove(state, move): CubeState`, `applyMoves(state, moves): CubeState`.
- `invertMove(move): Move`, `invertAlgorithm(moves): Move[]`.
- `createMove(target, quarterTurns): Move`, `moveFromReference(kind, face, quarterTurns): Move` (e.g. `('slice', 'R', 1)` is `M'`).
- `moveReferenceFace(move): Face`: the face whose clockwise defines the move's direction.
- `moveLayers(move): { axis: 'x' | 'y' | 'z'; layers: (-1 | 0 | 1)[]; quarters: number }`: the layers a move turns and the signed quarter turns about the + axis; used by the 3D engine.
- `isCubeSolved(state): boolean`: solved in any of the 24 orientations.
- `cubeStateToFaceletString(state): string` / `faceletStringToCubeState(str): CubeState`: 54-character Kociemba strings; the state must be in standard orientation.
- `cloneCubeState`, `rotateFaceClockwise`, `rotateFaceCounterClockwise`, `rotateFace180`.
- `createSolvedCubeState(): CubeState` lives in `src/cube/constants.ts`.

### 1.3 Orientation and Grip (`src/cube/orientation.ts`, `src/cube/grip.ts`)

- `normalizeOrientation(state): { state: CubeState; rotation: Move[] } | null`
- `centerColors(state): Record<Face, CubeColor>`
- `findRotation(centers, target: Partial<Record<Face, CubeColor>>): Move[] | null`
- `translateMoveThroughRotation(move, rotation): Move` and `translateAlgorithmThroughRotation(moves, rotation): Move[]`: for any state S, `S · move · rotation = S · rotation · result`.
- `interface Grip { top: CubeColor; front: CubeColor }`, `STANDARD_GRIP` (white top, green front).
- `isValidGrip(grip)`, `gripOf(state): Grip`, `gripCenters(grip): Record<Face, CubeColor>`.
- `gripRotation(from: Grip, to: Grip): Move[]`: at most two rotations.
- `viewInGrip(state, grip): { state: CubeState; rotation: Move[] }`.
- `translateMove(move, from: Grip, to: Grip): Move`, `translateAlgorithm(moves, from, to): Move[]`.

### 1.4 Pieces (`src/cube/pieces.ts`)

- `CORNER_SLOTS`, `EDGE_SLOTS`: sticker tables, shared with the validator.
- `findEdge(state, [c1, c2]): { slot: EdgeSlot; stickers: [StickerRef, StickerRef]; orientation: 0 | 1 }`
- `findCorner(state, [c1, c2, c3]): { slot: CornerSlot; stickers: [StickerRef, StickerRef, StickerRef]; orientation: 0 | 1 | 2 }`
  (`stickers[i]` shows `colors[i]`; `orientation` is the slot sticker showing `c1`, 0 = U/D. Both throw if the piece does not exist.)
- `isPieceSolved(state, colors): boolean`, `isCrossSolved(state, color)`, `isF2LSlotSolved(state, crossColor, [sideA, sideB])`, `isLayerSolved(state, color)`, `isMiddleLayerSolved(state, color)`, `f2lSlots(crossColor)`, `sideColors(color)`.

### 1.5 Names and Geometry

- `moveName(move): string` (`src/cube/moveNames.ts`): plain-language instruction, e.g. "Turn the right side up".
- `src/cube/geometry.ts`: `stickerPosition`, `stickerAt`, `layerTurnPermutation`, `faceRotationMap`, `ORIENTATIONS` (the 24 orientations with their rotations).

### 1.6 State Validation (`src/cube/validator.ts`)

- `validateCubeState(state: CubeState): ValidationResult`
  Normalizes orientation, then validates color counts, centers, piece integrity and parity.

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
- `parseAlgorithm` / `parseMove`: see section 1.2. Solutions are face turns in the frame the cube is held in.
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
  resolution: ResolvedCube | null;                        // flags, rotated faces, duplicates
  manualEdits: Partial<Record<Face, Partial<Record<number, CubeColor>>>>; // hand fixes, re-applied on re-resolution
  pendingFaces: Partial<Record<Face, StickerSample[]>>;   // phone readings held during review
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
  ingestFaceSamples(face: Face, samples: StickerSample[]): void;
  setReviewSticker(face: Face, index: number, color: CubeColor): void; // centers locked
  applyPendingFaces(): void;                              // use held phone readings, keep other fixes
  discardPendingFaces(): void;
  confirmReview(): Promise<void>;                         // solves only a valid cube
  rescanFace(face: Face): void;
  captureFace(face: ScannedFace): Promise<void>;          // legacy nine-color path
  validateAndSolve(): Promise<void>;
  stepNext(): CubeMove | null;
  stepPrevious(): CubeMove | null;
  togglePlay(): void;
  setPlaybackSpeed(speed: number): void;
  resetToScramble(): void;
  seekToMove(index: number): void;                        // jump without animating; pauses
  resetAll(): void;
}
```

`ingestFaceSamples` is keyed by face, so faces may arrive in any order. When all six are present it calls `resolveCubeColors`, lays any hand fixes back over the result and enters `reviewing`. A face that arrives during `reviewing` while hand fixes exist is held in `pendingFaces` until the student chooses. `startScanning`, `startCompanionScan`, `loadMockScramble` and `resetAll` clear the previous cube, validation, samples, resolution and fixes; `resetAll` also clears `cameraError`.

---

## 5. Photo Pipeline API (`src/vision/`)

| Function | Module | Purpose |
|---|---|---|
| `mapElementRectToVideo(target, videoBox, videoW, videoH): ROIBounds` | `sampling.ts` | Maps the on-screen reticle into camera-frame pixels under `object-fit: cover`. |
| `assessCaptureQuality(input): CaptureQuality` | `captureQuality.ts` | Framing, right face, light, glare, steady; `topHint` is the one fix to show. |
| `measureGlare(ctx, roi): number[]` | `captureQuality.ts` | Share of clipped pixels per tile. |
| `analyzeFaceContext(ctx, w, h, face, knownCenters?): FaceAnalysis` | `faceImageAnalyzer.ts` | Per-face samples, ML verdict, wrong-face check, provisional colors. Runs on the phone. |
| `faceScannedFromSamples(face, samples, colors)` / `samplesFromFaceScanned(payload)` | `src/sync/faceSamples.ts` | Phone: a face reading as a `face-scanned` message. Laptop: tile samples rebuilt from it. |
| `resolveCubeColors(samplesByFace): ResolvedCube` | `resolveCubeColors.ts` | Calibrate, nine-per-color assignment, orientation repair, review flags. |

---

## 6. Phone ↔ Laptop Sync API (`src/sync/`, `src/app/api/session/`)

See [ADR-015](ADR/015-state-only-sync.md). State messages only; no route accepts or returns image
data. Every route except the first two needs the session secret in `x-cubyntra-session`
(404 unknown session, 403 missing or wrong secret).

| Method & path | Caller | Auth | Body / query | Result |
|:---|:---|:---|:---|:---|
| `POST /api/session` | laptop | `x-cubyntra-token` (app token), 20/min | ignored (no `preferredId`) | `{ sessionId, secret, code, codeExpiresAt, companionUrl, availableIps, primaryIp }`. `401` bad token, `429`, `503` all 8 slots in use. |
| `POST /api/session/pair` | phone | none, 10/min overall | `{ code }`, ≤ 1 KB | `{ sessionId, secret, token }`. Code is single-use, 10 min. `400`, `404` wrong/used/expired, `413`, `429`. |
| `GET /api/session/[id]` | either | secret | – | `{ snapshot: SessionSnapshot }` |
| `DELETE /api/session/[id]` | laptop | secret | – | Ends the session; open streams get `ended`. |
| `GET /api/session/[id]/events?role=desktop\|mobile` | either | secret | – | `text/event-stream` of `data: StreamEvent`: `snapshot` first, then `message`, `connections`, `ping` (15 s, keeps the session alive), `ended`. |
| `POST /api/session/[id]/messages` | either | secret, 600/min | `SyncMessageInput`, ≤ 16 KB (streaming cap) | `{ seq }`. `400` invalid, `413`, `429`. |

```typescript
// QR link (src/sync/pairingLink.ts): credentials in the fragment, never sent to a server
buildPairingUrl(origin, { sessionId, secret, token }) // -> `${origin}/companion#s=…&k=…&t=…`
parsePairingFragment(hash): PairingCredentials | null
// Phone storage (src/sync/pairingStorage.ts): sessionStorage key 'cubyntra.pairing'
takePairingFromLocation(window)                       // save + history.replaceState strip

// Messages (src/sync/types.ts); the server adds { seq, at } -> SyncEvent
type SyncMessageInput = { role: 'desktop' | 'mobile'; clientId: string } & (
  | { type: 'cube-state'; payload: { state: CubeState } }
  | { type: 'face-scanned'; payload: { face; colors: CubeColor[9]; confidences: number[9]; tileRgb: [r, g, b][9]; capturedAt } }
  | { type: 'step'; payload: { method: 'solver' | 'beginner' | 'cfop'; stepIndex; planId; algorithm?; stepCount? } }
  | { type: 'playback'; payload: { action: 'play' | 'pause' | 'seek' | 'index' | 'speed'; index?; speed? } }
  | { type: 'grip'; payload: { top: CubeColor; front: CubeColor } }
  | { type: 'checkpoint-result'; payload: { planId; stepIndex; result: 'matched' | 'mismatch' | 'unsure'; mistakes? } }
  | { type: 'presence'; payload: { visible: boolean; screen?: 'pairing' | 'scan' | 'review' | 'solve' | 'idle' } }
  | { type: 'scan-control'; payload: { action: 'rescan'; face } | { action: 'confirmed' } | { action: 'reset' } }
);
parseSyncMessage(body: unknown): { ok: true; value: SyncMessageInput } | { ok: false; error: string }

// Browser transport (src/sync/syncClient.ts)
openSyncStream({ sessionId, secret, role, onEvent, onStatus?, onEnded? }): { close() } // fetch-based, reconnects
postSyncMessage(sessionId, secret, message): Promise<{ ok: true; seq } | { ok: false; status }>
deleteSyncSession(sessionId, secret): Promise<void>  // keepalive

// Hooks
useCompanionSync()   // laptop: initSession (single-flight, cancelled on unmount), disconnect (DELETE),
                     // selectHost, send, subscribe, requestRescan, confirmScan, connections, code, …
useMobileSession(creds, { onEnded? }) // phone: sendFace, rejectFace, controlPlayback, startOver, …
useTutorSync(sync, twinPlayback) // device on /solve: publishes step, start cube, grip, twin playback and
                     // checkpoint verdicts; applies the other device's playback, grip and verdicts
                     // (src/sync/tutorSync.ts; wire index = moves applied - 1)
```

Playback is last-writer-wins by the server's sequence number: each device applies playback messages
in `seq` order, its own included; `index` reports are not re-applied by their sender, and the
animating device ignores others' reports while it plays.

---

## 7. Coach API (`src/coach/`, `src/app/api/coach/`)

See [ADR-014](ADR/014-claude-coach.md). Protected routes need the header `x-cubyntra-token`
(the per-install app secret from `src/lib/localAuth.ts`).

| Route | Auth | Body | Result |
|:---|:---|:---|:---|
| `POST /api/coach` | token, 30/min | `{ facts: CoachFacts }`, at most 8 KB | `text/event-stream`: `delta` → `{ text }`, `replace` → `{ text, reason }`, `done` → `{ source: 'live' \| 'template', mode, reason?, notice? }`. `400` bad body, `401` bad token, `413` too large, `429` rate limited (`Retry-After`). |
| `GET /api/coach/status` | token | – | `{ mode: 'live' \| 'mock' \| 'capped', monthSpendUsd, capUsd, month }` |
| `GET /api/auth/token` | loopback Host only | – | `{ token }`, or `403` from any other host. |

```typescript
// Facts (src/coach/facts.ts)
buildCoachFacts(plan: StepPlan, hintLevel: 1 | 2 | 3, attempts?: AttemptRecord[], diagnosis?: Diagnosis): CoachFacts
parseCoachFacts(input: unknown): { ok: true; value: CoachFacts } | { ok: false; error: string }
projectDiagnosis(diagnosis: Diagnosis, step): CoachDiagnosisFacts | undefined  // what Claude sees
allowedMoves(facts): Set<string>   // step moves + moves named in the top diagnosis description
describeMoves(notation: string): string[]   // ["R = turn the right side up", ...]

// Diagnosis comes from the tutor (src/tutor/types.ts: Diagnosis, LikelyMistake, MistakeKind).
// Only this projection is sent (src/coach/types.ts):
interface CoachDiagnosisFacts {
  likelyMistakes: { kind: MistakeKind; detail?: MistakeDetail; moveIndex?: number; confidence: number; description?: string }[]  // at most 3
  confident: boolean
  showNext?: string   // a side in words, e.g. "the right side"
}
interface AttemptRecord { result: 'matched' | 'mismatch' | 'unsure'; mistakes?: MistakeKind[] }
// CoachFacts also carries moveWords?: string[] at hint level 3 (recomputed by the server).

// Client hook (src/coach/useCoach.ts)
useCoach({ plan, token, attempts?, diagnosis?, endpoint? }): {
  text, status: 'idle' | 'loading' | 'streaming' | 'done' | 'error', hintLevel, source, mode,
  reason, notice, error, requestHint(level: 1 | 2 | 3): void, cancel(): void
}

// Guardrail and templates
checkReplyMoves(text: string, allowed: Set<string>, names?: string[]): { ok, tokens, offending }
relayableLength(text: string): number   // how much of a streaming reply may be shown now
templateText(facts: CoachFacts): string

// Server only (src/lib/localAuth.ts)
getAppSecret(): string          // creates data/app-secret on first use
getPairingToken(): string       // the app token carried by the pairing QR / typed code
```

---

## 8. Tutor Engine API (`src/tutor/`)

Full description, step-plan fields and case tables: [`docs/tutor/METHODS.md`](tutor/METHODS.md).

```typescript
type MethodId = 'beginner' | 'cfop'
type LastLayerMode = '2-look' | 'full'
/** Learner settings. Every field optional; `{}` is the method as first taught. */
interface MethodOptions { lastLayer?: LastLayerMode }   // CFOP only; default '2-look'

// By method id (src/tutor/api.ts). `options` is always last and optional.
getMethod(method: MethodId, options?: MethodOptions): MethodDefinition
currentStage(state: CubeState, method: MethodId, options?: MethodOptions): StageDefinition | null
progress(state: CubeState, method: MethodId, options?: MethodOptions): TutorProgress
planNextStep(state: CubeState, method: MethodId, grip?: Grip, stepIndex?: number, options?: MethodOptions): StepPlan | null
runGuidedSolve(state: CubeState, method: MethodId, grip?: Grip, options?: MethodOptions): GuidedSolve

// A plan made with non-default settings carries them; default plans have no `options` field.
interface StepPlan { /* ... */ options?: MethodOptions }
interface MethodDefinition { id: MethodId; name: string; options?: MethodOptions; stages: StageDefinition[] }

// Recovery (src/tutor/recovery.ts): resumeFrom / decideRecovery read plan.options themselves.
replanFromScan(scanned: CubeState, method: MethodId, preferredGrip?: Grip, stepIndex?: number, options?: MethodOptions): ScanReplan

// Case ids (src/tutor/caseIds.ts)
CASE_IDS: Record<MethodId, Record<string, readonly string[]>>     // default variants, by stage
CFOP_FULL_CASE_IDS: Record<string, readonly string[]>             // cross, f2l, oll, pll, auf
caseIdsByStage(method: MethodId, options?: MethodOptions): Record<string, readonly string[]>
caseIdsOf(method: MethodId, options?: MethodOptions): string[]
allCaseIds(): string[]                                            // every id of every variant, each once

// Full last-layer tables (src/tutor/cases/oll.ts, pll.ts)
interface LastLayerCase { id: string; name: string; recognition: string; algorithm: string }
interface OllCase extends LastLayerCase { number: number; group: OllGroup; pattern: string }   // 'oll-01' .. 'oll-57'
interface PllCase extends LastLayerCase { group: PllGroup; cycles: string }                    // 'pll-aa' .. 'pll-z'
OLL_CASES: readonly OllCase[]   // 57, in number order
PLL_CASES: readonly PllCase[]   // 21: aa ab e f ga gb gc gd h ja jb na nb ra rb t ua ub v y z
CFOP_FULL_METHOD: MethodDefinition   // src/tutor/methods/cfop.ts; what getMethod('cfop', { lastLayer: 'full' }) returns
```

Worker jobs (`src/solver/protocol.ts`) take the same optional settings:

| Job | Payload | Result |
|:---|:---|:---|
| `tutor.plan` | `{ state, method, grip?, stepIndex?, options? }` | `StepPlan \| null` |
| `tutor.progress` | `{ state, method, options? }` | `TutorProgress` |
| `tutor.guidedSolve` | `{ state, method, grip?, options? }` | `GuidedSolve` |

```typescript
// src/solver/client.ts
planStepInWorker(state, method, grip?, stepIndex?, options?): Promise<StepPlan | null>
tutorProgressInWorker(state, method, options?): Promise<TutorProgress>
guidedSolveInWorker(state, method, grip?, options?): Promise<GuidedSolve>
```

## 9. Student Profile and Tutor Session (`src/lib/`, `src/stores/useTutorStore.ts`)

| Route | Auth | Body | Response |
|---|---|---|---|
| `GET /api/student` | token | – | `StudentProfile` (the default one before anything is saved) |
| `PUT /api/student` | token | whole `StudentProfile` (≤ 32 KB) | the saved profile; `400` invalid, `401` no token, `413` too large |

```typescript
// src/lib/studentProfile.ts (shared; no Node or DOM)
interface StudentProfile {
  version: 1;
  name: string;                                   // ≤ 40 characters
  settings: { methodDefault: MethodId; plainLanguage: boolean; stickerLetters: boolean;
              reducedMotion: boolean; theme: 'light' | 'dark' | 'system' };
  palette: StudentPalette | null;                 // src/vision/palette.ts
  currentSolve: { method: MethodId; state: CubeState; grip: Grip; stepIndex: number;
                  attempts: AttemptRecord[]; startedAt: string; updatedAt: string } | null;
  stats: { solvesCompleted: number; stepsCompleted: number; checkpointsPassed: number; lastSolveAt: string | null };
}
parseStudentProfile(input: unknown): { ok: true; profile: StudentProfile } | { ok: false; error: string }
defaultStudentProfile(): StudentProfile

// src/lib/studentFile.ts (server only)
readStudentProfile(): StudentProfile             // default when missing; damaged file -> student.json.bad
writeStudentProfile(profile: StudentProfile): void  // atomic; throws ProfileTooLargeError

// src/stores/useTutorStore.ts
type SolvePhase = 'idle' | 'loading' | 'step' | 'checking' | 'celebrate' | 'mismatch' | 'solved' | 'error';
startSolve(state, method); resumeSolve(): Promise<boolean>; loadPlan();
beginCheckpoint(); submitObservation(observation); editTiles(face, edits); confirmByHand();
advance(); replayStep(); continueFromDiagnosis(); showNextFace(); replanFromRescan(scanned);
setGrip(grip); applyRemoteCheckpoint({ stepIndex, result, mistakes? }); abandonSolve();
updateSettings(patch); setName(name); savePalette(palette); loadProfile();

// src/app-shell/checkpointAdapter.ts (wires src/tutor/checkpoint, diagnose and recovery)
checkCheckpoint(plan, observations): { result: CheckpointResult; diagnosis: Diagnosis | null; recovery: Recovery | null }
  // mismatch -> diagnoseMistake(plan, observations), decideRecovery(plan, diagnosis)
confirmCheckpointByHand(plan); checkWithEdits(plan, observations, face, edits); toCoachDiagnosis(diagnosis)
replanAfterRescan(scanned, method, grip, stepIndex): ScanReplan   // replanFromScan
faceToShowNext(outcome): Face | null   // needsRescan with showNext
```

