/**
 * Cubyntra - Tutor Case Ids
 * Necookie Labs (c) 2026
 *
 * Every `caseId` a step plan can carry, by method and stage. The coach keeps one text template
 * per id and the trainer lists them; the scramble suite asserts that planners produce exactly
 * these ids and that each one really occurs.
 *
 * `CASE_IDS` holds each method as it is taught by default (CFOP with the 2-look last layer).
 * CFOP with the learner setting `lastLayer: 'full'` has its own stage list in
 * `CFOP_FULL_CASE_IDS`: the same cross, F2L and final turn, with the stages `oll` (`oll-01` to
 * `oll-57`) and `pll` (`pll-aa` to `pll-z`) in place of the four 2-look stages. Ask
 * `caseIdsByStage` / `caseIdsOf` with the settings rather than picking a table by hand, and
 * `allCaseIds` for every id of every variant.
 */

import { F2L_CASES } from './cases/f2l';
import { OLL_CORNER_CASES, OLL_EDGE_CASES } from './cases/oll2look';
import { PLL_CORNER_CASES, PLL_EDGE_CASES } from './cases/pll2look';
import { OLL_CASES } from './cases/oll';
import { PLL_CASES } from './cases/pll';
import { MethodId, MethodOptions } from './types';

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

/** Stages and case ids of CFOP with the full last layer (`lastLayer: 'full'`). */
export const CFOP_FULL_CASE_IDS: Readonly<Record<string, readonly string[]>> = {
  cross: CASE_IDS.cfop.cross,
  f2l: CASE_IDS.cfop.f2l,
  oll: ids(OLL_CASES),
  pll: ids(PLL_CASES),
  auf: CASE_IDS.cfop.auf,
};

/** The case ids of each stage of a method, for the variant the learner settings select. */
export function caseIdsByStage(
  method: MethodId,
  options: MethodOptions = {}
): Readonly<Record<string, readonly string[]>> {
  return method === 'cfop' && options.lastLayer === 'full' ? CFOP_FULL_CASE_IDS : CASE_IDS[method];
}

/** All case ids of a method (or of the variant the learner settings select), in stage order. */
export function caseIdsOf(method: MethodId, options: MethodOptions = {}): string[] {
  return Object.values(caseIdsByStage(method, options)).flat();
}

/** Every case id any method or variant can produce, each once. */
export function allCaseIds(): string[] {
  return [
    ...new Set([...caseIdsOf('beginner'), ...caseIdsOf('cfop'), ...caseIdsOf('cfop', { lastLayer: 'full' })]),
  ];
}
