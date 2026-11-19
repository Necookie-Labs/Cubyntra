# Cubyntra Tutor — Goal for Autonomous Build

Approved by the project owner on 2026-11-17. This file is the single source of truth for the
tutor rebuild. `docs/tutor/PROGRESS.md` tracks the checklist.

## Objective
Turn Cubyntra into a **local, single-student Rubik's Cube tutor**, delivered as a PWA running on
localhost:
- The student scans their cube with their phone.
- A 3D twin shows their exact cube and animates each step of either the **beginner's method** or
  **CFOP**.
- An AI coach (Claude) explains each step in plain language.
- **Checkpoint scans** confirm the student did each step correctly.
- The whole app gets a **light-green voxel redesign** with flat colors only.

## Locked decisions (do not revisit)
| Area | Decision |
|---|---|
| Platform | PWA in the existing Next.js 16 app. No native app, no monorepo. |
| Runtime | Must run well on localhost (`npm run dev` over HTTPS for phone camera access; `npm run build && npm start`). *Amended by Phase 13 / ADR-017:* it may also be hosted on the owner's home server behind Cloudflare Tunnel + Access; localhost stays the default and is unchanged. |
| Users | One local student. No accounts or auth. Profile and progress live in `data/student.json` on the laptop (`/data/` is gitignored), read and written through API routes. *Amended by Phase 13:* in the hosted modes, each allow-listed person has their own `data/students/<slug>.json`. |
| Methods | **Beginner's:** white cross on top, then an animated flip so white is on the bottom. **CFOP:** white on the bottom throughout; 2-look OLL/PLL first, full 57 OLL / 21 PLL in Phase 9. |
| Moves | A deterministic tutor engine picks **every** move. Claude never decides moves. |
| Privacy | No photos leave the device that took them. Phone↔laptop sync sends cube states only. The photo relay routes are deleted. |
| AI | `@anthropic-ai/sdk`, model **`claude-haiku-5-5`**, effort `low`, streaming. API key only in `.env.local` (`ANTHROPIC_API_KEY`), used only on the server. Hard spend cap **$10/month**, tracked in `data/coach-usage.json`. |
| Design | Light-green voxel style, flat colors, **no gradients, blur, glow, glass or text-shadow**. Original voxel style: no Minecraft names, logos, textures or fonts. |
| Audience | English, plain language suitable for ages 10+. Coach tone: encouraging and concise. |

## Non-goals
Hosting, accounts, multiple users (all three now in scope only as Phase 13 describes: one home
server, two allow-listed people, no sign-up), teacher dashboards, native apps, Bluetooth smart cubes,
tracking moves from live video, languages other than English.

## Phases and acceptance criteria
Every phase ends with **`npm run lint` (0 errors, 0 warnings), `npm run typecheck`, `npm test` and
`npm run build`** all passing, followed by a push of `feat/tutor`.

### Phase 0: Stabilize
- Fix the reversed guidance arrows (`src/three/arrows.ts`). Add a test asserting that the arrow for
  a clockwise move sweeps clockwise when seen from outside the face, for all six faces, and
  counter-clockwise for primes.
- Upgrade `next` and `eslint-config-next` to the latest 16.x patch release. `npm audit --omit=dev`
  must report no critical or high issues.
- Fix the edge-gradient bracket bug (`src/vision/ml/featureExtractor.ts`: divide both terms by
  255) and add a test that matches the Python formula in `scripts/extract_dataset_features.py`.
- Fix the orange/red hue boundary in `src/vision/color.ts` so RGB (201,82,58) classifies as
  orange, with a test (red stickers must still classify as red).
- Fix all existing lint warnings and the no-op assertion at `tests/cube.test.ts:57`.
- `parseMove` throws on unknown or lowercase input until Phase 2 adds wide moves.
- Python scripts: no hard-coded personal paths (take the dataset path as an argument).

### Phase 1: Design system
- Tokens in `src/app/globals.css` on `:root`, with a dark variant: background mint `#EAF4E2`
  (dark: deep moss `#16210F`), primary leaf `#5FA83A`, primary edge `#3F7A24`, ink moss `#2E4A22`,
  panel cream `#F7F3E3`, flat cube colors. 8px spacing grid, 2px and 4px borders, hard offset
  shadows (`4px 4px 0` in an ink tint) with zero blur.
