# Cubyntra Local Development Guide

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Status**: Active (2.0.0)  
**Scope**: Developer Environment Setup, Workflows, and Tooling

---

## 1. Quick Start

```bash
# 1. Clone repository
git clone https://github.com/Necookie-Labs/Cubyntra.git
cd Cubyntra

# 2. Install dependencies
npm install

# 3. Start development server (with Turbopack)
npm run dev

# 4. Access application in browser (accept the one-time certificate warning)
open https://localhost:3000
```

> **Why HTTPS?** Phones only allow camera access on `https://` pages (`localhost` on the same device is the only exception). `npm run dev` creates a self-signed certificate for `localhost` and this computer's network addresses in `.certs/` (git-ignored), without installing anything into the system trust store. The first visit on each device shows a "connection is not private" warning: tap **Advanced → Proceed**. Use `npm run dev:http` for plain HTTP; phone scanning will not work with it.

> **Fonts need the network once.** The UI fonts (Nunito, Nunito Sans, Geist Mono) load through `next/font/google`, which downloads them during `npm run dev` and `npm run build` and then serves them from this machine; the browser never contacts Google. Without network access `next build` can fail at the font step (the dev server falls back to system fonts), so run the first build online.

> **Design rules.** UI code may only use the design tokens from `src/app/globals.css` and the components in `src/components/ui/` ([ADR-018](ADR/018-raised-design-system.md)). `tests/design-rules.test.ts` fails on gradients and hex colors outside the token block, blur, glass, text shadows, Tailwind's default shadows and palette, corners off the radius scale, classes for retired tokens (`bg-leaf`...) and any `var(--vx-*)` that is not a declared token.

---

## 2. Available Scripts

| Command | Purpose |
|:---|:---|
| `npm run dev` | Starts the dev server over HTTPS (needed for the phone camera) with Turbopack HMR |
| `npm run dev:http` | Starts the dev server over plain HTTP (computer only; phone camera will not open) |
| `npm run build` | Builds optimized production bundle |
| `npm run start` | Serves compiled production bundle locally |
| `npm run lint` | Runs ESLint over all TypeScript and React files |
| `npm run typecheck` | Validates strict TypeScript types across the codebase |
| `npm run test` | Runs the Vitest suite (1,633 tests in 164 files; 1,000 tutor scrambles per method) |
| `npm run test:watch`| Runs Vitest in interactive watch mode |
| `npm run test:tutor-soak` | Runs the tutor scramble suite at 10,000 scrambles per method and variant (about 95 s) |
| `npm run docs:pdf` | Compiles documentation into PDF artifacts in `docs/pdf/` |
| `npm run coach:eval` | Runs 50 real step situations (guided solves of seeded scrambles) through the coach and writes `data/coach-eval-report.md` (calls Claude only with a key; see §5) |
| `npm run voice:prewarm` | Prints what generating the voice phrase bank would cost; with `-- --yes`, makes the missing ElevenLabs clips in `data/voice/` (see §5.6) |

---

## 3. Directory Layout & Architecture Boundaries

- **`src/cube/`**: Pure logical domain models (moves of every kind, grip, pieces, orientation, validation, move names). No DOM or Three.js dependencies.
- **`src/tutor/`**: Deterministic tutor engine: beginner's method and CFOP as data, case tables, step plans replayed on the logical cube, checkpoint verification, mistake diagnosis and recovery. No DOM, Three.js or React imports. See `docs/tutor/METHODS.md` and `docs/tutor/CHECKPOINTS.md`.
- **`src/learn/`**: Trainer sets and drills, Leitner boxes, mastery, streaks, timer rules and scrambles. Pure.
- **`src/vision/`**: Camera capture, reticle sampling, HSV/CIELAB conversion, ML cube check, capture quality, 54-tile resolution, the student palette and checkpoint face reading.
- **`src/solver/`**: Kociemba two-phase solver and the Web Worker (with its typed client) that also runs the tutor jobs.
- **`src/twin/`**: Teaching twin logic: step-plan pieces, slots and checkpoint faces as twin positions, and the controller that plays a plan on the engine with its aids. See `docs/THREE_D_ENGINE.md` section 6.4.
- **`src/three/`**: Three.js rendering: voxel cubies, layer turns with integer snapping, arrows, grip camera, spotlight, "after" preview, playback, context-loss recovery.
- **`src/coach/`**: Claude coach: facts, system prompt, templates and case notes, guardrail, spend tracking, the SSE relay and the `useCoach` hook.
- **`src/sync/`**: Phone ↔ laptop pairing and state-only sync (ADR-015).
- **`src/app-shell/`**: Shell glue: app token, checkpoint adapter, navigation, wake lock, install prompt, progress summaries.
- **`src/lib/`**: Tokens, theme, the `data/` directory, the app secret, the streaming body cap, and the student profile schema, file and operations.
- **`src/stores/`**: Zustand stores: `useCubyntraStore` (scan) and `useTutorStore` (guided solve, profile, trainer and timer).
- **`src/components/`**: React UI: `ui/` kit, `shell/`, and one folder per screen or feature (`home/`, `scan/`, `camera/`, `review/`, `solve/`, `twin/`, `trainer/`, `timer/`, `progress/`, `pair/`, `companion/`, `settings/` ...).
- **`src/app/`**: Next.js routes: `(app)/` screens (including `companion/`), `api/` (auth, coach, session, student), `manifest.ts`.
- **`docs/`**: Engineering documentation and architectural decision records (ADRs).
- **`tests/`**: Automated unit, integration, property and accessibility tests (`tests/helpers/` for fakes and fixtures).
- **`scripts/`**: Dev certificate, coach eval, icon and PDF generators, and the ML dataset and training scripts.

