# ADR-013: Checkpoint Verification, Mistake Diagnosis and Recovery

**Status**: Accepted
**Date**: 2026-11-17
**Deciders**: Necookie Labs Core Engineering Team
**Related**: [ADR-003](003-computer-vision-strategy.md) (reticle sampling, CIELAB), [ADR-010](010-desktop-side-analysis-and-global-color-resolution.md) (global color resolution), [ADR-012](012-deterministic-tutor-engine.md) (tutor engine), `docs/tutor/GOAL.md` Phase 5, `docs/tutor/CHECKPOINTS.md`

---

## Context

After each step the tutor must know whether the student's cube is where the plan says. A full
six-face scan after every step would be correct and unbearable: a guided solve has 10 to 30
steps. The engine already names, per step, one or two faces and the stickers on them that the
step changed or placed (`StepPlan.checkpoint`).

Three things make a partial check hard:

1. **Color.** The full scan calibrates on six centers and settles close calls with the
   nine-per-color constraint. One face has one center and no constraint.
2. **Honesty.** A wrong "that matches" sends the student on with a broken cube; a wrong "that
   does not match" tells a child who did it right that they failed.
3. **What next.** "Wrong, scan everything again" after every slip would make checkpoints a
   punishment.

## Decision

### 1. A per-student palette from the full scan
The full scan's samples and resolved colors are reduced to a palette: per cube color, the mean
measured color and its spread (`src/vision/palette.ts`). It is plain JSON and is stored with the
student's profile. Checkpoint faces are classified against it by distance in spreads, after a
per-photo lighting correction anchored on the face's own center and fitted to all its tiles.
Without a palette the static classifier is used.

Alternatives rejected: the static classifier alone (it is tuned to dataset averages, not this
cube); re-using the full scan's center RGBs without spread (no way to say "not sure"); asking for
all six centers at every checkpoint (defeats the point).

### 2. Only the check-spec stickers decide, each with a confidence
`verifyCheckpoint` compares `plan.checkpoint.stickers` and nothing else. A check-spec sticker
read below the confidence threshold makes the result `uncertain` ("show me again"), whether its
guessed color is right or wrong. A clearly read wrong sticker makes it `mismatch`. Glare tiles
get confidence 0 at the reader. The other stickers on the shown faces never change the verdict;
they are evidence for the diagnosis.

### 3. A face is identified by its center
The center of each shown face is compared with the expected center first. A different, clearly
read center is a `wrong-face` result that names the face to show, not a mistake in the moves.
Observations are in the frame of the plan's `gripAfter`, in the cube model's tile layout; the
check never tries the in-plane turns of a photo, because on the top face that turn is the
difference between right and wrong.

### 4. Diagnosis by replaying slips on the logical cube
On a mismatch, `diagnoseMistake` enumerates the slips learners make (other direction, skipped,
doubled, wrong side, wrong grip, stopped early, extra repeat; pairs only when no single slip
fits), replays each from `startState`, and scores the resulting cube against every observed
sticker with a likelihood built from the sticker confidences plus a small prior per kind. Only
slips that explain every clearly read sticker are returned, ranked. The description is plain
language with no notation.

Alternative rejected: asking the language model what went wrong. It cannot see the cube, cannot
be tested exhaustively, and ADR-012 already keeps it out of decisions. The coach receives the
diagnosis (`{ likelyMistakes }`) and only phrases it.

### 5. Confident means unique
A diagnosis is `confident` only when its first slip holds most of the belief **and** no other
candidate leads to a different cube that would look the same on the shown faces. Then the cube
is known and `resumeFrom` gives a corrective step (take the slip back, finish the step) or, when
that is longer than 12 turns, a fresh plan from that cube. Otherwise the app may ask for the one
extra face that separates the look-alikes (`showNext`), and failing that asks for a full rescan
and plans afresh with `replanFromScan`, in whatever orientation the cube was scanned.

### 6. The student can always overrule the camera
`confirmManually` records a manual match; `applyTileEdits` lets tiles be corrected by hand and
verified through the same code path. A camera that cannot read a cube never blocks a lesson.

### 7. Module boundaries
`src/tutor/checkpoint.ts`, `diagnose.ts` and `recovery.ts` import only the cube engine and
other tutor files, like the rest of `src/tutor` (the purity test covers them). They take colors
and confidences, not pixels. Pixels are read in `src/vision/checkpointCapture.ts`, in the tab.

## Consequences

- A checkpoint is one or two photos, and a slip usually costs a few corrective turns instead of a
  rescan. On the synthetic suite (311 plans, 1824 injected mistakes) every visible mistake is
  detected, the top diagnosis is right in 100% of distinguishable cases (required: 95%), and it
  is confident in 99.3%, never wrongly. Numbers and definitions: `docs/tutor/CHECKPOINTS.md`.
- A slip that leaves every check-spec sticker as expected passes the checkpoint (3 of 1824 in
  the suite). This follows from comparing only the check spec; the next step meets the real cube.
- The palette is tied to one cube. A new cube, or a full rescan, rebuilds it.
- Overexposed white tiles and glare read as "not seen". The cost is an occasional "show me
  again"; the alternative is guessing.
- The UI must show the student which way up to hold each face, since the check does not try
  rotated photos.
- Everything above is measured on synthetic photos. Real-camera behaviour is unverified and is
  listed for manual checking.
