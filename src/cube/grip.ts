/**
 * Cubyntra - Grip Model
 * Necookie Labs (c) 2026
 *
 * A grip is how the student holds the cube: which center color is on top and which faces them.
 * Move notation is always relative to the grip (R is whatever side is on the student's right),
 * so the tutor states a grip with every instruction and these helpers move between grips.
 * Assumes the standard color scheme (white opposite yellow, green opposite blue, red opposite
 * orange; white top + green front puts red on the right).
 */

import { CubeColor, CubeState, Face, Move } from './types';
import { CANONICAL_CENTER_COLORS, OPPOSITE_COLORS } from './constants';
import {
  centerColors,
  findRotation,
  translateAlgorithmThroughRotation,
  translateMoveThroughRotation,
} from './orientation';
import { applyMoves } from './transforms';

export interface Grip {
  /** Center color on the top face. */
  top: CubeColor;
  /** Center color on the face pointing at the student. */
  front: CubeColor;
}

/** White on top, green in front: the orientation the scanner and solver use. */
export const STANDARD_GRIP: Grip = { top: 'white', front: 'green' };

/** A grip is possible when top and front are different, non-opposite colors. */
export function isValidGrip(grip: Grip): boolean {
  return grip.top !== grip.front && OPPOSITE_COLORS[grip.top] !== grip.front;
}

function assertValidGrip(grip: Grip): void {
  if (!isValidGrip(grip)) {
    throw new Error(`Impossible grip: ${grip.top} on top with ${grip.front} in front`);
  }
}

/** The grip a state is currently held in, read from its U and F centers. */
export function gripOf(state: CubeState): Grip {
  return { top: state.U[4], front: state.F[4] };
}

/** Center color on every face while the cube is held in `grip`. */
export function gripCenters(grip: Grip): Record<Face, CubeColor> {
  return centerColors(viewInGrip(solvedCenters(), grip).state);
}

function solvedCenters(): CubeState {
  const state = {} as Record<Face, CubeColor[]>;
  for (const [face, color] of Object.entries(CANONICAL_CENTER_COLORS) as [Face, CubeColor][]) {
    state[face] = Array(9).fill(color);
  }
  return state as unknown as CubeState;
}

/**
 * The whole-cube rotation (at most two of x, y, z) that takes a cube held in `from` to `to`.
 * Empty when the grips are the same.
 */
export function gripRotation(from: Grip, to: Grip): Move[] {
  assertValidGrip(from);
  assertValidGrip(to);
  const rotation = findRotation(gripCenters(from), { U: to.top, F: to.front });
  if (!rotation) throw new Error('Unreachable grip'); // every valid grip pair is reachable
  return rotation;
}

/**
 * The state as the student sees it while holding the cube in `grip`, plus the rotation from
 * the state's current grip. Throws if the state's centers cannot show that grip.
 */
export function viewInGrip(state: CubeState, grip: Grip): { state: CubeState; rotation: Move[] } {
  assertValidGrip(grip);
  const rotation = findRotation(centerColors(state), { U: grip.top, F: grip.front });
  if (!rotation) {
    throw new Error(`State cannot be held with ${grip.top} on top and ${grip.front} in front`);
  }
  return { state: applyMoves(state, rotation), rotation };
}

/**
 * Re-expresses a move written for one grip as the move that turns the same layer in another.
 * E.g. R with white on top is L with yellow on top (same front).
 */
export function translateMove(move: Move, from: Grip, to: Grip): Move {
  return translateMoveThroughRotation(move, gripRotation(from, to));
}

/** `translateMove` for every move of an algorithm. */
export function translateAlgorithm(moves: readonly Move[], from: Grip, to: Grip): Move[] {
  return translateAlgorithmThroughRotation(moves, gripRotation(from, to));
}