---

## 4. Development & Debugging Utilities

### 4.1 Developing Without a Physical Cube
1. **Demo cube**: **Try a demo cube** on Home starts a guided solve from one of three fixed scrambles (`src/app-shell/demoCube.ts`); the scanner's **Use demo cube** loads a fixed mock scan (`loadMockScramble`) through the same review and solve path.
2. **Mock scans**: `src/vision/mock.ts` builds scanned faces from any cube state (`createMockScannedFaces`, `getScrambledMockScan`) for tests; there is no synthetic video feed.
3. **Synthetic photos**: `tests/helpers/syntheticCube.ts` renders checkpoint photos with controlled lighting and noise for the checkpoint tests.

### 4.2 Computer Vision Debugging
There is no debugging panel in the UI (the old CV Debugger was removed with the single-page app). Use the vision tests (`tests/vision*.test.ts`, `tests/checkpoint-synthetic.test.ts` with `CHECKPOINT_REPORT=report.json`) or read `currentClassification` from `useCubyntraStore` in a test or a temporary log (the store is not exposed on `window`).

---

## 5. Coach (Claude)

The tutor's coach explains each step in plain words ([ADR-014](ADR/014-claude-coach.md)). It is
optional: without a key every hint comes from the built-in templates.

### 5.1 Adding the key
1. Create `.env.local` in the project root (git-ignored; see `.env.example`):
   ```bash
   ANTHROPIC_API_KEY=sk-ant-...
   COACH_MONTHLY_CAP_USD=10   # optional, default 10
   ```
2. Restart `npm run dev`. The key is read only by the server (`src/coach/service.ts`); it is
   never sent to the browser. Never prefix it with `NEXT_PUBLIC_`.
3. Check the mode: `GET /api/coach/status` (with the app token, see 5.3) returns
   `{ mode: "live" | "mock" | "capped", monthSpendUsd, capUsd, month }`.

### 5.2 Mock mode and the cap
- **Mock** (no key): `/api/coach` streams the template for the step through the same event
  stream, with a notice. Use it for all UI work; tests never call the real API.
- **Capped**: spend is recorded per UTC month in `data/coach-usage.json`. Once it reaches the cap
  the coach serves templates until the next month. Delete or edit that file only if you know the
  real spend (the Anthropic Console shows it).
- The server logs `[coach] usage input=... output=... cache_read=... cache_write=... cost=$...`
  for every live call. After the first call, `cache_read` should be about 5,000 tokens; if it
  stays at 0, something made the system prompt change between calls.
- The request turns thinking off (`thinking: { type: "disabled" }`, effort `low`) so the whole
  400-token budget goes to the reply.

### 5.3 The app token
`/api/coach` and `/api/coach/status` need the header `x-cubyntra-token`. The laptop's browser
gets it from `GET /api/auth/token`, which only answers on `localhost` / `127.0.0.1` / `[::1]`.
The secret lives in `data/app-secret`; delete the file to rotate it (paired devices then need the
new one). For a quick manual call:
```bash
TOKEN=$(curl -sk https://localhost:3000/api/auth/token | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -skN https://localhost:3000/api/coach -H "x-cubyntra-token: $TOKEN" \
  -H 'Content-Type: application/json' -d @facts.json   # body: { "facts": { ... } }
```

