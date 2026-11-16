# ADR-015: State-Only Phone ↔ Laptop Sync

**Status**: Accepted
**Date**: 2026-11-17
**Deciders**: Necookie Labs Core Engineering Team
**Amends**: [ADR-009](009-mobile-companion-qr-pairing.md), [ADR-010](010-desktop-side-analysis-and-global-color-resolution.md)
**Restores**: [ADR-001](001-client-side-processing.md) (no pixels leave the device that captured them)

---

## Context

ADR-010 had the phone post a 512 px JPEG of every face to the laptop through the Cubyntra server,
which held the photos in memory until the student confirmed the scan. That narrowed ADR-001's
promise that camera pixels never leave the device. A review of the relay also found:

- 6-character session ids from `Math.random` and no authentication: anyone on the network who
  guessed an id could read photos or drive a session.
- `POST /api/session` accepted a `preferredId` and overwrote an existing session with that id.
- An unvalidated legacy `thumbnail` field, and request bodies read in full before any size check.
- Unbounded session count, boolean connection flags (one of two laptop tabs closing marked the
  laptop as gone), event-stream cleanup only through `cancel()`, `disconnect()` that never ended
  the session on the server, and an `initSession` that could leak a session on unmount or a
  double click.

The tutor (GOAL.md, Phase 8) also needs the phone and laptop to share more than a scan: the
current step, playback, the grip and checkpoint results.

## Decision

### 1. The phone reads, only state travels
The phone runs the same face analysis the laptop used (`analyzeFaceContext`: tile sampling, ML
cube check, wrong-face check) on its own reticle crop, then discards the pixels. It sends a
`face-scanned` message with nine colors, nine confidences and the nine **tile mean colors**
(integers 0-255). The tile means let the laptop keep running the nine-per-color resolution
(`resolveCubeColors`, ADR-010) across all six faces; 27 numbers per face describe the stickers,
not the scene, and cannot be turned back into an image. The photo, verdict, rescan, confirm and
reset routes, the server image store, the `thumbnail` field and the review screen's photo crops
are deleted.

### 2. Typed, validated messages
`src/sync/types.ts` defines eight message types: `cube-state`, `face-scanned`, `step` (method,
step index, plan id, optional notation), `playback` (play / pause / seek / index / speed),
`grip`, `checkpoint-result`, `presence` and `scan-control` (rescan / confirmed / reset). Every
body is read with a 16 KB streaming byte cap (`src/lib/readBodyCapped.ts`, never `req.text()`
first) and parsed field by field (`src/sync/validation.ts`). Parsers build new objects from known
fields only, so an unknown field (an image, a blob) is dropped, never relayed. One route,
`POST /api/session/[id]/messages`, carries all of them.

### 3. Pairing and authentication
- `POST /api/session` needs the per-install app token (`x-cubyntra-token`), which the laptop's
  own browser gets from the loopback-only `GET /api/auth/token`. Any body is ignored: there is no
  `preferredId`.
- The session id is `crypto.randomUUID()`; the session secret is 128 bits from
  `crypto.getRandomValues`; a 6-character code from a 29-symbol alphabet with no look-alikes
  (no 0/O, 1/I/L, U/V) is drawn with rejection sampling, all from the crypto RNG.
- The QR code holds `/companion#s=<id>&k=<secret>&t=<appToken>`. The credentials are in the URL
  fragment, which browsers never send to a server. The app token is included so the phone can
  call `/api/coach` (`getPairingToken()`).
- When the QR code cannot be scanned, the student opens `/companion` and types the code;
  `POST /api/session/pair` returns the same credentials. A code works once, for 10 minutes, and
  guesses are limited to 10 per minute across all devices.
- Every other sync route requires the secret in `x-cubyntra-session`, compared in constant time
  (SHA-256 of both sides, then `timingSafeEqual`): 404 for an unknown session, 403 for a missing
  or wrong secret. The event stream is read with `fetch`, not `EventSource`, so the secret
  travels in a header and never in a URL.

### 4. Where the phone keeps the secret
On arrival the phone moves the credentials to **sessionStorage** and strips the fragment with
`history.replaceState`. sessionStorage survives a reload of that tab (a Wi-Fi drop or screen
lock must not lose the pairing) but is scoped to the tab and cleared when it closes, so a pairing
does not outlive the lesson. The laptop keeps the secret in memory only.

### 5. Sessions
At most 8 sessions exist. Creating a ninth evicts the least recently used one with no open
stream, or answers 503 when all are in use. A session expires after 30 minutes without activity
(an open stream's 15 s keep-alive counts) and after 12 hours regardless. Open streams are counted
per role. Stream cleanup (unsubscribe, stop the keep-alive, release the count) runs once, on the
first of: the client cancelling, the request's abort signal, or the session ending, which also
sends an `ended` frame. The laptop's `disconnect()` sends `DELETE`; `initSession` returns the
in-flight promise to a second caller and is aborted on unmount, deleting a session created just
before.

### 6. Two-way playback, last writer wins
The server stamps every message with a per-session monotonic sequence number. Each device applies
playback messages in sequence order, its own included, so concurrent commands settle on the one
the server received last on both devices. `index` reports from the device animating the twin are
not re-applied where they came from, and that device ignores others' reports while it plays, so
a late report cannot pull it backwards (`src/sync/playbackSync.ts`). The laptop mirrors the
phone's commands; the phone mirrors the laptop's position.

## Consequences

### Positive
- ADR-001 holds again for every scan path: camera pixels never leave the device that captured
  them. Webcam frames stay in the laptop's browser; phone frames stay on the phone.
- Sync routes are authenticated, size-capped, rate-limited and bounded in number and lifetime.
- One generic message route serves the scan, the solve and the coming tutor features.

### Negative / trade-offs
- The phone does the analysis, so its CPU and the ML detector load there (they already ran there
  for the live checks).
- The laptop's review can no longer show a crop of the student's photo next to a doubtful tile;
  the student checks it against the cube in hand.
- The app token in the QR code means a paired phone is trusted like the laptop. A photo of the
  QR code shares that trust until the session ends; the app token itself lasts until
  `data/app-secret` is deleted.
- The relay still needs one long-running server process (as under ADR-009/010).
- `grip` and `checkpoint-result` are relayed and kept in the snapshot. Since Phase 9 both devices
  consume them: whichever device runs `/solve` publishes its step, grip, playback and checkpoint
  verdicts (the laptop over the pairing it created, a paired phone as `mobile` over the pairing it
  joined, `useSolveSyncTarget`), and the other applies the grip and a verdict for the same step. A
  device with no solve open joins the step the other shows (the tutor is deterministic, so the same
  cube, grip and step number give the same plan). Two devices running different solves at once
  still share one grip; the app assumes one student and one solve.
- Every grip names its step (`planId`, `stepIndex`) and is applied only to that very step, so a
  late grip from a step already left cannot re-plan the wrong step. A device that makes a new plan
  for a step (a corrective step after a diagnosed slip, a re-plan after a regrip or rescan) or moves
  on to the next step publishes `cube-state`, `step` and `grip` one after another; the other device
  adopts that plan instead of planning on its own: a corrective step is rebuilt from its own plan,
  the cube sent and the step's moves, anything else is planned from the cube sent, and either is
  taken only if its plan id matches. A step older than the one on screen is ignored. `step` also
  carries `solveStartedAt`, so both devices save progress as the same solve (see the
  `PATCH /api/student` merge rules in `API_REFERENCE.md`).
- Each event stream watches for silence: no frame (not even the 15 s ping) for 30 s means a dead
  connection, which the client drops and reopens.
