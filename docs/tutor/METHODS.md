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
interface MethodOptions { lastLayer?: '2-look' | 'full' }   // learner settings; {} = defaults

planNextStep(state: CubeState, method: MethodId, grip?: Grip, stepIndex?: number, options?: MethodOptions): StepPlan | null
currentStage(state: CubeState, method: MethodId, options?: MethodOptions): StageDefinition | null
progress(state: CubeState, method: MethodId, options?: MethodOptions): TutorProgress
runGuidedSolve(state: CubeState, method: MethodId, grip?: Grip, options?: MethodOptions): GuidedSolve
getMethod(method: MethodId, options?: MethodOptions): MethodDefinition
METHODS: Record<MethodId, MethodDefinition>              // each method as taught by default
CASE_IDS: Record<MethodId, Record<stageId, string[]>>   // every caseId a default plan can carry
CFOP_FULL_CASE_IDS: Record<stageId, string[]>           // the same for CFOP with lastLayer 'full'
caseIdsByStage(method: MethodId, options?: MethodOptions): Record<stageId, string[]>
caseIdsOf(method: MethodId, options?: MethodOptions): string[]
allCaseIds(): string[]                                   // every id of every variant, each once
```

- `options` are learner settings. The only one is `lastLayer` for CFOP: `'2-look'` (default) or
  `'full'` (section 5.1). Leaving it out, passing `{}` or passing `'2-look'` all give exactly the
  same plans as before the setting existed. The beginner's method ignores it. An unknown value
  throws `TutorPlanError`.

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
  options?: MethodOptions;  // present only for non-default settings, e.g. { lastLayer: 'full' }
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

`options` travels with the plan so that whatever plans the next step from it (the recovery
functions in `recovery.ts`, the solve screen) stays on the same variant: stage indexes and
progress values of the 2-look and full variants are not comparable. `resumeFrom` reads
`plan.options` itself; `replanFromScan` takes the options as its last argument.

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
| `methods/cfop.ts` | CFOP stages (2-look and full last layer), F2L recognition index |
| `cases/f2l.ts`, `cases/oll2look.ts`, `cases/pll2look.ts` | Case tables |
| `cases/oll.ts`, `cases/pll.ts` | Full last-layer tables: 57 OLL and 21 PLL cases |
| `caseIds.ts` | Every case id by method, variant and stage |
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

## 5. CFOP

White is on the bottom from start to finish. The last layer is 2-look by default; section 5.1
describes the full last layer.

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

### 5.1 Full last layer (`lastLayer: 'full'`)

A learner who knows the 2-look last layer can switch CFOP to the full one:

```ts
planNextStep(state, 'cfop', grip, stepIndex, { lastLayer: 'full' });
runGuidedSolve(state, 'cfop', grip, { lastLayer: 'full' });
// in a worker: client.request('tutor.plan', { state, method: 'cfop', options: { lastLayer: 'full' } })
```

The method id stays `cfop`; `getMethod('cfop', { lastLayer: 'full' })` returns the variant
`CFOP_FULL_METHOD`. Cross, F2L and the final turn are the very same stage objects, so the first
two layers are planned identically. The four 2-look stages are replaced by two:

| # | Stage id | What happens | Case ids |
|---|---|---|---|
| 1 | `cross` | As in 2-look. | `cross` |
| 2 | `f2l` | As in 2-look. | `f2l-01` … `f2l-41`, `f2l-extract-corner`, `f2l-extract-edge` |
| 3 | `oll` | The whole top yellow in one algorithm (skipped when it already is). | `oll-01` … `oll-57` |
| 4 | `pll` | Every top piece in order in one algorithm (skipped when already right). | `pll-aa`, `pll-ab`, `pll-e`, `pll-f`, `pll-ga` … `pll-gd`, `pll-h`, `pll-ja`, `pll-jb`, `pll-na`, `pll-nb`, `pll-ra`, `pll-rb`, `pll-t`, `pll-ua`, `pll-ub`, `pll-v`, `pll-y`, `pll-z` |
| 5 | `auf` | One turn of the top, if needed. | `auf-u`, `auf-u2`, `auf-u'` |

- **Recognition** works like the 2-look stages: each table algorithm is tried after each of the
  four top turns and the first that finishes the stage is planned. An OLL algorithm turns the
  whole top yellow from exactly one yellow pattern, and a PLL algorithm solves exactly one
  arrangement (give or take top turns), so the entry found is the case the cube shows. The line-up
  turn is the only setup move; `facts.lookFor` is the case's `recognition`, which describes the
  cube after that turn.
