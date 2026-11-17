# Cubyntra Testing Strategy & Quality Assurance Specification

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Status**: Implemented, 1,633 tests in 164 files passing (2026-11-18)  
**Directory**: `tests/`

---

## 1. Quality Assurance Philosophy

1. **The logical cube is checked, not trusted.** Tutor plans are replayed on the cube engine, the
   twin is compared with the logical state after every step, and case tables are checked against
   hand-written sheets rather than their own entries.
2. **No network, no real API calls.** The coach is tested with a fake Anthropic client
   (`tests/helpers/fakeAnthropic.ts`); the build and test suite never call Claude. Route handlers
   are called directly; profile and usage files are written to a scratch data directory.
3. **Privacy is a test.** `tests/sync-privacy.test.ts` fails if any route or message can carry
   image data, or if sync code produces or sends an image.
4. **Design and accessibility are tests.** Gradients, blur, off-token colors, contrast below AA
   and small tap targets fail the suite.
5. **Never loosen a check to get green** (`docs/tutor/GOAL.md`, execution rule 5).

---

## 2. Running the Tests

```bash
npm test                  # the whole suite (vitest run), about 30 s on the dev laptop
npm run test:watch        # watch mode
npm run test:tutor-soak   # tests/tutor-scrambles.test.ts at 10,000 scrambles per method and
                          # variant (vitest.soak.config.mts, about 95 s); npm test runs 1,000
npx vitest run tests/coach-guard.test.ts   # one file

# Write the checkpoint rates as JSON
CHECKPOINT_REPORT=report.json npx vitest run tests/checkpoint-synthetic.test.ts
```

`vitest.config.mts` maps `@/` to `src/`, raises the timeouts (the first Kociemba solve in each
worker builds its tables) and excludes `.claude/` worktrees. There is no coverage script.
`npm run coach:eval` is not a test: it runs only when invoked, and calls Claude only with a key
([DEVELOPMENT.md](DEVELOPMENT.md) §5.4). Nor is `npm run voice:prewarm`, which sends nothing
without `--yes` (§5.6); the voice tests fake ElevenLabs by stubbing `fetch`.

CI (`.github/workflows/ci.yml`, Node 22) runs lint, typecheck, test and build on pushes and pull
requests to `main`.

---

## 3. Suites

Counts are tests per area as of 2026-11-18 (`npx vitest run --reporter=json`).

| Area | Files | Tests | What they cover |
|:---|---:|---:|:---|
| Cube engine (`cube`, `cube-*`, `move-names`) | 7 | 65 | Moves of every kind with hand-written sticker permutations, inverses and orders, `x = R M' L'` style identities, grip, orientation, pieces, validation and parity, move names |
| Tutor engine (`tutor-*`) | 34 | 250 | Every stage with hand-made cubes, F2L / 2-look / full OLL and PLL tables against hand-written sheets, cross search ≤ 8, replay and advance checks, the fixed-seed scramble suite, checkpoint verification, diagnosis, recovery, the worker jobs, the tutor store |
| Checkpoint end to end (`checkpoint-*`) | 2 | 16 | Synthetic photos through the real sampling, glare and palette code with injected mistakes; the adapter |
| Learning (`learn-*` except `learn-case-tiles`) | 4 | 61 | Trainer sets and drills, Leitner boxes, mastery and streaks, WCA inspection and averages |
| Vision (`vision*`, `color-boundary`, `calibration`, `capture-quality`, `face-analyzer`, `feature-extractor`, `ml-detector`, `reticle-mapping`, `resolve-colors`) | 12 | 81 | Color spaces, red/orange boundary, ML features (parity with the Python formula) and detector, capture checks, 54-tile resolution, palette, checkpoint read, camera start and timeouts |
| Solver (`solver*`) | 2 | 14 | Kociemba solves verified by simulation, invalid cubes rejected; the worker protocol, client and fallback |
| 3D twin (`three-*`, `arrows`, `twin-*`, `cube-visualizer`, `app-solve-twin`) | 17 | 146 | Turn direction and exact snapping, playback controller, grip camera, spotlight, ghost, letters, context loss, arrows on all six faces, teaching-twin mapping and hooks, twin colors equal `expectedState` after each step |
| Coach (`coach-*`) | 11 | 244 | Facts parser, system prompt size and stability, templates and case notes for every id, the move guardrail (tables both ways), the service with a fake SDK (request shape, cap cutoff, fallbacks, usage from stream events), SSE, routes (token, rate limit, body cap), `useCoach` |
| Sync (`sync-*`, `session-routes`, `paired-phone-routes`, `companion*`, `mobile-integration`, `network`) | 20 | 176 | Session manager, routes and secrets, typed code, pairing storage, message validation, playback and tutor mirroring, phone solve, reconnect, privacy scan, phone capture UI |
| Profile and local data (`student-*`, `data-dir`, `local-auth`, `app-token`, `read-body-capped`, `route-body-cap`) | 9 | 98 | Profile v3 schema and v1 / v2 migrations, operation merge, `/api/student`, atomic writes, the app secret and loopback check, streaming body caps |
| Scan store (`store-*`, `review-store`, `integration`) | 6 | 27 | Scan flow, review fixes and pending phone faces, resets, seek, errors, solver client |
| App shell and screens (`app-*` except `app-token` and `app-solve-twin`, `pwa-*`, `wake-lock`, `method-stages`) | 14 | 83 | Every shell page renders, scan, solve, trainer, timer, progress, settings, method info and stages, manifest and icons, install prompt, wake lock, the Voice settings and the solve screen's voice |
| Design and accessibility (`design-rules`, `tokens`, `ui-*`, `a11y-*`, `learn-case-tiles`) | 13 | 121 | No gradients / blur / glass / off-token colors, token block, UI kit components, axe audit of every screen, contrast, tap targets, reduced motion |
| Voice (`voice-*`) | 13 | 251 | Every move spoken in both styles, markdown stripping, guard-failed coach text never spoken, the phrase bank, the speech queue's interruption, the device voice, credits (cap, 80% warning, balance min), the ElevenLabs client and routes with a fake `fetch` (token, body cap, rate limit, cache hit spends nothing, fallbacks), the fallback chain, privacy (text only), one speaker when paired, narration and `useVoice`, the prewarm script |
| **Total** | **164** | **1,633** | |

Each file is counted in one area (for example `learn-case-tiles` under design, `app-token` under profile);
the per-file list is the output of `npx vitest run`.

---

## 4. Key Measured Results

- **Tutor engine**: 10,000 fixed-seed scrambles per method and variant all solve, every step
  advances, every case id is triggered; averages 155.8 turns (beginner's), 75.7 (CFOP 2-look),
  62.3 (CFOP full last layer). Details in [`docs/tutor/METHODS.md`](tutor/METHODS.md) §8.
- **Checkpoints**: on synthetic photos, correct steps match 311 / 311; 1,819 of 1,821 visible
  injected mistakes are reported as a mismatch on the first photo and the top diagnosis is right
  in all 1,819; zero confident-but-wrong diagnoses. Details in
  [`docs/tutor/CHECKPOINTS.md`](tutor/CHECKPOINTS.md) §7.
- **Accessibility**: axe finds no serious or critical violations on any screen; method in
  [UI_UX.md](UI_UX.md) §5.3.

---

## 5. Limits

- Vision numbers come from synthetic photos; real cameras, glare and worn stickers are checked
  by hand, not by the suite.
- jsdom has no layout: contrast is computed from the tokens and tap targets from class names.
- The coach's live behaviour is sampled by `npm run coach:eval` with a key, outside the suite.
