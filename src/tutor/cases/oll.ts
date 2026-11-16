/**
 * Cubyntra - Full OLL Case Table
 * Necookie Labs (c) 2026
 *
 * Orienting the last layer in one look: 57 cases, numbered the standard way (OLL 1 to OLL 57),
 * each with one algorithm that turns the whole top yellow. Used by CFOP with the learner
 * setting `lastLayer: 'full'`; the 2-look tables in `oll2look.ts` stay the default.
 *
 * `pattern` is the case's definition: the 21 last-layer stickers seen from above with yellow on
 * top, at the moment the algorithm starts, `x` for yellow. Five rows joined by `|`: the back
 * side (left to right), three rows of left sticker + top face + right sticker (back row first),
 * then the front side (left to right). `recognition` says the same in words: the shape, then
 * where every yellow sticker is.
 *
 * No algorithm contains a whole-cube rotation, so a step never regrips part-way through; wide
 * turns and slices are used where the common algorithm has them.
 */

import { LastLayerCase } from './oll2look';

export type OllGroup =
  | 'Dot'
  | 'Square'
  | 'Small lightning bolt'
  | 'Fish'
  | 'Knight move'
  | 'Cross'
  | 'Corners oriented'
  | 'Awkward'
  | 'P shapes'
  | 'T shapes'
  | 'C shapes'
  | 'W shapes'
  | 'Big lightning bolt'
  | 'Small L'
  | 'Line';

export interface OllCase extends LastLayerCase {
  /** Standard case number, 1 to 57. */
  number: number;
  /** Shape family, as algorithm sheets group them. */
  group: OllGroup;
  /** Where the yellow stickers are when the algorithm starts (see the file header). */
  pattern: string;
}

