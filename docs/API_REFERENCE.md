# Cubyntra TypeScript API & Domain Model Reference

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Status**: Implemented (2.0.0), checked against the exports on 2026-11-17  
**Scope**: Public TypeScript Interfaces, Function Contracts and HTTP Routes

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

### 2.1 Types (`src/vision/types.ts`)

```typescript
interface RGBColor { r: number; g: number; b: number }   // 0-255
interface HSVColor { h: number; s: number; v: number }   // h 0-360, s and v 0-100
interface LABColor { l: number; a: number; b: number }   // l 0-100, a and b about -128..127

interface StickerSample {
  row: number; col: number; index: number;               // 0-2, 0-2, 0-8
  rgb: RGBColor; hsv: HSVColor; lab: LABColor;
  predictedColor: CubeColor;
  confidence: number;                                    // 0-1
  colorScores: Record<CubeColor, number>;
  isCubeColor?: boolean; rejectionReason?: string;
}

interface FrameClassificationResult {
  stickers: StickerSample[];                             // exactly 9
  averageConfidence: number; isStable: boolean; stabilityProgress: number;
  stableFramesCount: number; expectedFace: Face; detection?: CubeDetectionResult;
}

interface ROIBounds { x: number; y: number; size: number }
interface CalibrationProfile { referenceCenters: Partial<Record<Face, RGBColor>>; ambientWhitePoint?: RGBColor; warmthFactor: number }
```

### 2.2 Color and Sampling

| Function | Module | Purpose |
|---|---|---|
| `rgbToHsv(rgb): HSVColor`, `rgbToLab(rgb): LABColor` | `color.ts` | Color space conversions (CIELAB under D65). |
| `colorDistanceDeltaE(lab1, lab2): number` | `color.ts` | CIE76 ΔE. |
| `classifyColor(rgb, calibration?): ClassifiedColorResult` | `color.ts` | `{ color, confidence, scores, hsv, lab, isCubeColor, rejectionReason?, skinProbability? }`; CIELAB distance to `REFERENCE_LAB` (or calibrated centers), HSV rules, dataset gamut gating (`DATASET_REFERENCE_LAB`, `DATASET_MAX_DELTA_E`), `RED_ORANGE_HUE_SPLIT = 8`. |
| `isAuthenticRubikColor(rgb, calibration?)` | `color.ts` | `classifyColor` reduced to `{ isCubeColor, color, confidence, reason? }`. |
| `calculateROIBounds(w, h, fraction = 0.70): ROIBounds` | `sampling.ts` | Centered square (the webcam scanner passes 0.65). |
| `mapElementRectToVideo(target, videoBox, videoW, videoH): ROIBounds` | `sampling.ts` | Maps the on-screen reticle into camera pixels under `object-fit: cover`. |
| `aggregateTrimmedMean(pixels, trimRatio = 0.15): RGBColor` | `sampling.ts` | Per-channel trimmed mean. |
| `sampleGridFromContext(ctx, roi, { sampleRatio = 0.40, outlierTrimRatio = 0.15, calibration? }): StickerSample[]` | `sampling.ts` | Nine classified tile samples. |
| `updateCalibrationFromCenter(profile, face, centerRgb): CalibrationProfile` | `sampling.ts` | Records a face's center as its reference. |
| `new TemporalStabilityBuffer({ requiredStableFrames = 8, minAverageConfidence = 0.70, maxHistoryLength = 15 })` | `stability.ts` | `processFrame(stickers, expectedFace, detection?): FrameClassificationResult`, `reset()`; a non-cube frame zeroes the count. |
| `detectCubeInROI(...)`, `detectCubeInROISync(...)` | `cubeDetector.ts` | ML cube presence and face rejection (`src/vision/ml/`). |
| `buildDynamicPalette(...)`, `classifyWithDynamicPalette(...)` | `dynamicCalibration.ts` | Palette from the six observed centers. |
| `solveHungarian(cost)`, `resolve54StickerInvariant(...)` | `invariantSolver.ts` | Nine-per-color assignment. |
| `initializeCameraStream(video, options?)`, `terminateCameraStream(stream)`, `toggleCameraTorch`, `lockWhiteBalance`, `formatCameraError` | `camera.ts` | Camera lifecycle; `STREAM_TIMEOUT_MS = 30_000`, `METADATA_TIMEOUT_MS = 10_000`. |
| `createMockScannedFaces(state)`, `getSolvedMockScan()`, `getScrambledMockScan(scramble?)` | `mock.ts` | Synthetic scans for the demo and tests. |

