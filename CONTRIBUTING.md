# Contributing to Cubyntra

Thank you for your interest in contributing to **Cubyntra**, an open-source project by **Necookie Labs**.

## Development Principles

- **Correctness First**: Never sacrifice mathematical or algorithmic accuracy for visual polish.
- **Privacy by Design**: All computer vision operations remain strictly client-side. No frame uploads.
- **Micro-Commits & Clean Git History**: Small, well-scoped commits adhering to Conventional Commits.
- **Synchronized Documentation**: Every architectural, CV, or solver change must be reflected in the `/docs` directory.

## Getting Started

### Prerequisites

- Node.js 20+ (Node.js 22 or 24 recommended)
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

Visit `http://localhost:3000` to interact with Cubyntra.

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

Documentation and test coverage are required for all non-trivial PRs.
