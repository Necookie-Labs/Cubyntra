/**
 * Cubyntra - 2-Look PLL Case Table
 * Necookie Labs (c) 2026
 *
 * Permuting the last layer in two looks: first the corners (2 cases, or already done), then
 * the edges (4 cases, or already done). Recognition is written for yellow on top, after turning
 * the top layer to the position the algorithm starts from. It compares top-layer stickers with
 * each other, never with the centers, because the top may still be a turn away from them.
 */

import { LastLayerCase } from './oll2look';

/** Look 1: put the four top corners in the right order. */
export const PLL_CORNER_CASES: readonly LastLayerCase[] = [
  {
    id: 'pll-corners-t',
    name: 'Headlights (T perm)',
    recognition: 'One side has two corner stickers of the same color ("headlights"). Turn the top so they are on the left.',
    algorithm: "R U R' U' R' F R2 U' R' U' R U R' F'",
  },
  {
    id: 'pll-corners-y',
    name: 'No headlights (Y perm)',
    recognition: 'No side has two corner stickers of the same color.',
    algorithm: "F R U' R' U' R U R' F' R U R' U' R' F R F'",
  },
];

/** Look 2: put the four top edges in the right order once the corners are done. */
export const PLL_EDGE_CASES: readonly LastLayerCase[] = [
  {
    id: 'pll-edges-ua',
    name: 'Ua perm',
    recognition: 'One side of the top layer is a solid bar of one color. Hold the bar at the back: the front edge has the color of the corners on the right side.',
    algorithm: "R U' R U R U R U' R' U' R2",
  },
  {
    id: 'pll-edges-ub',
    name: 'Ub perm',
    recognition: 'One side of the top layer is a solid bar of one color. Hold the bar at the back: the front edge has the color of the corners on the left side.',
    algorithm: "R2 U R U R' U' R' U' R' U R'",
  },
  {
    id: 'pll-edges-h',
    name: 'H perm',
    recognition: 'No side of the top layer is a solid bar. Every edge has the color of the corners on the opposite side.',
    algorithm: 'M2 U M2 U2 M2 U M2',
  },
  {
    id: 'pll-edges-z',
    name: 'Z perm',
    recognition: 'No side of the top layer is a solid bar. The front edge has the color of the left corners and the back edge the color of the right corners.',
    algorithm: "M' U M2 U M2 U M' U2 M2 U'",
  },
];
