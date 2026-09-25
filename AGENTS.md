<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Cubyntra AI Agent Guidelines

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Tagline**: *See it. Solve it.*

## 1. Project Purpose & Philosophy
Cubyntra is a high-precision, client-side Computer Vision Rubik's Cube scanner, state validator, solver, and interactive 3D digital twin.

Key Core Principles:
1. **Mathematical Correctness Over Visuals**: The logical cube state is the ground truth. Three.js is a visual representation only.
2. **Client-Side Privacy**: Video streams and pixel data must NEVER leave the browser. Zero image uploads.
3. **Zero Floating-Point Drift**: All 3D layer rotations must snap cubie quaternions and matrices back to exact integer axes.
4. **Documentation Synchronization**: Code changes must be paired with updates to corresponding documents in `/docs`.

## 2. Directory Structure & Architecture Boundaries
- `src/cube/`: Pure logical domain models (faces, stickers, rotations, invariants, validation). No DOM or Three.js dependencies.
- `src/vision/`: Camera capture, 3x3 sampling grid, HSV/CIELAB conversion, center calibration, temporal stability.
- `src/solver/`: Herbert Kociemba two-phase solving algorithm and move sequence parsing.
- `src/three/`: Three.js rendering, 27-cubie construction, layer rotation animations, directional arrows, camera controls.
- `src/stores/`: Zustand store (`useCubyntraStore`) coordinating UI flow and scan/solve states.
- `src/components/`: Modular React components (Scanner, Visualizer, Controls, Debugger, Background).
- `docs/`: Comprehensive engineering documentation and architectural decision records (ADRs).
- `tests/`: Automated unit, integration, and property tests.

## 3. Git & Pull Request Conventions
- Never commit broken builds or untested core logic.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `perf:`, `chore:`).
- Document any new architectural decisions in `docs/ADR/`.