- Type: a pixel display font for headings only (Pixelify Sans via `next/font`), a readable sans for
  body text.
- Components in `src/components/ui/`: `BlockButton` (darker bottom edge, pressed down 2px),
  `Panel`, `Chip`, `ProgressBlocks`, `Dialog` (role, focus trap, Escape), `Toast`, `IconButton`
  (accessible name required).
- Motion: quick steps with a little overshoot; respect `prefers-reduced-motion`.
- Remove `HexagonBackground` and every gradient.
- Automated check: a test scans `src/**/*.{css,tsx}` and fails on `gradient(`, `blur(`,
  `backdrop-filter` or `text-shadow`, and on hex colors outside the token list.
- ADR-011: voxel design system, superseding the visual direction of ADR-008.

### Phase 2: Cube engine extensions (`src/cube`)
- Whole-cube rotations `x y z`, wide moves `r u f l d b` and `Rw`-style, slices `M E S`, each with
  `'` and `2`; supported by `parseAlgorithm`, `applyMove`, `invertMove`.
- Grip model: which color is on top and which faces the student. Instructions are relative to the
  grip.
- Piece queries: `findEdge(colors)`, `findCorner(colors)`, `isPieceSolved`, `isCrossSolved`,
  `isF2LSlotSolved`, `isLayerSolved`.
- Plain-language name for every move ("turn the right side up").
- Property tests: inverse undoes, order-4 (or 2) returns to start, `x` matches `R M' L'`,
  hand-written sticker permutation check for each new move.
- The 3D engine animates rotations, wide moves and slices.

### Phase 3: Tutor engine (`src/tutor/`, no DOM or Three.js imports)
- Methods are data: stages, each with a detector, a planner and a check spec.
- Step plan type: `{ method, stage, caseId, caseName, grip, setupMoves, algorithm,
  highlightPieces, expectedState, checkpoint: { facesToShow[], stickers[] } }`.
- Beginner's: daisy / white cross on top → white corners → flip → middle edges → yellow cross →
  yellow edges → position yellow corners → orient yellow corners.
- CFOP: cross on the bottom (search, ≤ 8 moves) → F2L ×4 (41-case table plus setup/regrip) →
  2-look OLL → 2-look PLL.
- Every plan is replayed on the logical cube before it is returned; a plan that does not advance
  the stage throws.
- Tests: fixed-seed 10,000-scramble run per method solves to completion; every step advances;
  every table case is triggered at least once; average and maximum move counts recorded.
- ADR-012: deterministic tutor engine, Claude as explainer only.

### Phase 4: Teaching twin (`src/three`)
- Camera framed to the grip; regrips animated.
- Spotlight: plan pieces at full color, others faded (originally specified as 35% opacity; built as a solid wash toward the panel color, because see-through pieces made the cube unreadable); flat outline on the target slot.
- Controls: play, step forward/back, 0.5× speed, loop. `MoveChips` highlights the current move in
  sync with the animation.
- Faded "after" preview of the expected state.
- Voxel restyle: flat per-face tones, chunky arrows.
- Solver/tutor initialization in a Web Worker so the main thread never blocks.
- WebGL context loss handled with a rebuild.
- Tests: twin colors match `expectedState` after each step plays; three-motion tests extended to
  the new moves.

### Phase 5: Checkpoint checks (`src/vision` + `src/tutor/checkpoint.ts`)
- Reuse the per-student color palette from the full scan.
- Compare only the check-spec stickers, each with a confidence; low confidence → "show me again".
- On mismatch, search mistakes (wrong direction, skipped move, doubled move, wrong face, wrong
  grip) and return the ones consistent with the observation, ranked.
- Nothing matches → full rescan → fresh plan from the observed state.
- Manual "it matches" button plus tile editing as fallback.
- Tests: synthetic images from expected states with injected mistakes; the injected mistake is the
  top diagnosis in ≥ 95% of cases.
- ADR-013: checkpoint verification.

### Phase 6: Claude coach
- `POST /api/coach`, streaming.
- Fixed, cached system prompt (curriculum, tone, rules) + facts JSON (step plan, hint level 1 =
  what to look for / 2 = why it works / 3 = exact moves, attempt history, diagnosis).
