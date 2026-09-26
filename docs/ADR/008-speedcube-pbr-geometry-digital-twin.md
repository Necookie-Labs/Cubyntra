# ADR-008: High-Precision Speedcube Physical Geometry & PBR Digital Twin

**Date**: 2026-09  
**Status**: Accepted  
**Deciders**: Necookie Labs Core Engineering Team

---

## Context
Previous iterations of the Cubyntra 3D visualizer used basic, flat `BoxGeometry` and planar sticker quads. While functional for move validation, speedcube enthusiasts and digital twin users require a tactile, authentic representation mirroring competition-grade hardware (such as MoYu, GAN, and QiYi speedcubes).

Key architectural and graphical requirements:
1. **Physical Chamfers & Tile Depth**: Real cubes feature rounded outer body edges and tactile 3D beveled tiles rather than zero-depth sticker planes.
2. **Physically Based Rendering (PBR)**: Realistic plastic clearcoat, micro-roughness, and reflections reflecting overhead studio illumination.
3. **Contact Shadow & Idle Dynamics**: Grounding the digital twin within the visual viewport via soft contact shadows and subtle floating idle motion.
4. **Memory Optimization**: Avoiding excessive GPU allocation by sharing geometric singletons across the 27 cubies.

---

## Decision
We decided to:
1. Replace plain primitives with **extruded rounded geometries**:
   - `createRoundedBoxGeometry(0.985, 0.11, 5)` for the matte black ABS cubie body.
   - `createRoundedTileGeometry(0.84, 0.13, 0.018)` for the beveled facelet tiles.
2. Adopt `MeshPhysicalMaterial` with clearcoat ($0.7$), clearcoat roughness ($0.18$), and an authentic speedcube color palette.
3. Integrate a **PMREM studio environment** synthesized from overhead softbox and rim panels to provide dynamic specular highlights.
4. Implement a **projected radial contact shadow** with dynamic breathing synced to an organic idle micro-bob animation.
5. Retain mathematical zero-drift integer snapping and dynamic pivot reparenting as established in ADR-005.

---

## Rationale
- **Visual Realism**: Extruded bevels capture natural specular edge highlights, making the digital twin instantly identifiable as an authentic speedcube.
- **WebGL Performance**: By caching and reusing shared geometry buffers (`getSharedBodyGeometry` and `getSharedTileGeometry`), all 27 cubies share vertex attributes, minimizing GPU memory footprints and draw call overhead.
- **Accessibility & Motion Preference**: Floating bob dynamics respect `prefers-reduced-motion`, falling back to static presentation where requested.

---

## Consequences
- **Positive**:
  - Competition-grade visual fidelity matching physical speedcubes.
  - Consistent 60 FPS performance via geometry buffer sharing.
  - Zero z-fighting due to slight tile embedding and exact normal offsets.
- **Negative / Trade-offs**:
  - Extruded curved geometry introduces slightly higher vertex counts compared to flat cubes, mitigated by singleton caching.
