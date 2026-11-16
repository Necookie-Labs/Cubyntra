/**
 * Cubyntra - Sticker Geometry Tests
 *
 * The geometric layer-turn rule must agree exactly with the hand-written face turns, sticker
 * by sticker, so moves derived from it (slices, wide moves, rotations) share their conventions.
 */

import { describe, it, expect } from 'vitest';
import { FACES } from '../src/cube/constants';
import { applyMove, parseMove } from '../src/cube/transforms';
import type { CubeState } from '../src/cube/types';
import {
  faceAxis,
  faceRotationMap,
  flatIndex,
  layerTurnPermutation,
  rotateVec,
  stickerAt,
  stickerPosition,
  FACE_NORMAL,
} from '../src/cube/geometry';

/** A cube whose every sticker is labelled with its own position, e.g. "R5". */
function labelledCube(): CubeState {
  const state = {} as Record<string, string[]>;
  for (const face of FACES) state[face] = Array.from({ length: 9 }, (_, i) => `${face}${i}`);
  return state as unknown as CubeState;
}

function flatten(state: CubeState): string[] {
  return FACES.flatMap((f) => state[f] as unknown as string[]);
}

describe('sticker geometry', () => {
  it('round-trips every sticker through its position and normal', () => {
    for (const face of FACES) {
      for (let index = 0; index < 9; index++) {
        expect(stickerAt(stickerPosition(face, index), FACE_NORMAL[face])).toEqual({ face, index });
      }
    }
  });

  it('rotates vectors counter-clockwise by the right-hand rule', () => {
    expect(rotateVec([0, 1, 0], 'x', 1)).toEqual([0, 0, 1]);
    expect(rotateVec([0, 0, 1], 'y', 1)).toEqual([1, 0, 0]);
    expect(rotateVec([1, 0, 0], 'z', 1)).toEqual([0, 1, 0]);
    expect(rotateVec([1, 2, 3], 'y', 4)).toEqual([1, 2, 3]);
    expect(rotateVec([1, 0, 0], 'z', -1)).toEqual([0, -1, 0]);
  });

  it('matches the hand-written face turns sticker for sticker', () => {
    for (const face of FACES) {
      const { axis, sign } = faceAxis(face);
      const perm = layerTurnPermutation(axis, [sign], -sign);
      const before = flatten(labelledCube());
      const geometric = perm.map((src) => before[src]);
      expect(geometric, face).toEqual(flatten(applyMove(labelledCube(), parseMove(face))));
    }
  });

  it('maps faces under whole-cube quarter turns', () => {
    // A quarter turn clockwise about R (an x rotation) brings the front up.
    expect(faceRotationMap('x', -1)).toEqual({ U: 'B', R: 'R', F: 'U', D: 'F', L: 'L', B: 'D' });
    expect(flatIndex('F', 4)).toBe(22);
  });
});