- `claude-haiku-5-5`, effort `low`, `max_tokens` 400. System prompt longer than the model's minimum
  cacheable size; log `cache_read_input_tokens`.
- Guardrails: the prompt forbids inventing moves; a post-check rejects any move notation not in the
  plan and swaps in a template; refusals and errors also swap in the template.
- Every stage and case has a built-in text template. No key → coach mode `"mock"` (templates only).
  **The build never makes real API calls.**
- Spend: cost from `usage` × price table, saved to `data/coach-usage.json`; at the $10/month cap,
  switch to templates and show a notice.
- Only requests with the local session token are served; rate limit 30 requests/minute.
- Tests with a mocked SDK: request shape, move guardrail, cap cutoff, template fallback, token
  rejection.
- `scripts/coach-eval.ts` with ~50 recorded step situations; runs only when invoked with a key.
- ADR-014: Claude integration.

### Phase 7: App shell and PWA
- Routes: `/` home and method picker, `/scan`, `/solve`, `/trainer`, `/timer`, `/progress`,
  `/pair`, `/settings`.
- Phone-first portrait solve layout (twin, move chips, controls, coach text, Hint, I did it).
  Desktop layout: big twin plus side panels.
- `app/manifest.ts`, icons, standalone display, Screen Wake Lock during solving. Read
  `node_modules/next/dist/docs/` for the Next 16 approach first.
- Service-worker caching is a stretch goal (needs a cert the phone trusts); setup notes in
  `docs/DEVELOPMENT.md`.
- Interrupted solves resume from `data/student.json`.
- Error states: camera denied, coach offline, cap reached, cube unreadable.

### Phase 8: Phone ↔ laptop sync (localhost)
- State-only messages over the existing event-stream pattern: cube state, step, playback, grip.
- QR pairing carries a random 128-bit secret (`crypto.randomUUID`), plus a 6-character typed code.
  Every sync and coach route checks it.
- `preferredId`, photo upload and image storage removed; sessions expire; session count capped.
- Laptop mirrors the phone; either device can control playback.
- ADR-015 (state-only sync, amends ADRs 009/010, restores ADR-001); update `SECURITY_PRIVACY.md`
  and `AGENTS.md`.

### Phase 9: Learning features
- Trainer: case on the twin → recognize → do → check; missed cases come back more often.
- Timer with 15 s inspection and personal bests.
- Progress world: a voxel block per stage mastered, streaks, algorithm collection.
- Graduation: beginner's mastered → suggest CFOP with 2-look last layer.
- Full OLL 57 / PLL 21, covered by the Phase 3 test pattern.

### Phase 10: Finish
- Accessibility: labels on every control, focus-trapped dialogs, color-blind letters option, AA
  contrast.
- `/docs` match the code (no unbacked claims); README and CHANGELOG updated; PDFs regenerated.
- `docs/tutor/MORNING_REPORT.md`: what was built, test counts, known gaps, what to check by hand
  (real camera, real phone, the look, a live Claude key).

### Phase 11: Voice tutoring (added 2026-11-18, approved by the owner)
The tutor speaks, so the student can keep their eyes and hands on the cube.
- **Fallback chain**, chosen in Settings: ElevenLabs → device voice (the browser's built-in
  speech, free and offline) → off. Any failure, a missing key or the cap drops to the next layer.
