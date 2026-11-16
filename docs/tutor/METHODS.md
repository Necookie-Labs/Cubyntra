# Cubyntra Tutor — Methods and the Tutor Engine

**Module**: `src/tutor/` (pure TypeScript: no DOM, Three.js, React, solver or network imports)
**Decision record**: [ADR-012](../ADR/012-deterministic-tutor-engine.md)
**Spec**: [GOAL.md](GOAL.md), Phase 3

The tutor engine picks every move of a guided solve. Given a cube state, a method and the way the
student is holding the cube, it returns one small step: what to line up, which algorithm to do,
which pieces to watch, what the cube must look like afterwards and what to show the camera. The
coach only explains these plans; it never chooses moves.

---

## 1. Public API (`src/tutor/index.ts`)

```ts
type MethodId = 'beginner' | 'cfop';

planNextStep(state: CubeState, method: MethodId, grip?: Grip, stepIndex?: number): StepPlan | null
currentStage(state: CubeState, method: MethodId): StageDefinition | null
progress(state: CubeState, method: MethodId): TutorProgress
runGuidedSolve(state: CubeState, method: MethodId, grip?: Grip): GuidedSolve
getMethod(method: MethodId): MethodDefinition
METHODS: Record<MethodId, MethodDefinition>
CASE_IDS: Record<MethodId, Record<stageId, string[]>>   // every caseId a plan can carry
caseIdsOf(method: MethodId): string[]
```

- `planNextStep` returns `null` for a solved cube (in any orientation) and throws
  `TutorPlanError` when the cube cannot be held in `grip` or a plan fails its replay check.
- `grip` defaults to the orientation the state is stored in (`gripOf(state)`). A scan is stored
  with white on top and green in front; pass the student's real grip to avoid a needless regrip.
- `runGuidedSolve` follows plans until the cube is solved, as a student who does every step
  correctly would. It stops with `TutorPlanError` after `MAX_GUIDED_STEPS` (200).
- The same functions exist for a method definition passed in directly (`planNextStepIn`,
  `currentStageIn`, `progressIn`, `runGuidedSolveIn` in `src/tutor/engine.ts`); the tests use
  them with deliberately broken stages.

### 1.1 Step plan

```ts
interface StepPlan {
  method: MethodId;
  stage: string;            // stage id, e.g. 'white-cross', 'f2l'
  stageName: string;
  stageIndex: number;
  stepIndex: number;        // position in a guided solve (0 unless the caller numbers steps)
  caseId: string;           // e.g. 'f2l-17', 'yellow-cross-line'
  caseName: string;
  grip: Grip;               // how the cube is held when the step starts
  gripAfter: Grip;          // how it is held when the step ends
  startState: CubeState;    // the cube as seen in `grip`
  setupMoves: Move[];       // regrip (x y z) first, then lining-up turns
  algorithm: Move[];        // never contains a regrip
  highlightPieces: PieceRef[];          // { kind: 'edge' | 'corner' | 'center', colors }
  targetSlot?: PieceRef;                // where the piece is going, named by its home colors
  expectedState: CubeState; // startState after setupMoves then algorithm, as seen in gripAfter
  checkpoint: { facesToShow: Face[]; stickers: { face: Face; index: number }[] };
  facts: { goal: string; lookFor: string; why: string; repeat?: { unit: Move[]; times: number } };
  progressBefore: number;
  progressAfter: number;    // always greater than progressBefore
}
```

All moves are relative to the grip at the moment they are made: `R` is whatever side is on the
student's right. `facts.repeat` is set when the algorithm is one short sequence done several
times ("do R' D' R D three times").

### 1.2 Methods are data

A method is an ordered list of stages (`MethodDefinition.stages`). Each stage has:

