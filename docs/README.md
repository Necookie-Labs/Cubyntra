# Cubyntra Engineering Documentation Portal

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Tagline**: *See it. Solve it.*  
**Status**: V1 Release  
**Last Updated**: 2026-09-26  

Welcome to the comprehensive engineering documentation portal for **Cubyntra**. Cubyntra is a high-precision, 100% client-side Computer Vision Rubik's Cube scanner, state validator, deterministic solver, and interactive 3D digital twin.

All documents in this directory represent the actual implemented codebase and are kept strictly synchronized with source code.

---

## Documentation Index

### 1. Product & Specifications
| Document | Format | Description |
| :--- | :--- | :--- |
| [**Product Requirements Document (PRD)**](./PRD.md) | [Markdown](./PRD.md) • [PDF](./pdf/Cubyntra-PRD.pdf) | Comprehensive product vision, user stories, requirements, and acceptance criteria |
| [**Software Requirements Specification (SRS)**](./SRS.md) | [Markdown](./SRS.md) • [PDF](./pdf/Cubyntra-SRS.pdf) | IEEE-inspired functional and non-functional requirements with traceability matrix |
| [**Roadmap**](./ROADMAP.md) | [Markdown](./ROADMAP.md) • [PDF](./pdf/Cubyntra-Roadmap.pdf) | Product evolution from V1 CV Web Solver to V4 Robotic Physical Solver |

### 2. Architecture & System Design
| Document | Format | Description |
| :--- | :--- | :--- |
| [**System Architecture**](./ARCHITECTURE.md) | [Markdown](./ARCHITECTURE.md) • [PDF](./pdf/Cubyntra-Architecture.pdf) | High-level system structure, module boundaries, and dependency directions |
| [**System Design**](./SYSTEM_DESIGN.md) | [Markdown](./SYSTEM_DESIGN.md) • [PDF](./pdf/Cubyntra-System-Design.pdf) | Low-level design, state machines, sequence diagrams, and concurrency |
| [**Data Flow Architecture**](./DATA_FLOW.md) | [Markdown](./DATA_FLOW.md) | End-to-end data pipeline from video frames to 3D matrix transformations |
| [**Internal API Reference**](./API_REFERENCE.md) | [Markdown](./API_REFERENCE.md) | Core TypeScript interfaces, domain types, and architectural contracts |

### 3. Core Algorithms & Mathematics
| Document | Format | Description |
| :--- | :--- | :--- |
| [**Computer Vision Pipeline**](./COMPUTER_VISION.md) | [Markdown](./COMPUTER_VISION.md) • [PDF](./pdf/Cubyntra-Computer-Vision.pdf) | ROI targeting, trimmed-mean aggregation, HSV/CIELAB classification, and temporal stability |
| [**Cube Domain Model**](./CUBE_MODEL.md) | [Markdown](./CUBE_MODEL.md) • [PDF](./pdf/Cubyntra-Cube-Model.pdf) | URFDLB standards, 54-facelet mapping, 3D cubie coordinates, and permutation invariants |
| [**Kociemba Two-Phase Solver**](./SOLVER.md) | [Markdown](./SOLVER.md) • [PDF](./pdf/Cubyntra-Solver.pdf) | Two-phase algorithm, Half Turn Metric (HTM), and pre/post-solve verification |

### 4. 3D Graphics & User Experience
| Document | Format | Description |
| :--- | :--- | :--- |
| [**3D Digital Twin Engine**](./THREE_D_ENGINE.md) | [Markdown](./THREE_D_ENGINE.md) • [PDF](./pdf/Cubyntra-3D-Engine.pdf) | Three.js 27-cubie construction, zero-drift layer rotations, and dynamic move arrows |
| [**UI / UX Design System**](./UI_UX.md) | [Markdown](./UI_UX.md) • [PDF](./pdf/Cubyntra-UI-UX.pdf) | Minimalist technical aesthetic, procedural hexagonal canvas, and state wireframes |

### 5. Quality, Security & Operations
| Document | Format | Description |
| :--- | :--- | :--- |
| [**Testing Strategy & Matrix**](./TESTING.md) | [Markdown](./TESTING.md) • [PDF](./pdf/Cubyntra-Testing.pdf) | Automated invariant tests, synthetic vision benchmarks, and E2E verification |
| [**Security & Privacy Architecture**](./SECURITY_PRIVACY.md) | [Markdown](./SECURITY_PRIVACY.md) • [PDF](./pdf/Cubyntra-Security-Privacy.pdf) | Local client-side processing guarantee and camera security boundaries |
| [**Development Guide**](./DEVELOPMENT.md) | [Markdown](./DEVELOPMENT.md) | Environment setup, scripts, debugging tools, and testing commands |
| [**Deployment Guide**](./DEPLOYMENT.md) | [Markdown](./DEPLOYMENT.md) | Production build guidelines, Vercel deployment, and HTTPS camera requirements |
| [**Contributing Guide**](./CONTRIBUTING.md) | [Markdown](./CONTRIBUTING.md) | Open-source contribution standards and Conventional Commits workflow |

### 6. Hardware & Future Planning
| Document | Format | Description |
| :--- | :--- | :--- |
| [**Future Hardware Integration**](./FUTURE_HARDWARE.md) | [Markdown](./FUTURE_HARDWARE.md) • [PDF](./pdf/Cubyntra-Future-Hardware.pdf) | Hardware architecture, ESP32 integration, motor kinematics, and physical grippers |

### 7. Architecture Decision Records (ADRs)
- [**ADR Index & Guidelines**](./ADR/README.md)
- [**ADR-001: Client-Side Computer Vision & Privacy Model**](./ADR/001-client-side-processing.md)
- [**ADR-002: Dual Logical State Model & Three.js Decoupling**](./ADR/002-cube-state-model.md)
- [**ADR-003: Guided Target Reticle vs Unconstrained Contour Segmentation**](./ADR/003-computer-vision-strategy.md)
- [**ADR-004: Herbert Kociemba Two-Phase Algorithm Selection**](./ADR/004-solver-selection.md)
- [**ADR-005: Orthogonal Matrix Snapping for Zero Floating-Point Drift**](./ADR/005-threejs-rendering.md)

---

## Automated Documentation Generation

To generate or refresh all PDF counterparts from Markdown sources, run:

```bash
npm run docs:pdf
```

The script `scripts/generate-docs.ts` parses the Markdown documentation and produces vector-rendered PDF documents in `docs/pdf/` matching Necookie Labs design standards.