- **Speak only guard-approved text.** Voice reads what the coach panel shows after the move
  guardrail, never raw model output. Moves are spoken as plain-language names ("turn the right
  side up"), or "R prime" style for students who chose notation.
- **ElevenLabs** through a server route on the laptop: key only in `.env.local`
  (`ELEVENLABS_API_KEY`, optional `ELEVENLABS_VOICE_ID`), Flash model, a stock voice (no cloned
  voices). Only text is sent, never images or student data.
- **Phrase bank:** the fixed lines (move names, stage intros, checkpoint and praise lines) are
  generated once and cached in `data/voice/`, so step narration costs nothing after the first
  ~2,500 credits. Claude's free-form replies use the device voice unless the student taps
  "Read with ElevenLabs".
- **Credit cap:** characters sent are counted in `data/voice-usage.json`; default cap 20,000
  credits/month (`ELEVENLABS_MONTHLY_CREDIT_CAP`), a warning at 80%, the device voice at the cap.
  The real remaining balance is read from ElevenLabs when a key is set.
- **One speaker:** when the phone and laptop are paired, only the device being solved on speaks.
- **Tests** use a fake ElevenLabs; the build never calls the real service. ADR-016.

### Phase 12: User-flow audit (added 2026-11-18)
Every route through the app is walked as a student would: first run, demo solve, real scan,
each checkpoint outcome, resume after reload, solve another, trainer, timer, progress,
settings, pairing, errors, back/forward navigation, phone and desktop. Rough edges are fixed with
regression tests; flows are documented in `docs/UI_UX.md`.

### Phase 13: Hosting (added 2026-11-19, approved by the owner)
For a presentation on 2026-11-21, Cubyntra is hosted at `https://cubyntra.necookie.dev` for two
people (the owner and Kiko). Laptop use must keep working exactly as before. ADR-017.
- **Where:** the owner's Linux home server runs `next start -p 3001 -H 127.0.0.1` under systemd;
  a Cloudflare Tunnel publishes it; Cloudflare Access (email allowlist, one-time PIN) protects it.
- **Auth modes** (`CUBYNTRA_AUTH_MODE`): `local` (default, unchanged), `cloudflare-access` (every
  API request carries a `Cf-Access-Jwt-Assertion` JWT verified with `jose`: RS256, cached JWKS,
  `aud`, `iss`, expiry; identity = `email`; optional `CUBYNTRA_ALLOWED_EMAILS`; loopback never
  trusted) and `passcode` (fallback: name + `CUBYNTRA_ACCESS_CODE`, signed HttpOnly cookie, 7
  days, constant-time compare, rate limited, sign-out). Unknown values fail closed.
- **One identity layer:** `getRequestUser` / `guardUser` on every guarded route; hosted modes get
  a per-user `x-cubyntra-token` (HMAC of the user id) that must match the requester.
- **Per-person profiles** in `data/students/<slug>.json` (safe slug + hash, tested); locks, caps
  and batch ids per file. **Coach and voice spend caps stay global and shared** (one wallet).
- **Pairing per person:** sessions belong to their creator; the phone passes Access with the same
  email; `companionUrl` uses `PUBLIC_ORIGIN`. Session cap and expiry unchanged.
- **Rate limits per user**, hosted security headers through `src/proxy.ts`, `GET /api/health`
  (`{ ok, mode, version }`, no key status), a deploy kit in `deploy/`, `.env.example` for every
  variable.
- **Tests** with a local RSA key pair and a stubbed `fetch` for the JWKS; no network.

## Execution rules
1. Work on `feat/tutor`. Never commit to `main`, never force-push, never rewrite pushed history.
2. **Micro-commits**: one small working change per commit (a function plus its test, one component,
   one doc fix), Conventional Commits in the existing style. Each commit typechecks and passes the
   affected tests. Docs and ADRs are updated alongside the code they describe.
3. The full gate (lint, typecheck, test, build) runs at the end of each phase, then
   `git push origin feat/tutor`. No merge, no PR (the owner opens it).
4. Keep `docs/tutor/PROGRESS.md` current; tick an item only when it is done and tested.
5. Blocked after 3 honest attempts → record it under "Blocked" in `PROGRESS.md` with what was
   tried, then move on. Never fake a passing test, skip or delete tests to get green, or loosen a
   check.
6. New dependencies: `@anthropic-ai/sdk`, plus small focused libraries only when clearly needed
   (say why in the commit). No UI kits; no CSS frameworks beyond the existing Tailwind.
7. `src/cube` and `src/tutor` stay free of DOM and Three.js imports. No real Claude API calls, no
   network calls in tests, nothing written outside the repo or `data/`.
8. Never commit `docs/milestone-*` (owner's untracked files), `data/`, or `.env*`.
9. Builders: Fable 5 for Phases 3, 5 and the full OLL/PLL tables; Opus for everything else.

## Definition of done
- Every item in `PROGRESS.md` is ticked, or listed as blocked with a reason.
- All four gates pass on the final commit, and `feat/tutor` is pushed.
- A guided solve with both methods completes through the tutor engine in tests.
- `npm run build && npm start` serves every route without errors.
- `docs/tutor/MORNING_REPORT.md` is written.
