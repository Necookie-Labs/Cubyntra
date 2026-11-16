# Cubyntra Tutor — Morning Report

Build of `docs/tutor/GOAL.md`, run on 2026-11-17/18. Everything is on branch **`feat/tutor`**
(pushed to `origin`; not merged, no PR opened). `main` is untouched.

## Summary
Cubyntra is now a local, single-student cube tutor PWA. A student scans their cube. The 3D twin
teaches the beginner's method or CFOP (2-look or full last layer) one step at a time on their own
cube. A checkpoint scan after each step confirms it or diagnoses the mistake. A Claude Haiku 5.5
coach explains each step, falling back to built-in text when no key is set or the $10 cap is
reached.

Every item in `PROGRESS.md` is done; nothing is blocked. The build was checked with automated
tests and synthetic camera images only. **No real phone, camera or Claude key was used.**

## Numbers (checked on the final commit)
| Check | Result |
|---|---|
| `npm run lint` | 0 errors, 0 warnings |
| `npm run typecheck` | clean |
| `npm test` | **1,358 tests in 148 files, all passing** |
| `npm run build` | passes, 13 routes |
| `npm audit --omit=dev` | 0 vulnerabilities (was 1 critical + 2 high) |
| Production smoke test (`next start`) | all 9 pages, manifest and icons 200; unknown path 404; coach status 200 with token (`mode: mock`, cap $10); `/api/student` 401 without token |
| Tutor soak (`npm run test:tutor-soak`, 10,000 scrambles each, seed 2026) | all solved; every step replays and advances; every case triggered |

| Method | Avg turns | Max turns | Avg steps |
|---|---|---|---|
| Beginner's | 155.8 | 231 | 21.6 |
| CFOP, 2-look | 75.7 | 106 | 9.8 |
| CFOP, full (57 OLL / 21 PLL) | 62.3 | 87 | 8.2 |

Checkpoint checks, measured on synthetic photos (`docs/tutor/CHECKPOINTS.md`):
- **Correct steps:** 311/311 matched, and 277/277 when a face was held rotated.
- **Mistakes:** 1,819/1,821 visible mistakes detected on the first check. The other 2 look exactly
  like a rotated hold; the app asks for the face again and then reports them.
- **Diagnosis:** the top diagnosis was right every time, and never confidently wrong.

## What was built
- **Phase 0, stabilize:**
  - The guidance arrows were reversed for every move; fixed and tested on all six faces.
  - Next.js upgraded to 16.4.6.
  - The vision feature bug and the orange/red hue split are fixed.
  - The Python scripts no longer hard-code a personal path.
- **Phase 1, voxel design system:** flat light/dark tokens, Pixelify Sans headings, and block
  components. A design-rules test fails the build on any gradient, blur, backdrop filter,
  text-shadow or off-token color (ADR-011).
- **Phase 2, cube engine:** rotations, wide and slice moves, the grip model, piece queries and
  plain-language move names.
- **Phase 3, tutor engine** (`src/tutor`): both methods, the 41 F2L cases, 2-look and full
  OLL/PLL. Every plan is replayed on the logical cube before it is shown (ADR-012).
- **Phase 4, teaching twin:** voxel cubies, playback controls, move chips, a spotlight on the
  pieces involved, an "after" preview, the solver and tutor in a Web Worker, and WebGL
  context-loss recovery.
- **Phase 5, checkpoints:**
  - The student's own color palette from the full scan is used to read each checkpoint.
  - Only the relevant stickers are compared, with a confidence per sticker; uncertain ones get
    a "show me again".
  - Mismatches are diagnosed as wrong direction, skipped, doubled, wrong face, wrong grip,
    stopped early or extra repeats. The app can correct from the slip or ask for a rescan
    (ADR-013).
- **Phase 6, coach:**
  - `claude-haiku-5-5` at effort low with thinking off, streamed, with a cached system prompt of
    about 5K tokens.
  - A guardrail checks every move notation in a reply against the plan, including condensed forms
    like `RUR'U'`.
  - Built-in text for every stage and case, used for mock mode, refusals and the cap.
  - Spend is tracked in `data/coach-usage.json` and capped at $10/month.
  - Requests need a local token and are rate-limited (ADR-014).
- **Phase 7, app shell:** Home, Scan, Solve, Trainer, Timer, Progress, Settings and Pair. The
  profile and an interrupted solve are kept in `data/student.json`. Manifest, icons, screen wake
  lock and an install prompt.
- **Phase 8, sync:**
  - Only cube states and colors are sent between devices, never images; the photo relay is
    deleted (ADR-015).
  - Pairing uses a crypto secret carried in the QR code's URL fragment (it never reaches the
    server), plus a 6-character typed code.
  - Either device can control playback.