| Field | Role |
|---|---|
| `id`, `name` | Stable id and display name |
| `top` | The center color that must be on top while the stage's moves are done |
| `isComplete(state)` | **Detector**: true once this stage and all earlier ones are finished, however the cube is held |
| `progress(view)` | Whole number 0–999 that every step of the stage raises |
| `plan(view)` | **Planner**: the next step for a cube held with `top` on top |
| `check.prefer` | **Check spec**: which faces the checkpoint prefers when several changed equally |

The current stage is the first one whose detector is false.

### 1.3 Files

| File | Contents |
|---|---|
| `types.ts` | `StepPlan`, `StageDefinition`, `MethodDefinition`, `TutorPlanError` |
| `engine.ts` | Stage lookup, progress, regrips, replay and advance check, checkpoint, guided solve |
| `api.ts`, `index.ts` | The same by method id; public exports |
| `methods/beginner.ts`, `methods/orientCorners.ts` | Beginner's stages and the last-stage detector |
| `methods/cfop.ts` | CFOP stages, F2L recognition index |
| `cases/f2l.ts`, `cases/oll2look.ts`, `cases/pll2look.ts` | Case tables |
| `caseIds.ts` | Every case id by method and stage |
| `crossSearch.ts`, `edgeCoords.ts` | Cross distance table and edge-position search |
| `helpers.ts` | Move lists, piece references, last-layer checks |

---

## 2. How a plan is made and checked

1. The state is turned into the student's grip (`viewInGrip`).
2. The current stage is found. If its `top` color is not on top, a regrip is added: one rotation
   whenever one is enough, keeping the same front (a flip is `z2`).
3. The stage planner returns a draft: setup moves, algorithm, pieces, facts.
4. Leading rotations are folded into the shortest regrip (`z2` then `y2` becomes `x2`).
5. **Replay**: `expectedState = applyMoves(startState, [...setupMoves, ...algorithm])`.
6. **Advance check**: `progress(expectedState).value` must be greater than
   `progress(startState).value`, where `value = stageIndex * 1000 + withinStage`. If it is not,
   or if the plan turns no layer, `TutorPlanError` is thrown. A wrong plan is never returned.
7. The checkpoint is derived from the replay (section 6).

Planners never recognise a case from a hand-written sticker pattern:

- **Holds match the explanation.** Where several holds work, the planner picks the one the facts
  describe (L at the back-left, matching edges at the back and the right, the placed corner at
  the front-right). `tests/tutor-beginner-facts.test.ts` and `tests/tutor-cfop-facts.test.ts`
  check this on real plans.
- **F2L** uses an index built by undoing every table algorithm (after each of the four top
  turns) on a solved cube: 149 position keys, each mapped to its case and top turn.
- **Last-layer cases and beginner steps** are found by trying the stage's standard sequences on
  a copy of the cube (after each top turn or cube turn) and keeping the one that reaches the goal.
- **Cross and daisy** come from searches over edge positions whose move table is generated from
  the cube engine itself.

### 2.1 Progress measures

| Method | Stage | `withinStage` |
|---|---|---|
| beginner | `daisy` | white edges that are petals or already home (0–4) |
| beginner | `white-cross` | white edges solved (0–4) |
| beginner | `white-corners` | 2 × corners solved + 1 if a white corner waits in the bottom layer |
| beginner | `middle-edges` | 2 × edges solved + 1 if a middle edge waits in the top layer |
| beginner | `yellow-cross` | 0 dot, 1 L, 2 line |
| beginner | `yellow-edges` | 0 opposite pair matches, 1 neighbouring pair matches, 2 all match after a top turn |
| beginner | `yellow-corners-position` | 0 none in place, 1 some in place |
| beginner | `yellow-corners-orient` | top corners showing yellow (0–4) |
| cfop | `cross` | 8 − shortest solution length |
| cfop | `f2l` | 4 × pairs solved + reach of the best unsolved pair (0–2 of its pieces in the top layer or its own slot) |
| cfop | last-layer stages | 0 (each is one step) |

---

## 3. Grips

- A grip is `{ top, front }` (center colors). Plans carry the grip before and after.
- Regrips are rotation moves at the start of `setupMoves`; they are never a step of their own and
  never appear in `algorithm`.