- **Case ids** do not overlap with the 2-look ids (`oll-edges-*`, `oll-corners-*`,
  `pll-corners-*`, `pll-edges-*`), so an id always names one algorithm. Sune is `oll-27` here and
  `oll-corners-sune` in 2-look. `caseIdsOf('cfop', { lastLayer: 'full' })` lists the variant's
  ids; `allCaseIds()` lists every id of every variant (what the coach and the trainer need).
- **No regrips inside an algorithm.** Every table algorithm is free of `x`, `y`, `z`, like every
  other step. Where the usual fingertrick version of a case starts with a rotation (A perms, E
  perm, V perm), the table holds a rotation-free version of the same case.
- **Plans carry the setting** as `plan.options`, and recovery keeps it (section 1.1).

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

### 7.4 Full OLL (57 cases, `cases/oll.ts`)

Each entry has `id`, `number` (1–57, the standard numbering), `name` (`OLL n (nickname)`),
`group`, `pattern`, `recognition` and `algorithm`. `pattern` is the case's definition: the 21
last-layer stickers seen from above when the algorithm starts, `x` for yellow, as five rows
(shown below with spaces between rows; the source joins them with `|`): the back side (left to
right), three rows of left sticker + top face + right sticker, the front side (left to right).
`recognition` is the group's shape followed by where every yellow sticker is, e.g. for `oll-27`:
"A yellow cross on top. Yellow on top: the cross and the front-left corner. Yellow on the sides:
front (right), right (back), back (left)."

Groups: Dot (1–4, 17–20), Square (5, 6), Small lightning bolt (7, 8, 11, 12), Fish (9, 10, 35,
37), Knight move (13–16), Cross (21–27), Corners oriented (28, 57), Awkward (29, 30, 41, 42),
P shapes (31, 32, 43, 44), T shapes (33, 45), C shapes (34, 46), W shapes (36, 38), Big lightning
bolt (39, 40), Small L (47–50, 53, 54), Line (51, 52, 55, 56).

