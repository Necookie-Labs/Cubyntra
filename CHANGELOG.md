# Changelog

All notable changes to **Cubyntra** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Light theme, with a header switch for Light, Dark and System (follows the OS) and no flash of the wrong theme on load. The phone companion stays dark.
- A way out of every screen: the logo returns home; Back on the webcam scan; Cancel on the phone scan; Try again on camera and pairing errors; "Scan another cube" after solving.
- Error, root-error and 404 pages with Try again and Back to home.
- Desktop shows "Reconnecting…" when the phone link drops and "Pairing ended" with a New QR code button when the session is gone. The QR dialog warns when its link is plain http:// and the phone camera will not open.
- Phone scanning sends a photo of each face and the computer reads it. Colors are resolved across all 54 tiles at once: the centers calibrate the palette, an assignment enforces nine tiles per color, and a face photographed a quarter turn off is turned back automatically ([ADR-010](docs/ADR/010-desktop-side-analysis-and-global-color-resolution.md)).
- Review screen before solving: an unfolded net with hard-to-read tiles marked, each tile comparable with the user's own photo and correctable, and solving enabled only for a valid cube. The webcam scanner uses it too.
- Phone coaching: a first-run guide, a mini cube showing the grip for every face, live checks for framing, wrong face, light, glare and motion with one instruction at a time, and a shutter that takes the photo by itself once the frame holds steady.
- The phone opens its own event stream, so the computer can accept a photo, ask for a retake, request a specific face again, and confirm the scan.

### Fixed
- Header buttons (Scan Cube, Scramble Demo, reset) left the phone session running.
- The phone's "Scan another cube" sent photos to a desktop that was no longer listening.
- A pairing expired after 30 minutes even while connected.
- The error panel could be blank, guessed which face to rescan, and always restarted with the webcam.
- An unexpected solver error left the solving spinner running forever.
- Fullscreen hid the controls, and its icon went out of sync after Esc.
- Several buttons used a non-existent color class and had no background.
- 3D twin: the turning layer detached from the cube whenever the view was orbited; colors were repainted onto the wrong tiles after every turn; autoplay dropped moves at higher speeds and recolored the cube before the turn played; Next and Previous did not animate; orientation snapping was invalid near gimbal lock; orbit damping depended on the display refresh rate; the camera clipped the cube in tall containers.
- The phone cropped a fixed region of the camera frame rather than the reticle the user aligned the cube in.
- The pairing QR code could point at a VPN address (such as Tailscale) that a phone on ordinary Wi-Fi cannot reach.
- Under `next dev` the phone page did not hydrate when opened by the computer's LAN address.
- The bottom-face scan instruction produced a photo a quarter turn off when followed from the previous step.

### Changed
- Phone photos, small JPEG crops of the cube, pass through the server in memory only and are deleted once the scan is confirmed. Webcam frames still never leave the browser. Phone pairing needs a single long-running server.

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
