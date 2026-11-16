# Cubyntra Tutor — Checkpoint Checks

How the tutor confirms a step was done correctly, what it does when it was not, and how well
that works in tests. Decision record: [ADR-013](../ADR/013-checkpoint-verification.md). Spec:
`docs/tutor/GOAL.md`, Phase 5.

## 1. The flow

```
plan (StepPlan)  ──►  student turns the cube  ──►  shows the checkpoint face(s)
                                                        │
                    readFaceFromContext (src/vision/checkpointCapture.ts)
                                                        │  9 colors + confidences per face
                                                        ▼
                               verifyCheckpoint (src/tutor/checkpoint.ts)
            ┌──────────────┬───────────────┬──────────────────┐
          match        uncertain        wrong-face          mismatch
        next step    "show me again"  "show the X face"        │
                                                               ▼
                                           diagnoseMistake (src/tutor/diagnose.ts)
                                                               │
                                           decideRecovery (src/tutor/recovery.ts)
                                   ┌───────────────────────────┴──────────────────────┐
                           confident diagnosis                         nothing fits / look-alikes
                    resume: corrective step or fresh plan        (optionally show one more face, then)
                                                                  full rescan → replanFromScan
```

Manual path, always available: `confirmManually(plan)` ("it matches") and
`applyTileEdits(observation, edits)` (fix tiles by hand, then verify as usual).

## 2. How the student shows a face

A checkpoint asks for the one or two faces in `plan.checkpoint.facesToShow`. The student holds
the cube the way the plan's `gripAfter` says (top and front named by center color) and shows each
face. An observation is therefore in the same frame as `plan.expectedState`:

```ts
interface FaceObservation {
  face: Face;                       // the face that was asked for, in the gripAfter frame
  stickers: StickerObservation[];   // 9 tiles, row-major like expectedState[face]; index 4 = center
}
interface StickerObservation { color: CubeColor; confidence: number; edited?: boolean }
```

The tile layout must match the face layout of the cube model (`src/cube/geometry.ts`). The check
does not try the four in-plane turns of a photo: on the top face a quarter turn is exactly what
separates a correct last-layer step from a wrong one.

## 3. Reading a face: the student's palette

`buildStudentPalette(samplesByFace, resolved)` (`src/vision/palette.ts`) runs once after the full
scan. For each cube color it stores the mean measured color (CIELAB and sRGB), the standard
deviation along each CIELAB axis (floored at L 6, a 4, b 4) and the sticker count. It is plain
data: `serializePalette` / `parsePalette` store and validate it.

`readFaceFromContext(ctx, width, height, palette)` samples the nine tiles with the full scan's
sampler, measures glare, and classifies:

1. **Lighting correction.** Seven corrections are tried: none, and one per cube color that maps
   the observed center onto that color (per-channel gains, re-fitted by least squares to every
   tile the correction explains). The correction under which the other eight tiles sit closest
   to palette colors wins. Changing brightness is cheap; changing the color of the light is
   expensive, so a dim, warm all-yellow face is not "corrected" into an all-orange one.
2. **Classification.** Each corrected tile goes to the nearest palette color, distance measured
   in spreads. Confidence = fit × margin: fit is 1 up to 4 spreads and fades to 0 at 10; margin
   is `1 − d(best) / d(second)`.
3. **Glare.** A tile with more than 20% clipped pixels gets confidence 0 and takes no part in
   the lighting correction. This includes a white tile in an overexposed photo: clipped pixels
   hold no color, so it is "not seen", never guessed.

With no stored palette, `classifyFace` falls back to the static classifier (`classifyColor`);
readings it rejects as non-cube get confidence 0.

## 4. Verifying

`verifyCheckpoint(plan, observations, { minConfidence = 0.5 })` returns:

| Status | When | What the app does |
|---|---|---|
| `wrong-face` | A shown face's center is read clearly and is not the asked face's center | Says which face was shown and which to show (`wrongFace`) |
| `mismatch` | At least one check-spec sticker is read clearly and is the wrong color | Diagnose |
| `uncertain` | No clear mismatch, but a check-spec sticker or its face's center is below `minConfidence`, or a face has not been shown | "Show me again" / "Show me the … face" |
| `match` | Every check-spec sticker is read clearly and is right | Next step |

Only `plan.checkpoint.stickers` decide the status. Clearly read differences elsewhere on the
shown faces are listed in `elsewhere` and used by the diagnosis, not by the verdict.

## 5. Diagnosing a mismatch

`diagnoseMistake(plan, observations, { topK = 3 })` replays slips on the logical cube from
`plan.startState` and keeps the ones that fit.

| Slip considered | `kind` | `detail` |
|---|---|---|
| A move turned the other way | `wrong-direction` | |
| A move skipped; a double turn done once | `skipped-move` | |
| A move done twice | `doubled-move` | |
| Opposite side turned (mirrored or not); one layer vs two; whole cube vs one side; a neighbor of a middle layer | `wrong-face` | |
| Any of the first three on a regrip; the cube held in one of the 23 other grips from the start | `wrong-grip` | |
| Stopped after any prefix; a repeated sequence done fewer times | `other` | `stopped-early` |
| A repeated sequence done one or two times too many | `other` | `extra-repeat` |
| Two of {other way, skipped, doubled} at different moves, searched only when no single slip fits and the step has at most 30 moves | `other` | `two-mistakes` |