| Id | Name | Group | Pattern | Algorithm |
|---|---|---|---|---|
| `oll-01` | OLL 1 (Runway) | Dot | `.x. x...x x.x.x x...x .x.` | `R U2 R2 F R F' U2 R' F R F'` |
| `oll-02` | OLL 2 (Zamboni) | Dot | `.xx x.... x.x.x x.... .xx` | `F R U R' U' F' f R U R' U' f'` |
| `oll-03` | OLL 3 (Anti-Mouse) | Dot | `xx. ....x x.x.x x..x. .x.` | `f R U R' U' f' U' F R U R' U' F'` |
| `oll-04` | OLL 4 (Mouse) | Dot | `.x. x..x. x.x.x ....x xx.` | `f R U R' U' f' U F R U R' U' F'` |
| `oll-05` | OLL 5 (Lefty Square) | Square | `xx. ....x x.xx. x.xx. ...` | `r' U2 R U R' U r` |
| `oll-06` | OLL 6 (Righty Square) | Square | `... x.xx. x.xx. ....x xx.` | `r U2 R' U' R U' r'` |
| `oll-07` | OLL 7 (Fat Sune) | Small lightning bolt | `x.. ..x.x .xx.x .x... .xx` | `r U R' U R U2 r'` |
| `oll-08` | OLL 8 (Fat Anti-Sune) | Small lightning bolt | `.xx .x... .xx.x ..x.x x..` | `r' U' R U' R' U2 r` |
| `oll-09` | OLL 9 (Kite) | Fish | `..x x.x.. .xx.x ...x. xx.` | `R U R' U' R' F R2 U R' U' F'` |
| `oll-10` | OLL 10 (Anti-Kite) | Fish | `xx. ...x. .xx.x x.x.. ..x` | `R U R' U R' F R F' R U2 R'` |
| `oll-11` | OLL 11 (Downstairs) | Small lightning bolt | `x.. ..xx. .xx.x x.... .xx` | `r U R' U R' F R F' R U2 r'` |
| `oll-12` | OLL 12 (Upstairs) | Small lightning bolt | `..x .xx.. x.xx. ....x xx.` | `M' R' U' R U' R' U2 R U' R r'` |
| `oll-13` | OLL 13 (Gun) | Knight move | `xx. ....x .xxx. .x... .xx` | `F U R U' R2 F' R U R U' R'` |
| `oll-14` | OLL 14 (Anti-Gun) | Knight move | `.xx x.... .xxx. ...x. xx.` | `R' F R U R' F' R F U' F'` |
| `oll-15` | OLL 15 (Squeegee) | Knight move | `xx. ....x .xxx. x..x. .x.` | `r' U' r R' U' R U r' U r` |
| `oll-16` | OLL 16 (Anti-Squeegee) | Knight move | `.x. x..x. .xxx. ....x xx.` | `r U r' R U R' U' r U' r'` |
| `oll-17` | OLL 17 (Slash) | Dot | `.xx .x... x.x.x x..x. .x.` | `R U R' U R' F R F' U2 R' F R F'` |
| `oll-18` | OLL 18 (Crown) | Dot | `.x. .x.x. x.x.x ..... xxx` | `r U R' U R U2 r2 U' R U' R' U2 r` |
| `oll-19` | OLL 19 (Bunny) | Dot | `.x. .x.x. x.x.x x...x .x.` | `r' R U R U R' U' M' R' F R F'` |
| `oll-20` | OLL 20 (Checkers) | Dot | `.x. .x.x. x.x.x .x.x. .x.` | `r U R' U' M2 U R U' R' U' M'` |
| `oll-21` | OLL 21 (Double Sune) | Cross | `x.x ..x.. .xxx. ..x.. x.x` | `R U2 R' U' R U R' U' R U' R'` |
| `oll-22` | OLL 22 (Pi) | Cross | `..x x.x.. .xxx. x.x.. ..x` | `R U2 R2 U' R2 U' R2 U2 R` |
| `oll-23` | OLL 23 (Headlights) | Cross | `x.x ..x.. .xxx. .xxx. ...` | `R2 D' R U2 R' D R U2 R` |
| `oll-24` | OLL 24 (Chameleon) | Cross | `x.. ..xx. .xxx. ..xx. x..` | `r U R' U' r' F R F'` |
| `oll-25` | OLL 25 (Bowtie) | Cross | `... x.xx. .xxx. .xx.. ..x` | `F' r U R' U' r' F R` |
| `oll-26` | OLL 26 (Anti-Sune) | Cross | `... x.xx. .xxx. ..x.x x..` | `R U2 R' U' R U' R'` |
| `oll-27` | OLL 27 (Sune) | Cross | `x.. ..x.x .xxx. .xx.. ..x` | `R U R' U R U2 R'` |
| `oll-28` | OLL 28 (Stealth) | Corners oriented | `... .xxx. .xx.x .x.x. .x.` | `r U R' U' r' R U R U' R'` |
| `oll-29` | OLL 29 (Spotted Chameleon) | Awkward | `x.. ..xx. .xx.x ...x. xx.` | `R U R' U' R U' R' F' U' F R U R'` |
| `oll-30` | OLL 30 (Anti-Spotted Chameleon) | Awkward | `... x.x.x .xx.x .x.x. .x.` | `F R' F R2 U' R' U' R U R' F2` |
| `oll-31` | OLL 31 (Couch) | P shapes | `x.. ..xx. x.xx. ...x. xx.` | `R' U' F U R U' R' F' R` |
| `oll-32` | OLL 32 (Anti-Couch) | P shapes | `..x .xx.. .xx.x .x... .xx` | `L U F' U' L' U L F L'` |
| `oll-33` | OLL 33 (Key) | T shapes | `xx. ...x. .xxx. ...x. xx.` | `R U R' U' R' F R F'` |
| `oll-34` | OLL 34 (City) | C shapes | `.x. x...x .xxx. .x.x. .x.` | `R U R2 U' R' F R U R U' F'` |
| `oll-35` | OLL 35 (Fish Salad) | Fish | `.x. .x..x x.xx. ..xx. x..` | `R U2 R2 F R F' R U2 R'` |
| `oll-36` | OLL 36 (Wario) | W shapes | `..x .xx.. x.xx. x..x. .x.` | `L' U' L U' L' U L U L F' L' F` |
| `oll-37` | OLL 37 (Mounted Fish) | Fish | `... .xx.x .xx.x ...x. xx.` | `F R' F' R U R U' R'` |
| `oll-38` | OLL 38 (Mario) | W shapes | `x.. ..xx. .xx.x .x..x .x.` | `R U R' U R U' R' U' R' F R F'` |
| `oll-39` | OLL 39 (Fung) | Big lightning bolt | `xx. ...x. .xxx. .x..x .x.` | `L F' L' U' L U F U' L'` |
| `oll-40` | OLL 40 (Anti-Fung) | Big lightning bolt | `.xx .x... .xxx. x..x. .x.` | `R' F R U R' U' F' U R` |
| `oll-41` | OLL 41 (Awkward Fish) | Awkward | `x.x ..x.. .xx.x .x.x. .x.` | `R U R' U R U2 R' F R U R' U' F'` |
| `oll-42` | OLL 42 (Lefty Awkward Fish) | Awkward | `.x. .x.x. .xx.x ..x.. x.x` | `R' U' R U' R' U2 R F R U R' U' F'` |
| `oll-43` | OLL 43 (Anti-P) | P shapes | `... x.xx. x.xx. x..x. .x.` | `F' U' L' U L F` |
| `oll-44` | OLL 44 (P) | P shapes | `... .xx.x .xx.x .x..x .x.` | `F U R U' R' F'` |
| `oll-45` | OLL 45 (Suit Up) | T shapes | `.x. x..x. .xxx. x..x. .x.` | `F R U R' U' F'` |
| `oll-46` | OLL 46 (Seein' Headlights) | C shapes | `... .xx.x x.x.x .xx.x ...` | `R' U' R' F R F' U R` |
| `oll-47` | OLL 47 (Anti-Breakneck) | Small L | `x.. ..x.x x.xx. ....x xx.` | `R' U' R' F R F' R' F R F' U R` |
| `oll-48` | OLL 48 (Breakneck) | Small L | `..x x.x.. .xx.x x.... .xx` | `F R U R' U' R U R' U' F'` |
| `oll-49` | OLL 49 (Right Back Squeezy) | Small L | `..x x.x.. x.xx. x.... .xx` | `r U' r2 U r2 U r2 U' r` |
| `oll-50` | OLL 50 (Right Front Squeezy) | Small L | `.xx x.... x.xx. x.x.. ..x` | `r' U r2 U' r2 U' r2 U r'` |
| `oll-51` | OLL 51 (Bottlecap) | Line | `xx. ....x .xxx. ....x xx.` | `F U R U' R' U R U' R' F'` |
| `oll-52` | OLL 52 (Rice Cooker) | Line | `x.. ..x.x x.x.x ..x.x x..` | `R U R' U R U' B U' B' R'` |
| `oll-53` | OLL 53 (Frying Pan) | Small L | `x.x ..x.. x.xx. ..... xxx` | `l' U2 L U L' U' L U L' U l` |
| `oll-54` | OLL 54 (Anti-Frying Pan) | Small L | `x.x ..x.. .xx.x ..... xxx` | `r U2 R' U' R U R' U' R U' r'` |
| `oll-55` | OLL 55 (Highway) | Line | `xxx ..... .xxx. ..... xxx` | `R' F R U R U' R2 F' R2 U' R' U R U R'` |
| `oll-56` | OLL 56 (Streetlights) | Line | `.x. x...x .xxx. x...x .x.` | `r' U' r U' R' U R U' R' U R r' U r` |
| `oll-57` | OLL 57 (Mummy) | Corners oriented | `.x. .x.x. .xxx. .x.x. .x.` | `R U R' U' M' U R U' r'` |

### 7.5 Full PLL (21 cases, `cases/pll.ts`)

Each entry has `id`, `name`, `group`, `cycles`, `recognition` and `algorithm`. `cycles` is the
case's definition: what the algorithm does to the top-layer pieces, leaving out any last turn of
the top. `(UFR UBR)` means the front-right corner goes to the back-right and the other comes
back; `(UF UR UL)` sends front to right, right to left, left to front. `recognition` says what
the top row of each side shows (a solid bar, headlights, a block of two, three different colors)
and never mentions the centers, because the top may be a turn away from them.

| Id | Name | Group | Cycles | Algorithm |
|---|---|---|---|---|
| `pll-aa` | Aa perm | Corners only | `(UBL UBR UFR)` | `R' F R' B2 R F' R' B2 R2` |
| `pll-ab` | Ab perm | Corners only | `(UBL UFR UBR)` | `R2 B2 R F R' B2 R F' R` |
| `pll-e` | E perm | Corners only | `(UBL UFL) (UBR UFR)` | `R B' R' F R B R' F' R B R' F R B' R' F'` |
| `pll-f` | F perm | Adjacent corner swap | `(UB UF) (UBR UFR)` | `R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R` |
| `pll-ga` | Ga perm | G perms | `(UB UL UR) (UBL UBR UFL)` | `R2 U R' U R' U' R U' R2 U' D R' U R D'` |
| `pll-gb` | Gb perm | G perms | `(UBL UBR UFL) (UF UR UL)` | `R' U' R U D' R2 U R' U R U' R U' R2 D` |
| `pll-gc` | Gc perm | G perms | `(UB UF UR) (UBL UBR UFL)` | `R2 U' R U' R U R' U R2 U D' R U' R' D` |
| `pll-gd` | Gd perm | G perms | `(UB UL UF) (UBL UBR UFL)` | `R U R' U' D R2 U' R U' R' U R' U R2 D'` |
| `pll-h` | H perm | Edges only | `(UB UF) (UL UR)` | `M2 U M2 U2 M2 U M2` |
| `pll-ja` | Ja perm | Adjacent corner swap | `(UB UL) (UBL UBR)` | `R' U L' U2 R U' R' U2 R L` |
| `pll-jb` | Jb perm | Adjacent corner swap | `(UBR UFR) (UF UR)` | `R U R' F' R U R' U' R' F R2 U' R'` |
| `pll-na` | Na perm | Diagonal corner swap | `(UBR UFL) (UL UR)` | `R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'` |
| `pll-nb` | Nb perm | Diagonal corner swap | `(UBL UFR) (UL UR)` | `R' U R U' R' F' U' F R U R' F R' F' R U' R` |
| `pll-ra` | Ra perm | Adjacent corner swap | `(UB UL) (UBR UFR)` | `R U' R' U' R U R D R' U' R D' R' U2 R'` |
| `pll-rb` | Rb perm | Adjacent corner swap | `(UBR UFR) (UF UL)` | `R2 F R U R U' R' F' R U2 R' U2 R` |
| `pll-t` | T perm | Adjacent corner swap | `(UBR UFR) (UL UR)` | `R U R' U' R' F R2 U' R' U' R U R' F'` |
| `pll-ua` | Ua perm | Edges only | `(UF UR UL)` | `R U' R U R U R U' R' U' R2` |
| `pll-ub` | Ub perm | Edges only | `(UF UL UR)` | `R2 U R U R' U' R' U' R' U R'` |
| `pll-v` | V perm | Diagonal corner swap | `(UB UR) (UBL UFR)` | `R' U R' U' R D' R' D R' U D' R2 U' R2 D R2` |
| `pll-y` | Y perm | Diagonal corner swap | `(UB UL) (UBL UFR)` | `F R U' R' U' R U R' F' R U R' U' R' F R F'` |
| `pll-z` | Z perm | Edges only | `(UB UR) (UF UL)` | `M' U M2 U M2 U M' U2 M2` |

---

## 8. Tests and measured results

| File | What it covers |
|---|---|
| `tests/tutor-edge-coords.test.ts`, `tutor-cross-search.test.ts` | Move table agrees with the cube engine; cross search is optimal and never exceeds 8 turns |
| `tests/tutor-f2l-cases.test.ts`, `tutor-last-layer-cases.test.ts` | Every table algorithm does what its entry says; the 41 F2L cases are distinct and complete |
| `tests/tutor-oll-cases.test.ts`, `tutor-pll-cases.test.ts` | Full last-layer tables (see "Full last-layer tables" below) |
| `tests/tutor-cfop-full-last-layer.test.ts` | Every one of the 57 + 21 cases is set up directly and recognised, from every side |
| `tests/tutor-full-last-layer-coach.test.ts` | Full last-layer plans pass the coach's facts parser and move guardrail |
| `tests/tutor-engine.test.ts` | Replay, advance check (a plan that does not advance throws), regrips, checkpoint, loop guard |
| `tests/tutor-cfop-*.test.ts`, `tutor-beginner-*.test.ts`, `tutor-orient-corners.test.ts` | Each stage with hand-made cubes (a case is set up by undoing its algorithm) |
| `tests/tutor-beginner-facts.test.ts`, `tutor-cfop-facts.test.ts` | After the setup moves, the cube looks the way `facts.lookFor` and the case recognition say |
| `tests/tutor-api.test.ts` | Public API, case-id lists, purity of `src/tutor` (imports and determinism) |
| `tests/tutor-scrambles.test.ts` | Fixed-seed scramble suite |

The scramble suite uses 30-move random scrambles from a seeded generator (seed 2026). For every
scramble and both methods it checks that the solve finishes, that every step starts from the
previous state, replays exactly to `expectedState`, raises progress and never goes back a stage,
and that the set of case ids seen equals `CASE_IDS` exactly (every table case is triggered).

CFOP runs twice, with the 2-look and with the full last layer (`cfop-full`). For the full run the
suite also checks that the cross and F2L turns equal the 2-look run's, that no solve has more
than one `oll`, one `pll` and one `auf` step, and that every case id seen is in the tables. A
1-in-216 case can be missing from 1,000 random scrambles, so "every case is triggered" is
asserted for `cfop-full` only at soak size; the default suite proves it another way (below).

- `npm test` runs **1,000** scrambles per method and variant (about 7 s).
- `npm run test:tutor-soak` runs **10,000** each (about 95 s) and prints the report below.

**Full last-layer tables.** The table tests do not take the tables' word for anything:

- *Each algorithm does its case.* Undoing an OLL algorithm on a solved cube gives exactly the
  entry's `pattern`, and the algorithm turns the top yellow from that pattern with the top pieces
  in two different orders. A PLL algorithm does exactly the entry's `cycles` (up to a last top
  turn) and solves its case from every side.