export const OLL_CASES: readonly OllCase[] = [
  {
    id: 'oll-01',
    number: 1,
    name: 'OLL 1 (Runway)',
    group: 'Dot',
    pattern: '.x.|x...x|x.x.x|x...x|.x.',
    recognition:
      'No yellow edges on top. Yellow on top: only the center. Yellow on the sides: front (middle), right (all three), back (middle), left (all three).',
    algorithm: "R U2 R2 F R F' U2 R' F R F'",
  },
  {
    id: 'oll-02',
    number: 2,
    name: 'OLL 2 (Zamboni)',
    group: 'Dot',
    pattern: '.xx|x....|x.x.x|x....|.xx',
    recognition:
      'No yellow edges on top. Yellow on top: only the center. Yellow on the sides: front (middle and right), right (middle), back (middle and right), left (all three).',
    algorithm: "F R U R' U' F' f R U R' U' f'",
  },
  {
    id: 'oll-03',
    number: 3,
    name: 'OLL 3 (Anti-Mouse)',
    group: 'Dot',
    pattern: 'xx.|....x|x.x.x|x..x.|.x.',
    recognition:
      'No yellow edges on top. Yellow on top: the center and the front-right corner. Yellow on the sides: front (middle), right (middle and back), back (left and middle), left (middle and front).',
    algorithm: "f R U R' U' f' U' F R U R' U' F'",
  },
  {
    id: 'oll-04',
    number: 4,
    name: 'OLL 4 (Mouse)',
    group: 'Dot',
    pattern: '.x.|x..x.|x.x.x|....x|xx.',
    recognition:
      'No yellow edges on top. Yellow on top: the center and the back-right corner. Yellow on the sides: front (left and middle), right (front and middle), back (middle), left (back and middle).',
    algorithm: "f R U R' U' f' U F R U R' U' F'",
  },
  {
    id: 'oll-05',
    number: 5,
    name: 'OLL 5 (Lefty Square)',
    group: 'Square',
    pattern: 'xx.|....x|x.xx.|x.xx.|...',
    recognition:
      'A yellow 2-by-2 square on top. Yellow on top: the center, the right and front edges and the front-right corner. Yellow on the sides: right (back), back (left and middle), left (middle and front).',
    algorithm: "r' U2 R U R' U r",
  },
  {
    id: 'oll-06',
    number: 6,
    name: 'OLL 6 (Righty Square)',
    group: 'Square',
    pattern: '...|x.xx.|x.xx.|....x|xx.',
    recognition:
      'A yellow 2-by-2 square on top. Yellow on top: the center, the back and right edges and the back-right corner. Yellow on the sides: front (left and middle), right (front), left (back and middle).',
    algorithm: "r U2 R' U' R U' r'",
  },
  {
    id: 'oll-07',
    number: 7,
    name: 'OLL 7 (Fat Sune)',
    group: 'Small lightning bolt',
    pattern: 'x..|..x.x|.xx.x|.x...|.xx',
    recognition:
      'A small yellow zigzag on top. Yellow on top: the center, the back and left edges and the front-left corner. Yellow on the sides: front (middle and right), right (middle and back), back (left).',
    algorithm: "r U R' U R U2 r'",
  },
  {
    id: 'oll-08',
    number: 8,
    name: 'OLL 8 (Fat Anti-Sune)',
    group: 'Small lightning bolt',
    pattern: '.xx|.x...|.xx.x|..x.x|x..',
    recognition:
      'A small yellow zigzag on top. Yellow on top: the center, the left and front edges and the back-left corner. Yellow on the sides: front (left), right (front and middle), back (middle and right).',
    algorithm: "r' U' R U' R' U2 r",
  },
  {
    id: 'oll-09',
    number: 9,
    name: 'OLL 9 (Kite)',
    group: 'Fish',
    pattern: '..x|x.x..|.xx.x|...x.|xx.',
    recognition:
      'A yellow fish shape on top. Yellow on top: the center, the back and left edges and the front-right corner. Yellow on the sides: front (left and middle), right (middle), back (right), left (back).',
    algorithm: "R U R' U' R' F R2 U R' U' F'",
  },
  {
    id: 'oll-10',
    number: 10,
    name: 'OLL 10 (Anti-Kite)',
    group: 'Fish',
    pattern: 'xx.|...x.|.xx.x|x.x..|..x',
    recognition:
      'A yellow fish shape on top. Yellow on top: the center, the left and front edges and the back-right corner. Yellow on the sides: front (right), right (middle), back (left and middle), left (front).',
    algorithm: "R U R' U R' F R F' R U2 R'",
  },
  {
    id: 'oll-11',
    number: 11,
    name: 'OLL 11 (Downstairs)',
    group: 'Small lightning bolt',
    pattern: 'x..|..xx.|.xx.x|x....|.xx',
    recognition:
      'A small yellow zigzag on top. Yellow on top: the center, the back and left edges and the back-right corner. Yellow on the sides: front (middle and right), right (middle), back (left), left (front).',
    algorithm: "r U R' U R' F R F' R U2 r'",
  },
  {
    id: 'oll-12',
    number: 12,
    name: 'OLL 12 (Upstairs)',
    group: 'Small lightning bolt',
    pattern: '..x|.xx..|x.xx.|....x|xx.',
    recognition:
      'A small yellow zigzag on top. Yellow on top: the center, the back and right edges and the back-left corner. Yellow on the sides: front (left and middle), right (front), back (right), left (middle).',
    algorithm: "M' R' U' R U' R' U2 R U' R r'",
  },
  {
    id: 'oll-13',
    number: 13,
    name: 'OLL 13 (Gun)',
    group: 'Knight move',
    pattern: 'xx.|....x|.xxx.|.x...|.xx',
    recognition:
      'A yellow line through the center with one corner beside it. Yellow on top: the center, the left and right edges and the front-left corner. Yellow on the sides: front (middle and right), right (back), back (left and middle).',
    algorithm: "F U R U' R2 F' R U R U' R'",
  },
  {
    id: 'oll-14',
    number: 14,
    name: 'OLL 14 (Anti-Gun)',
    group: 'Knight move',
    pattern: '.xx|x....|.xxx.|...x.|xx.',
    recognition:
      'A yellow line through the center with one corner beside it. Yellow on top: the center, the left and right edges and the front-right corner. Yellow on the sides: front (left and middle), back (middle and right), left (back).',
    algorithm: "R' F R U R' F' R F U' F'",
  },
  {
    id: 'oll-15',
    number: 15,
    name: 'OLL 15 (Squeegee)',
    group: 'Knight move',
    pattern: 'xx.|....x|.xxx.|x..x.|.x.',
    recognition:
      'A yellow line through the center with one corner beside it. Yellow on top: the center, the left and right edges and the front-right corner. Yellow on the sides: front (middle), right (back), back (left and middle), left (front).',
    algorithm: "r' U' r R' U' R U r' U r",
  },
  {
    id: 'oll-16',
    number: 16,
    name: 'OLL 16 (Anti-Squeegee)',
    group: 'Knight move',
    pattern: '.x.|x..x.|.xxx.|....x|xx.',
    recognition:
      'A yellow line through the center with one corner beside it. Yellow on top: the center, the left and right edges and the back-right corner. Yellow on the sides: front (left and middle), right (front), back (middle), left (back).',
    algorithm: "r U r' R U R' U' r U' r'",
  },
  {
    id: 'oll-17',
    number: 17,
    name: 'OLL 17 (Slash)',
    group: 'Dot',
    pattern: '.xx|.x...|x.x.x|x..x.|.x.',
    recognition:
      'No yellow edges on top. Yellow on top: the center and the back-left and front-right corners. Yellow on the sides: front (middle), right (middle), back (middle and right), left (middle and front).',
    algorithm: "R U R' U R' F R F' U2 R' F R F'",
  },
  {
    id: 'oll-18',
    number: 18,
    name: 'OLL 18 (Crown)',
    group: 'Dot',
    pattern: '.x.|.x.x.|x.x.x|.....|xxx',
    recognition:
      'No yellow edges on top. Yellow on top: the center and the back-left and back-right corners. Yellow on the sides: front (all three), right (middle), back (middle), left (middle).',
    algorithm: "r U R' U R U2 r2 U' R U' R' U2 r",
  },
  {
    id: 'oll-19',
    number: 19,
    name: 'OLL 19 (Bunny)',
    group: 'Dot',
    pattern: '.x.|.x.x.|x.x.x|x...x|.x.',
    recognition:
      'No yellow edges on top. Yellow on top: the center and the back-left and back-right corners. Yellow on the sides: front (middle), right (front and middle), back (middle), left (middle and front).',
    algorithm: "r' R U R U R' U' M' R' F R F'",
  },
  {
    id: 'oll-20',
    number: 20,
    name: 'OLL 20 (Checkers)',
    group: 'Dot',
    pattern: '.x.|.x.x.|x.x.x|.x.x.|.x.',
    recognition:
      'No yellow edges on top. Yellow on top: the center and all four corners. Yellow on the sides: front (middle), right (middle), back (middle), left (middle).',
    algorithm: "r U R' U' M2 U R U' R' U' M'",
  },
];
