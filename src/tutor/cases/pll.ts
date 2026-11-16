/**
 * Cubyntra - Full PLL Case Table
 * Necookie Labs (c) 2026
 *
 * Permuting the last layer in one look: the 21 cases by their standard names, each with one
 * algorithm that puts every top piece in order (a turn of the top may still be needed to line
 * it up with the sides). Used by CFOP with the learner setting `lastLayer: 'full'`; the 2-look
 * tables in `pll2look.ts` stay the default.
 *
 * `cycles` is the case's definition: what the algorithm does to the top-layer pieces, leaving
 * out any last turn of the top. `(UFR UBR)` means the front-right corner piece goes to the
 * back-right and the back-right one comes to the front-right; `(UF UR UL)` sends front to
 * right, right to left and left to front. `recognition` says what each side of the top layer
 * shows when the algorithm starts; it compares top-layer stickers with each other, never with
 * the centers, because the top may still be a turn away from them.
 *
 * No algorithm contains a whole-cube rotation, so a step never regrips part-way through.
 */

import { LastLayerCase } from './oll2look';

export type PllGroup =
  | 'Corners only'
  | 'Edges only'
  | 'Adjacent corner swap'
  | 'Diagonal corner swap'
  | 'G perms';

export interface PllCase extends LastLayerCase {
  group: PllGroup;
  /** What the algorithm does to the top-layer pieces (see the file header). */
  cycles: string;
}

