# ADR-010: Desktop-Side Photo Analysis & Global 54-Sticker Color Resolution

**Status**: Accepted
**Date**: 2026-09-29
**Deciders**: Necookie Labs Core Engineering Team
**Amends**: [ADR-001](001-client-side-processing.md), [ADR-009](009-mobile-companion-qr-pairing.md)

---

## Context and Problem Statement

Under ADR-009 the phone classified each face on its own and sent nine color labels to the desktop. Three problems followed:

1. **Colors were guessed tile by tile.** Each tile was matched to its nearest reference color in isolation, so nothing stopped a scan from producing, say, seven reds and eleven oranges. ADR-009 records center-sticker calibration (`buildDynamicPalette`) and the Hungarian nine-per-color solver (`resolve54StickerInvariant`) as integrated. They were implemented and unit-tested, but no production code path called them.
2. **The desktop never saw pixels.** It could not calibrate across faces, show the user a doubtful tile, or re-read anything.
3. **The crop did not match the reticle.** The phone cropped a fixed 65% of the camera frame's short side, while the on-screen reticle is a CSS square over an `object-fit: cover` video. On a portrait phone with a landscape stream the crop was about 1.76x wider than what the user framed, so edge cells sampled background.

The product also needed the scan to be trustworthy "when returning to the website", and the phone to teach the user how to take each photo.

---

## Decision Drivers

1. The resolved cube must be physically valid by construction, never just a best guess per tile.
2. The user must be able to verify and correct the scan against their own photos before solving.
3. Pixels must never be persisted, and must leave memory as soon as they are no longer needed.
4. Reuse the existing vision stack (sampling, ML detector, calibration, Hungarian solver) rather than add new models.

---

## Considered Alternatives

1. **Keep classifying on the phone, add global resolution there.** The phone would need all six faces before sending anything, and the desktop still could not show photos for review. Rejected.
2. **Send photos phone-to-desktop over a WebRTC data channel.** Pixels would never touch the server, but this needs signaling, ICE, and a relay fallback for networks where peer connections fail. Deferred; see Consequences.
3. **Send each face as a cropped photo through the existing in-memory relay, analyze and resolve on the desktop.** Chosen.

---

## Decision Outcome

**Transport.** The phone crops exactly the reticle square, mapping it through the video's cover transform (`mapElementRectToVideo`), and posts a 512x512 JPEG to `POST /api/session/[id]/face`. The server holds the photo in a map kept apart from `SessionState`, so a photo can never appear in a session snapshot or be replayed on reconnect, and it broadcasts only a small `FACE_IMAGE` notice. The desktop fetches the photo, analyzes it, and posts a verdict that the phone receives over its own event stream. Bodies over 1.5 MB are refused. Photos are dropped on confirm, reset, delete and session expiry.

**Per-face analysis** (`src/vision/faceImageAnalyzer.ts`). Samples the nine tiles, runs the existing ML cube detector, and rejects a photo only when it is clearly not a cube or its center clearly belongs to another face. The 15 delta-E margin is deliberately high because a false rejection strands the user. No final colors are assigned here.

**Global resolution** (`src/vision/resolveCubeColors.ts`), once all six faces are in:
1. `buildDynamicPalette` calibrates the six reference colors from the six observed centers.
2. Every tile's distance to each calibrated color becomes a cost, and `resolve54StickerInvariant` finds the minimum-cost assignment with exactly nine tiles per color.
3. If the result fails `validateCubeState`, faces are turned by quarter turns (fewest first, top and bottom preferred) until it passes. This fixes the common case of a face held the wrong way round.
4. Tiles with a near-tie (margin under 8 delta-E) or whose color the constraint overrode are flagged. Two centers closer than 7 delta-E report which faces were shot twice.

**Review** (`src/components/review/ScanReview.tsx`). The desktop shows the unfolded net before solving. Flagged tiles are ringed, any tile can be compared with its crop from the user's own photo and corrected, and Confirm & solve is enabled only for a valid cube. The webcam scanner feeds the same resolution and review.

**Capture coaching** (`src/vision/captureQuality.ts`, `src/app/companion/page.tsx`). The phone checks each live frame for framing, the right face, light, glare and motion, says the single most important fix, and takes the photo itself once every check has held for 600 ms. White balance is locked after the camera settles, where the device supports it, so all six faces share one color temperature.

---

## Consequences

### Positive
- A resolved cube always has nine tiles of each color, and an impossible cube cannot be solved without the user seeing why.
- Measured on synthetic photos of a 14-move scramble with different lighting per face, the pipeline recovers the state exactly. A tile placed exactly between red and orange is settled correctly by the nine-per-color rule and flagged. A face photographed a quarter turn off is repaired automatically.
- The user verifies against their own photos, which is what makes the result trustworthy rather than merely likely.

### Negative / Trade-offs
- **Privacy scope changes (amends ADR-001).** Phone photos, small JPEG crops of the cube, now pass through the Cubyntra server process on their way to the desktop. They are held in memory only, capped at 1.5 MB, never written to disk, and deleted once the user confirms. Webcam frames still never leave the browser. If Cubyntra is hosted by a third party rather than run locally, that host's server process handles the photos in memory.
- **The relay needs one long-running server.** Sessions live in a single process's memory and use long-lived event streams. This was already true under ADR-009. Phone pairing works with `next dev`, `next start` or a container, but not on multi-instance serverless hosting.
- **Deferred:** a WebRTC data channel (alternative 2) would keep photos off the server entirely. The relay stays as its fallback.
