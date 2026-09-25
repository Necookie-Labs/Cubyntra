# Cubyntra Local Development Guide

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Status**: Active  
**Scope**: Developer Environment Setup, Workflows, and Tooling

---

## 1. Quick Start

```bash
# 1. Clone repository
git clone https://github.com/Necookie-Labs/Cubyntra.git
cd Cubyntra

# 2. Install dependencies
npm install

# 3. Start development server (with Turbopack)
npm run dev

# 4. Access application in browser
open http://localhost:3000
```

---

## 2. Available Scripts

| Command | Purpose |
|:---|:---|
| `npm run dev` | Starts local Next.js dev server with fast Turbopack HMR |
| `npm run build` | Builds optimized production bundle |
| `npm run start` | Serves compiled production bundle locally |
| `npm run lint` | Runs ESLint over all TypeScript and React files |
| `npm run typecheck` | Validates strict TypeScript types across the codebase |
| `npm run test` | Runs all 35 Vitest unit and integration tests |
| `npm run test:watch`| Runs Vitest in interactive watch mode |
| `npm run test:coverage` | Generates detailed code coverage metrics |
| `npm run docs:pdf` | Compiles documentation into PDF artifacts in `docs/pdf/` |

---

## 3. Directory Layout & Architecture Boundaries

- **`src/cube/`**: Pure logical domain models (faces, stickers, rotations, invariants, validation). No DOM or Three.js dependencies.
- **`src/vision/`**: Camera capture, 3x3 sampling grid, HSV/CIELAB conversion, center calibration, temporal stability.
- **`src/solver/`**: Herbert Kociemba two-phase solving algorithm and move sequence parsing.
- **`src/three/`**: Three.js rendering, 27-cubie construction, layer rotation animations, directional arrows, camera controls.
- **`src/stores/`**: Zustand store (`useCubyntraStore`) coordinating UI flow and scan/solve states.
- **`src/components/`**: Modular React components (Scanner, Visualizer, Controls, Debugger, Background).
- **`docs/`**: Comprehensive engineering documentation and architectural decision records (ADRs).
- **`tests/`**: Automated unit, integration, and property tests.
- **`scripts/`**: Engineering automation and PDF generator scripts.

---

## 4. Development & Debugging Utilities

### 4.1 Developing Without a Physical Cube
1. **Interactive Scramble**: Click the "Random Scramble" button on the UI to scramble the virtual 3D cube model.
2. **Mock Vision Feeds**: Use the built-in synthetic frame generator in `src/vision/mock.ts` to simulate webcam inputs with controlled lighting noise and slight color shifts for automated testing.

### 4.2 Computer Vision Debugging
- Toggle the **CV Debugger Drawer** at the bottom of the scanner view.
- Real-time inspector shows:
  - Sampled RGB, HSV, and CIELAB tuples for each of the 9 cells.
  - Active color assignment and Euclidean $\Delta E$ distance to the closest calibrated reference swatch.
  - Consecutive stable frame counter (0 to 10).