### 5.4 The eval
`npm run coach:eval` runs 50 situations taken from real tutor plans: guided solves of seeded
scrambles for both methods (every stage, hint levels 1-3, mixed attempt histories), six of them
with a diagnosis from `diagnoseMistake` after one move is turned the wrong way or skipped. It
sends each through the coach, applies the move guardrail and writes
`data/coach-eval-report.md`: how many live replies were kept, fallbacks by reason, guardrail
failures (must be 0), cost and cache use. With a key it makes 50 real calls (a few cents in
total, counted toward the cap); without one it checks the templates only and makes no API call.
It is never run by the test suite or the build (`tests/coach-eval-situations.test.ts` imports
the situation list only).

### 5.5 What the coach is sent, and the guardrail
- Facts come from the plan: stage and case ids and names, grip, setup and algorithm, the plan's
  `goal` / `lookFor` / `why` / `repeat`, attempts and, at hint level 3, plain-language move names.
  Templates are built from the same facts, so new stages or cases need no coach change to work.
- Per-case notes: `src/coach/caseNotes.ts` generates a cue, an idea plus common mistake and a
  fingertrick tip for every id in `allCaseIds()` from the case tables and a short note per group.
  The server sends the one for the hint level as `caseTip` (never in the cached system prompt),
  and the templates use it. A new case id needs a group or stage note there to pass
  `tests/coach-case-notes.test.ts`.
- Pass the tutor's `Diagnosis` to `useCoach({ diagnosis })`; it is projected to kind, detail,
  moveIndex, confidence and description per mistake (top 3), plus `confident` and `showNext`.
  Move lists and cube states never leave the browser.
- The guardrail rejects any move outside the step (plus moves named in the top diagnosis
  description). A lone capital counts as a move only in move-like context (a run of moves, a
  suffix, backticks, brackets, or after do/then/turn/try), so ordinary prose such as "plan B" or
  "the F face" is not mistaken for notation. Add cases to `tests/coach-guard.test.ts` when you
  change it: it has tables both ways.

### 5.6 Voice (device voice and ElevenLabs)
The tutor can speak ([ADR-016](ADR/016-voice-tutoring.md)): each move as the twin plays it, a
stage intro, every checkpoint result, and the coach's replies. The student picks **Off**,
**Device voice** or **ElevenLabs** in Settings → Voice (default Off), plus the speed and whether
moves are said in words ("turn the right side up") or as letters ("R prime"). The speaker button
in the solve screen's coach panel turns it on and off. Nothing is said before the first tap on the
page (browsers block autoplay).

**Device voice** is the browser's own `speechSynthesis`: free, offline, no key, no setup.

**Adding an ElevenLabs key** (optional):
1. Add to `.env.local` (git-ignored; see `.env.example`):
   ```bash
   ELEVENLABS_API_KEY=sk_...
   ELEVENLABS_VOICE_ID=                  # optional; default a stock premade voice
   ELEVENLABS_MONTHLY_CREDIT_CAP=20000   # optional, default 20,000 credits
   ```
2. Restart `npm run dev`. The key is read only by the server (`src/voice/elevenlabs.ts`) and never
   sent to the browser. Use a stock voice id; cloned voices are not used.
3. Settings → Voice now allows ElevenLabs and shows the month's credits. `GET /api/voice/status`
   (app token) returns `{ mode, keySet, monthCredits, capCredits, remaining?, warning, ... }`.

**Credits math.** ElevenLabs bills by characters of text. Flash v2.5 (`eleven_flash_v2_5`, the
model used) costs **0.5 credit per character**, half of Multilingual v2 (one table in
`src/voice/credits.ts`). About **1,000 characters ≈ 1 minute of audio ≈ 500 credits**.
- The phrase bank (every move in both styles, stage intros, checkpoint and praise lines) is
  142 lines, 3,118 characters ≈ **1,559 credits**, spent once: each clip is kept in
  `data/voice/<hash>.mp3` and replayed for free afterwards.
- Coach replies use the device voice. "Read with ElevenLabs" sends that one reply (often 300-700
  characters, 150-350 credits) and does not keep it.

**Prewarming the bank.** `npm run voice:prewarm` prints the number of lines, characters and
credits it would send and how many are cached already, and sends nothing. Run
`npm run voice:prewarm -- --yes` to make the missing clips in one go (it stops at the cap).
Without prewarming, each clip is made the first time it is needed. Changing the voice or model
makes new clips (the hash covers both).

