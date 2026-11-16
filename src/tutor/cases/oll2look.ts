/**
 * Cubyntra - 2-Look OLL Case Table
 * Necookie Labs (c) 2026
 *
 * Orienting the last layer in two looks: first the yellow cross (3 cases), then the yellow
 * corners (7 cases). Recognition is written for yellow on top, after turning the top layer to
 * the position the algorithm starts from.
 */

export interface LastLayerCase {
  id: string;
  name: string;
  /** What the student sees once the top is turned to the starting position. */
  recognition: string;
  algorithm: string;
}

/** Look 1: make the yellow cross. */
export const OLL_EDGE_CASES: readonly LastLayerCase[] = [
  {
    id: 'oll-edges-line',
    name: 'Line',
    recognition: 'Two yellow edges make a line through the center. Turn the top so the line runs left to right.',
    algorithm: "F R U R' U' F'",
  },
  {
    id: 'oll-edges-l',
    name: 'L shape',
    recognition: 'Two yellow edges make an L with the center. Turn the top so the L points to the front and the right.',
    algorithm: "f R U R' U' f'",
  },
  {
    id: 'oll-edges-dot',
    name: 'Dot',
    recognition: 'No yellow edges on top, only the yellow center.',
    algorithm: "F R U R' U' F' f R U R' U' f'",
  },
];

/** Look 2: turn the yellow corners up once the cross is made. */
export const OLL_CORNER_CASES: readonly LastLayerCase[] = [
  {
    id: 'oll-corners-sune',
    name: 'Sune',
    recognition: 'One yellow corner on top, at the front-left. The front-right corner shows yellow on the front.',
    algorithm: "R U R' U R U2 R'",
  },
  {
    id: 'oll-corners-antisune',
    name: 'Anti-Sune',
    recognition: 'One yellow corner on top, at the back-right. The front-right corner shows yellow on the right.',
    algorithm: "R U2 R' U' R U' R'",
  },
  {
    id: 'oll-corners-h',
    name: 'Double headlights (H)',
    recognition: 'No yellow corners on top. Two yellow stickers on the left side and two on the right side.',
    algorithm: "R U R' U R U' R' U R U2 R'",
  },
  {
    id: 'oll-corners-pi',
    name: 'Pi',
    recognition: 'No yellow corners on top. Two yellow stickers on the left side, one on the front and one on the back.',
    algorithm: "R U2 R2 U' R2 U' R2 U2 R",
  },
  {
    id: 'oll-corners-headlights',
    name: 'Headlights (U)',
    recognition: 'Two yellow corners on top, both at the back. The front shows two yellow stickers.',
    algorithm: "R2 D R' U2 R D' R' U2 R'",
  },
  {
    id: 'oll-corners-chameleon',
    name: 'Chameleon (T)',
    recognition: 'Two yellow corners on top, both on the right. The left corners show yellow on the front and the back.',
    algorithm: "r U R' U' r' F R F'",
  },
  {
    id: 'oll-corners-bowtie',
    name: 'Bowtie (L)',
    recognition: 'Two yellow corners on top, diagonal: back-left and front-right. The front-left corner shows yellow on the front.',
    algorithm: "F R' F' r U R U' r'",
  },
];