- CFOP: yellow on top throughout. A cube stored white-up gets one `z2` in the first step; after
  that only `y` turns are used (to bring an F2L slot to the front-right).
- Beginner's: see the flow below. There are two flips.

---

## 4. Beginner's method

The teaching flow follows the widely used layer-by-layer guide: build a daisy, turn it into the
white cross, solve the white corners **with the white cross on top**, then flip the cube so white
is on the bottom for the rest of the solve.

| # | Stage id | Grip | What happens | Moves | Case ids |
|---|---|---|---|---|---|
| 1 | `daisy` | yellow on top | One white edge per step becomes a petal next to the yellow center (an edge that is already home on the white face also counts). | Shortest turns found by search; leading top turns make room. | `daisy-top`, `daisy-middle`, `daisy-bottom-down`, `daisy-bottom-side` |
| 2 | `white-cross` | yellow on top | Turn the top until a petal's side color is above its center, then turn that side twice. | `U`-turn, then e.g. `F2` | `white-cross-petal` |
| 3 | `white-corners` | **white on top** (first flip) | The finished cross is turned to the top. A white corner in the bottom layer is brought under its home (`D` turns, `y` to hold it at the front-right) and lifted with `R' D' R D` done 1, 3 or 5 times. A corner that is home but twisted takes 2 or 4 rounds; a corner in the wrong home is taken out with 1 round. | `R' D' R D` × n | `white-corner-below`, `white-corner-twisted`, `white-corner-wrong-slot` |
| 4 | `middle-edges` | yellow on top (**the flip**: white goes to the bottom for good) | Turn the top until a middle edge's side sticker matches its center, face it, and drop it right or left. An edge stuck in the middle layer is pushed out first. | right: `U R U' R' U' F' U F`; left: `U' L' U L U F U' F'` | `middle-edge-right`, `middle-edge-left`, `middle-edge-extract` |
| 5 | `yellow-cross` | yellow on top | Dot → L → line → cross. The top is turned so the L points back-left and the line runs left to right. | `F R U R' U' F'` | `yellow-cross-dot`, `yellow-cross-l`, `yellow-cross-line` |
| 6 | `yellow-edges` | yellow on top | Turn the top until two yellow edges match their centers. Neighbours: hold them at the back and the right, one round finishes. Opposite: one round from any side, then the neighbour case. If all four match after a top turn, only that turn is planned. | `R U R' U R U2 R' U` | `yellow-edges-adjacent`, `yellow-edges-opposite`, `yellow-edges-align` |
| 7 | `yellow-corners-position` | yellow on top | Hold a corner that is in place at the front-right and cycle the other three (once or twice). | `U R U' L' U R' U' L` | `yellow-corners-none`, `yellow-corners-one` |
| 8 | `yellow-corners-orient` | yellow on top | Twist the front-right top corner with 2 or 4 rounds, turn **only the top** to bring the next one, repeat; then one last top turn. | `R' D' R D` × 2 or 4 | `yellow-corner-twist-2`, `yellow-corner-twist-4`, `yellow-corners-align` |

Notes:

- **Why two flips.** The daisy puts the cross on the bottom; the corner stage wants the cross on
  top so the student can see the homes; the middle layer wants white on the bottom. The first
  flip is the first setup move of the first corner step, the second ("the flip" of GOAL.md) is
  the first setup move of the first middle-edge step.
- **One trigger for corners.** The corner stages use the single sequence `R' D' R D` repeated,
  as the standard guide teaches, instead of three separate insert cases. This costs moves (up to
  20 for one corner) but there is only one thing to remember.
- **The last stage looks broken in the middle.** After the first corner is twisted the two lower
  layers are shuffled and stay that way until the last corner is done. The detector
  (`orientStage` in `src/tutor/methods/orientCorners.ts`) recognises exactly these cubes: lower
  layers solved or in one of the two known shuffles, and a top layer whose edges and corner
  positions are right after some top turn. Such a cube counts as "in stage 8" even when it is
  re-scanned from scratch, and the plan first turns the student back to the grip the stage was
  started in.

