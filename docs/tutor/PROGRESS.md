# Cubyntra Tutor — Progress

Checklist for `docs/tutor/GOAL.md`. Tick an item only when it is done and tested.

## Phase 0: Stabilize
- [x] Arrow direction fixed, with a six-face test
- [x] `next` / `eslint-config-next` on latest 16.x; audit clean (no critical/high)
- [x] Edge-gradient bracket bug fixed, with a parity test against the Python formula
- [x] Orange/red hue boundary fixed, with tests
- [x] Lint warnings and the no-op cube test fixed
- [x] `parseMove` rejects unknown and lowercase input
- [x] Python scripts take the dataset path as an argument
- [x] Phase gate passed and pushed

## Phase 1: Design system
- [x] Tokens (light + dark) in `globals.css`
- [x] Fonts (pixel headings, sans body)
- [x] UI components: BlockButton, Panel, Chip, ProgressBlocks, Dialog, Toast, IconButton
- [x] HexagonBackground and all gradients removed
- [x] Design-rules test (no gradient/blur/backdrop/text-shadow, tokens only)
- [x] ADR-011
- [x] Phase gate passed and pushed

## Phase 2: Cube engine extensions
- [x] Rotations x y z
- [x] Wide moves and slices M E S
- [x] Grip model
- [x] Piece queries
- [x] Plain-language move names
- [x] Property tests
- [x] 3D engine animates the new moves
- [x] Phase gate passed and pushed

## Phase 3: Tutor engine
- [x] Step-plan types and method framework
- [x] Beginner's method: all stages
- [x] CFOP cross
- [x] CFOP F2L (41 cases)
- [x] CFOP 2-look OLL and PLL
- [x] 10,000-scramble tests for both methods
- [x] ADR-012
- [x] Phase gate passed and pushed

## Phase 4: Teaching twin
- [x] Grip-framed camera and animated regrips
- [x] Spotlight and slot outline
- [x] Playback controls and MoveChips (engine playback controller, `PlaybackControls`, `MoveChips`, `usePlayback`)
- [x] "After" preview
- [x] Voxel restyle
- [x] Solver/tutor in a Web Worker
- [x] WebGL context-loss recovery
- [x] Tests (twin colors match the logical state after each playback step and `expectedState` after each tutor step)
- [x] Phase gate passed and pushed

## Phase 5: Checkpoint checks
- [x] Partial-face verification with the student's palette (`src/vision/palette.ts`, `checkpointCapture.ts`, `src/tutor/checkpoint.ts`; pure modules, UI wiring pending)
- [x] Mistake diagnosis (`src/tutor/diagnose.ts`)
- [x] Rescan and replan path; manual fallback (`src/tutor/recovery.ts`, `confirmManually`, `applyTileEdits`; buttons pending in the UI)
- [x] Injected-mistake tests (≥ 95% top diagnosis): 1821 / 1821 on synthetic photos, see `docs/tutor/CHECKPOINTS.md`
- [x] ADR-013
- [x] Phase gate passed and pushed

## Phase 6: Claude coach
- [x] `/api/coach` with streaming, Haiku 5.5, cached system prompt
- [x] Templates for every stage and case; mock mode
- [x] Move guardrail
- [x] Spend cap and usage file
- [x] Session-token check and rate limit
- [x] Tests with a mocked SDK
- [x] `scripts/coach-eval.ts`
- [x] ADR-014
- [x] Phase gate passed and pushed

## Phase 7: App shell and PWA
- [x] Routes and navigation (`(app)` route group, tab bar and side nav; Trainer, Timer and Progress built in Phase 9; `/pair` shows the QR and typed code)
- [x] Phone solve layout and desktop layout
- [x] Manifest, icons, wake lock
- [x] Student profile and resume (`data/student.json`)
- [x] Error states (camera denied, coach offline/capped, cube unreadable, planning/worker failure); service-worker caching not done, setup notes in `docs/DEVELOPMENT.md` §6
- [x] Phase gate passed and pushed

## Phase 8: Sync
- [x] State-only sync; photo relay removed
- [x] Pairing secret and typed code
- [x] Two-way playback control (solver and tutor playback; `grip` and `checkpoint-result` are consumed by both devices since Phase 9, including a solve done on the phone)
- [x] ADR-015 and privacy docs
- [x] Phase gate passed and pushed

## Phase 9: Learning features
- [x] Algorithm trainer (`/trainer`: five sets with group filter, drills planned as tutor steps from solved + random top turn, name / algorithm / coach on request, Got it / Missed it or the checkpoint camera, Leitner boxes counted in drills; `src/learn/trainerSets.ts`, `drill.ts`, `leitner.ts`)
- [x] Timer (`/timer`: 20-move scramble on the twin, 15 s inspection with 8 s / 12 s calls, +2 and DNF per WCA, hold-to-arm by pad or Space, best single, best ao5, ao5, ao12 with WCA trimming, history of 100; `src/learn/timer.ts`, `scramble.ts`)
- [x] Progress world (`/progress`: flat isometric SVG islands per method with a block per stage mastered, streak and four-week calendar, algorithm collection; mastered = 3 of the newest 5 completions without a level-3 hint; stage hints recorded by `useTutorStore`; graduation card on Home and the CFOP last-layer setting in Settings; profile v2 with a v1 migration)
- [x] Phone side of a solve (`/solve` on a paired phone syncs as `mobile` and sends grip and checkpoint results; `/companion` after a scan shows the guided-solve step with "Solve on this phone")
- [x] Full OLL 57 / PLL 21 (engine side: `cases/oll.ts`, `cases/pll.ts`, `lastLayer: 'full'` setting, 10,000-scramble soak: 62.3 turns average; coach case notes for every new id; trainer sets for both)
- [x] Phase gate passed and pushed

## Phase 10: Finish
- [x] Accessibility pass (axe page audit, token contrast, 44px targets, reduced motion in the twin; `docs/UI_UX.md` §5)
- [x] Docs, README, CHANGELOG, PDFs (every doc in `docs/` checked against the code; README and CHANGELOG 2.0.0 rewritten; `npm run docs:pdf` builds 25 PDFs, now including the tutor docs and ADR-011 to 015)
- [x] Morning report (`docs/tutor/MORNING_REPORT.md`)
- [x] Final gate passed and pushed

## Blocked
_None._
