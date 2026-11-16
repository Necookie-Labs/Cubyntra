/**
 * Cubyntra - F2L Case Table (41 cases)
 * Necookie Labs (c) 2026
 *
 * Every way a corner and its edge can sit in the top layer or in their own slot, with the cube
 * held so the slot is at the front-right and the cross on the bottom. Each algorithm solves the
 * pair without touching the cross or the other three slots.
 *
 * `position` is where the pair starts, as `<corner slot><twist>-<edge slot><flip>`:
 * - corner twist: 0 = cross color facing up (or down, in the slot), then 1 and 2 going
 *   counter-clockwise around the corner (UFR: 1 = facing front, 2 = facing right;
 *   DFR: 1 = facing right, 2 = facing front);
 * - edge flip: 0 = the front-center color is on the top sticker (or on the front, in the slot),
 *   1 = the other way round.
 * The tests rebuild every position by undoing the algorithm on a solved cube, so the table
 * cannot drift from what the algorithms really do.
 */

import { CubeState } from '../../cube/types';
import { findCorner, findEdge } from '../../cube/pieces';

export type F2LGroup =
  | 'easy-insert'
  | 'top-white-side'
  | 'top-white-up'
  | 'corner-in-slot'
  | 'edge-in-slot'
  | 'both-in-slot';

export interface F2LCase {
  /** `f2l-01` to `f2l-41`. */
  id: string;
  name: string;
  group: F2LGroup;
  position: string;
  /** What the student sees, in words. */
  recognition: string;
  algorithm: string;
}

export const F2L_GROUP_NAMES: Record<F2LGroup, string> = {
  'easy-insert': 'Easy insert',
  'top-white-side': 'Both on top, white on the side',
  'top-white-up': 'Both on top, white facing up',
  'corner-in-slot': 'Corner in the slot, edge on top',
  'edge-in-slot': 'Edge in the slot, corner on top',
  'both-in-slot': 'Both in the slot',
};

const CORNER_PLACE: Record<string, string> = {
  UFR: 'above the slot',
  UFL: 'at the top front-left',
  UBR: 'at the top back-right',
  UBL: 'at the top back-left',
  DFR: 'in the slot',
};

const CORNER_FACING: Record<string, [string, string, string]> = {
  UFR: ['up', 'the front', 'the right'],
  UFL: ['up', 'the left', 'the front'],
  UBR: ['up', 'the right', 'the back'],
  UBL: ['up', 'the back', 'the left'],
  DFR: ['down', 'the right', 'the front'],
};

const EDGE_PLACE: Record<string, string> = {
  UF: 'at the top front',
  UR: 'at the top right',
  UB: 'at the top back',
  UL: 'at the top left',
  FR: 'in the slot',
};

/** The position key of the front-right pair of a cube held with the cross on the bottom. */
export function f2lPositionKey(view: CubeState): string {
  const cross = view.D[4];
  const front = view.F[4];
  const right = view.R[4];
  const corner = findCorner(view, [cross, front, right]);
  const edge = findEdge(view, [front, right]);
  return `${corner.slot}${corner.orientation}-${edge.slot}${edge.orientation}`;
}

/** Plain-language description of a position key (see the header for the key format). */
export function describeF2LPosition(position: string): string {
  const match = /^([A-Z]{3})([012])-([A-Z]{2})([01])$/.exec(position);
  if (!match || !CORNER_PLACE[match[1]] || !EDGE_PLACE[match[3]]) {
    throw new Error(`Not an F2L position: "${position}"`);
  }
  const [, cornerSlot, twist, edgeSlot, flip] = match;
  const corner = `Corner ${CORNER_PLACE[cornerSlot]} with white facing ${CORNER_FACING[cornerSlot][Number(twist)]}`;
  let edge: string;
  if (edgeSlot === 'FR') {
    edge = flip === '0' ? 'edge in the slot the right way round' : 'edge in the slot but flipped';
  } else {
    const topColor = flip === '0' ? 'front' : 'right';
    edge = `edge ${EDGE_PLACE[edgeSlot]} showing the ${topColor} side's color on top`;
  }
  return `${corner}; ${edge}.`;
}

