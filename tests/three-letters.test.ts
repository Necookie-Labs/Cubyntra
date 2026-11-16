/**
 * Cubyntra - Color-blind sticker letters on the twin
 * Necookie Labs (c) 2026
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CubieMesh, LETTER_GLYPHS, STICKER_LETTER, VoxelKit, letterGeometry } from '../src/three/cubie';
import type { CubeColor } from '../src/cube/types';

const COLORS = Object.keys(STICKER_LETTER) as CubeColor[];

describe('sticker letters', () => {
  it('names every color with its own letter and a distinct 5x5 glyph', () => {
    expect(COLORS.map((c) => STICKER_LETTER[c]).join('')).toBe('WYROBG');
    const glyphs = COLORS.map((c) => LETTER_GLYPHS[c].join('/'));
    expect(new Set(glyphs).size).toBe(6);
    for (const c of COLORS) {
      expect(LETTER_GLYPHS[c]).toHaveLength(5);
      for (const row of LETTER_GLYPHS[c]) expect(row).toMatch(/^[01]{5}$/);
    }
  });

  it('builds one flat square (two triangles) per lit pixel, in front of the tile', () => {
    for (const c of COLORS) {
      const lit = LETTER_GLYPHS[c].join('').split('').filter((p) => p === '1').length;
      const geometry = letterGeometry(c);
      const position = geometry.getAttribute('position');
      expect(position.count).toBe(lit * 6);
      for (let i = 0; i < position.count; i++) expect(position.getZ(i)).toBeGreaterThan(0);
    }
  });

  it('adds letters as children of the tiles, so a cubie still has one child per tile', () => {
    const kit = new VoxelKit();
    const cubie = new CubieMesh({ x: 1, y: 1, z: 1 }, kit);
    expect(cubie.letterOn('U')).toBeNull();
    cubie.setLettersVisible(true);
    expect(cubie.group.children).toHaveLength(4);
    for (const face of ['U', 'R', 'F'] as const) {
      const letter = cubie.letterOn(face)!;
      expect(letter).toBeInstanceOf(THREE.Mesh);
      expect(letter.parent?.parent).toBe(cubie.group);
    }
    expect(cubie.letterOn('U')!.geometry).toBe(kit.letter('white'));
    cubie.setLettersVisible(false);
    expect(cubie.letterOn('U')).toBeNull();
  });

  it('follows the sticker color and the spotlight fade', () => {
    const kit = new VoxelKit();
    const cubie = new CubieMesh({ x: 0, y: 0, z: 1 }, kit);
    cubie.setLettersVisible(true);
    cubie.setStickerColor('F', 'orange');
    expect(cubie.letterOn('F')!.geometry).toBe(kit.letter('orange'));
    cubie.setFaded(true);
    expect(cubie.letterOn('F')!.material).toBe(kit.letterMaterial(true));
    cubie.setFaded(false);
    expect(cubie.letterOn('F')!.material).toBe(kit.letterMaterial(false));
  });

  it('creates letter materials only when letters are used', () => {
    const kit = new VoxelKit();
    expect(kit.materials()).toHaveLength(14);
    kit.letterMaterial();
    expect(kit.materials()).toHaveLength(16);
  });
});