- *Each case is the one its number or name says.* A hand-written sheet in the test lists, per OLL
  number, which yellow edges are on top (none / two adjacent / a line / all) and how many yellow
  corners; per PLL name, what moves (corner 3-cycle, adjacent or diagonal corner swap, two corner
  swaps; edge 3-cycle, adjacent or opposite edge swap, two swaps). Patterns and cycles must agree.
- *Recognition text is true.* A test helper reads the yellow stickers (OLL) or the bars,
  headlights and blocks (PLL) off the cube, and the entry's `recognition` must end with exactly
  that description.
- *Complete and without duplicates.* All yellow patterns a last layer can show are enumerated by
  search from the solved cube using only the 2-look algorithms: 216 patterns, 58 up to turns of
  the top; the table covers each exactly once except the finished top. Likewise all 288
  arrangements of a yellow top fall into 22 classes up to top turns before and after; the PLL
  table covers each exactly once except the solved one.
- *The planner finds each case.* `tutor-cfop-full-last-layer.test.ts` sets up every OLL case
  after each top turn on a randomly chosen (seeded) arrangement of the top pieces, and every PLL
  case with each of the 16 combinations of top turns before and after; the plan must carry that
  case's id, algorithm and recognition, and the cube after the line-up turn must show the entry's
  pattern. Every OLL case is also solved to the end on all 21 arrangements (1,197 solves, at most
  three steps each).

