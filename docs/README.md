# Cubyntra Engineering Documentation Portal

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Tagline**: *See it. Solve it.*  
**Status**: 2.0.0, the local cube tutor  
**Last Updated**: 2026-11-17  

Cubyntra is a local, single-student Rubik's Cube tutor: a PWA served from the student's laptop
that scans their cube, shows each step of the beginner's method or CFOP on a 3D twin, has a
Claude coach explain it, and checks each step with the camera. These documents describe the code
as it is; where a number is measured, the document says how.

---

## Documentation Index

### 1. Product & Specifications
| Document | Format | Description |
| :--- | :--- | :--- |
| [**Product Requirements (PRD)**](./PRD.md) | [Markdown](./PRD.md) • [PDF](./pdf/Cubyntra-PRD.pdf) | Vision, user, goals, scope, user stories and acceptance criteria |
| [**Software Requirements (SRS)**](./SRS.md) | [Markdown](./SRS.md) • [PDF](./pdf/Cubyntra-SRS.pdf) | Functional and non-functional requirements with a traceability matrix |
| [**Roadmap**](./ROADMAP.md) | [Markdown](./ROADMAP.md) • [PDF](./pdf/Cubyntra-Roadmap.pdf) | 1.0 scanner, 2.0 tutor, known gaps |
| [**Tutor goal and progress**](./tutor/GOAL.md) | [Goal](./tutor/GOAL.md) • [Progress](./tutor/PROGRESS.md) | The approved plan for the tutor rebuild and its checklist |

### 2. Architecture & System Design
| Document | Format | Description |
| :--- | :--- | :--- |
| [**System Architecture**](./ARCHITECTURE.md) | [Markdown](./ARCHITECTURE.md) • [PDF](./pdf/Cubyntra-Architecture.pdf) | Principles, pipeline, module boundaries and dependency rules, app shell |
| [**System Design**](./SYSTEM_DESIGN.md) | [Markdown](./SYSTEM_DESIGN.md) • [PDF](./pdf/Cubyntra-System-Design.pdf) | Subsystems, guided-solve sequence, state machines, concurrency |
| [**Data Flow**](./DATA_FLOW.md) | [Markdown](./DATA_FLOW.md) • [PDF](./pdf/Cubyntra-Data-Flow.pdf) | From camera to tile colors, the guided solve, phone sync and the profile |
| [**API Reference**](./API_REFERENCE.md) | [Markdown](./API_REFERENCE.md) • [PDF](./pdf/Cubyntra-API-Reference.pdf) | TypeScript contracts and HTTP routes |

### 3. Tutor
| Document | Format | Description |
| :--- | :--- | :--- |
| [**Methods and the Tutor Engine**](./tutor/METHODS.md) | [Markdown](./tutor/METHODS.md) • [PDF](./pdf/Cubyntra-Tutor-Methods.pdf) | Step plans, beginner's method, CFOP, case tables, soak results, learning rules |
| [**Checkpoint Checks**](./tutor/CHECKPOINTS.md) | [Markdown](./tutor/CHECKPOINTS.md) • [PDF](./pdf/Cubyntra-Tutor-Checkpoints.pdf) | Showing a face, the palette, verification, diagnosis, recovery, measured rates |

### 4. Core Algorithms & Mathematics
| Document | Format | Description |
| :--- | :--- | :--- |
| [**Cube Domain Model**](./CUBE_MODEL.md) | [Markdown](./CUBE_MODEL.md) • [PDF](./pdf/Cubyntra-Cube-Model.pdf) | Facelets, cubies, invariants, move notation, grip and pieces |
| [**Computer Vision Pipeline**](./COMPUTER_VISION.md) | [Markdown](./COMPUTER_VISION.md) • [PDF](./pdf/Cubyntra-Computer-Vision.pdf) | Sampling, classification, ML cube check, 54-tile resolution, student palette |
| [**AI Model Training Methodology**](./AI_MODEL_TRAINING_METHODOLOGY.md) | [Markdown](./AI_MODEL_TRAINING_METHODOLOGY.md) • [PDF](./pdf/Cubyntra-AI-Model-Training.pdf) | Dataset color profiles and the cube / face detector |
| [**Solver**](./SOLVER.md) | [Markdown](./SOLVER.md) • [PDF](./pdf/Cubyntra-Solver.pdf) | Kociemba two-phase solver and the Web Worker that runs solver and tutor jobs |

