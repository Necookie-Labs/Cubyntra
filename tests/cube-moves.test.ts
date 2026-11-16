/**
 * Cubyntra - Move Algebra Property Tests
 *
 * Runs on a cube whose 54 stickers are each labelled with their own starting position ("U0" ..
 * "B8"), so a wrong permutation is caught even when it would leave colors looking right.
 */

import { describe, it, expect } from 'vitest';
import { FACES } from '../src/cube/constants';
import {
  applyMove,
  applyMoves,
  formatAlgorithm,
  invertAlgorithm,
  invertMove,
  parseAlgorithm,
  parseMove,
  rotateFaceClockwise,
  rotateFaceCounterClockwise,
} from '../src/cube/transforms';
import type { CubeState, Face, FaceStickers } from '../src/cube/types';

type Labelled = Record<Face, string[]>;

function labelledCube(): CubeState {
  const state = {} as Labelled;
  for (const face of FACES) state[face] = Array.from({ length: 9 }, (_, i) => `${face}${i}`);
  return state as unknown as CubeState;
}

const L = (s: CubeState): Labelled => s as unknown as Labelled;
const SOLVED = labelledCube();

const SYMBOLS = ['U', 'R', 'F', 'D', 'L', 'B', 'u', 'r', 'f', 'd', 'l', 'b', 'M', 'E', 'S', 'x', 'y', 'z'];
const ALL_TOKENS = SYMBOLS.flatMap((s) => [s, `${s}'`, `${s}2`]);

const run = (alg: string, from: CubeState = SOLVED): CubeState => applyMoves(from, parseAlgorithm(alg));

describe('every move', () => {
  it('is undone by its inverse', () => {
    for (const token of ALL_TOKENS) {
      const move = parseMove(token);
      expect(applyMove(applyMove(SOLVED, move), invertMove(move)), token).toEqual(SOLVED);
      expect(applyMove(applyMove(SOLVED, invertMove(move)), move), token).toEqual(SOLVED);
    }
  });

  it('has order 4 for quarter turns and 2 for half turns', () => {
    for (const token of ALL_TOKENS) {
      const move = parseMove(token);
      const order = move.quarterTurns === 2 ? 2 : 4;
      let state = SOLVED;
      for (let k = 1; k <= order; k++) {
        state = applyMove(state, move);
        if (k < order) expect(state, `${token}^${k}`).not.toEqual(SOLVED);
      }
      expect(state, `${token}^${order}`).toEqual(SOLVED);
    }
  });

  it('reads Rw-style wide moves the same as lower case', () => {
    for (const face of ['U', 'R', 'F', 'D', 'L', 'B']) {
      for (const suffix of ['', "'", '2']) {
        expect(run(`${face}w${suffix}`)).toEqual(run(`${face.toLowerCase()}${suffix}`));
      }
    }
  });
});

describe('composite identities', () => {
  it.each([
    ['x', "R M' L'"],
    ['y', "U E' D'"],
    ['z', "F S B'"],
    ['r', "R M'"],
    ['l', 'L M'],
    ['u', "U E'"],
    ['d', 'D E'],
    ['f', 'F S'],
    ['b', "B S'"],
    ["x'", "R' M L"],
    ['M2', 'M M'],
  ])('%s equals %s', (move, expansion) => {
    expect(run(move)).toEqual(run(expansion));
  });
});

describe('hand-written sticker permutations', () => {
  /** Expected state built by listing, for each changed sticker, where it came from. */
  function expectFrom(changes: Partial<Record<Face, Record<number, string>>>): Labelled {
    const next = structuredClone(L(SOLVED));
    for (const [face, entries] of Object.entries(changes) as [Face, Record<number, string>][]) {
      for (const [index, label] of Object.entries(entries)) next[face][Number(index)] = label;
    }
    return next;
  }
  const cw = (face: Face) => rotateFaceClockwise(L(SOLVED)[face] as unknown as FaceStickers) as unknown as string[];
  const ccw = (face: Face) =>
    rotateFaceCounterClockwise(L(SOLVED)[face] as unknown as FaceStickers) as unknown as string[];

  it('M: the middle column moves front to bottom, like L', () => {
    expect(run('M')).toEqual(
      expectFrom({
        F: { 1: 'U1', 4: 'U4', 7: 'U7' },
        D: { 1: 'F1', 4: 'F4', 7: 'F7' },
        B: { 1: 'D7', 4: 'D4', 7: 'D1' },
        U: { 1: 'B7', 4: 'B4', 7: 'B1' },
      })
    );
  });

  it('E: the middle row moves front to right, like D', () => {
    expect(run('E')).toEqual(
      expectFrom({
        F: { 3: 'L3', 4: 'L4', 5: 'L5' },
        R: { 3: 'F3', 4: 'F4', 5: 'F5' },
        B: { 3: 'R3', 4: 'R4', 5: 'R5' },
        L: { 3: 'B3', 4: 'B4', 5: 'B5' },
      })
    );
  });

  it('S: the standing middle layer turns clockwise, like F', () => {
    expect(run('S')).toEqual(
      expectFrom({
        U: { 3: 'L7', 4: 'L4', 5: 'L1' },
        R: { 1: 'U3', 4: 'U4', 7: 'U5' },
        D: { 3: 'R7', 4: 'R4', 5: 'R1' },
        L: { 1: 'D3', 4: 'D4', 7: 'D5' },
      })
    );
  });

  it('x: the whole cube turns like R (front comes up)', () => {
    const s = L(SOLVED);
    expect(run('x')).toEqual({
      U: [...s.F],
      F: [...s.D],
      D: [...s.B].reverse(),
      B: [...s.U].reverse(),
      R: cw('R'),
      L: ccw('L'),
    });
  });

  it('y: the whole cube turns like U (front goes left)', () => {
    const s = L(SOLVED);
    expect(run('y')).toEqual({
      F: [...s.R],
      R: [...s.B],
      B: [...s.L],
      L: [...s.F],
      U: cw('U'),
      D: ccw('D'),
    });
  });

  it('z: the whole cube turns like F (top goes right)', () => {
    expect(run('z')).toEqual({
      U: cw('L'),
      R: cw('U'),
      D: cw('R'),
      L: cw('D'),
      F: cw('F'),
      B: ccw('B'),
    });
  });
});

describe('random algorithms', () => {
  it('are undone by their inverse, for 1,000 seeded sequences of every move kind', () => {
    let seed = 0x2f6b1d;
    const rand = () => {
      // mulberry32
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
    };

    const kinds = new Set<string>();
    for (let n = 0; n < 1000; n++) {
      const length = 1 + Math.floor(rand() * 30);
      const tokens = Array.from({ length }, () => ALL_TOKENS[Math.floor(rand() * ALL_TOKENS.length)]);
      const alg = parseAlgorithm(tokens.join(' '));
      alg.forEach((m) => kinds.add(m.kind));

      expect(formatAlgorithm(alg)).toBe(tokens.join(' '));
      expect(applyMoves(applyMoves(SOLVED, alg), invertAlgorithm(alg)), tokens.join(' ')).toEqual(SOLVED);
    }
    expect([...kinds].sort()).toEqual(['face', 'rotation', 'slice', 'wide']);
  });
});