### 8.1 Soak results (10,000 scrambles per method and variant, seed 2026, 2026-11-17)

All 30,000 solves completed; every step advanced; every case id was triggered (for the full last
layer: all 125 ids, including each of the 57 OLL and 21 PLL cases).
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

**CFOP (full last layer)** — average **62.3** turns, maximum **87**; average 8.2 steps, maximum 11.
The same scrambles as the 2-look run, so cross and F2L are identical; the last layer takes 25.3
turns on average instead of 38.6.

| Stage | Average turns | Maximum turns |
|---|---:|---:|
| `cross` | 5.8 | 8 |
| `f2l` | 31.2 | 54 |
| `oll` | 10.6 | 16 |
| `pll` | 14.0 | 21 |
| `auf` | 0.7 | 1 |

Stage turns include the line-up turn of the top before the algorithm.

---

## 9. Known limits

- The beginner's corner stages trade move count for a single trigger; the 5-round case (20
  turns) could be replaced by a second, mirrored trigger if the student finds it tedious.
- The CFOP cross is one step of up to 8 turns; it is not split per edge.
- F2L always works at the front-right slot (with `y` regrips) and uses algorithms in R, U and F
  only; there are no left-slot or back-slot variants.
- The engine assumes the standard color scheme and a physically valid cube; validate a scan with
  `validateCubeState` before planning.
- The full last-layer tables hold one rotation-free algorithm per case. Some (A perms, E perm)
  use back-face turns where speedcubers would regrip; alternative algorithms per case and
  left-handed mirrors are not offered.
- OLL nicknames follow common algorithm sheets; several cases have more than one nickname in use.
- The coach has no case notes of its own for `oll-01` … `oll-57` and `pll-aa` … `pll-z`, nor stage
  notes for `oll` and `pll`, yet; its templates fall back to the plan's facts, which is tested.
