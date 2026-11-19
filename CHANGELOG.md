# Changelog

All notable changes to **Cubyntra** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **My cubes** (`/cubes`): every confirmed scan, from the webcam or the phone, is saved before the solve starts, named like "Scan · 19 Nov, 14:32" (a solved cube is not saved; a demo cube only with **Save this cube** on the solve screen). Newest first, the last 30 kept. Each cube shows a small flat net (letters when that setting is on), its date and source, with **Show the solution**, **Solve it with me** (a guided solve of that scramble with the Home method), an inline **Rename** and **Delete** after a confirmation. In the nav (Learn) and under More on Home.
- **Full-solution walkthrough** (`/cubes/[id]`): the whole solution of a saved cube on the 3D twin, by **Beginner's**, **CFOP** (with the last-layer setting) or **Fewest moves** (the Kociemba computer solution, labelled as such and split into parts of at most 8 moves), remembered per cube. A summary of moves and steps per stage, the selected step's facts, Previous / Next, a keyboard-navigable list of every step grouped by stage, **Play all** (each step to the end, then the next; pause, resume, stop; narrated when the voice is on) and **Copy all moves** (notation by stage). Deep links and reload work; an unknown id says so.
- **Hosting** ([ADR-017](docs/ADR/017-hosting-cloudflare.md), [`deploy/`](deploy/README.md)): Cubyntra can be served from a home server at `https://cubyntra.necookie.dev` behind a Cloudflare Tunnel and Cloudflare Access. `CUBYNTRA_AUTH_MODE` picks `local` (default, unchanged), `cloudflare-access` (every API request carries a verified `Cf-Access-Jwt-Assertion` JWT: RS256 via `jose`, cached JWKS, `aud`/`iss`/expiry, optional `CUBYNTRA_ALLOWED_EMAILS`; loopback never trusted) or `passcode` (`/signin` with a name and `CUBYNTRA_ACCESS_CODE`, a signed 7-day cookie, Sign out in Settings). Unknown values fail closed.
- **One identity layer** (`getRequestUser`, `guardUser`) on every guarded route, with per-user `x-cubyntra-token`s and per-user rate limits in the hosted modes.
- **Per-person profiles** in `data/students/<slug>.json` when hosted; pairing sessions belong to their creator; the QR link uses `PUBLIC_ORIGIN`. Coach and voice caps stay global and shared.
- **`GET /api/health`** (`{ ok, mode, version }`, no auth) and hosted security headers (HSTS, nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy) from `src/proxy.ts`.
- **Deploy kit**: systemd unit, cloudflared example config, a step-by-step for a fresh Ubuntu server with a smoke-test checklist, updates and backups; `.env.example` documents every new variable.
- **Voice tutoring** ([ADR-016](docs/ADR/016-voice-tutoring.md)): the tutor speaks. Settings → Voice picks Off (default), the device voice (browser speech, free and offline) or ElevenLabs (Flash v2.5, a stock voice, through the laptop), the speed, and moves in words ("turn the right side up") or as letters ("R prime"), with a Test voice button. On the solve screen a speaker button in the coach panel turns it on and off; the twin's moves are named as they play, new stages are introduced, checkpoint results are spoken, and finished coach replies are read with the device voice (only after the move guardrail), with "Read with ElevenLabs" in ElevenLabs mode. A new step interrupts; nothing plays before the first tap; when paired only the device driving the solve speaks.
- **`POST /api/voice`** and **`GET /api/voice/status`**: token, 4 KB body cap, 60 requests a minute; only `{ text, kind? }` is accepted and only text reaches ElevenLabs. Any failure, a missing key or the cap falls back to the device voice.
- **Phrase bank** (`src/voice/phrases.ts`): every move in both styles, stage intros and checkpoint lines (142 lines, 3,118 characters), cached as `data/voice/<hash>.mp3` and served without spending credits; `npm run voice:prewarm` shows the cost and makes them all with `--yes`.
- **Credit cap**: characters counted per month in `data/voice-usage.json` (Flash 0.5 credit per character), default 20,000 credits (`ELEVENLABS_MONTHLY_CREDIT_CAP`), checked before each call against the lower of the cap and the account's real balance; a notice at 80%.

