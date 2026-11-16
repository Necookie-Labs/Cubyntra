# Contributing to Cubyntra

Thank you for your interest in contributing to **Cubyntra**, an open-source project by **Necookie Labs**.

## Development Principles

- **Correctness First**: Never sacrifice mathematical or algorithmic accuracy for visual polish.
- **Privacy by Design**: Computer vision runs in the tab that owns the camera; no image leaves the device that captured it. Sync sends states only.
- **The Engine Picks Every Move**: Tutor steps come from `src/tutor/`; the Claude coach only explains them.
- **Micro-Commits & Clean Git History**: Small, well-scoped commits adhering to Conventional Commits.
- **Synchronized Documentation**: Every architectural, CV, or solver change must be reflected in the `/docs` directory.

## Getting Started

### Prerequisites

- Node.js 20.9+ (CI uses Node.js 22)
- npm 10+

### Setup

```bash
# Clone the repository
git clone https://github.com/Necookie-Labs/Cubyntra.git
cd Cubyntra

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `https://localhost:3000` and accept the one-time certificate warning (`npm run dev` serves HTTPS so a phone camera works). No API key is needed: without `ANTHROPIC_API_KEY` the coach uses its built-in templates.

## Branching & Pull Request Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make meaningful micro-commits:
   ```bash
   git commit -m "feat: add 3x3 sampling grid stabilizer"
   ```
3. Run verification before opening a PR:
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   ```
4. Push and submit a Pull Request using the provided PR template.

## Conventional Commit Standards

Use standard conventional commit prefixes:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation updates
- `test:` Adding or updating tests
- `refactor:` Code refactoring without behavior changes
- `style:` Formatting or design refinements
- `perf:` Performance optimizations
- `chore:` Tooling, dependency, or configuration updates

## Synchronized Documentation Rule

If your change touches:
- Computer Vision algorithms -> update `docs/COMPUTER_VISION.md`
- Cube models or mathematical conventions -> update `docs/CUBE_MODEL.md`
- Solver heuristics or integration -> update `docs/SOLVER.md`
- 3D rendering or animations -> update `docs/THREE_D_ENGINE.md`
- Architecture or state management -> update `docs/ARCHITECTURE.md` and `docs/SYSTEM_DESIGN.md`
- Tutor methods, case tables or checkpoints -> update `docs/tutor/METHODS.md` or `docs/tutor/CHECKPOINTS.md`
- Coach, sync, profile or routes -> update `docs/API_REFERENCE.md` and `docs/SECURITY_PRIVACY.md`
- Screens or design tokens -> update `docs/UI_UX.md`
- A new architectural decision -> add an ADR in `docs/ADR/` and list it in `docs/ADR/README.md`

Documentation and test coverage are required for all non-trivial PRs.
