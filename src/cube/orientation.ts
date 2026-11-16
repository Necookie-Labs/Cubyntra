/**
 * Cubyntra - Whole-Cube Orientation
 * Necookie Labs (c) 2026
 *
 * Whole-cube rotations and slice moves carry the centers with them, so a logical state may hold
 * white anywhere. The solver, validator and facelet strings expect the standard orientation
 * (white on U, green on F); these helpers rotate a state into it and carry moves between frames.
 */

import { CubeColor, CubeState, Face, Move } from './types';
import { CANONICAL_CENTER_COLORS, FACES } from './constants';
import { ORIENTATIONS, rotationFaceMap } from './geometry';
import { applyMoves, formatMove, moveFromReference, moveReferenceFace, parseAlgorithm } from './transforms';

/** The center color on each face. */
export function centerColors(state: CubeState): Record<Face, CubeColor> {
  return Object.fromEntries(FACES.map((f) => [f, state[f][4]])) as Record<Face, CubeColor>;
}

/**
 * The shortest whole-cube rotation (at most two of x, y, z) after which the centers match
 * `target` on every face it names, or null if no rotation does.
 */
export function findRotation(
  centers: Record<Face, CubeColor>,
  target: Partial<Record<Face, CubeColor>>
): Move[] | null {
  for (const o of ORIENTATIONS) {
    const after = {} as Record<Face, CubeColor>;
    for (const f of FACES) after[o.faceMap[f]] = centers[f];
    if ((Object.keys(target) as Face[]).every((f) => after[f] === target[f])) {
      return parseAlgorithm(o.rotation.join(' '));
    }
  }
  return null;
}

export interface NormalizedOrientation {
  /** The same cube, turned so white is on U, red on R, green on F, and so on. */
  state: CubeState;
  /** Whole-cube rotation applied to get there (empty if the state was already standard). */
  rotation: Move[];
}

/**
 * Turns the whole cube so its centers are in the standard positions. Returns null when the
 * centers cannot be reached by turning a real cube (duplicate colors or a mirrored layout).
 */
export function normalizeOrientation(state: CubeState): NormalizedOrientation | null {
  const rotation = findRotation(centerColors(state), CANONICAL_CENTER_COLORS);
  if (!rotation) return null;
  return { state: applyMoves(state, rotation), rotation };
}

/**
 * Re-expresses a move made before a whole-cube rotation as the move that turns the same layers
 * after it. For any state S: `S · move · rotation` equals `S · rotation · result`.
 */
export function translateMoveThroughRotation(move: Move, rotation: readonly Move[]): Move {
  if (rotation.some((r) => r.kind !== 'rotation')) {
    throw new Error(`Only whole-cube rotations can re-frame a move, got "${rotation.map(formatMove).join(' ')}"`);
  }
  const faceMap = rotationFaceMap(rotation.map(formatMove));
  return moveFromReference(move.kind, faceMap[moveReferenceFace(move)], move.quarterTurns);
}

/** `translateMoveThroughRotation` for every move of an algorithm. */
export function translateAlgorithmThroughRotation(moves: readonly Move[], rotation: readonly Move[]): Move[] {
  return moves.map((m) => translateMoveThroughRotation(m, rotation));
}
