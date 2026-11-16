import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSolvedCubeState } from '../src/cube/constants';
import { applyMoves, parseAlgorithm } from '../src/cube/transforms';
import type { CubeColor } from '../src/cube/types';
import { GHOST_OPACITY, GHOST_RADIUS, GhostCube } from '../src/three/ghost';
import { STICKER_HEX } from '../src/lib/tokens';

const COLOR_BY_HEX = Object.fromEntries(
  Object.entries(STICKER_HEX).map(([color, hex]) => [hex.slice(1).toLowerCase(), color as CubeColor])
);

/** Color of the tile facing +Y on the ghost cubie at (x, 1, z). */
function topColor(ghost: GhostCube, x: number, z: number): CubeColor {
  const cubie = ghost.getCubies().find((c) => c.group.position.x === x && c.group.position.y === 1 && c.group.position.z === z)!;
  const tile = cubie.group.children.find((m) => m.position.y > 0.4) as THREE.Mesh;
  return COLOR_BY_HEX[(tile.material as THREE.MeshLambertMaterial).color.getHexString()];
}

describe('GhostCube ("after" preview)', () => {
  it('is hidden until given a state, and hides again on null', () => {
    const ghost = new GhostCube();
    expect(ghost.group.visible).toBe(false);
    ghost.setState(createSolvedCubeState());
    expect(ghost.group.visible).toBe(true);
    ghost.setState(null);
    expect(ghost.group.visible).toBe(false);
    expect(ghost.getState()).toBeNull();
  });

  it('paints the expected state', () => {
    const ghost = new GhostCube();
    const state = applyMoves(createSolvedCubeState(), parseAlgorithm("R U R'"));
    ghost.setState(state);
    // U face is stored row by row from the back: index = (z + 1) * 3 + (x + 1).
    for (const x of [-1, 0, 1]) for (const z of [-1, 0, 1]) expect(topColor(ghost, x, z)).toBe(state.U[(z + 1) * 3 + (x + 1)]);
  });

  it('is small, uniformly faded and flat', () => {
    const ghost = new GhostCube();
    expect(ghost.getCubies()).toHaveLength(26);
    const materials = new Set<THREE.Material>();
    ghost.group.traverse((o) => {
      if (o instanceof THREE.Mesh) materials.add(o.material as THREE.Material);
    });
    for (const m of materials) {
      expect(m).toBeInstanceOf(THREE.MeshLambertMaterial);
      expect(m.transparent).toBe(true);
      expect(m.opacity).toBe(GHOST_OPACITY);
    }
    expect(ghost.group.scale.x).toBeLessThan(0.5);
  });

  it('parks itself inside the corner of the view', () => {
    const ghost = new GhostCube();
    ghost.placeInCorner(3, 2);
    expect(ghost.group.position.x + GHOST_RADIUS).toBeLessThanOrEqual(3);
    expect(ghost.group.position.y + GHOST_RADIUS).toBeLessThanOrEqual(2);
    expect(ghost.group.position.x).toBeGreaterThan(0);
  });

  it('disposes its own geometries and materials', () => {
    const ghost = new GhostCube();
    const mesh = ghost.getCubies()[0].group.children[0] as THREE.Mesh;
    const spy = vi.spyOn(mesh.geometry, 'dispose');
    ghost.dispose();
    expect(spy).toHaveBeenCalledOnce();
  });
});
