/**
 * Cubyntra - Edge Coordinates for Tutor Searches
 * Necookie Labs (c) 2026
 *
 * A compact model of where edges sit, used by the cross and daisy searches. An edge coordinate
 * is `slotIndex * 2 + orientation` (0..23), matching `findEdge` in ../cube/pieces. The move table
 * is derived from the cube engine itself, so the searches can never disagree with real turns.
 */

import { CubeColor, CubeState, Face, FaceStickers, Move } from '../cube/types';
import { FACES } from '../cube/constants';
import { StickerRef } from '../cube/geometry';
import { EDGE_SLOTS, findEdge } from '../cube/pieces';
import { applyMove, parseAlgorithm } from '../cube/transforms';

/** The 18 outer-layer turns, in the fixed order every search tries them. */
export const FACE_TURNS: readonly Move[] = parseAlgorithm(
  "U U' U2 D D' D2 R R' R2 L L' L2 F F' F2 B B' B2"
);

export const EDGE_COORD_COUNT = 24;

/** Coordinate of the edge with these colors: where `colors[0]` sits decides the orientation. */
export function edgeCoord(state: CubeState, colors: readonly [CubeColor, CubeColor]): number {
  const found = findEdge(state, colors);
  return EDGE_SLOTS.findIndex((s) => s.name === found.slot) * 2 + found.orientation;
}

function coordOfSticker(ref: StickerRef): number {
  for (let s = 0; s < EDGE_SLOTS.length; s++) {
    const o = EDGE_SLOTS[s].stickers.findIndex((x) => x.face === ref.face && x.index === ref.index);
    if (o >= 0) return s * 2 + o;
  }
  throw new Error(`Not an edge sticker: ${ref.face}${ref.index}`);
}

/** Where one marked sticker ends up after a move. */
function stickerDestination(ref: StickerRef, move: Move): StickerRef {
  const blank = {} as CubeState;
  for (const f of FACES) blank[f] = Array(9).fill('white') as FaceStickers;
  blank[ref.face][ref.index] = 'yellow';
  const after = applyMove(blank, move);
  for (const face of FACES) {
    const index = after[face].indexOf('yellow');
    if (index >= 0) return { face: face as Face, index };
  }
  throw new Error('Marked sticker vanished');
}

let moveTable: Uint8Array[] | null = null;

/** `table[moveIndex][coord]` is the coordinate after `FACE_TURNS[moveIndex]`. Built once. */
export function edgeMoveTable(): Uint8Array[] {
  if (!moveTable) {
    moveTable = FACE_TURNS.map((move) => {
      const row = new Uint8Array(EDGE_COORD_COUNT);
      for (let c = 0; c < EDGE_COORD_COUNT; c++) {
        const from = EDGE_SLOTS[c >> 1].stickers[c & 1];
        row[c] = coordOfSticker(stickerDestination(from, move));
      }
      return row;
    });
  }
  return moveTable;
}

/**
 * Shortest sequence of outer turns (iterative deepening, fixed move order) after which the
 * tracked edges satisfy `isGoal`. Returns null if nothing within `maxDepth` does.
 */
export function shortestEdgeSequence(
  start: readonly number[],
  isGoal: (coords: readonly number[]) => boolean,
  maxDepth: number
): Move[] | null {
  const table = edgeMoveTable();
  const path: number[] = [];

  const dfs = (coords: readonly number[], depth: number, lastFace: number): boolean => {
    if (depth === 0) return isGoal(coords);
    for (let m = 0; m < FACE_TURNS.length; m++) {
      const face = Math.floor(m / 3);
      if (face === lastFace) continue;
      const next = coords.map((c) => table[m][c]);
      path.push(m);
      if (dfs(next, depth - 1, face)) return true;
      path.pop();
    }
    return false;
  };

  for (let depth = 0; depth <= maxDepth; depth++) {
    if (dfs(start, depth, -1)) return path.map((m) => FACE_TURNS[m]);
  }
  return null;
}
