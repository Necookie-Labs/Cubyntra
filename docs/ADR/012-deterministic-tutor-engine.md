# ADR-012: Deterministic Tutor Engine, Claude as Explainer Only

**Status**: Accepted
**Date**: 2026-11-17
**Deciders**: Necookie Labs Core Engineering Team
**Related**: [ADR-002](002-cube-state-model.md) (logical cube state), [ADR-004](004-solver-selection.md) (Kociemba solver), `docs/tutor/GOAL.md` Phase 3, `docs/tutor/METHODS.md`

---

## Context

Cubyntra is becoming a tutor: it must walk one student through the beginner's method or CFOP,
one small step at a time, on the cube in their hands. Three sources could decide the moves:

1. **The existing Kociemba solver.** It returns a 20-move solution that teaches nothing: no
   stages, no reusable algorithms, no step a person could explain.
2. **The language model.** Claude could be asked "what should the student do next?". A model
   can state a wrong move with full confidence, cannot be exhaustively tested, costs money per
   step, and would make the app unusable without a key or over the monthly cap.
3. **A deterministic engine** that encodes the two human methods as data and computes each step
   from the cube state.

A wrong move is the worst thing a tutor can do. The student trusts it, the cube gets further
from solved, and a ten-year-old cannot tell whose mistake it was.

## Decision

### 1. A deterministic engine picks every move
`src/tutor/` plans every step. It is pure TypeScript with no DOM, Three.js, React, solver or
network imports and no randomness or clock, so the same state, method and grip always give the
same plan, in the browser, in a worker, or in a test. A test scans the module's imports to keep
it that way.

### 2. Claude only explains
Each plan carries plain facts (`goal`, `lookFor`, `why`, the case name, the pieces involved).
Phase 6 hands those facts to Claude to phrase for the student, and rejects any reply containing
move notation that is not in the plan. With no API key, or at the spend cap, the same facts feed
fixed templates. The solve never depends on the model.

### 3. Methods are data
A method is an ordered list of stages. A stage has a detector (`isComplete`), a planner (`plan`),
a monotone progress measure and a check spec. Algorithms live in case tables
(`src/tutor/cases/`): 41 F2L cases, 2-look OLL (3 + 7) and 2-look PLL (2 + 4), each with an id, a
name, recognition text and notation. Full OLL/PLL (Phase 9) adds rows and a variant of the
CFOP method that uses them (see the addendum).

### 4. Every plan is replayed before it is returned
The engine applies `setupMoves` then `algorithm` to the logical cube and requires the result to
be strictly further along the method (`stageIndex * 1000 + withinStage`). A plan that does not
advance, or that turns nothing, throws `TutorPlanError` instead of reaching the student. The
replayed state is the plan's `expectedState`, so the twin, the checkpoint check and the coach all
work from a state that is known to be reachable.

### 5. Cases are recognised by construction
No planner matches hand-written sticker patterns:
- the F2L index is built by undoing each table algorithm on a solved cube (149 positions);
- last-layer cases and beginner steps are found by trying the standard sequences on a copy and
  keeping the one that reaches the stage goal;
- the cross and the daisy use searches whose move table is generated from the cube engine.

So a table entry cannot claim to solve a case it does not solve, and recognition cannot drift
from the algorithms.

