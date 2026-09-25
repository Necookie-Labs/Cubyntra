# Contributing to Cubyntra

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Tagline**: *See it. Solve it.*

Thank you for your interest in contributing to Cubyntra! This document outlines our engineering standards, pull request workflow, and architecture guidelines.

---

## 1. Code of Conduct & Core Principles

All contributors are expected to uphold the core principles of Cubyntra:
1. **Mathematical Correctness Over Visuals**: The logical cube state is the ground truth. Three.js is a visual representation only.
2. **Client-Side Privacy**: Video streams and pixel data must NEVER leave the browser. Zero image uploads.
3. **Zero Floating-Point Drift**: All 3D layer rotations must snap cubie quaternions and matrices back to exact integer axes.
4. **Documentation Synchronization**: Code changes must be paired with updates to corresponding documents in `/docs`.

---

## 2. Development Workflow

### 2.1 Branch Naming
Create branches branching off `main` with descriptive prefixes:
- `feat/feature-name` (new functionality)
- `fix/bug-description` (bug fixes)
- `docs/doc-updates` (documentation enhancements)
- `test/test-suite` (new tests or test refactoring)
- `perf/optimization` (performance improvements)

### 2.2 Conventional Commits
All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
- `feat: add CIELAB Delta-E color distance calculation`
- `fix: correct parity verification on edge flip sum`
- `docs: update solver architecture specification`
- `test: add end-to-end integration test for recovery modal`
- `refactor: optimize dynamic group detaching in 3D engine`

---

## 3. Pull Request Checklist

Before submitting a Pull Request, verify all quality gates pass locally:

```bash
# 1. Verify types
npm run typecheck

# 2. Verify linting
npm run lint

# 3. Verify all automated tests
npm run test

# 4. Verify production build
npm run build
```

Every PR must:
- [ ] Maintain 100% test pass rate across all suites.
- [ ] Introduce zero ESLint warnings or TypeScript `any` escapes.
- [ ] Preserve the mandatory `<!-- BEGIN:nextjs-agent-rules -->` block in `AGENTS.md`.
- [ ] Document new architectural decisions in `docs/ADR/` when introducing structural changes.
