# Changelog

All notable changes to **Cubyntra** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
