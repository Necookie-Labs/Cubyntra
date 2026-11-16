import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { CubieMesh, VoxelKit, CUBIE_SIZE, FADED_OPACITY } from '../src/three/cubie';
import { STICKER_CORE_HEX, STICKER_HEX } from '../src/lib/tokens';
import type { CubeColor } from '../src/cube/types';

type Coord = -1 | 0 | 1;
const hex = (m: THREE.Material | THREE.Material[]) => `#${(m as THREE.MeshLambertMaterial).color.getHexString()}`;

describe('voxel cubies (ADR-011)', () => {
  it('builds plain boxes with chunky tiles from two shared geometries', () => {
    const kit = new VoxelKit();
    const a = new CubieMesh({ x: 1, y: 1, z: 1 }, kit);
    const b = new CubieMesh({ x: -1, y: 0, z: 0 }, kit);
    const meshes = [...a.group.children, ...b.group.children] as THREE.Mesh[];
    expect(new Set(meshes.map((m) => m.geometry))).toEqual(new Set([kit.bodyGeometry, kit.tileGeometry]));
    expect(kit.bodyGeometry).toBeInstanceOf(THREE.BoxGeometry);
    expect(kit.bodyGeometry.parameters.width).toBeCloseTo(CUBIE_SIZE);
  });

  it('uses flat Lambert materials in the token colors: no gloss, no environment map', () => {
    const kit = new VoxelKit();
    for (const m of kit.materials()) {
      expect(m).toBeInstanceOf(THREE.MeshLambertMaterial);
      expect((m as THREE.MeshLambertMaterial).envMap).toBeNull();
    }
    expect(hex(kit.bodyMaterial())).toBe(STICKER_CORE_HEX.toLowerCase());
    for (const [color, value] of Object.entries(STICKER_HEX)) {
      expect(hex(kit.sticker(color as CubeColor))).toBe(value.toLowerCase());
    }
  });

  it('shares 14 materials across all 27 cubies', () => {
    const kit = new VoxelKit();
    const used = new Set<THREE.Material>();
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          const c = new CubieMesh({ x: x as Coord, y: y as Coord, z: z as Coord }, kit);
          c.group.traverse((o) => {
            if (o instanceof THREE.Mesh) used.add(o.material as THREE.Material);
          });
        }
    expect(used.size).toBe(7); // one body + six sticker colors on a solved cube
    expect(kit.materials()).toHaveLength(14);
  });

  it.each([
    ['corner', { x: 1, y: 1, z: 1 }, 3],
    ['edge', { x: 0, y: 1, z: 1 }, 2],
    ['center', { x: 0, y: 1, z: 0 }, 1],
  ] as const)('gives a %s cubie %i tiles plus its body', (_n, pos, tiles) => {
    const cubie = new CubieMesh(pos, new VoxelKit());
    expect(cubie.group.children).toHaveLength(tiles + 1);
    expect(cubie.initialPos.toArray()).toEqual([pos.x, pos.y, pos.z]);
  });

  it('recolors a tile by swapping to the shared material of that color', () => {
    const kit = new VoxelKit();
    const cubie = new CubieMesh({ x: 1, y: 0, z: 0 }, kit);
    cubie.setStickerColor('R', 'blue');
    expect((cubie.group.children[1] as THREE.Mesh).material).toBe(kit.sticker('blue'));
  });

  it('fades body and tiles to 35% and back, keeping tile colors', () => {
    const kit = new VoxelKit();
    const cubie = new CubieMesh({ x: 1, y: 1, z: 0 }, kit);
    cubie.setStickerColor('U', 'red');
    cubie.setFaded(true);
    const faded = cubie.group.children.map((c) => (c as THREE.Mesh).material as THREE.Material);
    expect(faded.every((m) => m.transparent && m.opacity === FADED_OPACITY)).toBe(true);
    expect(faded).toContain(kit.sticker('red', true));
    cubie.setFaded(false);
    expect(cubie.group.children.map((c) => (c as THREE.Mesh).material)).toContain(kit.sticker('red'));
    expect(cubie.isFaded()).toBe(false);
  });

  it('disposes every shared geometry and material exactly once', () => {
    const kit = new VoxelKit();
    const spies = [kit.bodyGeometry, kit.tileGeometry, ...kit.materials()].map((r) => vi.spyOn(r, 'dispose'));
    kit.dispose();
    kit.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
