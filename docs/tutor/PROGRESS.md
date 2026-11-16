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
- [ ] Grip-framed camera and animated regrips
- [ ] Spotlight and slot outline
- [ ] Playback controls and MoveChips
- [ ] "After" preview
- [ ] Voxel restyle
- [ ] Solver/tutor in a Web Worker
- [ ] WebGL context-loss recovery
- [ ] Tests
- [ ] Phase gate passed and pushed

## Phase 5: Checkpoint checks
- [ ] Partial-face verification with the student's palette
- [ ] Mistake diagnosis
- [ ] Rescan and replan path; manual fallback
- [ ] Injected-mistake tests (≥ 95% top diagnosis)
- [ ] ADR-013
- [ ] Phase gate passed and pushed

## Phase 6: Claude coach
- [ ] `/api/coach` with streaming, Haiku 5.5, cached system prompt
- [ ] Templates for every stage and case; mock mode
- [ ] Move guardrail
- [ ] Spend cap and usage file
- [ ] Session-token check and rate limit
- [ ] Tests with a mocked SDK
- [ ] `scripts/coach-eval.ts`
- [ ] ADR-014
- [ ] Phase gate passed and pushed

## Phase 7: App shell and PWA
- [ ] Routes and navigation
- [ ] Phone solve layout and desktop layout
- [ ] Manifest, icons, wake lock
- [ ] Student profile and resume (`data/student.json`)
- [ ] Error states
- [ ] Phase gate passed and pushed

## Phase 8: Sync
- [ ] State-only sync; photo relay removed
- [ ] Pairing secret and typed code
- [ ] Two-way playback control
- [ ] ADR-015 and privacy docs
- [ ] Phase gate passed and pushed

## Phase 9: Learning features
- [ ] Algorithm trainer
- [ ] Timer
- [ ] Progress world
- [ ] Full OLL 57 / PLL 21
- [ ] Phase gate passed and pushed

## Phase 10: Finish
- [ ] Accessibility pass
- [ ] Docs, README, CHANGELOG, PDFs
- [ ] Morning report
- [ ] Final gate passed and pushed

## Blocked
_None yet._