**The cap.** Characters sent are counted per UTC month in `data/voice-usage.json` (cached clips
are free and not counted). Before each call its credits are reserved; a call that could pass the
limit is not made. The limit is the lower of `ELEVENLABS_MONTHLY_CREDIT_CAP` (default 20,000)
and the account's real balance, read from ElevenLabs at most every 10 minutes. Settings shows a
notice at 80%; at the limit the device voice speaks until the next month. Any ElevenLabs failure
also falls back to the device voice.

**Paired phone.** Only the device driving the solve (the last to show a new step or press
play / pause / seek / speed) speaks; the other stays silent.

**Tests** fake ElevenLabs by stubbing `fetch` (`tests/voice-*.test.ts`); the suite and the build
never call it. Only the text to speak is sent (`tests/voice-privacy.test.ts`).

---

## 6. App Shell, Profile and PWA

### 6.1 Screens
`npm run dev`, then open `https://localhost:3000`. The screens are `/` (home), `/scan`, `/solve`,
`/settings`, `/trainer`, `/timer`, `/progress` and `/pair` (see `docs/UI_UX.md` §3). With no
cube to hand, use **Try a demo cube** on the home screen or the scanner's demo button.

### 6.2 The student profile
The profile lives in `data/student.json` (git-ignored) and is read and written through
`GET /api/student` and `PATCH /api/student` (small merge operations, never a whole profile) with the `x-cubyntra-token` header (§5.3). Writes are atomic and capped at
128 KB (profile version 2; a version 1 file is migrated when read); a file that fails validation is moved to `data/student.json.bad` and a fresh profile is
used. Delete `data/student.json` to start over as a new student.

**Where each device gets the token** (`src/app-shell/appToken.ts`): the laptop's browser from
`GET /api/auth/token`; a paired phone from its pairing, which Phase 8 keeps in sessionStorage
(`cubyntra.pairing`, from the QR fragment or the typed-code reply; ADR-015). That is the only
place a phone holds it, so it ends with the tab. Without a token (an unpaired phone) the app still
works for the visit and Settings says changes are not saved.

### 6.3 Installing on a phone
- **Android (Chrome).** Open the laptop's `https://<laptop-ip>:3000` on the phone, then
  Settings → Install (or the browser menu → Install app). Chrome only offers installation on a
  page it trusts: with the self-signed dev certificate it may only offer "Add to Home screen"
  (a shortcut) until the certificate is trusted (§6.4).
- **iPhone (Safari).** Share → Add to Home Screen. Settings shows this hint on iOS Safari.
- The manifest (`src/app/manifest.ts`, served at `/manifest.webmanifest`) asks for standalone,
  portrait display. Icons are in `public/icons/`, and the browser-tab favicon (the same cube on
  a transparent ground, 16/32/48 px) is `src/app/favicon.ico`. Regenerate them all with
  `npx tsx scripts/generate-icons.ts` after changing the icon or the color tokens
  (`tests/pwa-manifest.test.ts` fails if the committed PNGs or favicon are out of date).

### 6.4 Trusting the dev certificate on a phone (optional)
Camera access works after tapping through the certificate warning. Installing as a real app and
any future service worker need a certificate the phone trusts:
1. Copy `.certs/dev-cert.pem` (created by `npm run dev`) to the phone.
2. **Android:** Settings → Security → Encryption & credentials → Install a certificate → CA
   certificate. **iPhone:** open the file, install the profile in Settings → General → VPN &
   Device Management, then turn it on under Settings → General → About → Certificate Trust
   Settings.
3. Reload the page; the warning should be gone. Remove the certificate from the phone when you
   no longer need it. The certificate is regenerated when the laptop's network addresses change.

### 6.5 Screen wake lock
While a solve is open, `/solve` holds a Screen Wake Lock (`src/app-shell/wakeLock.ts`) so the
phone does not dim between turns; it is taken again when the page becomes visible. Browsers
without the API (and pages not served over HTTPS) simply skip it.

### 6.6 Service worker (not done)
Offline caching with a service worker is a stretch goal and is **not** implemented: browsers only
register service workers on trusted HTTPS origins (or `localhost`), so on a phone it would need
the trusted certificate from §6.4, and a caching worker easily serves stale bundles during
`next dev`. If it is added later, register it only in production builds and keep `/api/*`
network-only.

