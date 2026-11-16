/**
 * Cubyntra - Reading Full OLL and PLL Cases off a Cube
 *
 * Independent of the case tables: these functions look at a cube held with yellow on top and
 * say what its last layer shows (the yellow pattern, the plain-language description, the
 * permutation). The table tests compare them with what each table entry claims.
 */

import { CubeColor, CubeState, Face, Move } from '../../src/cube/types';
import { createSolvedCubeState } from '../../src/cube/constants';
import { findCorner, findEdge, isLayerSolved, isMiddleLayerSolved } from '../../src/cube/pieces';
import { applyMoves, parseAlgorithm } from '../../src/cube/transforms';

/** Solved, held with yellow on top and green in front. */
export const YELLOW_TOP = applyMoves(createSolvedCubeState(), parseAlgorithm('z2'));

/** No turn, U, U2 and U'. */
export const TOP_TURNS: readonly Move[][] = ['', 'U', 'U2', "U'"].map((t) => (t ? parseAlgorithm(t) : []));

export const firstTwoLayersSolved = (s: CubeState) => isLayerSolved(s, 'white') && isMiddleLayerSolved(s, 'white');
export const topIsYellow = (s: CubeState) => s.U.every((c) => c === 'yellow');

// ---------------------------------------------------------------------------------------------
// OLL: where the yellow stickers are
// ---------------------------------------------------------------------------------------------

/**
 * The 21 last-layer stickers seen from above, `x` for yellow: the back row (left to right),
 * three rows of left sticker + top face + right sticker, then the front row (left to right).
 */
export function ollPattern(s: CubeState): string {
  const y = (c: CubeColor) => (c === 'yellow' ? 'x' : '.');
  return [
    y(s.B[2]) + y(s.B[1]) + y(s.B[0]),
    y(s.L[0]) + y(s.U[0]) + y(s.U[1]) + y(s.U[2]) + y(s.R[2]),
    y(s.L[1]) + y(s.U[3]) + y(s.U[4]) + y(s.U[5]) + y(s.R[1]),
    y(s.L[2]) + y(s.U[6]) + y(s.U[7]) + y(s.U[8]) + y(s.R[0]),
    y(s.F[0]) + y(s.F[1]) + y(s.F[2]),
  ].join('|');
}

/** The same pattern whichever way the top is turned: the smallest of its four turns. */
export function ollClass(s: CubeState): string {
  return TOP_TURNS.map((turn) => ollPattern(applyMoves(s, turn))).sort()[0];
}

const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const TOP_EDGES: [number, string][] = [[1, 'back'], [3, 'left'], [5, 'right'], [7, 'front']];
const TOP_CORNERS: [number, string][] = [[0, 'back-left'], [2, 'back-right'], [6, 'front-left'], [8, 'front-right']];

/** The three top stickers of each side, named by where they are as the student holds the cube. */
const SIDE_ROWS: { name: string; face: Face; stickers: [number, string][] }[] = [
  { name: 'front', face: 'F', stickers: [[0, 'left'], [1, 'middle'], [2, 'right']] },
  { name: 'right', face: 'R', stickers: [[0, 'front'], [1, 'middle'], [2, 'back']] },
  { name: 'back', face: 'B', stickers: [[2, 'left'], [1, 'middle'], [0, 'right']] },
  { name: 'left', face: 'L', stickers: [[0, 'back'], [1, 'middle'], [2, 'front']] },
];

/** Where every yellow sticker of the last layer is, in plain words. */
export function describeOll(s: CubeState): string {
  const edges = TOP_EDGES.filter(([i]) => s.U[i] === 'yellow').map(([, name]) => name);
  const corners = TOP_CORNERS.filter(([i]) => s.U[i] === 'yellow').map(([, name]) => name);
  const parts: string[] = [];
  if (edges.length === 4) parts.push('the cross');
  else {
    parts.push('the center');
    if (edges.length) parts.push(`the ${list(edges)} ${edges.length === 1 ? 'edge' : 'edges'}`);
  }
  if (corners.length === 4) parts.push('all four corners');
  else if (corners.length) parts.push(`the ${list(corners)} ${corners.length === 1 ? 'corner' : 'corners'}`);
  const top = parts.length === 1 && edges.length === 0 ? 'Yellow on top: only the center.' : `Yellow on top: ${list(parts)}.`;

  const sides = SIDE_ROWS.flatMap(({ name, face, stickers }) => {
    const yellow = stickers.filter(([i]) => s[face][i] === 'yellow').map(([, where]) => where);
    if (!yellow.length) return [];
    return [`${name} (${yellow.length === 3 ? 'all three' : list(yellow)})`];
  });
  return `${top} Yellow on the sides: ${sides.join(', ')}.`;
}