- **Phase 9, learning:**
  - **Trainer:** five case sets with Leitner repetition.
  - **Timer:** WCA inspection rules, +2/DNF, ao5/ao12.
  - **Progress world:** two voxel islands, streaks and the algorithm collection.
  - **Graduation:** the app suggests beginner's → CFOP 2-look → full.
- **Phase 10, finish:**
  - **Accessibility:** an axe audit on every page, contrast checks on the tokens (it found and
    fixed a 1.1:1 dark-theme outline), 44px tap targets and reduced motion.
  - **Docs:** every file in `docs/` was checked against the code; README and CHANGELOG 2.0.0
    rewritten; 25 PDFs regenerated.

An independent review after Phase 9 found 15 bugs. All 15 are fixed, each with a regression test.
The serious ones:
- Two devices overwrote each other's profile; saves are now merged on the server.
- A stale grip message re-planned the wrong step.
- The coach's guardrail missed condensed move notation.
- "Solve another" was treated as a rescan.
- Coach spend was undercounted on aborted replies.

## Run it
```bash
npm install
npm run dev            # HTTPS on :3000 (needed for the phone camera)
# laptop: open https://localhost:3000   (pairing and the token only work from localhost)
# phone:  /pair on the laptop → scan the QR (same Wi-Fi) → trust the dev certificate
```
The coach works without a key, using built-in text. For live hints, add
`ANTHROPIC_API_KEY=...` to `.env.local` and restart; Settings then shows the mode and month spend.
To evaluate the coach with a real key, run `npm run coach:eval`, which writes
`data/coach-eval-report.md`. With about 50 short requests on Haiku, it should cost a few cents.

**Important:** a Claude Max subscription does not provide API credit. The key must come from
console.anthropic.com, which is billed separately. Set a spend limit there too, as a second guard
behind the app's $10 cap.

## What you need to check by hand
1. **The look:** voxel style in light and dark, on the phone and the desktop. No screenshots
   were taken overnight.
2. **The real camera:** full scan and checkpoint scans under your lighting.
   - The checkpoint tests used synthetic images, with lighting up to 1.08× the scan's brightness.
     Brighter light can clip white stickers; the app then asks to show the face again rather than
     guessing.
3. **A real phone:** installing the certificate, pairing by QR and by the typed code, the laptop
   mirroring the phone, wake lock, and Add to Home Screen.
4. **A live Claude key:**
   - Check reply quality and how often the guardrail falls back to templates (`coach:eval`
     reports this).
   - The guardrail was tuned strictly; a lone capital in prose inside move-like context may fall
     back to the template.
5. **Teaching flow with a real learner:** step sizes, the beginner's two flips (daisy and cross
   are done with yellow on top), and the wording of each step.

## Decisions made during the build that you may want to revisit
- **Pairing:** the laptop must be opened at `https://localhost:3000`. Opened by its LAN IP, the
  token route refuses it. A LAN client that fakes loopback headers can still read the token; this
  is documented in SECURITY_PRIVACY.
- **Sync:** phone scans send nine average tile colors per face (27 numbers, no image), so the
  laptop's nine-per-color correction still works (ADR-015).
- **Mastery:** a stage counts as mastered when at least 3 of its last 5 completions needed no
  "show the moves" hint.
- **Rotations in tables:** no table algorithm contains a whole-cube rotation, so the A, E and V
  perms use rotation-free versions with B-face turns.
- **Diagnosis timing:** diagnosis runs on the main thread. It measured about 20 ms per check in
  Node; it was not moved to the worker.
- **Service worker:** no offline caching yet. It is a stretch goal, because it needs a
  certificate the phone trusts; setup notes are in `docs/DEVELOPMENT.md` §6.
- **Known small limits:**
  - Scan-review tiles are 24px on phones (meets WCAG 2.2 AA, but below 44px).
  - A remote seek on the laptop jumps the twin without animating.
  - Two devices running different solves at once share one grip setting. The app assumes one
    student and one solve.

## Housekeeping
- **Commits:** 335 on `feat/tutor` since `b5176ec` (327 non-merge), across 351 files under
  `src/` and `tests/`.
- **Attribution:** commits by the Fable builder (tutor engine, checkpoints, OLL/PLL tables) carry
  a `Claude Fable 5.2` co-author trailer; everything else carries `Claude Opus 5.5`.
- **Not committed:** your untracked `docs/milestone-1/2/3/` folders were left alone.
- **Next step:** review `feat/tutor`, then open a PR to `main` when you're happy.
