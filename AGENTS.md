<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Cubyntra AI Agent Guidelines

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Tagline**: *See it. Solve it.*

## 1. Project Purpose & Philosophy
Cubyntra is a local, single-student Rubik's Cube tutor delivered as a PWA from the student's laptop: it scans the student's cube, shows each step of the beginner's method or CFOP on a 3D twin, has a Claude coach explain the step, and checks each step with the camera. The plan and its locked decisions are in `docs/tutor/GOAL.md`.

Key Core Principles:
1. **Mathematical Correctness Over Visuals**: The logical cube state is the ground truth. Three.js is a visual representation only.
2. **The Engine Picks Every Move**: The deterministic tutor engine (`src/tutor/`) plans every step and replays it on the logical cube before it is shown. Claude only explains; it never chooses moves, and the coach's guardrail replaces any reply naming a move outside the step.
3. **No Pixels Leave the Capturing Device**: Camera frames are sampled to tile colors in the browser tab that owns the camera. Phone ↔ laptop sync sends states only, and no route accepts, stores or returns image data (ADR-015, `tests/sync-privacy.test.ts`). The coach receives only a facts JSON about the step.
4. **Zero Floating-Point Drift**: All 3D layer rotations must snap cubie positions and orientations back to exact integer axes.
5. **Local Only**: One server on the laptop; the profile lives in `data/student.json`, the API key only in `.env.local` on the server. No hosting, accounts or real Claude calls in tests or the build.
6. **Documentation Synchronization**: Code changes must be paired with updates to corresponding documents in `/docs`.

## 2. Directory Structure & Architecture Boundaries
- `src/cube/`: Pure logical domain models (moves, grip, pieces, orientation, validation, move names). No DOM or Three.js dependencies.
- `src/tutor/`: Deterministic tutor engine: methods as data, case tables, step plans, checkpoint verification, mistake diagnosis and recovery. Depends only on `src/cube/`; no DOM, React, Three.js or network imports.
- `src/learn/`: Trainer sets and drills, Leitner boxes, mastery, streaks and timer rules. Pure.
- `src/vision/`: Camera capture, reticle sampling, HSV/CIELAB conversion, ML cube check, capture quality, 54-tile resolution, the student palette and checkpoint face reading.
- `src/solver/`: Kociemba two-phase solver and the Web Worker (typed client and protocol) that also runs the tutor jobs.
- `src/twin/`: Step plans mapped onto the 3D twin (pieces, slots, playback-driven aids). No DOM, React or Three.js imports.
- `src/three/`: Three.js rendering: voxel cubies, layer turns with integer snapping, arrows, grip camera, spotlight, "after" preview, playback, context-loss recovery.
- `src/coach/`: Claude coach (Haiku 5.5): facts, system prompt, templates and case notes, move guardrail, spend cap, SSE relay, `useCoach`.
- `src/voice/`: Voice tutoring (ADR-016): speakable text, phrase bank, speech queue, device voice, ElevenLabs client and speaker, credit cap, clip cache, one-speaker rule.
- `src/sync/`: Phone ↔ laptop pairing and state-only sync (ADR-015). Messages carry cube state, steps, grip, playback and checkpoint verdicts, never images; every sync route checks the session secret.
- `src/app-shell/`: App shell glue: app token, checkpoint adapter (the only caller of verify / diagnose / recover), navigation, wake lock, install, progress summaries.
- `src/lib/`: Tokens, theme, the `data/` directory, the app secret and loopback check, the streaming body cap, and the student profile schema, file and merge operations.
- `src/stores/`: Zustand stores: `useCubyntraStore` (scan) and `useTutorStore` (guided solve, profile, trainer, timer).
- `src/components/`: React UI: the `ui/` kit, `shell/`, and one folder per screen or feature (home, scan, camera, review, solve, twin, trainer, timer, progress, pair, companion, settings).
- `src/app/`: Next.js routes: the `(app)/` screens including `/companion`, `api/` (auth, coach, session, student) and `manifest.ts`.
- `docs/`: Engineering documentation, tutor docs (`docs/tutor/`) and architectural decision records (`docs/ADR/`).
- `tests/`: Automated unit, integration, property and accessibility tests.

## 3. Git & Pull Request Conventions
- Never commit broken builds or untested core logic. `npm run lint` (0 errors, 0 warnings), `npm run typecheck`, `npm test` and `npm run build` must pass.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `perf:`, `chore:`).
- Never commit `data/`, `.env*` or the owner's untracked `docs/milestone-*` folders.
- Document any new architectural decisions in `docs/ADR/` and list them in `docs/ADR/README.md`.
