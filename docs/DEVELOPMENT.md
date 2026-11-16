# Cubyntra Local Development Guide

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Status**: Active  
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

> **Fonts need the network once.** The UI fonts (Pixelify Sans, Nunito Sans, Geist Mono) load through `next/font/google`, which downloads them during `npm run dev` and `npm run build` and then serves them from this machine; the browser never contacts Google. Without network access `next build` can fail at the font step (the dev server falls back to system fonts), so run the first build online.

> **Design rules.** UI code may only use the voxel tokens from `src/app/globals.css` and the components in `src/components/ui/` ([ADR-011](ADR/011-voxel-design-system.md)). `tests/design-rules.test.ts` fails on gradients, blur, glass, text shadows, soft shadows, rounded corners, Tailwind's default palette and hex colors outside the token block.

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
| `npm run test` | Runs all 35 Vitest unit and integration tests |
| `npm run test:watch`| Runs Vitest in interactive watch mode |
| `npm run test:coverage` | Generates detailed code coverage metrics |
| `npm run docs:pdf` | Compiles documentation into PDF artifacts in `docs/pdf/` |
| `npm run coach:eval` | Runs 50 recorded step situations through the coach and writes `data/coach-eval-report.md` (calls Claude only with a key; see §5) |

---

## 3. Directory Layout & Architecture Boundaries

- **`src/cube/`**: Pure logical domain models (faces, stickers, rotations, invariants, validation). No DOM or Three.js dependencies.
- **`src/vision/`**: Camera capture, 3x3 sampling grid, HSV/CIELAB conversion, center calibration, temporal stability.
- **`src/solver/`**: Herbert Kociemba two-phase solving algorithm and move sequence parsing.
- **`src/three/`**: Three.js rendering, 27-cubie construction, layer rotation animations, directional arrows, camera controls.
- **`src/stores/`**: Zustand store (`useCubyntraStore`) coordinating UI flow and scan/solve states.
- **`src/components/`**: Modular React components (Scanner, Visualizer, Controls, Debugger, Background).
- **`docs/`**: Comprehensive engineering documentation and architectural decision records (ADRs).
- **`tests/`**: Automated unit, integration, and property tests.
- **`scripts/`**: Engineering automation and PDF generator scripts.

---

## 4. Development & Debugging Utilities

### 4.1 Developing Without a Physical Cube
1. **Interactive Scramble**: Click the "Random Scramble" button on the UI to scramble the virtual 3D cube model.
2. **Mock Vision Feeds**: Use the built-in synthetic frame generator in `src/vision/mock.ts` to simulate webcam inputs with controlled lighting noise and slight color shifts for automated testing.

### 4.2 Computer Vision Debugging
- Toggle the **CV Debugger Drawer** at the bottom of the scanner view.
- Real-time inspector shows:
  - Sampled RGB, HSV, and CIELAB tuples for each of the 9 cells.
  - Active color assignment and Euclidean $\Delta E$ distance to the closest calibrated reference swatch.
  - Consecutive stable frame counter (0 to 10).

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
  for every live call. After the first call, `cache_read` should be about 4,500 tokens; if it
  stays at 0, something made the system prompt change between calls.

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
`npm run coach:eval` runs 50 situations from the F2L, OLL and PLL tables (mixed hint levels,
setups, failed attempts and diagnoses) through the coach, applies the move guardrail and writes
`data/coach-eval-report.md`: how many live replies were kept, fallbacks by reason, guardrail
failures (must be 0), cost and cache use. With a key it makes 50 real calls (a few cents in
total, counted toward the cap); without one it checks the templates only. It is never run by the
test suite or the build.
