# ADR-005: Three.js Digital Twin with Drift-Free Orthonormal Snapping

**Date**: 2026-09  
**Status**: Accepted  
**Deciders**: Necookie Labs Core Engineering Team

---

## Context
Rendering a $3 \times 3 \times 3$ interactive Rubik's cube in WebGL can lead to accumulation of floating-point inaccuracies when faces are rotated repeatedly. Floating-point round-off errors cause cubie positions to drift from integer coordinates (e.g. $1.00000012$ or $0.9999987$), eventually leading to visible geometric gaps, seam tearing, or failure to isolate rotating slices.

Approaches considered:
1. **Continuous Euler / Quaternion Rotation without Snapping**: Animate local matrices directly.
2. **Re-creating Meshes on Every Turn**: Discarding all Three.js meshes and recreating them from scratch on every move.
3. **Dynamic Group Reparenting with Post-Animation Integer Snapping**: Group the 9 cubies in the rotating slice into a temporary pivot group, animate rotation, reparent back to root scene, round positions to $\{-1, 0, 1\}$, and snap quaternions to the nearest orthogonal cardinal axes.

---

## Decision
We chose **Dynamic Group Reparenting with Post-Animation Integer Snapping**.

---

## Rationale
1. **Zero Drift Guarantee**: Snapping cubie positions ($x, y, z \in \{-1, 0, 1\}$) and quaternions to multiples of $90^\circ$ after every single turn guarantees that after 10,000 rotations, the cube remains mathematically exact.
2. **Performance**: Grouping and animating a single `THREE.Group` is computationally lightweight and achieves consistent 60 FPS animation. Recreating meshes on every move would trigger heavy garbage collection pauses.
3. **Preservation of Materials & References**: Retaining the 27 cubie meshes avoids re-allocating textures and shaders.

---

## Consequences
- **Positive**:
  - Pixel-perfect visual alignment forever.
  - Smooth hardware-accelerated animations.
  - Clean detachment and reattachment lifecycle.
- **Negative / Trade-offs**:
  - Requires careful handling of local vs world transforms during `group.attach()` and `scene.attach()`.