const TABLE: ReadonlyArray<readonly [F2LGroup, string, string]> = [
  ['easy-insert', 'UFR1-UR0', "U R U' R'"],
  ['easy-insert', 'UFR2-UF1', "U' F' U F"],
  ['easy-insert', 'UFR1-UL1', "F' U' F"],
  ['easy-insert', 'UFR2-UB0', "R U R'"],
  ['top-white-side', 'UFR1-UB0', "U' R U R' U2 R U' R'"],
  ['top-white-side', 'UFR2-UL1', "U F' U' F U2 F' U F"],
  ['top-white-side', 'UFR1-UL0', "U' R U2 R' U2 R U' R'"],
  ['top-white-side', 'UFR2-UB1', "U F' U2 F U2 F' U F"],
  ['top-white-side', 'UFR1-UB1', "U' R U' R' U F' U' F"],
  ['top-white-side', 'UFR2-UL0', "U' R U R' U R U R'"],
  ['top-white-side', 'UBR1-UB1', "R U2 R' U F' U' F"],
  ['top-white-side', 'UFL2-UL0', "F' U2 F U' R U R'"],
  ['top-white-side', 'UFR1-UF1', "U F' U F U' F' U' F"],
  ['top-white-side', 'UFR2-UR0', "U' R U' R' U R U R'"],
  ['top-white-side', 'UFR1-UF0', "R U R' U2 R U' R' U R U' R'"],
  ['top-white-side', 'UFR2-UR1', "R U' R' U2 F' U' F"],
  ['top-white-up', 'UFR0-UR0', "R U2 R' U' R U R'"],
  ['top-white-up', 'UFR0-UF1', "F' U2 F U F' U' F"],
  ['top-white-up', 'UFL0-UR0', "R U2 R' U R U' R'"],
  ['top-white-up', 'UBR0-UF1', "F' U2 F U' F' U F"],
  ['top-white-up', 'UFR0-UL0', "R U' R' U2 R U R'"],
  ['top-white-up', 'UFR0-UB1', "F' U F U2 F' U' F"],
  ['top-white-up', 'UFR0-UF0', "R U R' U2 R U R' U' R U R'"],
  ['top-white-up', 'UFR0-UR1', "F U R U' R' F' R U' R'"],
  ['corner-in-slot', 'DFR0-UR0', "U' F' U F U R U' R'"],
  ['corner-in-slot', 'DFR0-UF1', "U R U' R' U' F' U F"],
  ['corner-in-slot', 'DFR2-UR0', "R U' R' U R U' R'"],
  ['corner-in-slot', 'DFR1-UF1', "F' U F U' F' U F"],
  ['corner-in-slot', 'DFR2-UF1', "F' U' F U F' U' F"],
  ['corner-in-slot', 'DFR1-UR0', "R U R' U' R U R'"],
  ['edge-in-slot', 'UFR0-FR1', "F' U F R U2 R'"],
  ['edge-in-slot', 'UFR0-FR0', "R U R' U' R U R' U' R U R'"],
  ['edge-in-slot', 'UFR1-FR0', "U' R U' R' U2 R U' R'"],
  ['edge-in-slot', 'UFR2-FR0', "U R U R' U2 R U R'"],
  ['edge-in-slot', 'UFR1-FR1', "U' R U R' U F' U' F"],
  ['edge-in-slot', 'UFR2-FR1', "U F' U' F U' R U R'"],
  ['both-in-slot', 'DFR1-FR0', "R U' R' U R U2 R' U R U' R'"],
  ['both-in-slot', 'DFR2-FR0', "R U' R' U' R U R' U2 R U' R'"],
  ['both-in-slot', 'DFR0-FR1', "R U' R' U F' U2 F U2 F' U F"],
  ['both-in-slot', 'DFR2-FR1', "R U' R' U F' U' F U' F' U' F"],
  ['both-in-slot', 'DFR1-FR1', "F' U F U' R U R' U R U R'"],
];

export const F2L_CASES: readonly F2LCase[] = (() => {
  const seenInGroup = new Map<F2LGroup, number>();
  return TABLE.map(([group, position, algorithm], i) => {
    const n = (seenInGroup.get(group) ?? 0) + 1;
    seenInGroup.set(group, n);
    return {
      id: `f2l-${String(i + 1).padStart(2, '0')}`,
      name: `${F2L_GROUP_NAMES[group]} ${n}`,
      group,
      position,
      recognition: describeF2LPosition(position),
      algorithm,
    };
  });
})();