### 2.3 Student Palette and Checkpoint Faces (`palette.ts`, `checkpointCapture.ts`)

| Function | Purpose |
|---|---|
| `buildStudentPalette(samplesByFace, { state, rotatedFaces? }): StudentPalette` | Mean and spread per color from the full scan (no images). `PALETTE_VERSION = 1`. |
| `serializePalette(palette)`, `parsePalette(input): StudentPalette \| null` | Storage form in the profile. |
| `paletteDistance(lab, entry)`, `classifyWithPalette(rgb, palette): PaletteReading` | One tile against the palette. |
| `classifyFaceWithPalette(rgbs, palette, skip?)`, `classifyFace(rgbs, palette?, skip?)`: `PaletteReading[]` | A whole face with per-photo lighting correction; `classifyFace` falls back to the static classifier without a palette. |
| `readFaceFromContext(ctx, width, height, palette?): FaceReading` | Reads a checkpoint face from a canvas; tiles with glare above `GLARE_REJECT_FRACTION = 0.2` count as not seen. |

---

## 3. Solver API (`src/solver/`)

### 3.1 Types (`src/solver/types.ts`)

```typescript
interface SolveResult {
  success: boolean;
  moves: CubeMove[];
  notation: string;        // formatAlgorithm(moves)
  moveCount: number;
  durationMs: number;
  error?: string;
}
```

### 3.2 Functions

- `solveCube(state: CubeState): Promise<SolveResult>` (`solver.ts`): validates, normalizes the
  orientation, runs the two-phase search, translates the solution back into the held frame and
  verifies it with `applyMoves` + `isCubeSolved` before returning success.
- `ensureSolverInitialized(): void`: builds the Kociemba tables once.
- `generateRandomScramble(): string`: a random scramble from `rubik-solver`.
- Worker client (`client.ts`): `solveInWorker(state)`, `warmUpSolver()`, `planStepInWorker`,
  `tutorProgressInWorker`, `guidedSolveInWorker` (§8), `getSolverClient()`, `class SolverClient`
  (`request(type, payload)`, `usesWorker()`, `terminate()`). Protocol: `WorkerJobs` in
  `protocol.ts`, handlers and `dispatch(request)` in `handlers.ts`.