export const PLL_CASES: readonly PllCase[] = [
  {
    id: 'pll-aa',
    name: 'Aa perm',
    group: 'Corners only',
    cycles: '(UBL UBR UFR)',
    recognition:
      'Only corners are out of place. Front: a block of two at the left. Right: three different colors. Back: headlights. Left: a block of two at the front.',
    algorithm: "R' F R' B2 R F' R' B2 R2",
  },
  {
    id: 'pll-ab',
    name: 'Ab perm',
    group: 'Corners only',
    cycles: '(UBL UFR UBR)',
    recognition:
      'Only corners are out of place. Front: a block of two at the left. Right: headlights. Back: three different colors. Left: a block of two at the front.',
    algorithm: "R2 B2 R F R' B2 R F' R",
  },
  {
    id: 'pll-e',
    name: 'E perm',
    group: 'Corners only',
    cycles: '(UBL UFL) (UBR UFR)',
    recognition:
      'Only corners are out of place. Front: three different colors. Right: three different colors. Back: three different colors. Left: three different colors.',
    algorithm: "R B' R' F R B R' F' R B R' F R B' R' F'",
  },
  {
    id: 'pll-f',
    name: 'F perm',
    group: 'Adjacent corner swap',
    cycles: '(UB UF) (UBR UFR)',
    recognition:
      'Two corners next to each other and two edges are swapped. Front: three different colors. Right: three different colors. Back: three different colors. Left: a solid bar.',
    algorithm: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R",
  },
  {
    id: 'pll-ga',
    name: 'Ga perm',
    group: 'G perms',
    cycles: '(UB UL UR) (UBL UBR UFL)',
    recognition:
      'Three corners and three edges go round in a cycle. Front: a block of two at the right. Right: three different colors. Back: three different colors. Left: headlights.',
    algorithm: "R2 U R' U R' U' R U' R2 U' D R' U R D'",
  },
  {
    id: 'pll-gb',
    name: 'Gb perm',
    group: 'G perms',
    cycles: '(UBL UBR UFL) (UF UR UL)',
    recognition:
      'Three corners and three edges go round in a cycle. Front: three different colors. Right: a block of two at the back. Back: three different colors. Left: headlights.',
    algorithm: "R' U' R U D' R2 U R' U R U' R U' R2 D",
  },
  {
    id: 'pll-gc',
    name: 'Gc perm',
    group: 'G perms',
    cycles: '(UB UF UR) (UBL UBR UFL)',
    recognition:
      'Three corners and three edges go round in a cycle. Front: three different colors. Right: three different colors. Back: a block of two at the right. Left: headlights.',
    algorithm: "R2 U' R U' R U R' U R2 U D' R U' R' D",
  },
  {
    id: 'pll-gd',
    name: 'Gd perm',
    group: 'G perms',
    cycles: '(UB UL UF) (UBL UBR UFL)',
    recognition:
      'Three corners and three edges go round in a cycle. Front: three different colors. Right: a block of two at the front. Back: three different colors. Left: headlights.',
    algorithm: "R U R' U' D R2 U' R U' R' U R' U R2 D'",
  },
  {
    id: 'pll-h',
    name: 'H perm',
    group: 'Edges only',
    cycles: '(UB UF) (UL UR)',
    recognition:
      'Only edges are out of place. Front: headlights, with the middle sticker in the color of the back corners. Right: headlights, with the middle sticker in the color of the left corners. Back: headlights, with the middle sticker in the color of the front corners. Left: headlights, with the middle sticker in the color of the right corners.',
    algorithm: 'M2 U M2 U2 M2 U M2',
  },
  {
    id: 'pll-ja',
    name: 'Ja perm',
    group: 'Adjacent corner swap',
    cycles: '(UB UL) (UBL UBR)',
    recognition:
      'Two corners next to each other and two edges are swapped. Front: a solid bar. Right: a block of two at the front. Back: a block of two at the right. Left: a block of two at the back.',
    algorithm: "R' U L' U2 R U' R' U2 R L",
  },
  {
    id: 'pll-jb',
    name: 'Jb perm',
    group: 'Adjacent corner swap',
    cycles: '(UBR UFR) (UF UR)',
    recognition:
      'Two corners next to each other and two edges are swapped. Front: a block of two at the right. Right: a block of two at the back. Back: a block of two at the left. Left: a solid bar.',
    algorithm: "R U R' F' R U R' U' R' F R2 U' R'",
  },
  {
    id: 'pll-na',
    name: 'Na perm',
    group: 'Diagonal corner swap',
    cycles: '(UBR UFL) (UL UR)',
    recognition:
      'Two corners across the top from each other and two edges are swapped. Front: a block of two at the right. Right: a block of two at the back. Back: a block of two at the left. Left: a block of two at the front.',
    algorithm: "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'",
  },
  {
    id: 'pll-nb',
    name: 'Nb perm',
    group: 'Diagonal corner swap',
    cycles: '(UBL UFR) (UL UR)',
    recognition:
      'Two corners across the top from each other and two edges are swapped. Front: a block of two at the left. Right: a block of two at the front. Back: a block of two at the right. Left: a block of two at the back.',
    algorithm: "R' U R U' R' F' U' F R U R' F R' F' R U' R",
  },
  {
    id: 'pll-ra',
    name: 'Ra perm',
    group: 'Adjacent corner swap',
    cycles: '(UB UL) (UBR UFR)',
    recognition:
      'Two corners next to each other and two edges are swapped. Front: a block of two at the left. Right: three different colors. Back: three different colors. Left: headlights.',
    algorithm: "R U' R' U' R U R D R' U' R D' R' U2 R'",
  },
  {
    id: 'pll-rb',
    name: 'Rb perm',
    group: 'Adjacent corner swap',
    cycles: '(UBR UFR) (UF UL)',
    recognition:
      'Two corners next to each other and two edges are swapped. Front: three different colors. Right: three different colors. Back: a block of two at the left. Left: headlights.',
    algorithm: "R2 F R U R U' R' F' R U2 R' U2 R",
  },
  {
    id: 'pll-t',
    name: 'T perm',
    group: 'Adjacent corner swap',
    cycles: '(UBR UFR) (UL UR)',
    recognition:
      'Two corners next to each other and two edges are swapped. Front: a block of two at the left. Right: three different colors. Back: a block of two at the left. Left: headlights.',
    algorithm: "R U R' U' R' F R2 U' R' U' R U R' F'",
  },
  {
    id: 'pll-ua',
    name: 'Ua perm',
    group: 'Edges only',
    cycles: '(UF UR UL)',
    recognition:
      'Only edges are out of place. Front: headlights, with the middle sticker in the color of the right corners. Right: headlights, with the middle sticker in the color of the left corners. Back: a solid bar. Left: headlights, with the middle sticker in the color of the front corners.',
    algorithm: "R U' R U R U R U' R' U' R2",
  },
  {
    id: 'pll-ub',
    name: 'Ub perm',
    group: 'Edges only',
    cycles: '(UF UL UR)',
    recognition:
      'Only edges are out of place. Front: headlights, with the middle sticker in the color of the left corners. Right: headlights, with the middle sticker in the color of the front corners. Back: a solid bar. Left: headlights, with the middle sticker in the color of the right corners.',
    algorithm: "R2 U R U R' U' R' U' R' U R'",
  },
  {
    id: 'pll-v',
    name: 'V perm',
    group: 'Diagonal corner swap',
    cycles: '(UB UR) (UBL UFR)',
    recognition:
      'Two corners across the top from each other and two edges are swapped. Front: a block of two at the left. Right: three different colors. Back: three different colors. Left: a block of two at the front.',
    algorithm: "R' U R' U' R D' R' D R' U D' R2 U' R2 D R2",
  },
  {
    id: 'pll-y',
    name: 'Y perm',
    group: 'Diagonal corner swap',
    cycles: '(UB UL) (UBL UFR)',
    recognition:
      'Two corners across the top from each other and two edges are swapped. Front: a block of two at the left. Right: a block of two at the back. Back: three different colors. Left: three different colors.',
    algorithm: "F R U' R' U' R U R' F' R U R' U' R' F R F'",
  },
  {
    id: 'pll-z',
    name: 'Z perm',
    group: 'Edges only',
    cycles: '(UB UR) (UF UL)',
    recognition:
      'Only edges are out of place. Front: headlights, with the middle sticker in the color of the left corners. Right: headlights, with the middle sticker in the color of the back corners. Back: headlights, with the middle sticker in the color of the right corners. Left: headlights, with the middle sticker in the color of the front corners.',
    algorithm: "M' U M2 U M2 U M' U2 M2",
  },
];
