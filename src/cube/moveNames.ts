/**
 * Cubyntra - Plain-Language Move Names
 * Necookie Labs (c) 2026
 *
 * One short instruction per move, written for a student holding the cube with the front facing
 * them. Directions describe where the front (or, for the back, the top) of the turning part goes.
 */

import { Face, Move } from './types';
import { moveReferenceFace } from './transforms';

const FACE_SUBJECT: Record<Face, string> = {
  R: 'the right side',
  L: 'the left side',
  U: 'the top',
  D: 'the bottom',
  F: 'the front',
  B: 'the back',
};

const WIDE_SUBJECT: Record<Face, string> = {
  R: 'the right two layers',
  L: 'the left two layers',
  U: 'the top two layers',
  D: 'the bottom two layers',
  F: 'the front two layers',
  B: 'the back two layers',
};

const SLICE_SUBJECT = {
  M: 'the middle layer between left and right',
  E: 'the middle layer between top and bottom',
  S: 'the middle layer between front and back',
} as const;

/** How a turn that is clockwise about each reference face looks from the front, and its reverse. */
const DIRECTION: Record<Face, { clockwise: string; counter: string }> = {
  R: { clockwise: 'up', counter: 'down' },
  L: { clockwise: 'down', counter: 'up' },
  U: { clockwise: 'to the left', counter: 'to the right' },
  D: { clockwise: 'to the right', counter: 'to the left' },
  F: { clockwise: 'clockwise', counter: 'counter-clockwise' },
  B: { clockwise: 'so the top goes to the left', counter: 'so the top goes to the right' },
};

function subject(move: Move): string {
  switch (move.kind) {
    case 'face': return FACE_SUBJECT[move.face];
    case 'wide': return WIDE_SUBJECT[move.face];
    case 'slice': return SLICE_SUBJECT[move.slice];
    case 'rotation': return 'the whole cube';
  }
}

/**
 * Plain-language instruction for a move, e.g. R → "Turn the right side up",
 * U' → "Turn the top to the right", y → "Turn the whole cube to the left", R2 → "Turn the right
 * side twice".
 */
export function moveName(move: Move): string {
  const direction = DIRECTION[moveReferenceFace(move)];
  if (move.quarterTurns === 2) {
    // Which way a half turn goes does not matter for layers; for the whole cube the axis does.
    return move.kind === 'rotation'
      ? `Turn the whole cube ${direction.clockwise} twice`
      : `Turn ${subject(move)} twice`;
  }
  return `Turn ${subject(move)} ${move.quarterTurns === 1 ? direction.clockwise : direction.counter}`;
}
