# ADR-009: Mobile Companion Scanner with Ephemeral QR Pairing & Center-Sticker Calibration

**Status**: Accepted  
**Date**: 2026-09-27  
**Deciders**: Necookie Labs Core Engineering Team  

---

## Context and Problem Statement
Laptop and desktop webcams typically feature low-resolution sensors (720p/1080p), slow focus hunting, and high motion blur when moving twisty puzzles across the reticle. Additionally, users find holding a physical cube up in the air in front of a laptop display ergonomically cumbersome.

In contrast, modern smartphone cameras provide 12–48MP sensors, phase-detection autofocus, optical stabilization, and built-in flashlight/torch capability to neutralize indoor shadow gradients.

However, introducing a mobile component must satisfy two strict non-negotiable architectural invariants:
1. **Client-Side Privacy ([ADR-001](001-client-side-processing.md))**: Video streams and pixel data must NEVER leave the user's local devices or be uploaded to remote cloud storage.
2. **Zero-Install Friction**: Requiring users to download a native app from the App Store or Google Play introduces high adoption barriers and build maintenance overhead.

Furthermore, physical cube scanning must overcome ambient lighting temperature shifts (e.g. warm 2700K incandescent bulbs causing white/yellow and orange/red misclassifications).

---

## Decision Drivers
1. **High-Resolution Optical Fidelity**: Leverage high-megapixel smartphone cameras for crisp, glare-free sticker sampling.
2. **Zero-Install Cross-Platform Web Companion**: Allow instant pairing from iOS Safari or Android Chrome simply by pointing the phone camera at a desktop QR code.
3. **Strict Client-Side Privacy**: Ephemeral in-memory session relay over Server-Sent Events (SSE) and direct peer data dispatch. Zero photos are permanently stored on any server.
4. **Dynamic Center-Sticker Calibration**: Use the mechanically fixed 6 center pieces as dynamic ground-truth optical anchors to cancel ambient color cast.
5. **Mathematical Invariant Gating**: Enforce the physical Rubik's cube rule of exactly 9 stickers per color using Hungarian optimal assignment.

---

## Considered Alternatives
1. **Desktop Webcam Live Video Only (Status Quo)**: Retain desktop-only webcam streaming. (Rejected: Blurry sensors and poor ergonomics degrade scan completion rates).
2. **Native iOS / Android Apps (React Native / Swift / Kotlin)**: Build standalone mobile applications distributed via app stores. (Rejected: High barrier to entry, slow install loop, app store review delays).
3. **PWA Mobile Companion with Ephemeral QR Pairing & Center-Sticker Calibration (Chosen)**:
   - Desktop displays a dynamic QR code containing a secure ephemeral session ID.
   - Phone opens `/companion?session=<id>` in the mobile browser.
   - High-res still photos are captured on phone with flashlight illumination.
   - 6 center stickers dynamically calibrate the CIELAB palette for the specific room lighting.
   - Scanned face matrices and lightweight preview thumbnails are dispatched to desktop in real-time, instantly mirroring onto the 3D digital twin.

---

## Decision Outcome
We adopted **Alternative 3**:
- Created an ephemeral in-memory session manager in `src/sync/sessionManager.ts` and SSE streaming endpoint at `/api/session/[id]/events`.
- Built the zero-install mobile companion viewport at `/companion` with 3x3 reticle HUD, orientation guidance, and hardware torch controls.
- Integrated dynamic center-sticker palette calibration in `src/vision/dynamicCalibration.ts` and 54-sticker invariant solving via the Hungarian algorithm in `src/vision/invariantSolver.ts`.
- Added the "Scan with Phone" QR pairing modal to the desktop interface (`src/components/sync/MobilePairingModal.tsx`).

---

## Consequences
### Positive:
- **Pristine Optical Quality**: Eliminates motion blur and low-resolution webcam noise by utilizing smartphone still photography.
- **Flawless Color Accuracy**: Center-sticker dynamic anchoring neutralizes room lighting color cast, solving orange vs red and white vs yellow ambiguities.
- **Zero Install Friction**: Works instantly in Safari and Chrome without installing app store packages.
- **100% Privacy Preservation**: Transient peer synchronization ensures no images are ever permanently retained.

### Negative / Trade-Offs:
- Requires both devices to have network access to communicate with the session relay (or local Wi-Fi connectivity).
