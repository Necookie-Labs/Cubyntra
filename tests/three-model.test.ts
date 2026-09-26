import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createRoundedBoxGeometry,
  createRoundedTileGeometry,
  getSharedBodyGeometry,
  getSharedTileGeometry,
  SPEEDCUBE_COLORS,
  CubieMesh,
} from '../src/three/cubie';

describe('Three.js Speedcube 3D Model & Geometry Specification', () => {
  it('generates valid chamfered rounded box geometry with normals and bounding box', () => {
    const geo = createRoundedBoxGeometry(0.985, 0.11, 4);
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    geo.computeBoundingBox();
    expect(geo.boundingBox).toBeDefined();
    if (geo.boundingBox) {
      expect(geo.boundingBox.max.x).toBeCloseTo(0.985 / 2, 1);
      expect(geo.boundingBox.max.y).toBeCloseTo(0.985 / 2, 1);
      expect(geo.boundingBox.max.z).toBeCloseTo(0.985 / 2, 1);
    }
  });

  it('generates valid 3D rounded beveled tile geometry', () => {
    const tile = createRoundedTileGeometry(0.84, 0.13, 0.018);
    expect(tile).toBeInstanceOf(THREE.BufferGeometry);
    tile.computeBoundingBox();
    expect(tile.boundingBox).toBeDefined();
    if (tile.boundingBox) {
      expect(tile.boundingBox.max.x - tile.boundingBox.min.x).toBeGreaterThan(0.8);
      expect(tile.boundingBox.max.y - tile.boundingBox.min.y).toBeGreaterThan(0.8);
      expect(tile.boundingBox.max.z).toBeGreaterThan(0.01);
    }
  });

  it('reuses shared geometries across multiple calls to conserve WebGL memory', () => {
    const body1 = getSharedBodyGeometry();
    const body2 = getSharedBodyGeometry();
    expect(body1).toBe(body2);

    const tile1 = getSharedTileGeometry();
    const tile2 = getSharedTileGeometry();
    expect(tile1).toBe(tile2);
  });

  it('defines authentic speedcube physical hex color palette for all faces', () => {
    expect(SPEEDCUBE_COLORS.white).toBe('#f4f5f0');
    expect(SPEEDCUBE_COLORS.yellow).toBe('#ffd500');
    expect(SPEEDCUBE_COLORS.green).toBe('#00b35c');
    expect(SPEEDCUBE_COLORS.blue).toBe('#0a5cff');
    expect(SPEEDCUBE_COLORS.red).toBe('#e8132e');
    expect(SPEEDCUBE_COLORS.orange).toBe('#ff7a00');
  });

  it('constructs corner cubie with 3 exposed stickers and 1 plastic body', () => {
    const corner = new CubieMesh({ x: 1, y: 1, z: 1 });
    // Root group contains 1 body mesh + 3 sticker tiles (R, U, F) = 4 children
    expect(corner.group.children.length).toBe(4);
    expect(corner.initialPos.x).toBeCloseTo(1.0);
    expect(corner.initialPos.y).toBeCloseTo(1.0);
    expect(corner.initialPos.z).toBeCloseTo(1.0);
  });

  it('constructs edge cubie with 2 exposed stickers', () => {
    const edge = new CubieMesh({ x: 0, y: 1, z: 1 });
    // Root group contains 1 body mesh + 2 sticker tiles (U, F) = 3 children
    expect(edge.group.children.length).toBe(3);
  });

  it('constructs center cubie with 1 exposed sticker', () => {
    const center = new CubieMesh({ x: 0, y: 1, z: 0 });
    // Root group contains 1 body mesh + 1 sticker tile (U) = 2 children
    expect(center.group.children.length).toBe(2);
  });

  it('updates sticker colors dynamically and disposes safely', () => {
    const cubie = new CubieMesh({ x: 1, y: 0, z: 0 });
    expect(() => cubie.setStickerColor('R', 'blue')).not.toThrow();
    expect(() => cubie.dispose()).not.toThrow();
  });
});
