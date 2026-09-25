# Cubyntra

<div align="center">

**See it. Solve it.**

*A high-precision, client-side Computer Vision Rubik's Cube scanner, mathematical validator, Kociemba two-phase solver, and interactive 3D digital twin.*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15+-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL-black?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![Vitest](https://img.shields.io/badge/Vitest-35%2F35%20Passing-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev/)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Client--Side-brightgreen?style=for-the-badge&logo=shield)](docs/SECURITY_PRIVACY.md)

</div>

---

## 1. Executive Overview

**Cubyntra** is an autonomous engineering project developed by **Necookie Labs**. It bridges physical mechanical puzzles and client-side web computing by providing real-time optical scanning of physical Rubik's cubes, mathematical invariant validation, sub-second solving via Herbert Kociemba's two-phase algorithm, and an interactive 3D digital twin rendered in WebGL.

### Core Engineering Invariants
1. **Mathematical Correctness Over Visuals**: The logical cube state is the ground truth. Three.js is a visual representation only.
2. **Client-Side Privacy**: Video streams and pixel data must NEVER leave the browser. Zero image uploads.
3. **Zero Floating-Point Drift**: All 3D layer rotations snap cubie quaternions and matrices back to exact integer axes ($\{-1, 0, 1\}$).
4. **Sub-Second Deterministic Solving**: Computes near-optimal solutions (20–24 Half Turn Metric moves) in under 50ms using the two-phase algorithm.

---

## 2. Key Features

- **Client-Side Computer Vision Scanner**:
  - Live WebRTC camera stream with 3x3 guided viewport reticle.
  - Perceptual color classification via CIELAB $\Delta E$ and HSV color spaces.
  - Circular kernel sampling to eliminate sensor noise and glare.
  - 10-frame temporal stability filtering to prevent motion blur misclassifications.
- **Mathematical Invariant & Parity Validation**:
  - Verifies 9 facelets per color and center orientations.
  - Validates physical piece integrity (impossible corner/edge color pairings).
  - Validates edge flip sum, corner twist sum, and permutation parity.
  - Visual Error Recovery Modal allowing manual correction of misclassified stickers.
- **Deterministic Kociemba Two-Phase Solver**:
  - Phase 1: Reduction from group $G$ to subgroup $H = \langle U, D, R^2, L^2, F^2, B^2 \rangle$.
  - Phase 2: Solving subgroup $H$ to identity.
  - Internal simulation verification guaranteeing solution correctness before display.
- **Interactive 3D Digital Twin**:
  - 27-cubie WebGL model built with Three.js.
  - Dynamic slice grouping and detachment with zero floating-point accumulation drift.
  - 3D directional animated arrows indicating exact rotation directions.
  - OrbitControls inspection with smooth inertial damping.
- **Full Playback & Step-by-Step Guidance**:
  - Interactive move tape showing upcoming and completed moves.
  - Play, pause, step forward, step backward, and speed multiplier ($0.5\times$ to $4\times$).

---

## 3. Architecture & Directory Boundaries

```
src/
├── cube/          # Pure logical domain models (faces, stickers, rotations, invariants)
├── vision/        # Camera capture, 3x3 sampling grid, HSV/CIELAB conversion, stability
├── solver/        # Herbert Kociemba two-phase algorithm and move parsing
├── three/         # Three.js 27-cubie construction, animations, and directional arrows
├── stores/        # Zustand store coordinating scanning, solving, and playback states
└── components/    # Modular React components (Scanner, Visualizer, Controls, Debugger)

tests/             # Automated test suite (35 unit & integration tests passing)
docs/              # Complete engineering specifications and ADRs
scripts/           # Documentation PDF generation automation
```

---

## 4. Quick Start

### Prerequisites
- Node.js 20.x or higher LTS
- npm 10.x or higher

### Installation & Execution
```bash
# 1. Clone the repository
git clone https://github.com/Necookie-Labs/Cubyntra.git
cd Cubyntra

# 2. Install dependencies
npm install

# 3. Start local development server (with Turbopack)
npm run dev

# 4. Open http://localhost:3000 in your browser
```

