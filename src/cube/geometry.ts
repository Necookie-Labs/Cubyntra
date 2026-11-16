/**
 * Cubyntra - Sticker Geometry
 * Necookie Labs (c) 2026
 *
 * Places every sticker in 3D so layer turns and whole-cube rotations can be derived from one
 * rule (rotate the stickers of the chosen layers a quarter turn about an axis) instead of being
 * written out by hand. Coordinates match the 3D twin: +x right (R), +y up (U), +z front (F),
 * cubie coordinates in {-1, 0, 1}.
 *
 * Index conventions (row-major, as seen looking at the face from outside):
 *   U (y = 1):  index = (z + 1) * 3 + (x + 1)
 *   D (y = -1): index = (1 - z) * 3 + (x + 1)
 *   F (z = 1):  index = (1 - y) * 3 + (x + 1)
 *   B (z = -1): index = (1 - y) * 3 + (1 - x)
 *   R (x = 1):  index = (1 - y) * 3 + (1 - z)
 *   L (x = -1): index = (1 - y) * 3 + (z + 1)
 */

import { Face } from './types';
import { FACES } from './constants';

export type Axis = 'x' | 'y' | 'z';
export type Layer = -1 | 0 | 1;
export type Vec3 = readonly [number, number, number];

/** A sticker location: a face and its row-major index 0..8. */
export interface StickerRef {
  face: Face;
  index: number;
}

export const FACE_NORMAL: Record<Face, Vec3> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  R: [1, 0, 0],
  L: [-1, 0, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};

const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

/** The axis a face's normal lies on, and the sign of the normal along it. */
export function faceAxis(face: Face): { axis: Axis; sign: 1 | -1 } {
  const n = FACE_NORMAL[face];
  if (n[0] !== 0) return { axis: 'x', sign: n[0] as 1 | -1 };
  if (n[1] !== 0) return { axis: 'y', sign: n[1] as 1 | -1 };
  return { axis: 'z', sign: n[2] as 1 | -1 };
}

/** The face whose outward normal is the given unit axis vector. */
export function faceFromNormal(n: Vec3): Face {
  for (const face of FACES) {
    const f = FACE_NORMAL[face];
    if (f[0] === n[0] && f[1] === n[1] && f[2] === n[2]) return face;
  }
  throw new Error(`Not a face normal: ${n.join(',')}`);
}

/**
 * Rotates an integer vector a quarter turn about a coordinate axis. `quarters` counts
 * counter-clockwise quarter turns by the right-hand rule (looking down the +axis toward the
 * origin); negative values turn clockwise.
 */
export function rotateVec(v: Vec3, axis: Axis, quarters: number): Vec3 {
  const k = ((quarters % 4) + 4) % 4;
  let [x, y, z] = v;
  for (let i = 0; i < k; i++) {
    if (axis === 'x') [y, z] = [-z, y];
    else if (axis === 'y') [z, x] = [-x, z];
    else [x, y] = [-y, x];
  }
  // `+ 0` turns -0 into 0 so vectors compare cleanly.
  return [x + 0, y + 0, z + 0];
}

/** Cubie position of a sticker. */
export function stickerPosition(face: Face, index: number): Vec3 {
  const row = Math.floor(index / 3);
  const col = index % 3;
  switch (face) {
    case 'U': return [col - 1, 1, row - 1];
    case 'D': return [col - 1, -1, 1 - row];
    case 'F': return [col - 1, 1 - row, 1];
    case 'B': return [1 - col, 1 - row, -1];
    case 'R': return [1, 1 - row, 1 - col];
    case 'L': return [-1, 1 - row, col - 1];
  }
}

/** The sticker at a cubie position facing along a face normal. */
export function stickerAt(position: Vec3, normal: Vec3): StickerRef {
  const face = faceFromNormal(normal);
  const [x, y, z] = position;
  let index: number;
  switch (face) {
    case 'U': index = (z + 1) * 3 + (x + 1); break;
    case 'D': index = (1 - z) * 3 + (x + 1); break;
    case 'F': index = (1 - y) * 3 + (x + 1); break;
    case 'B': index = (1 - y) * 3 + (1 - x); break;
    case 'R': index = (1 - y) * 3 + (1 - z); break;
    case 'L': index = (1 - y) * 3 + (z + 1); break;
  }
  return { face, index };
}

/** Position of a sticker in a flat 54-entry array laid out U R F D L B. */
export function flatIndex(face: Face, index: number): number {
  return FACES.indexOf(face) * 9 + index;
}

/**
 * Permutation for rotating the given layers a quarter turn about an axis. Layers are cubie
 * coordinates along that axis. The result `p` satisfies `next[i] = prev[p[i]]` on flat indices.
 */
export function layerTurnPermutation(axis: Axis, layers: readonly Layer[], quarters: number): number[] {
  const perm = Array.from({ length: 54 }, (_, i) => i);
  const a = AXIS_INDEX[axis];
  for (const face of FACES) {
    for (let index = 0; index < 9; index++) {
      const pos = stickerPosition(face, index);
      if (!layers.includes(pos[a] as Layer)) continue;
      const to = stickerAt(rotateVec(pos, axis, quarters), rotateVec(FACE_NORMAL[face], axis, quarters));
      perm[flatIndex(to.face, to.index)] = flatIndex(face, index);
    }
  }
  return perm;
}

/**
 * Where each face position goes under a whole-cube quarter turn: the content at `f` moves to
 * `map[f]`.
 */
export function faceRotationMap(axis: Axis, quarters: number): Record<Face, Face> {
  const map = {} as Record<Face, Face>;
  for (const face of FACES) map[face] = faceFromNormal(rotateVec(FACE_NORMAL[face], axis, quarters));
  return map;
}

/** One of the 24 ways to hold the cube, reached from the current grip by `rotation`. */
export interface Orientation {
  /** Whole-cube rotation tokens (x, y, z with ' or 2), applied left to right. */
  rotation: readonly string[];
  /** Where the content of each face position ends up after the rotation. */
  faceMap: Readonly<Record<Face, Face>>;
}

const ROTATION_AXIS_TOKEN = /^([xyz])(['2]?)$/;

/** Face map of a sequence of whole-cube rotation tokens. */
export function rotationFaceMap(tokens: readonly string[]): Record<Face, Face> {
  let map = Object.fromEntries(FACES.map((f) => [f, f])) as Record<Face, Face>;
  for (const token of tokens) {
    const m = ROTATION_AXIS_TOKEN.exec(token);
    if (!m) throw new Error(`Not a whole-cube rotation: "${token}"`);
    const turns = m[2] === "'" ? 1 : m[2] === '2' ? 2 : -1; // x/y/z turn clockwise about R/U/F
    const step = faceRotationMap(m[1] as Axis, turns);
    const prev = map;
    map = Object.fromEntries(FACES.map((f) => [f, step[prev[f]]])) as Record<Face, Face>;
  }
  return map;
}

/**
 * All 24 orientations, shortest rotation first: first bring a face to the top (nothing, x, x',
 * x2, z, z'), then turn about the vertical axis (nothing, y, y', y2).
 */
export const ORIENTATIONS: readonly Orientation[] = (() => {
  const list: Orientation[] = [];
  for (const tip of ['', 'x', "x'", 'x2', 'z', "z'"]) {
    for (const turn of ['', 'y', "y'", 'y2']) {
      const rotation = [tip, turn].filter(Boolean);
      list.push({ rotation, faceMap: rotationFaceMap(rotation) });
    }
  }
  return list.sort((a, b) => a.rotation.length - b.rotation.length);
})();