---

## 5. CFOP (2-look last layer)

White is on the bottom from start to finish.

| # | Stage id | What happens | Case ids |
|---|---|---|---|
| 1 | `cross` | The whole white cross in one step: a shortest solution (0–8 outer turns) read off a breadth-first distance table over the four cross edges (190,080 positions). | `cross` |
| 2 | `f2l` | One corner-edge pair per step. `y` brings the slot to the front-right, a top turn lines the pair up, the table algorithm inserts it. | `f2l-01` … `f2l-41`, `f2l-extract-corner`, `f2l-extract-edge` |
| 3 | `oll-edges` | Yellow cross. | `oll-edges-line`, `oll-edges-l`, `oll-edges-dot` |
| 4 | `oll-corners` | Yellow top. | `oll-corners-sune`, `-antisune`, `-h`, `-pi`, `-headlights`, `-chameleon`, `-bowtie` |
| 5 | `pll-corners` | Top corners in order (skipped when already right). | `pll-corners-t`, `pll-corners-y` |
| 6 | `pll-edges` | Top edges in order (skipped when already right). | `pll-edges-ua`, `-ub`, `-h`, `-z` |
| 7 | `auf` | One turn of the top, if needed. | `auf-u`, `auf-u2`, `auf-u'` |

F2L details:

- **Which pair.** Every unsolved pair whose two pieces are both in the top layer or in their own
  slot is looked up in the index; the cheapest (regrip + line-up + algorithm length) is planned.
  Ties go to the pair needing the smallest `y` turn.
- **Line-up turn.** When a table algorithm itself starts with a top turn, that turn and the
  line-up turn are merged into one setup move, so a plan never turns the top twice in a row.
  `[...setupMoves, ...algorithm]` then equals the table algorithm up to that first turn.
  `facts.lookFor` describes the position the student actually sees before lining up.
- **Stuck pieces.** If no pair is within reach, the pair with the most reachable pieces is
  chosen and its stuck piece is taken out of the foreign slot with `R U R'`, `R U' R'` or
  `R U2 R'` after a top turn, whichever raises progress most (so nothing useful is pushed back
  in). In the soak run no solve needed more than 13 steps in total.

---

## 6. Checkpoint spec

After the replay the engine compares the start state (carried into the final grip, so a regrip
alone changes nothing) with `expectedState`:

- every face is scored: one point per changed sticker, three per sticker of a highlighted piece;
- the two best faces are shown (`facesToShow`, relative to `gripAfter`); ties follow the stage's
  `check.prefer` order, then `U F R L B D`;
- `stickers` lists, for those faces only, the stickers that changed or belong to a highlighted
  piece, in the frame of `expectedState`.

Phase 5 compares only these stickers against the camera.

---

## 7. Case tables

Tables are plain data in `src/tutor/cases/` (`id`, `name`, `recognition`, `algorithm`).

### 7.1 F2L (41 cases, `cases/f2l.ts`)

The cube is held with the slot at the front-right and white on the bottom. "Starts from" is
`<corner slot><twist>-<edge slot><flip>`: twist 0 = white facing up (or down, in the slot), then
1 and 2 counter-clockwise around the corner (UFR: front, right; DFR: right, front); flip 0 = the
front-center color on the top sticker (or on the front, in the slot). `recognition` is generated
from this key (`describeF2LPosition`), and the tests rebuild every key by undoing the algorithm.