### Changed
- Student profile schema v4 (`savedCubes`, with the `addSavedCube`, `renameSavedCube`, `setSavedCubeMethod` and `deleteSavedCube` operations, merged and validated on the server: a valid cube, a name of 1 to 40 characters); version 3 profiles are migrated on read.
- Student profile schema v3 (`voiceMode`, `voiceRate`, `voiceMoves`); version 2 profiles are migrated on read.
- `SegmentedControl` options can be disabled.

## [2.0.0] - 2026-11-17

The tutor rebuild: Cubyntra changes from a scanner and solver into a local, single-student cube
tutor (a PWA served from the laptop). Plan: `docs/tutor/GOAL.md`; checklist:
`docs/tutor/PROGRESS.md`. This release also contains the September phone-scanning work that was
listed here as unreleased, as amended by the tutor rebuild.

### Added
- **Tutor engine** (`src/tutor/`, [ADR-012](docs/ADR/012-deterministic-tutor-engine.md)): the beginner's method (daisy, white cross on top, white corners, flip, middle edges, yellow cross, yellow edges, position and orient the yellow corners) and CFOP (cross on the bottom in at most 8 turns, 41-case F2L, then 2-look OLL/PLL or, with `lastLayer: 'full'`, the full 57 OLL and 21 PLL). Methods are data; every step plan is replayed on the logical cube and must advance the stage. A fixed-seed scramble suite solves 1,000 scrambles per method and variant in `npm test` and 10,000 in `npm run test:tutor-soak`.
- **Cube engine**: whole-cube rotations `x y z`, wide moves (`r` and `Rw`), slices `M E S`; a grip model (top and front colors) that instructions are relative to; piece queries (`findEdge`, `findCorner`, `isCrossSolved`, `isF2LSlotSolved`, `isLayerSolved`); a plain-language name for every move.
- **Teaching twin**: a flat voxel restyle, the camera framed to the grip with animated regrips, a spotlight on the step's pieces with a slot outline, move chips in sync with the animation, play / step / 0.5× / loop, a faded "after" preview, WebGL context-loss recovery, and solver and tutor jobs in a Web Worker.
- **Checkpoint checks** ([ADR-013](docs/ADR/013-checkpoint-verification.md)): a per-student palette from the full scan, partial-face verification with a confidence per sticker, mistake diagnosis (wrong direction, skipped, doubled, wrong face, wrong grip, stopped early, extra repeat), corrective steps, "show one more face", rescan and re-plan, tile edits and a manual "it matches". On synthetic photos the top diagnosis is right in 1819 of the 1819 detected mistakes (`docs/tutor/CHECKPOINTS.md`).
- **Claude coach** ([ADR-014](docs/ADR/014-claude-coach.md)): `POST /api/coach` streams Claude Haiku 5.5 (`claude-haiku-5-5`, effort low, thinking off, at most 400 tokens) with a cached system prompt and a facts JSON; three hint levels; a template and teaching notes for every stage and case; mock mode without a key; a move guardrail; a monthly spend cap (default $10) tracked in `data/coach-usage.json`; `GET /api/coach/status`; `npm run coach:eval` with 50 recorded situations.
- **App shell and PWA**: Home with the method picker, Scan, Solve, Trainer, Timer, Progress, Pair and Settings in one shell (phone tab bar, desktop side nav); a web app manifest and icons; Screen Wake Lock while solving; error states for a denied camera, an offline or capped coach and an unreadable cube.
- **Student profile**: `data/student.json` (version 2; a version 1 file is migrated) read through `GET /api/student` and changed through `PATCH /api/student` operations that the server merges, so a phone and the laptop never overwrite each other; an interrupted solve resumes.
- **Learning features**: an algorithm trainer (five sets, drills planned as tutor steps, Leitner boxes), a timer (20-move scramble, 15 s WCA inspection with +2 and DNF, best single, ao5 and ao12), a progress world (a voxel block per stage mastered, streaks, the algorithm collection) and graduation suggestions (beginner's to CFOP, 2-look to the full last layer).
- **State-only phone ↔ laptop sync** ([ADR-015](docs/ADR/015-state-only-sync.md)): QR pairing with a 128-bit secret plus a six-character typed code; the phone reads each face itself and sends colors only; the step, grip, playback and checkpoint verdicts are mirrored both ways, and a solve can be done on the phone.
- **Accessibility**: labels on every control, focus-trapped dialogs, an optional color-blind letter on every sticker, AA contrast for the token pairs, 44px tap targets on phones, reduced motion (system and student setting), and an axe audit of every screen in the tests.
- Light and dark themes with a Light / Dark / System switch and no flash of the wrong theme on load.
- Error, root-error and 404 pages with Try again and Back to home.
- A review screen before solving: an unfolded net with hard-to-read tiles marked, each tile correctable, and solving enabled only for a valid cube. Colors are resolved across all 54 tiles at once: the centers calibrate the palette, an assignment enforces nine tiles per color, and a face read a quarter turn off is turned back automatically ([ADR-010](docs/ADR/010-desktop-side-analysis-and-global-color-resolution.md)).
- Phone capture coaching: a first-run guide, a mini cube showing the grip for every face, live checks for framing, wrong face, light, glare and motion with one instruction at a time, and a shutter that reads the face by itself once the frame holds steady.
- An HTTPS dev server (`npm run dev`) with a self-signed certificate for localhost and the laptop's network addresses, so the phone camera works over Wi-Fi.

### Changed
- The product is a tutor: the engine picks every move and Claude only explains. The Kociemba solver still validates and solves every confirmed scan in the worker; the tutor's steps never come from it.
- A light-green voxel design system ([ADR-011](docs/ADR/011-voxel-design-system.md)) with flat tokens, pixel headings (Pixelify Sans) and block components in `src/components/ui/`; `tests/design-rules.test.ts` rejects gradients, blur, glass, text shadows and colors outside the tokens. It supersedes the visual direction of ADR-008.
- `next` and `eslint-config-next` 16.4.6.
- `CubeMove` is now a tagged `Move` (face, wide, slice, rotation); `parseMove` accepts the new notation and rejects anything else.
- The Python dataset scripts take the dataset path as an argument.

### Removed
- **The photo relay.** The phone no longer sends face photos: the `/api/session/[id]/face`, `verdict`, `rescan`, `confirm` and `reset` routes, the server's image store, the `thumbnail` field and the review screen's photo crops are gone. No picture leaves the device that took it (ADR-001, restored by ADR-015). This reverses the September change that let phone photos pass through the server in memory.
- `preferredId` on `POST /api/session`: a session id can no longer be chosen.
- The single-page scanner/solver UI (`src/app/page.tsx`, the header, `SolveControls`, `CVDebugger`, `ErrorRecoveryModal`, the pairing modal), the hexagon canvas background, every gradient and the PBR speedcube look.
- The `canvas-confetti` dependency.

### Fixed
- Guidance arrows swept the wrong way; a clockwise turn now sweeps clockwise seen from outside the face, on all six faces.
- The ML edge-gradient feature scaled only one term by 255; it now matches the Python training formula.
- Orange could be read as red: the red/orange hue split moved from 12° to 8°.
- `parseMove` accepted lower-case and unknown tokens.
- The checkpoint camera could wait forever; it starts when its video mounts and fails after 30 s without a stream or 10 s without a frame.
- A solve uses one WebGL context instead of one per step, and releases it on unmount.
- Event streams that stay silent for two ping intervals reconnect.
- Coach usage is recorded for aborted and failed calls too.
- 3D twin: the turning layer detached from the cube whenever the view was orbited; colors were repainted onto the wrong tiles after every turn; autoplay dropped moves at higher speeds; orientation snapping was invalid near gimbal lock; orbit damping depended on the refresh rate; the camera clipped the cube in tall containers.
- The phone cropped a fixed region of the camera frame rather than the reticle the user aligned the cube in.
- The pairing QR code could point at a VPN address that a phone on ordinary Wi-Fi cannot reach, and under `next dev` the phone page did not hydrate when opened by the laptop's LAN address.
- A pairing expired after 30 minutes even while connected.

### Security
- Every sync route requires the session's 128-bit secret (compared in constant time); creating a session requires the per-install app token, which `GET /api/auth/token` gives only to loopback requests. The QR credentials travel in the URL fragment and live in the phone tab's sessionStorage.
- Typed pairing codes are single use, valid 10 minutes, and limited to 10 guesses per minute.
- At most 8 sessions, expiring after 30 minutes idle or 12 hours; 600 messages per minute per session; bodies read through a streaming size cap (16 KB sync, 8 KB coach, 128 KB profile, 1 KB typed code).
- `/api/coach` needs the app token and allows 30 requests per minute; `ANTHROPIC_API_KEY` is read only on the server and never sent to the browser.
- `tests/sync-privacy.test.ts` fails if a route or message type can carry image data.
- `npm audit --omit=dev` reports no critical or high issues.

## [1.0.0] - 2026-09-26

### Added
- **Computer Vision Pipeline**:
  - WebRTC camera initialization with rear/environment camera preference.
  - Adaptive 3x3 sampling grid with perspective-safe region-of-interest (ROI).
  - Truncated mean pixel aggregation per sticker region.
  - Color classification utilizing calibrated RGB-to-HSV and perceptual color metrics.
  - Temporal stability buffering with consecutive frame consensus and confidence scoring.
  - Guided 6-face scanning sequence with visual orientation cues.
  - Real-time Computer Vision Debugger inspection panel.
- **Cube State & Mathematics**:
  - Standard URFDLB face notation and 54-sticker coordinate system.
  - Dual logical cube model (Facelet matrix and 3D cubie coordinates).
  - Strict physical state validation (sticker counts, centers, edge/corner parity, twist/flip invariants).
  - Smart error reporting identifying exact problematic stickers and faces.
- **Solving Engine**:
  - Deterministic Herbert Kociemba two-phase solving algorithm.
  - Conversion between physical scanned facelet state and solver representation.
  - Generation of standardized `CubeMove[]` with Half Turn Metric (HTM) counting.
  - Post-solve state verification ensuring 100% solved integrity.
- **3D Digital Twin Engine**:
  - 27-cubie interactive 3D Rubik's Cube built with Three.js.
  - Orbit, drag, zoom, and orientation reset controls.
  - Seamless scanned state mapping onto the 3D twin.
  - Zero-drift layer rotation animations with orthogonal transform snapping.
  - Dynamic 3D curved directional arrows indicating next move direction.
- **User Interface & Experience**:
  - Minimalist technical dark aesthetic with restrained Rubik color accents.
  - Procedural dynamic hexagonal background canvas with mouse interaction and reduced-motion support.
  - Comprehensive playback controls: Step Previous, Play/Pause, Step Next, Reset, Speed controls.
  - Responsive layout for desktop side-by-side and mobile stacked views.
- **Engineering Documentation**:
  - Comprehensive documentation suite under `/docs` (PRD, SRS, Architecture, System Design, CV, Cube Model, Solver, 3D Engine, UI/UX, Testing, Security/Privacy, Future Hardware, Roadmap, ADRs).
  - Automated PDF documentation generation pipeline via `scripts/generate-docs.ts`.
- **Quality & DevOps**:
  - Vitest test suite covering mathematical invariants, cube rotations, validation, and solver verification.
  - GitHub Actions CI pipeline covering linting, typechecking, testing, and production builds.
  - Issue templates and PR templates.
