# ADR-004: Deterministic Kociemba Two-Phase Engine vs Optimal IDA* / Korf Solver

**Date**: 2026-09  
**Status**: Accepted  
**Deciders**: Necookie Labs Core Engineering Team

---

## Context
Solving a Rubik's cube algorithmically involves navigating a search space of $4.33 \times 10^{19}$ states. Two primary algorithm classes exist:
1. **Optimal Solvers (Korf's IDA* / God's Number 20)**: Guaranteed shortest move count ($\le 20$ HTM), requiring hundreds of megabytes of pattern databases and seconds to minutes of search time.
2. **Two-Phase Solver (Herbert Kociemba)**: Subdivides search via intermediate subgroup $H = \langle U, D, R^2, L^2, F^2, B^2 \rangle$. Yields near-optimal solutions (typically 20–23 moves) in milliseconds with compact tables.
3. **Beginner / CFOP Layer-by-Layer Solvers**: Easy to follow, but yields 50–120 moves.

---

## Decision
We chose the **Deterministic Herbert Kociemba Two-Phase Algorithm** implemented via a zero-dependency, pure JavaScript/TypeScript engine (`rubik-solver`).

---

## Rationale
1. **Sub-Second Latency**: Computes solutions in 10–50 milliseconds on modern browser JavaScript engines, providing instantaneous feedback to the user immediately upon scan completion.
2. **Near-Optimal Move Count**: Average solution length of 21–23 moves in Half Turn Metric (HTM) is extremely close to optimal (God's Number = 20), presenting a human-executable and satisfying solve sequence.
3. **Zero Native Dependencies**: Native C++ node-gyp packages cannot run in client-side web browsers without complex Emscripten WASM scaffolding. `rubik-solver` runs cleanly in all browser environments and Vitest tests without build dependencies.
4. **Deterministic Reproducibility**: Given identical input facelet strings, the solver deterministically produces the exact same optimal sequence.

---

## Consequences
- **Positive**:
  - Instantaneous UI response.
  - Minimal memory overhead (< 5 MB).
  - Short, efficient move sequences for user execution.
- **Negative / Trade-offs**:
  - Solutions are occasionally 1 to 3 moves longer than the absolute mathematical theoretical minimum. Acceptable for user-facing interactive speedcubing.
