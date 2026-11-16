/**
 * Cubyntra - Timer Scrambles
 * Necookie Labs (c) 2026
 *
 * Random-move scrambles of outer turns in the usual notation. Official WCA scrambles come from a
 * random state; for practice at home a 20-move random-turn scramble mixes the cube thoroughly
 * and needs no solver tables. Rules that keep every turn meaningful:
 * - never the same face twice in a row (`R R'` would cancel);
 * - never three turns in a row on one axis (`R L R` is just `R2 L`).
 */

import type { CubeState, Face, Move } from '../cube/types';
import { createSolvedCubeState } from '../cube/constants';
import { applyMoves, createMove } from '../cube/transforms';
import type { QuarterTurns } from '../cube/types';

export const SCRAMBLE_LENGTH = 20;

const FACES_BY_AXIS: readonly (readonly Face[])[] = [
  ['U', 'D'],
  ['R', 'L'],
  ['F', 'B'],
];
const AXIS_OF: Record<Face, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
const TURNS: readonly QuarterTurns[] = [1, 2, -1];
const ALL_FACES: readonly Face[] = FACES_BY_AXIS.flat();

/** A random scramble of `length` outer turns, white on top and green in front. */
export function generateScramble(random: () => number = Math.random, length = SCRAMBLE_LENGTH): Move[] {
  const moves: Move[] = [];
  const faces: Face[] = [];
  while (moves.length < length) {
    const face = ALL_FACES[Math.min(ALL_FACES.length - 1, Math.floor(random() * ALL_FACES.length))];
    const last = faces[faces.length - 1];
    const before = faces[faces.length - 2];
    if (face === last) continue;
    if (last && before && AXIS_OF[face] === AXIS_OF[last] && AXIS_OF[last] === AXIS_OF[before]) continue;
    const turn = TURNS[Math.min(TURNS.length - 1, Math.floor(random() * TURNS.length))];
    faces.push(face);
    moves.push(createMove({ kind: 'face', face }, turn));
  }
  return moves;
}

/** The scrambled cube (white on top, green in front) for showing on the twin. */
export function scrambledState(moves: readonly Move[]): CubeState {
  return applyMoves(createSolvedCubeState(), moves);
}
