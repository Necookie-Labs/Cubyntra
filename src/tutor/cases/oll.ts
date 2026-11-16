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
  {
    id: 'oll-21',
    number: 21,
    name: 'OLL 21 (Double Sune)',
    group: 'Cross',
    pattern: 'x.x|..x..|.xxx.|..x..|x.x',
    recognition:
      'A yellow cross on top. Yellow on top: the cross. Yellow on the sides: front (left and right), back (left and right).',
    algorithm: "R U2 R' U' R U R' U' R U' R'",
  },
  {
    id: 'oll-22',
    number: 22,
    name: 'OLL 22 (Pi)',
    group: 'Cross',
    pattern: '..x|x.x..|.xxx.|x.x..|..x',
    recognition:
      'A yellow cross on top. Yellow on top: the cross. Yellow on the sides: front (right), back (right), left (back and front).',
    algorithm: "R U2 R2 U' R2 U' R2 U2 R",
  },
  {
    id: 'oll-23',
    number: 23,
    name: 'OLL 23 (Headlights)',
    group: 'Cross',
    pattern: 'x.x|..x..|.xxx.|.xxx.|...',
    recognition:
      'A yellow cross on top. Yellow on top: the cross and the front-left and front-right corners. Yellow on the sides: back (left and right).',
    algorithm: "R2 D' R U2 R' D R U2 R",
  },
  {
    id: 'oll-24',
    number: 24,
    name: 'OLL 24 (Chameleon)',
    group: 'Cross',
    pattern: 'x..|..xx.|.xxx.|..xx.|x..',
    recognition:
      'A yellow cross on top. Yellow on top: the cross and the back-right and front-right corners. Yellow on the sides: front (left), back (left).',
    algorithm: "r U R' U' r' F R F'",
  },
  {
    id: 'oll-25',
    number: 25,
    name: 'OLL 25 (Bowtie)',
    group: 'Cross',
    pattern: '...|x.xx.|.xxx.|.xx..|..x',
    recognition:
      'A yellow cross on top. Yellow on top: the cross and the back-right and front-left corners. Yellow on the sides: front (right), left (back).',
    algorithm: "F' r U R' U' r' F R",
  },
  {
    id: 'oll-26',
    number: 26,
    name: 'OLL 26 (Anti-Sune)',
    group: 'Cross',
    pattern: '...|x.xx.|.xxx.|..x.x|x..',
    recognition:
      'A yellow cross on top. Yellow on top: the cross and the back-right corner. Yellow on the sides: front (left), right (front), left (back).',
    algorithm: "R U2 R' U' R U' R'",
  },
  {
    id: 'oll-27',
    number: 27,
    name: 'OLL 27 (Sune)',
    group: 'Cross',
    pattern: 'x..|..x.x|.xxx.|.xx..|..x',
    recognition:
      'A yellow cross on top. Yellow on top: the cross and the front-left corner. Yellow on the sides: front (right), right (back), back (left).',
    algorithm: "R U R' U R U2 R'",
  },
  {
    id: 'oll-28',
    number: 28,
    name: 'OLL 28 (Stealth)',
    group: 'Corners oriented',
    pattern: '...|.xxx.|.xx.x|.x.x.|.x.',
    recognition:
      'All four corners are yellow on top, and two edges are not. Yellow on top: the center, the back and left edges and all four corners. Yellow on the sides: front (middle), right (middle).',
    algorithm: "r U R' U' r' R U R U' R'",
  },
  {
    id: 'oll-29',
    number: 29,
    name: 'OLL 29 (Spotted Chameleon)',
    group: 'Awkward',
    pattern: 'x..|..xx.|.xx.x|...x.|xx.',
    recognition:
      'Two yellow edges next to each other and two yellow corners that do not make a block. Yellow on top: the center, the back and left edges and the back-right and front-right corners. Yellow on the sides: front (left and middle), right (middle), back (left).',
    algorithm: "R U R' U' R U' R' F' U' F R U R'",
  },
  {
    id: 'oll-30',
    number: 30,
    name: 'OLL 30 (Anti-Spotted Chameleon)',
    group: 'Awkward',
    pattern: '...|x.x.x|.xx.x|.x.x.|.x.',
    recognition:
      'Two yellow edges next to each other and two yellow corners that do not make a block. Yellow on top: the center, the back and left edges and the front-left and front-right corners. Yellow on the sides: front (middle), right (middle and back), left (back).',
    algorithm: "F R' F R2 U' R' U' R U R' F2",
  },
  {
    id: 'oll-31',
    number: 31,
    name: 'OLL 31 (Couch)',
    group: 'P shapes',
    pattern: 'x..|..xx.|x.xx.|...x.|xx.',
    recognition:
      'A yellow P shape on top. Yellow on top: the center, the back and right edges and the back-right and front-right corners. Yellow on the sides: front (left and middle), back (left), left (middle).',
    algorithm: "R' U' F U R U' R' F' R",
  },
  {
    id: 'oll-32',
    number: 32,
    name: 'OLL 32 (Anti-Couch)',
    group: 'P shapes',
    pattern: '..x|.xx..|.xx.x|.x...|.xx',
    recognition:
      'A yellow P shape on top. Yellow on top: the center, the back and left edges and the back-left and front-left corners. Yellow on the sides: front (middle and right), right (middle), back (right).',
    algorithm: "L U F' U' L' U L F L'",
  },
  {
    id: 'oll-33',
    number: 33,
    name: 'OLL 33 (Key)',
    group: 'T shapes',
    pattern: 'xx.|...x.|.xxx.|...x.|xx.',
    recognition:
      'A yellow T shape on top. Yellow on top: the center, the left and right edges and the back-right and front-right corners. Yellow on the sides: front (left and middle), back (left and middle).',
    algorithm: "R U R' U' R' F R F'",
  },
  {
    id: 'oll-34',
    number: 34,
    name: 'OLL 34 (City)',
    group: 'C shapes',
    pattern: '.x.|x...x|.xxx.|.x.x.|.x.',
    recognition:
      'A yellow C shape on top. Yellow on top: the center, the left and right edges and the front-left and front-right corners. Yellow on the sides: front (middle), right (back), back (middle), left (back).',
    algorithm: "R U R2 U' R' F R U R U' F'",
  },
  {
    id: 'oll-35',
    number: 35,
    name: 'OLL 35 (Fish Salad)',
    group: 'Fish',
    pattern: '.x.|.x..x|x.xx.|..xx.|x..',
    recognition:
      'A yellow fish shape on top. Yellow on top: the center, the right and front edges and the back-left and front-right corners. Yellow on the sides: front (left), right (back), back (middle), left (middle).',
    algorithm: "R U2 R2 F R F' R U2 R'",
  },
  {
    id: 'oll-36',
    number: 36,
    name: 'OLL 36 (Wario)',
    group: 'W shapes',
    pattern: '..x|.xx..|x.xx.|x..x.|.x.',
    recognition:
      'A yellow W shape (a staircase) on top. Yellow on top: the center, the back and right edges and the back-left and front-right corners. Yellow on the sides: front (middle), back (right), left (middle and front).',
    algorithm: "L' U' L U' L' U L U L F' L' F",
  },
  {
    id: 'oll-37',
    number: 37,
    name: 'OLL 37 (Mounted Fish)',
    group: 'Fish',
    pattern: '...|.xx.x|.xx.x|...x.|xx.',
    recognition:
      'A yellow fish shape on top. Yellow on top: the center, the back and left edges and the back-left and front-right corners. Yellow on the sides: front (left and middle), right (middle and back).',
    algorithm: "F R' F' R U R U' R'",
  },
  {
    id: 'oll-38',
    number: 38,
    name: 'OLL 38 (Mario)',
    group: 'W shapes',
    pattern: 'x..|..xx.|.xx.x|.x..x|.x.',
    recognition:
      'A yellow W shape (a staircase) on top. Yellow on top: the center, the back and left edges and the back-right and front-left corners. Yellow on the sides: front (middle), right (front and middle), back (left).',
    algorithm: "R U R' U R U' R' U' R' F R F'",
  },
  {
    id: 'oll-39',
    number: 39,
    name: 'OLL 39 (Fung)',
    group: 'Big lightning bolt',
    pattern: 'xx.|...x.|.xxx.|.x..x|.x.',
    recognition:
      'A big yellow zigzag on top. Yellow on top: the center, the left and right edges and the back-right and front-left corners. Yellow on the sides: front (middle), right (front), back (left and middle).',
    algorithm: "L F' L' U' L U F U' L'",
  },
  {
    id: 'oll-40',
    number: 40,
    name: 'OLL 40 (Anti-Fung)',
    group: 'Big lightning bolt',
    pattern: '.xx|.x...|.xxx.|x..x.|.x.',
    recognition:
      'A big yellow zigzag on top. Yellow on top: the center, the left and right edges and the back-left and front-right corners. Yellow on the sides: front (middle), back (middle and right), left (front).',
    algorithm: "R' F R U R' U' F' U R",
  },
  {
    id: 'oll-41',
    number: 41,
    name: 'OLL 41 (Awkward Fish)',
    group: 'Awkward',
    pattern: 'x.x|..x..|.xx.x|.x.x.|.x.',
    recognition:
      'Two yellow edges next to each other and two yellow corners that do not make a block. Yellow on top: the center, the back and left edges and the front-left and front-right corners. Yellow on the sides: front (middle), right (middle), back (left and right).',
    algorithm: "R U R' U R U2 R' F R U R' U' F'",
  },
  {
    id: 'oll-42',
    number: 42,
    name: 'OLL 42 (Lefty Awkward Fish)',
    group: 'Awkward',
    pattern: '.x.|.x.x.|.xx.x|..x..|x.x',
    recognition:
      'Two yellow edges next to each other and two yellow corners that do not make a block. Yellow on top: the center, the left and front edges and the back-left and back-right corners. Yellow on the sides: front (left and right), right (middle), back (middle).',
    algorithm: "R' U' R U' R' U2 R F R U R' U' F'",
  },
  {
    id: 'oll-43',
    number: 43,
    name: 'OLL 43 (Anti-P)',
    group: 'P shapes',
    pattern: '...|x.xx.|x.xx.|x..x.|.x.',
    recognition:
      'A yellow P shape on top. Yellow on top: the center, the back and right edges and the back-right and front-right corners. Yellow on the sides: front (middle), left (all three).',
    algorithm: "F' U' L' U L F",
  },
  {
    id: 'oll-44',
    number: 44,
    name: 'OLL 44 (P)',
    group: 'P shapes',
    pattern: '...|.xx.x|.xx.x|.x..x|.x.',
    recognition:
      'A yellow P shape on top. Yellow on top: the center, the back and left edges and the back-left and front-left corners. Yellow on the sides: front (middle), right (all three).',
    algorithm: "F U R U' R' F'",
  },
  {
    id: 'oll-45',
    number: 45,
    name: 'OLL 45 (Suit Up)',
    group: 'T shapes',
    pattern: '.x.|x..x.|.xxx.|x..x.|.x.',
    recognition:
      'A yellow T shape on top. Yellow on top: the center, the left and right edges and the back-right and front-right corners. Yellow on the sides: front (middle), back (middle), left (back and front).',
    algorithm: "F R U R' U' F'",
  },
  {
    id: 'oll-46',
    number: 46,
    name: "OLL 46 (Seein' Headlights)",
    group: 'C shapes',
    pattern: '...|.xx.x|x.x.x|.xx.x|...',
    recognition:
      'A yellow C shape on top. Yellow on top: the center, the back and front edges and the back-left and front-left corners. Yellow on the sides: right (all three), left (middle).',
    algorithm: "R' U' R' F R F' U R",
  },
  {
    id: 'oll-47',
    number: 47,
    name: 'OLL 47 (Anti-Breakneck)',
    group: 'Small L',
    pattern: 'x..|..x.x|x.xx.|....x|xx.',
    recognition:
      'A small yellow L shape on top, with no yellow corners. Yellow on top: the center and the back and right edges. Yellow on the sides: front (left and middle), right (front and back), back (left), left (middle).',
    algorithm: "R' U' R' F R F' R' F R F' U R",
  },
  {
    id: 'oll-48',
    number: 48,
    name: 'OLL 48 (Breakneck)',
    group: 'Small L',
    pattern: '..x|x.x..|.xx.x|x....|.xx',
    recognition:
      'A small yellow L shape on top, with no yellow corners. Yellow on top: the center and the back and left edges. Yellow on the sides: front (middle and right), right (middle), back (right), left (back and front).',
    algorithm: "F R U R' U' R U R' U' F'",
  },
  {
    id: 'oll-49',
    number: 49,
    name: 'OLL 49 (Right Back Squeezy)',
    group: 'Small L',
    pattern: '..x|x.x..|x.xx.|x....|.xx',
    recognition:
      'A small yellow L shape on top, with no yellow corners. Yellow on top: the center and the back and right edges. Yellow on the sides: front (middle and right), back (right), left (all three).',
    algorithm: "r U' r2 U r2 U r2 U' r",
  },
  {
    id: 'oll-50',
    number: 50,
    name: 'OLL 50 (Right Front Squeezy)',
    group: 'Small L',
    pattern: '.xx|x....|x.xx.|x.x..|..x',
    recognition:
      'A small yellow L shape on top, with no yellow corners. Yellow on top: the center and the right and front edges. Yellow on the sides: front (right), back (middle and right), left (all three).',
    algorithm: "r' U r2 U' r2 U' r2 U r'",
  },
  {
    id: 'oll-51',
    number: 51,
    name: 'OLL 51 (Bottlecap)',
    group: 'Line',
    pattern: 'xx.|....x|.xxx.|....x|xx.',
    recognition:
      'A yellow line through the center on top, with no yellow corners. Yellow on top: the center and the left and right edges. Yellow on the sides: front (left and middle), right (front and back), back (left and middle).',
    algorithm: "F U R U' R' U R U' R' F'",
  },
  {
    id: 'oll-52',
    number: 52,
    name: 'OLL 52 (Rice Cooker)',
    group: 'Line',
    pattern: 'x..|..x.x|x.x.x|..x.x|x..',
    recognition:
      'A yellow line through the center on top, with no yellow corners. Yellow on top: the center and the back and front edges. Yellow on the sides: front (left), right (all three), back (left), left (middle).',
    algorithm: "R U R' U R U' B U' B' R'",
  },
  {
    id: 'oll-53',
    number: 53,
    name: 'OLL 53 (Frying Pan)',
    group: 'Small L',
    pattern: 'x.x|..x..|x.xx.|.....|xxx',
    recognition:
      'A small yellow L shape on top, with no yellow corners. Yellow on top: the center and the back and right edges. Yellow on the sides: front (all three), back (left and right), left (middle).',
    algorithm: "l' U2 L U L' U' L U L' U l",
  },
  {
    id: 'oll-54',
    number: 54,
    name: 'OLL 54 (Anti-Frying Pan)',
    group: 'Small L',
    pattern: 'x.x|..x..|.xx.x|.....|xxx',
    recognition:
      'A small yellow L shape on top, with no yellow corners. Yellow on top: the center and the back and left edges. Yellow on the sides: front (all three), right (middle), back (left and right).',
    algorithm: "r U2 R' U' R U R' U' R U' r'",
  },
  {
    id: 'oll-55',
    number: 55,
    name: 'OLL 55 (Highway)',
    group: 'Line',
    pattern: 'xxx|.....|.xxx.|.....|xxx',
    recognition:
      'A yellow line through the center on top, with no yellow corners. Yellow on top: the center and the left and right edges. Yellow on the sides: front (all three), back (all three).',
    algorithm: "R' F R U R U' R2 F' R2 U' R' U R U R'",
  },
  {
    id: 'oll-56',
    number: 56,
    name: 'OLL 56 (Streetlights)',
    group: 'Line',
    pattern: '.x.|x...x|.xxx.|x...x|.x.',
    recognition:
      'A yellow line through the center on top, with no yellow corners. Yellow on top: the center and the left and right edges. Yellow on the sides: front (middle), right (front and back), back (middle), left (back and front).',
    algorithm: "r' U' r U' R' U R U' R' U R r' U r",
  },
  {
    id: 'oll-57',
    number: 57,
    name: 'OLL 57 (Mummy)',
    group: 'Corners oriented',
    pattern: '.x.|.x.x.|.xxx.|.x.x.|.x.',
    recognition:
      'All four corners are yellow on top, and two edges are not. Yellow on top: the center, the left and right edges and all four corners. Yellow on the sides: front (middle), back (middle).',
    algorithm: "R U R' U' M' U R U' r'",
  },
];