### 5. 3D Graphics & User Experience
| Document | Format | Description |
| :--- | :--- | :--- |
| [**3D Engine & Teaching Twin**](./THREE_D_ENGINE.md) | [Markdown](./THREE_D_ENGINE.md) • [PDF](./pdf/Cubyntra-Three-D-Engine.pdf) | Voxel cubies, drift-free turns, playback, grip camera, spotlight, preview |
| [**UI / UX**](./UI_UX.md) | [Markdown](./UI_UX.md) • [PDF](./pdf/Cubyntra-UI-UX.pdf) | Voxel tokens and components, screens and navigation, accessibility |

### 6. Quality, Security & Operations
| Document | Format | Description |
| :--- | :--- | :--- |
| [**Testing**](./TESTING.md) | [Markdown](./TESTING.md) • [PDF](./pdf/Cubyntra-Testing.pdf) | Suites, counts, soak, measured results |
| [**Security & Privacy**](./SECURITY_PRIVACY.md) | [Markdown](./SECURITY_PRIVACY.md) • [PDF](./pdf/Cubyntra-Security-Privacy.pdf) | Camera privacy, the coach, pairing, threat table and honest limits |
| [**Development Guide**](./DEVELOPMENT.md) | [Markdown](./DEVELOPMENT.md) • [PDF](./pdf/Cubyntra-Development.pdf) | Setup, scripts, the coach key, profile, PWA install and certificates |
| [**Deployment Guide**](./DEPLOYMENT.md) | [Markdown](./DEPLOYMENT.md) • [PDF](./pdf/Cubyntra-Deployment.pdf) | Localhost only: dev server or a local production build |
| [**Contributing Guide**](./CONTRIBUTING.md) | [Markdown](./CONTRIBUTING.md) | Principles, Conventional Commits and the PR checklist |

### 7. Future Concepts
| Document | Format | Description |
| :--- | :--- | :--- |
| [**Robotic Solver (concept)**](./FUTURE_HARDWARE.md) | [Markdown](./FUTURE_HARDWARE.md) • [PDF](./pdf/Cubyntra-Future-Hardware.pdf) | A robot rig sketch; not planned, not built |

### 8. Architecture Decision Records
[ADR index](./ADR/README.md) with statuses and relations. Tutor-era records with PDFs:
[ADR-011](./ADR/011-voxel-design-system.md) ([PDF](./pdf/Cubyntra-ADR-011-Voxel-Design-System.pdf)),
[ADR-012](./ADR/012-deterministic-tutor-engine.md) ([PDF](./pdf/Cubyntra-ADR-012-Deterministic-Tutor-Engine.pdf)),
[ADR-013](./ADR/013-checkpoint-verification.md) ([PDF](./pdf/Cubyntra-ADR-013-Checkpoint-Verification.pdf)),
[ADR-014](./ADR/014-claude-coach.md) ([PDF](./pdf/Cubyntra-ADR-014-Claude-Coach.pdf)),
[ADR-015](./ADR/015-state-only-sync.md) ([PDF](./pdf/Cubyntra-ADR-015-State-Only-Sync.pdf)).

---

## PDF Generation

```bash
npm run docs:pdf
```

`scripts/generate-docs.ts` renders each Markdown document listed in it to `docs/pdf/` with
PDFKit's standard fonts. It is a simple renderer: Mermaid diagrams appear as their source text,
LaTeX is reduced to plain text, and characters the standard fonts cannot show (arrows, box
drawing, some math signs) are spelled in ASCII. The Markdown is the source of truth.