- Moves are parsed, inverted and applied with the cube API (§1.2): `parseAlgorithm`,
  `invertAlgorithm`, `applyMoves`.

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
  solution: SolveResult | null;                           // Kociemba solution of the confirmed scan
  currentMoveIndex: number;                               // -1 = before the first move
  isPlaying: boolean;
  playbackSpeed: number;                                  // 0.5, 1, 2, 4
  currentClassification: FrameClassificationResult | null; // the webcam scanner's latest frame
  isCameraActive: boolean;
  cameraError: string | null;

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
  loadMockScramble(scramble?: string): Promise<void>;     // demo cube through the same validate + solve
  loadMockSolved(): Promise<void>;
  setAppState(state); setClassification(result); setCameraActive(active); setCameraError(error);
  setPlaying(isPlaying);
}
```

`ingestFaceSamples` is keyed by face, so faces may arrive in any order. When all six are present it calls `resolveCubeColors`, lays any hand fixes back over the result and enters `reviewing`. A face that arrives during `reviewing` while hand fixes exist is held in `pendingFaces` until the student chooses. `startScanning`, `startCompanionScan`, `loadMockScramble` and `resetAll` clear the previous cube, validation, samples, resolution and fixes; `resetAll` also clears `cameraError`.

---

## 5. Phone Capture and Scan Resolution API (`src/vision/`, `src/sync/faceSamples.ts`)

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
(404 unknown session, 403 missing or wrong secret). In the hosted modes (§12) every sync route
also authenticates the requester (401 when not signed in), a session belongs to the user who
created it (another user gets 404, even with the secret), a typed code can only be claimed by its
owner, the `token` returned is that user's own, and `companionUrl` uses `PUBLIC_ORIGIN` (with
`availableIps: []`).

| Method & path | Caller | Auth | Body / query | Result |
|:---|:---|:---|:---|:---|
| `POST /api/session` | laptop | `x-cubyntra-token` (app token), 20/min | ignored (no `preferredId`) | `{ sessionId, secret, code, codeExpiresAt, companionUrl, availableIps, primaryIp }`. `401` bad token, `429`, `503` all 8 slots in use. |
| `POST /api/session/pair` | phone | none (hosted: signed in), 10/min overall (hosted: per user) | `{ code }`, ≤ 1 KB | `{ sessionId, secret, token }`. Code is single-use, 10 min. `400`, `404` wrong/used/expired, `413`, `429`. |
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
  | { type: 'step'; payload: { method: 'solver' | 'beginner' | 'cfop'; stepIndex; planId; algorithm?; stepCount?; solveStartedAt? } }
  | { type: 'playback'; payload: { action: 'play' | 'pause' | 'seek' | 'index' | 'speed'; index?; speed? } }
  | { type: 'grip'; payload: { top: CubeColor; front: CubeColor; planId?; stepIndex? } } // the step it belongs to
  | { type: 'checkpoint-result'; payload: { planId; stepIndex; result: 'matched' | 'mismatch' | 'unsure'; mistakes? } }
  | { type: 'presence'; payload: { visible: boolean; screen?: 'pairing' | 'scan' | 'review' | 'solve' | 'idle' } }
  | { type: 'scan-control'; payload: { action: 'rescan'; face } | { action: 'confirmed' } | { action: 'reset' } }
);
parseSyncMessage(body: unknown): { ok: true; value: SyncMessageInput } | { ok: false; error: string }

// Browser transport (src/sync/syncClient.ts)
openSyncStream({ sessionId, secret, role, onEvent, onStatus?, onEnded?, inactivityTimeoutMs? }): { close() }
  // fetch-based, reconnects; no frame for inactivityTimeoutMs (default 2 x PING_INTERVAL_MS = 30 s) -> reconnect
postSyncMessage(sessionId, secret, message): Promise<{ ok: true; seq } | { ok: false; status }>
deleteSyncSession(sessionId, secret): Promise<void>  // keepalive

// Hooks
useCompanionSync()   // laptop: initSession (single-flight, cancelled on unmount), disconnect (DELETE),
                     // selectHost, send, subscribe, requestRescan, confirmScan, connections, code, …
useMobileSession(creds, { onEnded? }) // phone: sendFace, rejectFace, controlPlayback, startOver, …
useTutorSync(sync, twinPlayback) // device on /solve: publishes step, start cube, grip (in that order), twin
                     // playback and checkpoint verdicts; applies the other device's playback, and a
                     // grip or verdict only for the step on screen (same planId and stepIndex);
                     // adopts the other device's plan for this or a later step (adoptRemoteStep)
                     // (src/sync/tutorSync.ts; wire index = moves applied - 1)
correctivePlanFrom(plan, from, moves): StepPlan | null   // src/tutor/recovery.ts: rebuilds a corrective step sent by the other device
```

Playback is last-writer-wins by the server's sequence number: each device applies playback messages
in `seq` order, its own included; `index` reports are not re-applied by their sender, and the
animating device ignores others' reports while it plays.

---

## 7. Coach API (`src/coach/`, `src/app/api/coach/`)

