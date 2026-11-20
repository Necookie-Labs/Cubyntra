# Contributing to Cubyntra

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Tagline**: *See it. Solve it.*

Thank you for your interest in contributing to Cubyntra! This document outlines our engineering standards, pull request workflow, and architecture guidelines.

---

## 1. Code of Conduct & Core Principles

All contributors are expected to uphold the core principles of Cubyntra:
1. **Mathematical Correctness Over Visuals**: The logical cube state is the ground truth. Three.js is a visual representation only.
2. **The Engine Picks Every Move**: Tutor steps come from the deterministic engine in `src/tutor/` and are replayed on the logical cube before they are shown. Claude only explains; never let a model choose or edit moves (ADR-012, ADR-014).
3. **No Pixels Leave the Capturing Device**: Camera frames are sampled to tile colors in the tab that owns the camera. Sync messages carry states only; no route may accept, store or return image data (ADR-015, `tests/sync-privacy.test.ts`).
4. **Pure Cores**: `src/cube`, `src/tutor` and `src/learn` import no DOM, React, Three.js or network code.
5. **Zero Floating-Point Drift**: All 3D layer rotations must snap cubie positions and orientations back to exact integer axes.
6. **Raised Design**: Tokens and `src/components/ui/` only; gradients, colors and shadows exist only as tokens, corners come from the radius scale, and there is no blur, glass or text shadow (ADR-018, `tests/design-rules.test.ts`).
7. **Documentation Synchronization**: Code changes must be paired with updates to the corresponding documents in `/docs`.

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

The tests never call the Claude API or the network; use the fake client in
`tests/helpers/fakeAnthropic.ts` for coach tests. Run `npm run test:tutor-soak` after changing the
tutor engine or its case tables.

Every PR must:
- [ ] Keep every test passing; never skip, delete or loosen a test to get green.
- [ ] Introduce zero ESLint errors or warnings (`npm run lint` must report 0/0).
- [ ] Preserve the mandatory `<!-- BEGIN:nextjs-agent-rules -->` block in `AGENTS.md`.
- [ ] Document new architectural decisions in `docs/ADR/` when introducing structural changes.
