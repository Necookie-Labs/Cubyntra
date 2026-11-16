/**
 * Cubyntra - What Each 2-Look Case Looks Like
 *
 * One predicate per last-layer case, written from the case's `recognition` text, for a cube held
 * with yellow on top at the moment the algorithm starts. The table tests apply them to the cube
 * made by undoing each algorithm; the scramble tests apply them to real plans after their setup
 * moves. PLL predicates only compare top-layer stickers with each other, because the top layer
 * may still be a turn away from the centers.
 */

import { CubeState } from '../../src/cube/types';

const SIDES = ['F', 'R', 'B', 'L'] as const;
const yellowUp = (s: CubeState, indices: number[]) => indices.filter((i) => s.U[i] === 'yellow').join();
const edgesUp = (s: CubeState) => yellowUp(s, [1, 3, 5, 7]);
const cornersUp = (s: CubeState) => (edgesUp(s) === '1,3,5,7' ? yellowUp(s, [0, 2, 6, 8]) : 'no cross');
const isYellow = (...stickers: string[]) => stickers.every((c) => c === 'yellow');
/** Sides whose two top corner stickers have the same color. */
const headlights = (s: CubeState) => SIDES.filter((f) => s[f][0] === s[f][2]).join('');
/** Sides whose three top stickers have the same color. */
const bars = (s: CubeState) => SIDES.filter((f) => s[f][0] === s[f][1] && s[f][1] === s[f][2]).join('');
const allHeadlights = (s: CubeState) => headlights(s) === 'FRBL' && s.U.every((c) => c === 'yellow');

export const LOOKS: Record<string, (s: CubeState) => boolean> = {
  'oll-edges-line': (s) => edgesUp(s) === '3,5',
  'oll-edges-l': (s) => edgesUp(s) === '5,7',
  'oll-edges-dot': (s) => edgesUp(s) === '',

  'oll-corners-sune': (s) => cornersUp(s) === '6' && isYellow(s.F[2]),
  'oll-corners-antisune': (s) => cornersUp(s) === '2' && isYellow(s.R[0]),
  'oll-corners-h': (s) => cornersUp(s) === '' && isYellow(s.L[0], s.L[2], s.R[0], s.R[2]),
  'oll-corners-pi': (s) =>
    cornersUp(s) === '' &&
    isYellow(s.L[0], s.L[2]) &&
    [s.F[0], s.F[2]].filter((c) => c === 'yellow').length === 1 &&
    [s.B[0], s.B[2]].filter((c) => c === 'yellow').length === 1,
  'oll-corners-headlights': (s) => cornersUp(s) === '0,2' && isYellow(s.F[0], s.F[2]),
  'oll-corners-chameleon': (s) => cornersUp(s) === '2,8' && isYellow(s.F[0], s.B[2]),
  'oll-corners-bowtie': (s) => cornersUp(s) === '0,8' && isYellow(s.F[0]),

  'pll-corners-t': (s) => headlights(s) === 'L',
  'pll-corners-y': (s) => headlights(s) === '',

  'pll-edges-ua': (s) => allHeadlights(s) && bars(s) === 'B' && s.F[1] === s.R[0],
  'pll-edges-ub': (s) => allHeadlights(s) && bars(s) === 'B' && s.F[1] === s.L[0],
  'pll-edges-h': (s) => allHeadlights(s) && bars(s) === '' && s.F[1] === s.B[0] && s.L[1] === s.R[0],
  'pll-edges-z': (s) => allHeadlights(s) && bars(s) === '' && s.F[1] === s.L[0] && s.B[1] === s.R[0],
};