### Automated Testing & Quality Gates
```bash
# Run all 35 unit and integration tests
npm run test

# Run TypeScript typecheck
npm run typecheck

# Run ESLint check
npm run lint

# Build production bundle
npm run build
```

---

## 5. Engineering Documentation Suite

Comprehensive technical specifications and architectural decision records are maintained in [`/docs`](docs/):

| Document | Description | Format |
|:---|:---|:---:|
| [Product Requirements Document (PRD)](docs/PRD.md) | High-level vision, target personas, and scope | [Markdown](docs/PRD.md) / [PDF](docs/pdf/Cubyntra-PRD.pdf) |
| [Software Requirements Spec (SRS)](docs/SRS.md) | Functional, non-functional, and interface requirements | [Markdown](docs/SRS.md) / [PDF](docs/pdf/Cubyntra-SRS.pdf) |
| [System Architecture](docs/ARCHITECTURE.md) | Architectural layers, boundaries, and dependencies | [Markdown](docs/ARCHITECTURE.md) / [PDF](docs/pdf/Cubyntra-Architecture.pdf) |
| [System Design Document](docs/SYSTEM_DESIGN.md) | Component specifications and data contracts | [Markdown](docs/SYSTEM_DESIGN.md) / [PDF](docs/pdf/Cubyntra-System-Design.pdf) |
| [Computer Vision Pipeline](docs/COMPUTER_VISION.md) | Sampling, color classification, and stability | [Markdown](docs/COMPUTER_VISION.md) / [PDF](docs/pdf/Cubyntra-Computer-Vision.pdf) |
| [Cube Mathematical Model](docs/CUBE_MODEL.md) | Group theory, coordinate systems, and invariants | [Markdown](docs/CUBE_MODEL.md) / [PDF](docs/pdf/Cubyntra-Cube-Model.pdf) |
| [Solver Specification](docs/SOLVER.md) | Kociemba two-phase algorithm and HTM metrics | [Markdown](docs/SOLVER.md) / [PDF](docs/pdf/Cubyntra-Solver.pdf) |
| [3D Graphics Engine](docs/THREE_D_ENGINE.md) | 27-cubie construction and drift-free snapping | [Markdown](docs/THREE_D_ENGINE.md) |
| [UI/UX Design System](docs/UI_UX.md) | Color palette, design tokens, and user journeys | [Markdown](docs/UI_UX.md) / [PDF](docs/pdf/Cubyntra-UI-UX.pdf) |
| [Testing & QA Strategy](docs/TESTING.md) | Test coverage matrices and QA protocols | [Markdown](docs/TESTING.md) / [PDF](docs/pdf/Cubyntra-Testing.pdf) |
| [Security & Privacy](docs/SECURITY_PRIVACY.md) | Client-side privacy and WebRTC security | [Markdown](docs/SECURITY_PRIVACY.md) / [PDF](docs/pdf/Cubyntra-Security-Privacy.pdf) |
| [Future Hardware (Robotics)](docs/FUTURE_HARDWARE.md) | Conceptual robotic rig (OUT OF SCOPE FOR V1) | [Markdown](docs/FUTURE_HARDWARE.md) / [PDF](docs/pdf/Cubyntra-Future-Hardware.pdf) |
| [Product Roadmap](docs/ROADMAP.md) | Milestone progression from V1 to V4 | [Markdown](docs/ROADMAP.md) / [PDF](docs/pdf/Cubyntra-Roadmap.pdf) |
| [Architectural Decision Records (ADR)](docs/ADR/README.md) | Formal records of technical decisions | [Markdown Directory](docs/ADR/) |

---

## 6. Privacy Commitment

Cubyntra operates strictly under a zero-image-upload model. Camera feeds are processed synchronously in volatile browser memory. Video frames, canvas buffers, and pixel values are never transmitted over the internet or written to persistent storage.

---

## 7. License & Credits

Cubyntra is an open-source engineering project by **Necookie Labs**.  
Licensed under the [MIT License](LICENSE).
