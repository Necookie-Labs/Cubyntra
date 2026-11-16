/**
 * Cubyntra - Tutor Planner Helpers
 * Necookie Labs (c) 2026
 *
 * Small building blocks the stage planners share: move lists, piece references and
 * last-layer checks. Everything here reads colors relative to the centers, so it works however
 * the cube is held unless a function says it needs a particular face on top.
 */

import { CubeColor, CubeState, Face, Move, RotationAxis } from '../cube/types';
import { FACES, OPPOSITE_COLORS } from '../cube/constants';
import { f2lSlots, findCorner, findEdge, isPieceSolved, sideColors } from '../cube/pieces';
import { applyMoves, createMove, parseAlgorithm } from '../cube/transforms';
import { PieceRef } from './types';

/** The color of the first layer and the color of the last layer. */
export const FIRST: CubeColor = 'white';
export const LAST: CubeColor = 'yellow';

/** The four colors around the sides, in a fixed order. */
export const SIDES: readonly CubeColor[] = sideColors(FIRST);

const parsed = new Map<string, Move[]>();

/** Parses notation once and reuses the result. Callers must not mutate the returned list. */
export function alg(notation: string): Move[] {
  let moves = parsed.get(notation);
  if (!moves) {
    moves = parseAlgorithm(notation);
    parsed.set(notation, moves);
  }
  return moves;
}

/** `quarters` clockwise quarter turns of a face as at most one move (0 gives no move). */
export function faceTurns(face: Face, quarters: number): Move[] {
  const k = ((quarters % 4) + 4) % 4;
  if (k === 0) return [];
  return [createMove({ kind: 'face', face }, k === 1 ? 1 : k === 2 ? 2 : -1)];
}

/** `quarters` quarter turns of the whole cube about an axis as at most one move. */
export function rotations(axis: RotationAxis, quarters: number): Move[] {
  const k = ((quarters % 4) + 4) % 4;
  if (k === 0) return [];
  return [createMove({ kind: 'rotation', axis }, k === 1 ? 1 : k === 2 ? 2 : -1)];
}

/** A sequence done `times` times in a row. */
export function repeatMoves(unit: readonly Move[], times: number): Move[] {
  const moves: Move[] = [];
  for (let i = 0; i < times; i++) moves.push(...unit);
  return moves;
}

/** Number of layer turns in a move list; whole-cube rotations are regrips, not turns. */
export function countTurns(moves: readonly Move[]): number {
  return moves.filter((m) => m.kind !== 'rotation').length;
}

/** The face whose center has this color. */
export function faceOfColor(state: CubeState, color: CubeColor): Face {
  const face = FACES.find((f) => state[f][4] === color);
  if (!face) throw new Error(`No ${color} center on this cube`);
  return face;
}

export function edgeRef(a: CubeColor, b: CubeColor): PieceRef {
  return { kind: 'edge', colors: [a, b] };
}

export function cornerRef(a: CubeColor, b: CubeColor, c: CubeColor): PieceRef {
  return { kind: 'corner', colors: [a, b, c] };
}

/** The four corners of a layer, each as [layer color, side, side]. */
export function layerCorners(color: CubeColor): [CubeColor, CubeColor, CubeColor][] {
  return f2lSlots(OPPOSITE_COLORS[color]).map(([a, b]) => [color, a, b]);
}

/** True when a piece sits between its own centers, whichever way it is turned. */
export function isPieceInPlace(state: CubeState, colors: readonly CubeColor[]): boolean {
  const stickers =
    colors.length === 2
      ? findEdge(state, colors as [CubeColor, CubeColor]).stickers
      : findCorner(state, colors as [CubeColor, CubeColor, CubeColor]).stickers;
  return stickers.every((ref) => colors.includes(state[ref.face][4]));
}

/** True when the piece's `colors[0]` sticker lies on the face of that color. */
export function isPieceOriented(state: CubeState, colors: readonly CubeColor[]): boolean {
  const first =
    colors.length === 2
      ? findEdge(state, colors as [CubeColor, CubeColor]).stickers[0]
      : findCorner(state, colors as [CubeColor, CubeColor, CubeColor]).stickers[0];
  return state[first.face][4] === colors[0];
}

/** How many of the four last-layer edges show yellow on the yellow face. */
export function orientedLastEdges(state: CubeState): number {
  return SIDES.filter((side) => isPieceOriented(state, [LAST, side])).length;
}

/** How many of the four last-layer corners show yellow on the yellow face. */
export function orientedLastCorners(state: CubeState): number {
  return layerCorners(LAST).filter((corner) => isPieceOriented(state, corner)).length;
}

export function solvedLastEdges(state: CubeState): number {
  return SIDES.filter((side) => isPieceSolved(state, [LAST, side])).length;
}

export function solvedLastCorners(state: CubeState): number {
  return layerCorners(LAST).filter((corner) => isPieceSolved(state, corner)).length;
}

export function lastCornersInPlace(state: CubeState): number {
  return layerCorners(LAST).filter((corner) => isPieceInPlace(state, corner)).length;
}

/**
 * The fewest clockwise quarter turns of the yellow face (0 to 3) after which `test` holds, or
 * -1 if none does. Works however the cube is held.
 */
export function lastLayerTurnsUntil(state: CubeState, test: (turned: CubeState) => boolean): number {
  const face = faceOfColor(state, LAST);
  for (let k = 0; k < 4; k++) {
    if (test(applyMoves(state, faceTurns(face, k)))) return k;
  }
  return -1;
}

/** The last-layer pieces, for highlighting. */
export function lastLayerEdgeRefs(): PieceRef[] {
  return SIDES.map((side) => edgeRef(LAST, side));
}

export function lastLayerCornerRefs(): PieceRef[] {
  return layerCorners(LAST).map(([a, b, c]) => cornerRef(a, b, c));
}
