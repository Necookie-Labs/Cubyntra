# Cubyntra

<div align="center">

**See it. Solve it.**

*A Rubik's Cube tutor for one student, running on your own laptop: scan your cube, follow a 3D
twin step by step through the beginner's method or CFOP, get each step explained, and let the
camera check your work.*

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL-black?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![Runs on](https://img.shields.io/badge/Runs%20on-localhost-5FA83A?style=for-the-badge)](docs/DEPLOYMENT.md)
[![License](https://img.shields.io/badge/License-MIT-2E4A22?style=for-the-badge)](LICENSE)

</div>

---

## 1. What it is

Cubyntra is a local, single-student cube tutor by **Necookie Labs**, delivered as a PWA from a
Next.js 16 server on the student's laptop. There are no accounts and no hosting: the profile and
progress live in `data/student.json` next to the code.

- **Two methods.** The beginner's method (daisy and white cross on top, then a flip so white is on
  the bottom) and CFOP (cross on the bottom, 41-case F2L, then 2-look OLL/PLL or the full 57 OLL /
  21 PLL). A deterministic tutor engine plans **every** move and replays each plan on the logical
  cube before showing it ([ADR-012](docs/ADR/012-deterministic-tutor-engine.md),
  [METHODS](docs/tutor/METHODS.md)).
- **A teaching twin.** A flat voxel 3D cube shows the student's exact cube in their grip, lights
  up the pieces that matter, animates each step with move chips, play / step / 0.5× / loop, and a
  faded "after" preview ([3D engine](docs/THREE_D_ENGINE.md)).
- **Checkpoint scans.** After each step the student shows one or two faces to the camera. The
  tutor reads them with the student's own color palette, and on a mismatch names the likely slip
  (wrong direction, skipped or doubled move, wrong face, wrong grip, stopped early, extra repeat)
  and offers a corrective step, one more face or a rescan
  ([ADR-013](docs/ADR/013-checkpoint-verification.md), [CHECKPOINTS](docs/tutor/CHECKPOINTS.md)).
- **A coach.** Claude Haiku 5.5 explains the step in plain words at three hint levels. It never
  picks moves: a guardrail swaps any reply naming a move outside the step for a built-in template,
  and a hard monthly spend cap (default $10) switches to templates when reached
  ([ADR-014](docs/ADR/014-claude-coach.md)).
- **Learning features.** An algorithm trainer with spaced repetition, a WCA-style timer with
  inspection and averages, and a progress world with mastery, streaks and an algorithm collection.
- **A paired phone.** The phone can scan, show the step and drive playback. Phone and laptop
  exchange cube states and steps only, never pictures ([ADR-015](docs/ADR/015-state-only-sync.md)).

Screens: Home (`/`), Scan, Solve, Trainer, Timer, Progress, Pair and Settings, plus the phone's
camera page (`/companion`). See [UI_UX](docs/UI_UX.md) §3.

---

## 2. Quick start

### Prerequisites
- Node.js 20.9 or newer (CI uses Node 22) and npm.
- A laptop and, optionally, a phone on the same Wi-Fi.
- Network access for the first `npm run dev` / `npm run build` (the UI fonts are downloaded once
  through `next/font` and then served locally).

### Run it
```bash
git clone https://github.com/Necookie-Labs/Cubyntra.git
cd Cubyntra
npm install
npm run dev          # HTTPS dev server on 0.0.0.0:3000 with a self-signed certificate
```

Open **https://localhost:3000** and accept the one-time certificate warning (Advanced → Proceed).
`npm run dev` writes a self-signed certificate for `localhost` and the laptop's network addresses
to `.certs/` (git-ignored) and installs nothing into the system trust store. HTTPS is needed
because phones only allow the camera on `https://` pages. `npm run dev:http` serves plain HTTP;
the laptop works, but the phone camera will not open.

Pick **Beginner's** or **CFOP** on Home, then **Scan my cube** (or **Try a demo cube**) and follow
the twin on Solve, pressing **I did it** after each step so the camera can check it.

### Pair a phone
1. Make sure the phone is on the same Wi-Fi as the laptop.
2. On the laptop open **Pair** (`/pair`). It shows a QR code and a six-character code (valid
   10 minutes, single use).
3. Scan the QR code with the phone, or open `https://<laptop-ip>:3000/companion` on the phone and
   type the code. If the laptop has several network addresses, choose the one the phone can reach
   on the Pair screen.
4. The phone shows the same certificate warning once; tap through it. To install the app on the
   phone as a real PWA, trust the dev certificate on the phone
   ([DEVELOPMENT](docs/DEVELOPMENT.md) §6.3–6.4).

### Add the coach key (optional)
```bash
# .env.local in the project root (git-ignored; see .env.example)
ANTHROPIC_API_KEY=sk-ant-...
COACH_MONTHLY_CAP_USD=10   # optional, default 10
```
Restart `npm run dev`. The key is read only by server code and never sent to the browser.
**Without a key everything works**: the coach runs in mock mode and every hint comes from the
built-in templates, with no calls to Anthropic. Spend is tracked per month in
`data/coach-usage.json`; at the cap the coach switches to templates until the next month.

### Production build on the laptop
```bash
npm run build && npm start   # http://localhost:3000
```
`npm start` serves plain HTTP, so the phone camera needs `npm run dev`
([DEPLOYMENT](docs/DEPLOYMENT.md)).

---

## 3. Scripts

| Command | What it does |
|:---|:---|
| `npm run dev` | HTTPS dev server (creates `.certs/` if needed), reachable from the phone |
| `npm run dev:http` | Plain-HTTP dev server (laptop only) |
| `npm run build` / `npm start` | Production build, then serve it locally |
| `npm run lint` / `npm run typecheck` | ESLint, `tsc --noEmit` |
| `npm test` | The Vitest suite: 1,353 tests in 147 files (1,000 tutor scrambles per method) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:tutor-soak` | The tutor scramble suite at 10,000 fixed-seed scrambles per method and variant (about 95 s) |
| `npm run coach:eval` | 50 recorded step situations through the coach, report in `data/coach-eval-report.md`; calls Claude only when a key is set |
| `npm run docs:pdf` | Regenerates the PDFs in `docs/pdf/` from the Markdown docs |

The test suite never calls the Claude API or the network; see [TESTING](docs/TESTING.md).

---

## 4. Architecture

```
src/
├── cube/        Logical cube: moves (face, wide, slice, rotation), grip, pieces, validation
├── tutor/       Deterministic tutor engine: methods as data, case tables, step plans,
│                checkpoint verification, mistake diagnosis, recovery (no DOM, React, Three.js)
├── learn/       Trainer sets, drills, Leitner boxes, mastery, streaks, timer rules (pure)
├── vision/      Camera, reticle sampling, CIELAB/HSV color, ML cube check, student palette
├── solver/      Kociemba two-phase solver and the Web Worker that also runs tutor jobs
├── three/       Three.js engine: voxel cubies, drift-free turns, arrows, spotlight, ghost
├── twin/        Step plans mapped onto the twin (pieces, slots, playback-driven aids)
├── coach/       Claude coach: facts, system prompt, templates, guardrail, spend, useCoach
├── sync/        Phone ↔ laptop pairing and state-only sync
├── app-shell/   Shell glue: app token, checkpoint adapter, navigation, wake lock, install
├── lib/         Tokens, theme, data dir, app secret, student profile schema, file and ops
├── stores/      Zustand: useCubyntraStore (scan) and useTutorStore (guided solve, profile)
├── components/  React UI: ui/, shell/, home/, scan/, solve/, trainer/, timer/, progress/ ...
└── app/         Next.js routes: (app)/ screens, api/ (auth, coach, session, student), manifest
```

The logical cube state is the ground truth; the twin only draws it, and every layer turn snaps
cubies back to integer positions. Start with [ARCHITECTURE](docs/ARCHITECTURE.md) and
[DATA_FLOW](docs/DATA_FLOW.md); the full index is [docs/README.md](docs/README.md).

| Topic | Document |
|:---|:---|
| Product and requirements | [PRD](docs/PRD.md), [SRS](docs/SRS.md), [ROADMAP](docs/ROADMAP.md) |
| Design | [ARCHITECTURE](docs/ARCHITECTURE.md), [SYSTEM_DESIGN](docs/SYSTEM_DESIGN.md), [DATA_FLOW](docs/DATA_FLOW.md), [API_REFERENCE](docs/API_REFERENCE.md) |
| Tutor | [METHODS](docs/tutor/METHODS.md), [CHECKPOINTS](docs/tutor/CHECKPOINTS.md) |
| Subsystems | [CUBE_MODEL](docs/CUBE_MODEL.md), [COMPUTER_VISION](docs/COMPUTER_VISION.md), [SOLVER](docs/SOLVER.md), [THREE_D_ENGINE](docs/THREE_D_ENGINE.md), [UI_UX](docs/UI_UX.md) |
| Quality and operations | [TESTING](docs/TESTING.md), [SECURITY_PRIVACY](docs/SECURITY_PRIVACY.md), [DEVELOPMENT](docs/DEVELOPMENT.md), [DEPLOYMENT](docs/DEPLOYMENT.md), [CONTRIBUTING](docs/CONTRIBUTING.md) |
| Decisions | [ADR index](docs/ADR/README.md) (ADR-001 … ADR-015) |

---

## 5. Privacy

- **No picture leaves the device that took it.** Webcam and phone frames are sampled to nine tile
  colors in that browser tab and discarded. The phone sends the laptop only colors, confidences
  and tile mean colors per face, then cube states, steps, grip, playback and checkpoint verdicts.
  No route accepts, stores or returns image data, and `tests/sync-privacy.test.ts` enforces it.
- **The coach sends words, not pictures.** With a key, the laptop's server sends Anthropic the
  fixed system prompt and a small facts JSON about the current step (stage, case, grip, the
  step's moves, hint level, recent attempt results, an optional diagnosis). Never images, cube
  state, the student's name, profile or progress. Without a key nothing is sent.
- **Local data only.** `data/student.json` (profile, palette, progress), `data/coach-usage.json`
  (token counts and cost, no reply text) and `data/app-secret` stay on the laptop and are
  git-ignored. There are no analytics or third-party trackers.
- **Local network, honestly.** Pairing is protected by a 128-bit session secret and an app token
  that only the laptop's own browser can fetch, but a paired phone is trusted like the laptop,
  and the self-signed certificate is not trusted by the phone by default. The limits are listed
  in [SECURITY_PRIVACY](docs/SECURITY_PRIVACY.md) §6.3.

---

## 6. License

Cubyntra is an open-source project by **Necookie Labs**, licensed under the [MIT License](LICENSE).