| Id | Name | Starts from | Algorithm |
|---|---|---|---|
| `f2l-01` | Easy insert 1 | `UFR1-UR0` | `U R U' R'` |
| `f2l-02` | Easy insert 2 | `UFR2-UF1` | `U' F' U F` |
| `f2l-03` | Easy insert 3 | `UFR1-UL1` | `F' U' F` |
| `f2l-04` | Easy insert 4 | `UFR2-UB0` | `R U R'` |
| `f2l-05` | Both on top, white on the side 1 | `UFR1-UB0` | `U' R U R' U2 R U' R'` |
| `f2l-06` | Both on top, white on the side 2 | `UFR2-UL1` | `U F' U' F U2 F' U F` |
| `f2l-07` | Both on top, white on the side 3 | `UFR1-UL0` | `U' R U2 R' U2 R U' R'` |
| `f2l-08` | Both on top, white on the side 4 | `UFR2-UB1` | `U F' U2 F U2 F' U F` |
| `f2l-09` | Both on top, white on the side 5 | `UFR1-UB1` | `U' R U' R' U F' U' F` |
| `f2l-10` | Both on top, white on the side 6 | `UFR2-UL0` | `U' R U R' U R U R'` |
| `f2l-11` | Both on top, white on the side 7 | `UBR1-UB1` | `R U2 R' U F' U' F` |
| `f2l-12` | Both on top, white on the side 8 | `UFL2-UL0` | `F' U2 F U' R U R'` |
| `f2l-13` | Both on top, white on the side 9 | `UFR1-UF1` | `U F' U F U' F' U' F` |
| `f2l-14` | Both on top, white on the side 10 | `UFR2-UR0` | `U' R U' R' U R U R'` |
| `f2l-15` | Both on top, white on the side 11 | `UFR1-UF0` | `R U R' U2 R U' R' U R U' R'` |
| `f2l-16` | Both on top, white on the side 12 | `UFR2-UR1` | `R U' R' U2 F' U' F` |
| `f2l-17` | Both on top, white facing up 1 | `UFR0-UR0` | `R U2 R' U' R U R'` |
| `f2l-18` | Both on top, white facing up 2 | `UFR0-UF1` | `F' U2 F U F' U' F` |
| `f2l-19` | Both on top, white facing up 3 | `UFL0-UR0` | `R U2 R' U R U' R'` |
| `f2l-20` | Both on top, white facing up 4 | `UBR0-UF1` | `F' U2 F U' F' U F` |
| `f2l-21` | Both on top, white facing up 5 | `UFR0-UL0` | `R U' R' U2 R U R'` |
| `f2l-22` | Both on top, white facing up 6 | `UFR0-UB1` | `F' U F U2 F' U' F` |
| `f2l-23` | Both on top, white facing up 7 | `UFR0-UF0` | `R U R' U2 R U R' U' R U R'` |
| `f2l-24` | Both on top, white facing up 8 | `UFR0-UR1` | `F U R U' R' F' R U' R'` |
| `f2l-25` | Corner in the slot, edge on top 1 | `DFR0-UR0` | `U' F' U F U R U' R'` |
| `f2l-26` | Corner in the slot, edge on top 2 | `DFR0-UF1` | `U R U' R' U' F' U F` |
| `f2l-27` | Corner in the slot, edge on top 3 | `DFR2-UR0` | `R U' R' U R U' R'` |
| `f2l-28` | Corner in the slot, edge on top 4 | `DFR1-UF1` | `F' U F U' F' U F` |
| `f2l-29` | Corner in the slot, edge on top 5 | `DFR2-UF1` | `F' U' F U F' U' F` |
| `f2l-30` | Corner in the slot, edge on top 6 | `DFR1-UR0` | `R U R' U' R U R'` |
| `f2l-31` | Edge in the slot, corner on top 1 | `UFR0-FR1` | `F' U F R U2 R'` |
| `f2l-32` | Edge in the slot, corner on top 2 | `UFR0-FR0` | `R U R' U' R U R' U' R U R'` |
| `f2l-33` | Edge in the slot, corner on top 3 | `UFR1-FR0` | `U' R U' R' U2 R U' R'` |
| `f2l-34` | Edge in the slot, corner on top 4 | `UFR2-FR0` | `U R U R' U2 R U R'` |
| `f2l-35` | Edge in the slot, corner on top 5 | `UFR1-FR1` | `U' R U R' U F' U' F` |
| `f2l-36` | Edge in the slot, corner on top 6 | `UFR2-FR1` | `U F' U' F U' R U R'` |
| `f2l-37` | Both in the slot 1 | `DFR1-FR0` | `R U' R' U R U2 R' U R U' R'` |
| `f2l-38` | Both in the slot 2 | `DFR2-FR0` | `R U' R' U' R U R' U2 R U' R'` |
| `f2l-39` | Both in the slot 3 | `DFR0-FR1` | `R U' R' U F' U2 F U2 F' U F` |
| `f2l-40` | Both in the slot 4 | `DFR2-FR1` | `R U' R' U F' U' F U' F' U' F` |
| `f2l-41` | Both in the slot 5 | `DFR1-FR1` | `F' U F U' R U R' U R U R'` |

