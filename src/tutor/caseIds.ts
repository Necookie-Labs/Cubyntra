/**
 * Cubyntra - Tutor Case Ids
 * Necookie Labs (c) 2026
 *
 * Every `caseId` a step plan can carry, by method and stage. The coach keeps one text template
 * per id and the trainer lists them; the scramble suite asserts that planners produce exactly
 * these ids and that each one really occurs.
 */

import { F2L_CASES } from './cases/f2l';
import { OLL_CORNER_CASES, OLL_EDGE_CASES } from './cases/oll2look';
import { PLL_CORNER_CASES, PLL_EDGE_CASES } from './cases/pll2look';
import { MethodId } from './types';

const ids = (cases: readonly { id: string }[]) => cases.map((c) => c.id);

export const CASE_IDS: Readonly<Record<MethodId, Readonly<Record<string, readonly string[]>>>> = {
  beginner: {
    daisy: ['daisy-top', 'daisy-middle', 'daisy-bottom-down', 'daisy-bottom-side'],
    'white-cross': ['white-cross-petal'],
    'white-corners': ['white-corner-below', 'white-corner-twisted', 'white-corner-wrong-slot'],
    'middle-edges': ['middle-edge-right', 'middle-edge-left', 'middle-edge-extract'],
    'yellow-cross': ['yellow-cross-dot', 'yellow-cross-l', 'yellow-cross-line'],
    'yellow-edges': ['yellow-edges-adjacent', 'yellow-edges-opposite', 'yellow-edges-align'],
    'yellow-corners-position': ['yellow-corners-none', 'yellow-corners-one'],
    'yellow-corners-orient': ['yellow-corner-twist-2', 'yellow-corner-twist-4', 'yellow-corners-align'],
  },
  cfop: {
    cross: ['cross'],
    f2l: [...ids(F2L_CASES), 'f2l-extract-corner', 'f2l-extract-edge'],
    'oll-edges': ids(OLL_EDGE_CASES),
    'oll-corners': ids(OLL_CORNER_CASES),
    'pll-corners': ids(PLL_CORNER_CASES),
    'pll-edges': ids(PLL_EDGE_CASES),
    auf: ['auf-u', 'auf-u2', "auf-u'"],
  },
};

/** All case ids of a method, in stage order. */
export function caseIdsOf(method: MethodId): string[] {
  return Object.values(CASE_IDS[method]).flat();
}