### 6. Small steps, grips included
One piece or one algorithm per step. Plans are written for the grip the student is holding;
regrips are rotation moves at the start of `setupMoves` (the beginner's flip is `z2`), never
steps of their own.

## Alternatives considered

| Option | Why not |
|---|---|
| Kociemba solution cut into chunks | Not a human method; nothing to learn or explain |
| Claude chooses moves, engine verifies | Still needs the engine; adds latency, cost and a failure mode at every step |
| Hand-written pattern predicates per case | 41 + 16 patterns to get right by eye; mistakes show up only on rare cubes |
| One step per stage | Too long to follow or to check with the camera |

## Consequences

**Good**
- Correctness is tested, not hoped for: 10,000 fixed-seed scrambles per method solve to
  completion with every step replaying and advancing, and every table case is triggered
  (`npm run test:tutor-soak`; results in `docs/tutor/METHODS.md`).
- Works offline, without a key, and at zero cost per step. Planning takes a few milliseconds.
- The coach prompt can be small: it explains a given step instead of reasoning about a cube.

**Costs**
- Solutions are longer than a solver's: about 76 turns for CFOP and 156 for the beginner's
  method on average. That is the price of teaching a method a person can repeat.
- New methods or case sets mean new tables and planners, not a prompt change.
- The beginner's last stage leaves the lower layers shuffled between steps, so its detector has
  to recognise those cubes explicitly (documented in `METHODS.md`).
- The engine assumes a valid cube with the standard color scheme; a scan must pass
  `validateCubeState` first.

---

## Addendum (2026-11-17, Phase 9): method options and the full last layer

**Context.** Full OLL (57 cases) and PLL (21 cases) are a second way of doing the same CFOP
stages, for a learner who has outgrown 2-look. They must not change what a 2-look learner sees,
and the choice has to reach the engine from the solve screen, through the worker, and survive a
recovery replan.

**Decision.**

1. **Learner settings are a `MethodOptions` object, not new method ids.** `MethodId` stays
   `'beginner' | 'cfop'`. Every engine entry point (`planNextStep`, `currentStage`, `progress`,
   `runGuidedSolve`, `getMethod`, `replanFromScan`, the three `tutor.*` worker jobs) takes an
   optional `options` last; the one setting so far is `lastLayer: '2-look' | 'full'`. Missing,
   `{}` and `'2-look'` are the same thing and give the plans they always gave.
2. **A setting selects a variant definition.** `getMethod('cfop', { lastLayer: 'full' })` returns
   `CFOP_FULL_METHOD`: the same cross, F2L and final-turn stage objects, with stages `oll` and
   `pll` in place of the four 2-look stages. Methods are still plain data; the engine's replay
   and advance check apply unchanged.
3. **A plan remembers its settings.** `StepPlan.options` is present only when the settings differ
   from the defaults (so default plans are byte-for-byte what they were). Recovery replans with
   `plan.options`, because stage indexes and progress values differ between variants.
4. **Case ids are disjoint between variants** (`oll-01`…`oll-57`, `pll-aa`…`pll-z` against
   `oll-edges-*`, `oll-corners-*`, `pll-corners-*`, `pll-edges-*`), so an id always names one
   algorithm. `caseIdsOf(method, options)` lists a variant; `allCaseIds()` lists them all.
5. **Recognition by construction still holds** (decision 5): the planner tries each table
   algorithm after each top turn and keeps the one that finishes the stage. The tables also carry
   each case's definition (`pattern` for OLL, `cycles` for PLL), and tests check algorithm against
   definition, definition against a hand-written sheet of what each standard case looks like,
   and the tables against an enumeration of every last-layer state (57 of 58 orientation classes,
   21 of 22 permutation classes, each exactly once).
6. **No rotations inside table algorithms**, keeping decision 6: where the common algorithm for a
   case begins with a cube rotation, a rotation-free algorithm for the same case is used.

**Alternatives considered.**

| Option | Why not |
|---|---|
| A third method id (`cfop-full`) | Coach, store, sync and saved progress all key on the method; a learner changing one setting would look like a different method |
| Replace 2-look outright | 78 algorithms is the wrong first step for a beginner; 2-look stays the default |
| A module-level setting | The engine must stay a pure function of its arguments (decision 1) |
| Always put `options` on the plan | Changes every stored and compared default plan for no benefit |

**Consequences.** 10,000 fixed-seed scrambles solve with the full last layer in 62.3 turns on
average (87 at most) against 75.7 (106) for 2-look, with all 78 cases triggered. The coach needs
case notes for the 78 new ids and stage notes for `oll` and `pll`; until then its templates use
the plan's own facts, and a test keeps that path working.
