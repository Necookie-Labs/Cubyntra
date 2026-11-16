/**
 * Cubyntra - Optimal Cross Search
 * Necookie Labs (c) 2026
 *
 * Solves the cross on the bottom face in the fewest outer turns. A breadth-first search from
 * the solved cross over the four cross edges (190,080 reachable positions) fills a distance
 * table once; a solution then just follows the table downhill. No cross needs more than 8 turns.
 */

import { CubeColor, CubeState, Move } from '../cube/types';
import { EDGE_COORD_COUNT, FACE_TURNS, edgeCoord, edgeMoveTable } from './edgeCoords';

/** Home coordinates of the four bottom edges, in the order DF, DL, DR, DB (orientation 0). */
const HOME = [16, 18, 20, 22] as const;
const N = EDGE_COORD_COUNT;

function pack(c: readonly number[]): number {
  return c[0] + N * (c[1] + N * (c[2] + N * c[3]));
}

let distances: Int8Array | null = null;

function crossDistances(): Int8Array {
  if (distances) return distances;
  const table = edgeMoveTable();
  const dist = new Int8Array(N * N * N * N).fill(-1);
  let frontier = [pack(HOME)];
  dist[frontier[0]] = 0;
  for (let depth = 1; frontier.length > 0; depth++) {
    const next: number[] = [];
    for (const index of frontier) {
      const a = index % N;
      const b = Math.floor(index / N) % N;
      const c = Math.floor(index / (N * N)) % N;
      const d = Math.floor(index / (N * N * N));
      for (let m = 0; m < FACE_TURNS.length; m++) {
        const row = table[m];
        const to = row[a] + N * (row[b] + N * (row[c] + N * row[d]));
        if (dist[to] < 0) {
          dist[to] = depth;
          next.push(to);
        }
      }
    }
    frontier = next;
  }
  distances = dist;
  return dist;
}

/** The four cross edges of a cube whose cross color is on the bottom, as coordinates. */
export function crossCoords(view: CubeState): number[] {
  const cross: CubeColor = view.D[4];
  return [view.F[4], view.L[4], view.R[4], view.B[4]].map((side) => edgeCoord(view, [cross, side]));
}

/** Fewest outer turns that solve the bottom cross of `view` (0 to 8). */
export function crossDistance(view: CubeState): number {
  return crossDistances()[pack(crossCoords(view))];
}

/** A shortest sequence of outer turns that solves the bottom cross of `view`. */
export function solveCross(view: CubeState): Move[] {
  const dist = crossDistances();
  const table = edgeMoveTable();
  let coords = crossCoords(view);
  const moves: Move[] = [];
  while (dist[pack(coords)] > 0) {
    const here = dist[pack(coords)];
    let advanced = false;
    for (let m = 0; m < FACE_TURNS.length; m++) {
      const next = coords.map((c) => table[m][c]);
      if (dist[pack(next)] === here - 1) {
        coords = next;
        moves.push(FACE_TURNS[m]);
        advanced = true;
        break;
      }
    }
    if (!advanced) throw new Error('Cross distance table is inconsistent');
  }
  return moves;
}

/** Largest distance in the table: the proven worst case for a cross. */
export function maxCrossDistance(): number {
  return crossDistances().reduce((max, d) => Math.max(max, d), 0);
}