// ---------------------------------------------------------------------------------------------
// PLL: where the pieces go and what the sides show
// ---------------------------------------------------------------------------------------------

const LL_CORNERS: [CubeColor, CubeColor, CubeColor][] = [
  ['yellow', 'blue', 'red'],
  ['yellow', 'blue', 'orange'],
  ['yellow', 'green', 'orange'],
  ['yellow', 'green', 'red'],
];
const LL_EDGES: [CubeColor, CubeColor][] = [
  ['yellow', 'blue'],
  ['yellow', 'orange'],
  ['yellow', 'green'],
  ['yellow', 'red'],
];

/**
 * What `moves` do to the last-layer pieces of a solved cube, as cycles: `(UFR UBR)` means the
 * piece at the front-right goes to the back-right and the other comes back. Each cycle starts
 * at its alphabetically first slot and cycles are sorted, so equal permutations give equal text.
 */
export function permutationCycles(moves: readonly Move[]): string {
  const after = applyMoves(YELLOW_TOP, moves);
  const to = new Map<string, string>();
  for (const c of LL_CORNERS) to.set(findCorner(YELLOW_TOP, c).slot, findCorner(after, c).slot);
  for (const e of LL_EDGES) to.set(findEdge(YELLOW_TOP, e).slot, findEdge(after, e).slot);
  const cycles: string[] = [];
  const seen = new Set<string>();
  for (const start of [...to.keys()].sort()) {
    if (seen.has(start) || to.get(start) === start) continue;
    const cycle = [start];
    seen.add(start);
    for (let at = to.get(start)!; at !== start; at = to.get(at)!) {
      cycle.push(at);
      seen.add(at);
    }
    cycles.push(`(${cycle.join(' ')})`);
  }
  return cycles.sort().join(' ');
}

/** The permutation a PLL algorithm does once the top turn it ends with is taken out. */
export function purePermutation(moves: readonly Move[]): string {
  const moved = (cycles: string) => cycles.split(' ').filter((w) => w).length;
  return TOP_TURNS.map((turn) => permutationCycles([...moves, ...turn])).sort(
    (a, b) => moved(a) - moved(b) || a.localeCompare(b)
  )[0];
}

/**
 * One key per PLL case: the same for two cubes that differ only by turns of the top before or
 * after the algorithm. A turn before is the same cube seen from another side, so the key reads
 * the top rows starting from each side in turn, naming colors by where their center sits.
 */
export function pllClass(s: CubeState): string {
  const keys: string[] = [];
  for (const turn of TOP_TURNS) {
    const turned = applyMoves(s, turn);
    for (let shift = 0; shift < 4; shift++) keys.push(relativeTop(turned, shift));
  }
  return keys.sort()[0];
}

const RING: Face[] = ['F', 'R', 'B', 'L'];

/** Top-row colors of the four sides starting at side `shift`, colors named by center position. */
function relativeTop(s: CubeState, shift: number): string {
  const names = new Map<CubeColor, string>();
  for (let i = 0; i < 4; i++) names.set(s[RING[(shift + i) % 4]][4], String(i));
  let key = '';
  for (let i = 0; i < 4; i++) {
    const face = RING[(shift + i) % 4];
    key += [0, 1, 2].map((k) => names.get(s[face][k])).join('') + '|';
  }
  return key;
}

/** What the top row of each side shows, comparing top-layer stickers only with each other. */
export function describePll(s: CubeState): string {
  const matched = (face: Face) => s[face][0] === s[face][2];
  const cornersDone = RING.every(matched);
  const sentences = SIDE_ROWS.map(({ name, face, stickers }) => {
    const [a, b, c] = stickers.map(([i]) => s[face][i]);
    const label = name[0].toUpperCase() + name.slice(1);
    if (a === b && b === c) return `${label}: a solid bar.`;
    if (a === c) {
      if (!cornersDone) return `${label}: headlights.`;
      const other = SIDE_ROWS.find((side) => side.face !== face && s[side.face][0] === b)!;
      return `${label}: headlights, with the middle sticker in the color of the ${other.name} corners.`;
    }
    if (a === b) return `${label}: a block of two at the ${stickers[0][1]}.`;
    if (b === c) return `${label}: a block of two at the ${stickers[2][1]}.`;
    return `${label}: three different colors.`;
  });
  return sentences.join(' ');
}
