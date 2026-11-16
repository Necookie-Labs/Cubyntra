/**
 * Cubyntra - Seeded Scrambles for Tutor Tests
 *
 * Random-move scrambles from a fixed-seed generator, so every run of the suite sees the same
 * cubes and a failure can be reproduced from its scramble number.
 */

import { CubeState, Move } from '../../src/cube/types';
import { createSolvedCubeState } from '../../src/cube/constants';
import { applyMoves, parseAlgorithm } from '../../src/cube/transforms';

const TURNS = parseAlgorithm("U U' U2 D D' D2 R R' R2 L L' L2 F F' F2 B B' B2");

/** Deterministic generator (mulberry32) returning numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `length` random outer turns, never turning the same face twice in a row. */
export function randomScramble(random: () => number, length = 30): Move[] {
  const moves: Move[] = [];
  let lastFace = -1;
  while (moves.length < length) {
    const pick = Math.floor(random() * TURNS.length);
    const face = Math.floor(pick / 3);
    if (face === lastFace) continue;
    lastFace = face;
    moves.push(TURNS[pick]);
  }
  return moves;
}

/** The scrambled cube for scramble number `n` of a seed (standard orientation). */
export function scrambledState(seed: number, n: number): CubeState {
  return applyMoves(createSolvedCubeState(), randomScramble(seededRandom(seed * 100003 + n)));
}