See [ADR-014](ADR/014-claude-coach.md). Protected routes need the header `x-cubyntra-token`
(the per-install app secret from `src/lib/localAuth.ts`; in the hosted modes, the signed-in
user's own token, §12). Rate limits count per token (local) or per user (hosted).

| Route | Auth | Body | Result |
|:---|:---|:---|:---|
| `POST /api/coach` | token, 30/min | `{ facts: CoachFacts }`, at most 8 KB | `text/event-stream`: `delta` → `{ text }`, `replace` → `{ text, reason }`, `done` → `{ source: 'live' \| 'template', mode, reason?, notice? }`. `400` bad body, `401` bad token, `413` too large, `429` rate limited (`Retry-After`). |
| `GET /api/coach/status` | token | – | `{ mode: 'live' \| 'mock' \| 'capped', monthSpendUsd, capUsd, month }` |
| `GET /api/auth/token` | local: loopback Host only; hosted: signed in | – | Local: `{ token }`, or `403` from any other host. Hosted: `{ token, user: { name }, mode }`, or `401`. |

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

// Full last-layer tables (src/tutor/cases/oll.ts, pll.ts; LastLayerCase is declared in cases/oll2look.ts)
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
| `GET /api/student` | token | – | `StudentProfile` (the default one before anything is saved). Hosted modes: the signed-in person's own `data/students/<slug>.json`. |
| `PATCH /api/student` | token | `{ ops: ProfileOp[]; batchId?: string }` (≤ 200 ops, ≤ 128 KB, read in chunks) | the merged, saved profile; `400` bad op or invalid result, `401` no token, `413` too large, `500` write failed |

There is no whole-profile `PUT`: a device sends only what changed, and the server merges it into
the profile it holds, so a paired phone or a second tab never wipes what the laptop saved.
Updates are serialized per profile file (a promise-chain lock around read, apply, validate,
write), the merged profile is validated as a whole (`parseStudentProfile`) before the atomic
write, and a `batchId` seen lately (the last 500) is not applied twice, so a retry is safe.

```typescript
// src/lib/profileOps.ts (shared; no Node or DOM)
type ProfileOp =
  | { op: 'setName'; name: string }
  | { op: 'setSettings'; settings: Partial<StudentSettings> }      // fields set, the rest kept
  | { op: 'setPalette'; palette: StudentPalette | null }
  | { op: 'setCurrentSolve'; solve: CurrentSolve }                  // only if newer (below)
  | { op: 'clearCurrentSolve'; startedAt: string }                  // clears that solve or an older one, and closes it
  | { op: 'incrementStats'; solvesCompleted?: number; stepsCompleted?: number; checkpointsPassed?: number }
  | { op: 'setLastSolveAt'; at: string }                            // only moves forward
  | { op: 'recordStage'; key: string; hint: HintUse }               // appended (newest 10 kept)
  | { op: 'addActiveDay'; day: string }                             // union
  | { op: 'answerTrainerCase'; caseId: string; correct: boolean }   // Leitner update replayed on the server's trainer state
  | { op: 'setTrainerSet'; set: TrainerSetId | null }
  | { op: 'addTimerSolve'; solve: TimerSolve & { id: string } }     // ignored if the id is there
  | { op: 'setTimerPenalty'; id: string; penalty: Penalty }
  | { op: 'deleteTimerSolve'; id: string }
  | { op: 'addSavedCube'; cube: SavedCube }                         // v4; ignored if the id is there; newest
                                                                    //   scannedAt first, the oldest dropped past 30
  | { op: 'renameSavedCube'; id: string; name: string }             // v4; trimmed; 1-40 characters
  | { op: 'setSavedCubeMethod'; id: string; method: SolutionMethod } // v4; the walkthrough's last choice
  | { op: 'deleteSavedCube'; id: string };                          // v4; a cube already gone is left alone
applyProfileOps(profile, ops): StudentProfile     // the same merge on the server and in the store
withSavedCube(cubes, cube): SavedCube[]          // add by id, newest first, capped at MAX_SAVED_CUBES
isNewerSolve(incoming, existing, closedStartedAt?): boolean
  // a later startedAt (a new solve); else the same solve at a later stepIndex; else the same step
  // with an updatedAt at least as late. Nothing started at or before closedStartedAt comes back.
parseProfileOps(body): { ok: true; ops; batchId } | { ok: false; error }
```

```typescript
// src/lib/studentProfile.ts (shared; no Node or DOM)
type HintUse = 0 | 1 | 2 | 3;                     // highest coach hint asked for (src/learn/types.ts)
interface StudentProfile {
  version: 4;
  name: string;                                   // ≤ 40 characters
  settings: { methodDefault: MethodId; plainLanguage: boolean; stickerLetters: boolean;
              reducedMotion: boolean; theme: 'light' | 'dark' | 'system';
              lastLayer: '2-look' | 'full';       // CFOP only; v2
              voiceMode: 'off' | 'device' | 'elevenlabs';  // v3, default 'off' (ADR-016)
              voiceRate: 0.75 | 1 | 1.25;         // v3, default 1
              voiceMoves: 'words' | 'notation' };  // v3, default 'words'
  palette: StudentPalette | null;                 // src/vision/palette.ts
  currentSolve: { method: MethodId; state: CubeState; grip: Grip; stepIndex: number;
                  attempts: AttemptRecord[];      // ≤ 20
                  stageHint?: HintUse;            // v2: highest hint so far on the stage in progress
                  startedAt: string; updatedAt: string } | null;
  stats: { solvesCompleted: number; stepsCompleted: number; checkpointsPassed: number; lastSolveAt: string | null;
           stages: Record<`${MethodId}/${string}`, HintUse[]>;  // v2: per stage completion, ≤ 10 kept
           activeDays: string[] };                // v2: local YYYY-MM-DD, sorted, unique, ≤ 400
  trainer: { turn: number;                        // v2: drills answered so far
             cards: Record<caseId, { box: 1 | 2 | 3 | 4 | 5; due: number; seen: number; missed: number }>; // ≤ 300
             set: 'beginner' | 'f2l' | 'last-layer-2look' | 'oll' | 'pll' | null };
  timer: { history: { id: string; ms: number; penalty: 'none' | '+2' | 'DNF'; at: string; scramble: string }[] }; // v2: ≤ 100, oldest first;
                                                  // id: [A-Za-z0-9_-]{1,64}, given to older solves when read
  savedCubes: SavedCube[];                        // v4: newest scannedAt first, ≤ MAX_SAVED_CUBES (30), ids unique
  closedSolveStartedAt?: string;                  // startedAt of the newest finished or abandoned solve
}
type SavedCubeSource = 'webcam' | 'phone' | 'demo';
type SolutionMethod = MethodId | 'fewest';      // 'fewest' = the Kociemba computer solution
interface SavedCube {
  id: string;                                     // [A-Za-z0-9_-]{1,64}
  name: string;                                   // 1-40 characters (MAX_CUBE_NAME_LENGTH), trimmed
  state: CubeState;                               // must pass validateCubeState (a cube that can be solved)
  scannedAt: string;                              // ISO date
  source: SavedCubeSource;
  lastMethod?: SolutionMethod;                    // the full-solution walkthrough's last choice
}
// 30 saved cubes are about 20 KB of JSON, well inside MAX_STUDENT_BYTES (128 KB).
parseStudentProfile(input: unknown): { ok: true; profile: StudentProfile } | { ok: false; error: string }
  // version 1, 2 and 3 profiles are migrated first (migrateProfileV1, V2, then V3); version 5+ is rejected
migrateProfileV1(input: unknown): unknown       // v1 -> v2: lastLayer '2-look', no stage records or days, empty trainer and timer
migrateProfileV2(input: unknown): unknown       // v2 -> v3: voice off, normal speed, moves in words
migrateProfileV3(input: unknown): unknown       // v3 -> v4: no saved cubes

// src/lib/savedCubes.ts (shared; no Node or DOM)
defaultCubeName(source, date): string            // "Scan · 19 Nov, 14:32" (local time); "Demo · ..." for a demo
shortDateTime(date): string                      // "19 Nov, 14:32"
SOURCE_LABEL: Record<SavedCubeSource, string>    // Webcam scan, Phone scan, Demo cube
defaultStudentProfile(): StudentProfile

// src/lib/studentFile.ts (server only)
readStudentProfile(): StudentProfile             // default when missing; damaged file -> student.json.bad
writeStudentProfile(profile: StudentProfile): Promise<void>  // atomic; rejects with ProfileTooLargeError
updateStudentProfile(change: (p) => StudentProfile): Promise<StudentProfile>  // read-change-write under the per-process lock

// src/stores/useTutorStore.ts
type SolvePhase = 'idle' | 'loading' | 'step' | 'checking' | 'celebrate' | 'mismatch' | 'solved' | 'error';
startSolve(state, method, { demo? }); resumeSolve(): Promise<boolean>; loadPlan();
// demo: true keeps the scramble in `unsavedDemo` until saveDemoCube(); any other start clears it
beginCheckpoint(); submitObservation(observation); editTiles(face, edits); confirmByHand();
advance(); replayStep(); continueFromDiagnosis(); showNextFace(); replanFromRescan(scanned);
setGrip(grip); applyRemoteCheckpoint({ stepIndex, result, mistakes? }); abandonSolve();
followRemoteStep({ state, method, stepIndex, solveStartedAt? })   // join the paired device's step when no solve is open here
adoptRemoteStep({ state, method, stepIndex, planId, algorithm?, solveStartedAt? }): Promise<boolean>
  // take the paired device's plan for this or a later step, if it can be rebuilt with the same id
updateSettings(patch); setName(name); savePalette(palette); loadProfile();
// Every profile change is a ProfileOp applied to the local copy at once and queued; the queue is
//   sent as one PATCH per batch, in order, once there is a token and the profile has loaded (or
//   failed to load). loadProfile() applies the queued ops on top of the loaded profile, so
//   changes made while it loads, or on an unpaired phone before it got a token, are merged.
//   A batch the server refuses (400/413) is dropped; one that cannot be sent is kept for later.
flushTutorSaves(); pendingProfileOps(); resetPendingProfileOps()   // tests
noteHint(level)                                  // stageHint = max(stageHint, level); saved with the solve
// advance(): when the step finished its stage (progressAfter's thousands > stageIndex), records
//   stats.stages['<method>/<stage>'] with stageHint and resets it; a finished solve adds today to activeDays
answerTrainerCase(caseId, correct); setTrainerSet(set)         // Leitner update + today in activeDays
addTimerSolve(solve); setLastTimerPenalty(penalty); deleteLastTimerSolve()
saveCube(state, source, at?): string | null      // addSavedCube with a new id and the default name; null for a solved cube
saveDemoCube(): string | null                    // saves unsavedDemo (source 'demo') and clears it
renameSavedCube(id, name); setSavedCubeMethod(id, method); deleteSavedCube(id)
// The scan screen calls saveCube for every confirmed scan with a scan source (webcam, or 'phone'
//   for the companion), before the solve starts; the demo scramble is started with { demo: true }.
methodOptionsFor(method, settings): MethodOptions | undefined  // { lastLayer: 'full' } for CFOP only;
//   passed to planStepInWorker and replanAfterRescan, so worker jobs carry it as `options`

// src/app-shell/walkthrough.ts (pure; the full-solution walkthrough, /cubes/[id])
buildWalkthrough(method: SolutionMethod, plans: StepPlan[]): Walkthrough
  // { method, steps: { plan, index, turns }[], stages: { stage, stageName, number, steps, turns }[], totalTurns }
  // turns = layer turns; x / y / z regrips are not counted
computerSolutionSteps(state, moves, max = 8): StepPlan[]
  // the Kociemba solution as near-equal parts of ≤ 8 moves (partSizes: 20 -> 7, 7, 6), one stage
  // 'computer' ("Computer solution"), face moves only, each part starting where the last ended;
  // no highlighted pieces and an empty checkpoint (the method id is only there for the type)
solutionText(walkthrough, cubeName): string      // "Copy all moves": numbered stages, one line per step
// src/components/cubes/CubeSolutionView.tsx
computeWalkthrough(state, method, lastLayer): Promise<Walkthrough>
  // beginner / cfop: guidedSolveInWorker (with methodOptionsFor); fewest: solveInWorker

// src/app-shell/checkpointAdapter.ts (wires src/tutor/checkpoint, diagnose and recovery)
checkCheckpoint(plan, observations, previous?): CheckpointOutcome   // { result, diagnosis, recovery }; previous = the last outcome (a trusted hold)
  // mismatch -> diagnoseMistake(plan, observations), decideRecovery(plan, diagnosis)
confirmCheckpointByHand(plan); checkWithEdits(plan, observations, face, edits, previous?); toCoachDiagnosis(diagnosis)
replanAfterRescan(scanned, method, grip, stepIndex, options?): ScanReplan   // replanFromScan
faceToShowNext(outcome): Face | null   // needsRescan with showNext
// decideRecovery never throws TutorPlanError: a failed re-plan is { action: 'needsRescan', reason: 'no-plan' }.
// The store runs each check guarded: any other error -> phase 'error' with errorMessage ("Try again" re-plans).
```


## 10. Learning Features (`src/learn/`, pure; no DOM or React)

```typescript
// trainerSets.ts: TRAINER_SETS (beginner 7, f2l 41, last-layer-2look 16, oll 57, pll 21)
trainerSet(id); trainerCaseIds(id, group?); trainerCase(id, caseId)
// drill.ts: a case as a StepPlan (set up from solved by the inverse algorithm + a random top turn)
buildDrill(case, auf = 0): { case; auf; plan: StepPlan }; randomAuf(case, random?); drillGrip(case)
// leitner.ts: boxes 1-5 counted in drills; BOX_GAP = [0, 2, 4, 8, 16, 32]; learned from box 3
reviewCard(card, correct, turn); answerDrill(state, caseId, correct); nextCase(state, caseIds, lastCaseId?)
isLearned(card); setProgress(state, caseIds): { learned; seen; total }
// timer.ts: WCA inspection and averages
inspectionPenalty(elapsedMs): 'none' | '+2' | 'DNF'      // +2 from 15 s, DNF from 17 s
inspectionCue(elapsedMs); trimmedAverage(solves); currentAverage(history, n); bestAverage(history, n)
bestSingle(history); formatTime(ms); formatSolve(solve); timerReducer(machine, event)  // press / release / tick / cancel
// scramble.ts
generateScramble(random?, length = 20): Move[]; scrambledState(moves)
// mastery.ts: 3 of the newest 5 completions without a level-3 hint = mastered
isStageMastered(records); stageStatus(records); recordStage(stages, key, hint); completedStage(plan)
isBeginnerMastered(stages); isTwoLookMastered(stages); graduationSuggestion({ stages, methodDefault, lastLayer })
localDay(date); addActiveDay(days, day); currentStreak(days, today); longestStreak(days); recentDays(today, n)
```

`src/app-shell/progressSummary.ts`: `summarizeProgress(profile, today)` (blocks placed, streak, cases
learned) and `cfopWorldStages(profile)`, shared by Home and Progress.

Sync on the phone (`src/sync/`): `useMobileTutorTarget(creds)` is a `TutorSyncTarget` that posts as
`mobile` and replays the snapshot's step (`snapshotStepEvents`); `useSolveSyncTarget()` picks the
laptop's pairing or the phone's; `remoteStepFor(event, ownClientId, lastCube)` is the step to join.

---

## 11. Voice API (`src/voice/`, `src/app/api/voice/`)

See [ADR-016](ADR/016-voice-tutoring.md). Routes need the header `x-cubyntra-token`.

| Route | Auth | Body | Result |
|:---|:---|:---|:---|
| `POST /api/voice` | token, 60/min | `{ text: string; kind?: 'phrase' \| 'reply' }` only (≤ 4 KB, read in chunks; text 1-1,200 characters, no data URL or encoded blob; a `phrase` must be a phrase-bank line) | `audio/mpeg` with `X-Voice-Cache: hit \| miss` (a cached phrase costs nothing). `400` bad body or extra field, `401` bad token, `413` too large, `429` rate limited (`Retry-After`); `503 { error, fallback: 'device', reason: 'no-key' \| 'capped' }`; `502 { error, fallback: 'device', reason: 'upstream' }`. |
| `GET /api/voice/status[?preference=off\|device\|elevenlabs]` | token | – | `VoiceStatus` (below); `preference` defaults to the profile's `voiceMode` |

```typescript
// src/voice/types.ts
interface VoiceStatus {
  mode: 'elevenlabs' | 'device' | 'off';   // what the laptop can give the student's choice now
  keySet: boolean;                         // ELEVENLABS_API_KEY is set
  monthCredits: number;                    // counted this UTC month (data/voice-usage.json)
  capCredits: number;                      // ELEVENLABS_MONTHLY_CREDIT_CAP, default 20,000
  remaining?: number;                      // with a key: lower of the cap and the account balance, minus use
  accountRemaining?: number;               // character_limit - character_count from ElevenLabs (cached 10 min)
  warning: boolean;                        // ≥ 80% of the limit used
  reason?: 'no-key' | 'capped' | 'chosen' | 'upstream' | 'off';
  month: string;                           // YYYY-MM
}

// Text (pure)
spokenMove(move, style: 'words' | 'notation'): string        // "Turn the right side up" / "R prime"
speakableText(text, style): string                            // markdown stripped, moves spoken
coachSpeech({ text, status }, { allowed, names? }, style): string | null  // only final, guard-approved text

// Phrase bank (pure): every move in both styles, stage intros, checkpoint lines
PHRASES: Phrase[]; LINES; isPhraseText(text); phraseBankCharacters(); movePhrase(move, style)
showFacePhrase(face); stagePhrase(name); checkpointLines({ status, manual?, askFace?, rotationUnclear?, oneMoreFace?, praiseIndex? })
narratedMove(prev, next, style): string | null; stageIntro(prevStage, stage, stageName)

// Speaking (browser)
new SpeechQueue(speaker): say(...items); replace(...items); setStep(key); interrupt(); setSpeaker(s)
createDeviceSpeaker({ rate?, env? }); pickVoice(voices); isDeviceVoiceAvailable()
createElevenLabsSpeaker({ token, rate?, endpoint? }); voiceRequestBody(item): { text, kind }
createVoiceSpeaker({ mode, device, elevenlabs, onFallback? })   // ElevenLabs -> device -> off
useVoice({ mode, rate, token, enabled? }): { active, say, replace, setStep, interrupt }
useVoiceStatus(token, preference); useOneSpeaker(target): boolean; new SpeakerArbiter(ownClientId)
installAudioUnlock(); unlockAudio(); isAudioUnlocked()   // nothing is said before a user gesture

// Server only
new VoiceUsageTracker(file?, now?): reserve(credits, accountRemaining?); settle(credits, billedChars | null);
  remaining(accountRemaining?); isCapped(...); isWarning(...); monthCredits(); capCredits()
creditsFor(characters, model?); CREDITS_PER_CHARACTER   // eleven_flash_v2_5: 0.5
textToSpeech(text, { apiKey, voiceId, model, signal?, fetchImpl? }): Promise<Uint8Array>
fetchSubscription(apiKey, fetchImpl?): Promise<{ characterCount, characterLimit, remaining }>
clipHash(model, voiceId, text); readClip(hash); writeClip(hash, audio)   // data/voice/<hash>.mp3
parseVoiceRequest(body); speak({ text, kind }, deps?, signal?); voiceStatus(preference, deps?)
```

---

## 12. Auth Modes and Hosting (`src/lib/`, `src/proxy.ts`, `src/app/api/auth/`, `src/app/api/health/`)

See [ADR-017](ADR/017-hosting-cloudflare.md) and [`deploy/README.md`](../deploy/README.md).
`CUBYNTRA_AUTH_MODE` is `local` (default), `cloudflare-access` or `passcode`; anything else is
`invalid` and every guarded route answers 401.

| Route | Auth | Body | Result |
|:---|:---|:---|:---|
| `GET /api/health` | none | – | `{ ok: true, mode, version }`. Nothing about keys, caps or users. |
| `POST /api/auth/signin` | passcode mode only (else `404`), 10/min overall | `{ name, code }`, ≤ 1 KB | `{ ok: true, user: { name } }` + `Set-Cookie: cubyntra_session=…; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`. `400` bad name, `401` wrong code, `413`, `429`. |
| `POST /api/auth/signout` | none | – | `{ ok: true }` + a cookie that clears `cubyntra_session`. |

```typescript
// src/lib/authMode.ts
authMode(env?): 'local' | 'cloudflare-access' | 'passcode' | 'invalid'
isHostedMode(env?); allowedEmails(env?): Set<string>          // CUBYNTRA_ALLOWED_EMAILS

// src/lib/cfAccess.ts (header 'cf-access-jwt-assertion')
accessConfig(env?): { teamDomain, audience } | null           // CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD
verifyAccessJwt(token, config?, env?): Promise<{ email } | null>
  // RS256 only; JWKS https://<team>/cdn-cgi/access/certs (cached 10 min); iss, aud, exp, nbf

// src/lib/passcodeSession.ts
userFromName(name): { id, name } | null; checkAccessCode(code, env?): boolean   // >= 8 chars, constant time
createSessionValue(user, now?); verifySessionValue(value, now?); sessionUserFromRequest(req)
sessionCookieHeader(value); clearSessionCookieHeader(); signInLimiter

// src/lib/requestUser.ts
getRequestUser(req, env?): Promise<{ id, name } | null>   // local -> LOCAL_USER; Access -> email; passcode -> cookie
guardUser(req, limiter?, env?): Promise<{ ok: true; user; mode } | { ok: false; response }>
userToken(user, env?): string     // local: the app secret; hosted: base64url HMAC-SHA256(app secret, user id)
userSlug(id): string              // [a-z0-9-] + 8-hex hash, matches USER_SLUG_PATTERN
profileSlugFor(user, env?): string | undefined   // undefined (data/student.json) in local mode

// src/lib/studentFile.ts: every function takes an optional slug
studentFilePath(slug?); readStudentProfile(slug?); updateStudentProfile(change, slug?); writeStudentProfile(profile, slug?)

// src/sync/server.ts
sessionOwner(req): Promise<RequestUser | null>; guardSession(req, id): Promise<Response | null>
publicOrigin(env?): string | null   // PUBLIC_ORIGIN as a bare http(s) origin (re-exported from src/lib/hostedHeaders.ts)

// src/lib/hostedHeaders.ts + src/proxy.ts (hosted modes only)
SECURITY_HEADERS   // HSTS, nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy (camera/microphone on self)
pageNeedsSignIn(pathname)   // passcode mode: pages without a valid cookie -> 307 to <PUBLIC_ORIGIN or request origin>/signin?next=…
```

The coach (`data/coach-usage.json`) and voice (`data/voice-usage.json`) caps are global in every
mode: everyone on a hosted server shares them.

