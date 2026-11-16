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
- [ ] Phase gate passed and pushed

## Phase 7: App shell and PWA
- [x] Routes and navigation (`(app)` route group, tab bar and side nav; Trainer/Timer/Progress are layout shells for Phase 9; `/pair` opens the existing pairing dialog until Phase 8)
- [x] Phone solve layout and desktop layout
- [x] Manifest, icons, wake lock
- [x] Student profile and resume (`data/student.json`)
- [x] Error states (camera denied, coach offline/capped, cube unreadable, planning/worker failure); service-worker caching not done, setup notes in `docs/DEVELOPMENT.md` §6
- [x] Phase gate passed and pushed

## Phase 8: Sync
- [x] State-only sync; photo relay removed
- [x] Pairing secret and typed code
- [x] Two-way playback control (solver playback; `grip` and `checkpoint-result` are relayed but not consumed until the Phase 7 tutor screens)
- [x] ADR-015 and privacy docs
- [x] Phase gate passed and pushed

## Phase 9: Learning features
- [ ] Algorithm trainer
- [ ] Timer
- [ ] Progress world
- [x] Full OLL 57 / PLL 21 (engine side: `cases/oll.ts`, `cases/pll.ts`, `lastLayer: 'full'` setting, 10,000-scramble soak: 62.3 turns average; trainer UI and coach notes for the new ids still to come)
- [ ] Phase gate passed and pushed

## Phase 10: Finish
- [ ] Accessibility pass
- [ ] Docs, README, CHANGELOG, PDFs
- [ ] Morning report
- [ ] Final gate passed and pushed

## Blocked
_None yet._
