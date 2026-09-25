# Cubyntra Testing Strategy & Quality Assurance Specification

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Status**: Implemented & Passing (35/35 Tests)  
**Directory**: `tests/`

---

## 1. Quality Assurance Philosophy

Because Cubyntra operates at the intersection of discrete group theory, computer vision heuristics, and 3D coordinate geometry, automated testing is mandatory for ensuring system stability.

### Core Testing Invariants:
1. **Mathematical Invariant Rigor**: Scramble operations must never corrupt piece counts or violate solvability parity unless specifically testing rejection paths.
2. **Zero Regressions**: All core modules (`src/cube`, `src/vision`, `src/solver`) must maintain full unit test coverage.
3. **Deterministic Integration Lifecycle**: Integration tests must simulate full end-to-end user workflows from raw frame sampling to final solved identity state.

---

## 2. Test Suite Architecture

Cubyntra utilizes **Vitest** for ultrafast, ESM-native TypeScript test execution.

```
tests/
├── cube.test.ts         # Domain models, face rotations, invariant validation (14 tests)
├── vision.test.ts       # Color space conversions, Delta-E, stability filtering (9 tests)
├── solver.test.ts       # Two-phase algorithm, move parsing, verification (7 tests)
└── integration.test.ts  # End-to-end scanning, error recovery, and playback (5 tests)
```

---

## 3. Test Coverage Matrix

### 3.1 `tests/cube.test.ts`
- **Initial Solved State**: Verifies exactly 6 faces, 9 stickers per face, correct center colors.
- **Single Face Rotations**: Verifies `U`, `D`, `L`, `R`, `F`, `B` preserve adjacent face boundary order.
- **Double Turns & Inverses**: Verifies $M \cdot M' = I$ and $M \cdot M^2 \cdot M = I$.
- **Validation Engine**:
  - Rejects invalid facelet counts (e.g. 10 whites, 8 yellows).
  - Rejects malformed strings (< 54 or > 54 chars, unexpected tokens).
  - Rejects physical impossible pieces (e.g. White-Yellow edge or Blue-Green corner).
  - Rejects parity errors (unsolvable single edge flip or single corner twist).
- **Scramble Generation**: Confirms random scrambles maintain piece invariants.

### 3.2 `tests/vision.test.ts`
- **Color Conversions**:
  - RGB to HSV conversion accuracy across primary color bounds.
  - RGB to CIELAB $L^* a^* b^*$ conversion accuracy under D65 standard illuminant.
- **CIELAB Delta-E Distance**: Validates perceptual distance matching between reference swatches and noisy camera inputs.
- **Grid Sampling**: Verifies 9 sample points centered accurately within camera bounding boxes with circular kernel averaging.
- **Temporal Stability Filter**:
  - Verifies stability count increments on static frames.
  - Verifies stability resets to 0 when camera detects motion blur or sticker change.
  - Locks face capture only after threshold (10 consecutive frames).

### 3.3 `tests/solver.test.ts`
- **Identity State**: Solved cube returns empty move sequence (`[]`) in < 1 ms.
- **Benchmark Positions**:
  - **Superflip**: Solved within 20 HTM moves.
  - **T-Permutation**: Solved accurately.
  - **Random Scrambles**: Solved within 20–24 moves.
- **Move Parsing**: Parses standard notation (`R`, `U'`, `F2`) into structured objects.
- **Move Inversion**: Correctly reverses move sequences:
  $$(R \ U \ R' \ U')^{-1} = U \ R \ U' \ R'$$
- **Simulation Verification**: Proves that applying the generated solution to the initial state arrives at identity.

### 3.4 `tests/integration.test.ts`
- **Full Scan-to-Solve Lifecycle**: Simulates sequential scanning of 6 faces, validates cube state, runs Kociemba solver, and verifies final state.
- **Error Recovery Workflow**: Simulates an optical misclassification (e.g. White misread as Yellow), verifies validator rejection, applies manual user correction, and solves successfully.
- **Interactive Scramble & Solve**: Applies random moves to digital twin, solves, and navigates step-by-step playback to completion.

---

## 4. Test Execution & CI Automation

```bash
# Execute full test suite
npm run test

# Run tests in continuous watch mode
npm run test:watch

# Generate code coverage report
npm run test:coverage
```

### Current Test Execution Results:
```
 ✓ tests/cube.test.ts (14 tests) 18ms
 ✓ tests/vision.test.ts (9 tests) 12ms
 ✓ tests/solver.test.ts (7 tests) 42ms
 ✓ tests/integration.test.ts (5 tests) 28ms

 Test Files  4 passed (4)
      Tests  35 passed (35)
   Duration  240ms (transform 48ms, setup 0ms, collect 38ms, tests 100ms, environment 0ms, prepare 22ms)
```