### 7.2 2-look OLL (`cases/oll2look.ts`)

**Look 1: yellow cross (`oll-edges`)**

| Id | Name | Algorithm | Recognition |
|---|---|---|---|
| `oll-edges-line` | Line | `F R U R' U' F'` | Two yellow edges make a line through the center. Turn the top so the line runs left to right. |
| `oll-edges-l` | L shape | `f R U R' U' f'` | Two yellow edges make an L with the center. Turn the top so the L points to the front and the right. |
| `oll-edges-dot` | Dot | `F R U R' U' F' f R U R' U' f'` | No yellow edges on top, only the yellow center. |

**Look 2: yellow corners (`oll-corners`)**

| Id | Name | Algorithm | Recognition |
|---|---|---|---|
| `oll-corners-sune` | Sune | `R U R' U R U2 R'` | One yellow corner on top, at the front-left. The front-right corner shows yellow on the front. |
| `oll-corners-antisune` | Anti-Sune | `R U2 R' U' R U' R'` | One yellow corner on top, at the back-right. The front-right corner shows yellow on the right. |
| `oll-corners-h` | Double headlights (H) | `R U R' U R U' R' U R U2 R'` | No yellow corners on top. Two yellow stickers on the left side and two on the right side. |
| `oll-corners-pi` | Pi | `R U2 R2 U' R2 U' R2 U2 R` | No yellow corners on top. Two yellow stickers on the left side, one on the front and one on the back. |
| `oll-corners-headlights` | Headlights (U) | `R2 D R' U2 R D' R' U2 R'` | Two yellow corners on top, both at the back. The front shows two yellow stickers. |
| `oll-corners-chameleon` | Chameleon (T) | `r U R' U' r' F R F'` | Two yellow corners on top, both on the right. The left corners show yellow on the front and the back. |
| `oll-corners-bowtie` | Bowtie (L) | `F R' F' r U R U' r'` | Two yellow corners on top, diagonal: back-left and front-right. The front-left corner shows yellow on the front. |

### 7.3 2-look PLL (`cases/pll2look.ts`)

**Look 1: corners (`pll-corners`)**

| Id | Name | Algorithm | Recognition |
|---|---|---|---|
| `pll-corners-t` | Headlights (T perm) | `R U R' U' R' F R2 U' R' U' R U R' F'` | One side has two corner stickers of the same color ("headlights"). Turn the top so they are on the left. |
| `pll-corners-y` | No headlights (Y perm) | `F R U' R' U' R U R' F' R U R' U' R' F R F'` | No side has two corner stickers of the same color. |

**Look 2: edges (`pll-edges`)**

| Id | Name | Algorithm | Recognition |
|---|---|---|---|
| `pll-edges-ua` | Ua perm | `R U' R U R U R U' R' U' R2` | One side of the top layer is a solid bar of one color. Hold the bar at the back: the front edge has the color of the corners on the right side. |
| `pll-edges-ub` | Ub perm | `R2 U R U R' U' R' U' R' U R'` | One side of the top layer is a solid bar of one color. Hold the bar at the back: the front edge has the color of the corners on the left side. |
| `pll-edges-h` | H perm | `M2 U M2 U2 M2 U M2` | No side of the top layer is a solid bar. Every edge has the color of the corners on the opposite side. |
| `pll-edges-z` | Z perm | `M' U M2 U M2 U M' U2 M2 U'` | No side of the top layer is a solid bar. The front edge has the color of the left corners and the back edge the color of the right corners. |