Each candidate cube is turned so its centers match `gripAfter` and scored against **every**
observed sticker: a sticker read with confidence `c` is taken to be right with probability
`1/6 + (0.98 − 1/6)·c`, so an unreadable sticker says nothing and a clear one weighs about
5.5 nats. A small prior per kind (`MISTAKE_PRIORS`) orders slips the camera cannot tell apart.
Candidates that lead to the same cube are merged (likeliest label kept); the cube the plan
expects is never offered.

Result: `Diagnosis { likelyMistakes: LikelyMistake[]; confident: boolean; showNext?: Face }`.
- `likelyMistakes` holds only slips that explain every clearly read sticker, best first. Each
  has `kind`, `detail?`, `moveIndex?` (into setup + algorithm), `confidence` (share of belief),
  a plain-language `description` without notation ("Move 3 is "turn the top to the left". You
  probably turned it the other way."), `performedMoves`, `resultingState`, `score`.
- `confident` is true when the first slip holds at least 60% of belief and no other candidate
  leads to a *different* cube that looks the same on the shown faces.
- `showNext` names the unseen face that best separates such look-alikes.

## 6. Recovering

- `decideRecovery(plan, diagnosis)` → `{ action: 'resume', mistake, resume }` when confident,
  else `{ action: 'needsRescan', reason: 'nothing-fits' | 'not-confident', showNext? }`.
- `resumeFrom(plan, mistake)` → a `corrective` step (a normal `StepPlan` starting at
  `resultingState` in `gripAfter`: regrip first, then take back the moves from the slip onward
  and finish the step, simplified; it ends in the original `expectedState` and checks the
  original stickers plus any others the slip changed on the shown faces), or a `replan` (a fresh
  `planNextStep` from that cube) when the corrective step would exceed 12 layer turns.
- `replanFromScan(scanned, method, preferredGrip?)` → plans from a full rescan held in any of the
  24 orientations, turned to the grip the student was last told to hold when given. The caller
  validates the scan first; this only checks that the centers form a cube.

## 7. Measured results

`tests/checkpoint-synthetic.test.ts`, fixed seed 121. 20 students (10 scrambles per method), 311
step plans from complete guided solves. Each student has their own sticker plastics (reference
or faded), a full scan that builds their palette, and a different random lighting for every
checkpoint photo: brightness 0.70–1.08× the scan's, color temperature ±12%, noise ±4–10 levels.
Photos are 96×96 synthetic renders read by the real sampling, glare and palette code. Mistakes
are injected by `tests/helpers/mistakes.ts`, which is written without the diagnosis code.

| Check | Result | Required |
|---|---|---|
| Correct execution → `match` | 311 / 311 (100%) | ≥ 99% |
| Glare on a check-spec sticker → `uncertain` | 311 / 311 | all |
| Glare on a sticker outside the check spec → `match` | 254 / 254 | all |
| Another face shown → `wrong-face`, naming the face | 311 / 311 | all |
| No palette (static classifier, reference plastics, scan lighting) → `match` | 152 / 152 (100%) | ≥ 99% |

Injected single mistakes (one random position per kind per plan):

| Kind | Injected | Visible to the check spec | Detected (`mismatch`) | Top diagnosis correct | Top is the exact cube | Confident |
|---|---|---|---|---|---|---|
| wrong-direction | 284 | 281 | 281 (100%) | 281 (100%) | 281 | 281 |
| skipped-move | 311 | 311 | 311 (100%) | 311 (100%) | 311 | 311 |
| doubled-move | 284 | 284 | 284 (100%) | 284 (100%) | 284 | 284 |
| wrong-face | 311 | 311 | 311 (100%) | 311 (100%) | 310 | 308 |
| wrong-grip | 285 | 285 | 285 (100%) | 285 (100%) | 285 | 280 |
| stopped-early | 272 | 272 | 272 (100%) | 272 (100%) | 272 | 271 |
| extra-repeat | 77 | 77 | 77 (100%) | 77 (100%) | 77 | 74 |
| **all** | **1824** | **1821** | **1821 (100%)** | **1821 (100%)**, required ≥ 95% | **1820 (99.95%)** | **1809 (99.34%)** |

Two slips in one step (one move the other way and another skipped): 198 detected, top diagnosis
correct in 198 (100%).

Definitions:
- **Visible**: the mistaken cube differs from `expectedState` on at least one check-spec sticker.
  The 3 that are not visible pass the checkpoint by design (the spec compares only those
  stickers); the next step's checkpoint or plan meets the real cube.
- **Top diagnosis correct** ("distinguishable"): the first `likelyMistake.resultingState` shows
  the same color as the injected cube on every sticker of the shown faces. Candidate cubes with
  identical observed stickers are ties; the top one counts as correct when the injected cube is
  among those tied with it, which is exactly this condition.
- **Exact cube**: the first diagnosis equals the injected cube on all 54 stickers.
- **Confident**: `diagnosis.confident`. In all 1809 confident cases the diagnosis is the exact
  cube (the test requires zero confident-but-wrong results), so resuming without a rescan is
  safe; the other 12 go to "show one more face" or a rescan.

To regenerate: `CHECKPOINT_REPORT=report.json npx vitest run tests/checkpoint-synthetic.test.ts`.

## 8. Limits

- All numbers are from synthetic photos. Real cameras, real glare and worn stickers have not been
  measured; that is on the by-hand list for the morning report.
- Injected mistakes are of the kinds the diagnosis considers. A student who does something else
  (three slips, an unrelated turn) gets an empty diagnosis and a rescan, which is the designed
  fallback, not a named mistake.
- A slip that leaves every check-spec sticker as expected passes the checkpoint (3 of 1824 here).
- A photo so bright that white clips reads those tiles as not seen ("show me again").
- A face must be shown in the model's tile layout; the UI has to tell the student which way up.
