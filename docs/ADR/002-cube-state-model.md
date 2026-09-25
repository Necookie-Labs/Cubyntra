# ADR-002: Logical 54-Facelet Cube State Model vs 26-Piece Entity Model

**Date**: 2026-09  
**Status**: Accepted  
**Deciders**: Necookie Labs Core Engineering Team

---

## Context
A $3 \times 3 \times 3$ Rubik's cube can be modeled internally using various representations:
1. **Piece-Centric Entity Model**: 26 discrete piece objects (8 corners, 12 edges, 6 centers) tracking their 3D position vector and 3D orientation matrix.
2. **Facelet-Centric Model**: A 54-element array or 6-face $3 \times 3$ matrix representing individual sticker colors (`U1` through `B9`).
3. **Bitboard / Permutation Index**: Compact integers encoding corner permutation (8!), edge permutation (12!), corner orientation ($3^7$), and edge orientation ($2^{11}$).

---

## Decision
We chose a **Hybrid Dual-Representation Architecture**:
- **Primary Domain State (`CubeState`)**: A structured 6-face record containing $3 \times 3$ 2D arrays of facelet colors (`{ U: StickerGrid, D: StickerGrid, ... }`).
- **Canonical Interchange Format**: A 54-character string (`UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB`) for serialization, solver input, and validation.
- **Conversion Helpers**: Bi-directional pure mapping functions between the structured model and 54-char string.

---

## Rationale
1. **Direct Alignment with Vision Pipeline**: The camera samples individual faces in 2D grids. A facelet matrix directly maps to camera reticle coordinates without complex geometric inverse projections.
2. **Direct Compatibility with Kociemba Algorithm**: Herbert Kociemba's two-phase solver definition natively accepts a 54-facelet string.
3. **Simplicity and Immutability**: A pure matrix representation allows trivial functional state updates (`(prevState) => nextState`) compatible with React and Zustand state immutability.
4. **Decoupling from 3D Rendering**: The Three.js visualizer can project from this logical model, ensuring rendering errors never corrupt mathematical state.

---

## Consequences
- **Positive**:
  - Clean separation of concerns between vision, logic, solver, and graphics.
  - Trivial serialization and testing.
  - Zero floating-point state in the logical domain.
- **Negative / Trade-offs**:
  - Verifying physical piece validity requires mapping pairs and triplets of facelets together to check corner/edge integrity. Handled cleanly in `src/cube/validator.ts`.