---

## 8. Tests and measured results

| File | What it covers |
|---|---|
| `tests/tutor-edge-coords.test.ts`, `tutor-cross-search.test.ts` | Move table agrees with the cube engine; cross search is optimal and never exceeds 8 turns |
| `tests/tutor-f2l-cases.test.ts`, `tutor-last-layer-cases.test.ts` | Every table algorithm does what its entry says; the 41 F2L cases are distinct and complete |
| `tests/tutor-engine.test.ts` | Replay, advance check (a plan that does not advance throws), regrips, checkpoint, loop guard |
| `tests/tutor-cfop-*.test.ts`, `tutor-beginner-*.test.ts`, `tutor-orient-corners.test.ts` | Each stage with hand-made cubes (a case is set up by undoing its algorithm) |
| `tests/tutor-beginner-facts.test.ts`, `tutor-cfop-facts.test.ts` | After the setup moves, the cube looks the way `facts.lookFor` and the case recognition say |
| `tests/tutor-api.test.ts` | Public API, case-id lists, purity of `src/tutor` (imports and determinism) |
| `tests/tutor-scrambles.test.ts` | Fixed-seed scramble suite |

The scramble suite uses 30-move random scrambles from a seeded generator (seed 2026). For every
scramble and both methods it checks that the solve finishes, that every step starts from the
previous state, replays exactly to `expectedState`, raises progress and never goes back a stage,
and that the set of case ids seen equals `CASE_IDS` exactly (every table case is triggered).

- `npm test` runs **1,000** scrambles per method (about 4 s).
- `npm run test:tutor-soak` runs **10,000** per method (about 40 s) and prints the report below.

### 8.1 Soak results (10,000 scrambles per method, seed 2026, 2026-11-17)

All 20,000 solves completed; every step advanced; every case id was triggered.
Turns are layer turns (regrips are not counted).

**Beginner's method** — average **155.8** turns, maximum **231**; average 21.6 steps, maximum 29.

| Stage | Average turns | Maximum turns |
|---|---:|---:|
| `daisy` | 5.2 | 10 |
| `white-cross` | 4.5 | 7 |
| `white-corners` | 43.5 | 88 |
| `middle-edges` | 35.6 | 60 |
| `yellow-cross` | 10.5 | 19 |
| `yellow-edges` | 8.9 | 18 |
| `yellow-corners-position` | 12.7 | 24 |
| `yellow-corners-orient` | 35.0 | 52 |

**CFOP (2-look)** — average **75.7** turns, maximum **106**; average 9.8 steps, maximum 13.

| Stage | Average turns | Maximum turns |
|---|---:|---:|
| `cross` | 5.8 | 8 |
| `f2l` | 31.2 | 54 |
| `oll-edges` | 6.5 | 12 |
| `oll-corners` | 8.6 | 12 |
| `pll-corners` | 12.7 | 17 |
| `pll-edges` | 10.1 | 12 |
| `auf` | 0.7 | 1 |

---

## 9. Known limits

- The beginner's corner stages trade move count for a single trigger; the 5-round case (20
  turns) could be replaced by a second, mirrored trigger if the student finds it tedious.
- The CFOP cross is one step of up to 8 turns; it is not split per edge.
- F2L always works at the front-right slot (with `y` regrips) and uses algorithms in R, U and F
  only; there are no left-slot or back-slot variants.
- The engine assumes the standard color scheme and a physically valid cube; validate a scan with
  `validateCubeState` before planning.
- Full OLL (57) and PLL (21) arrive in Phase 9 and will plug into the same last-layer planner.
