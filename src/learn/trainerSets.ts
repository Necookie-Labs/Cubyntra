/**
 * Cubyntra - Trainer Sets
 * Necookie Labs (c) 2026
 *
 * The algorithm sets the trainer drills, built from the tutor's own case tables so a drill and
 * a guided solve always teach the same algorithm under the same case id (and the coach's notes
 * for that id apply to both). The beginner's set is the handful of sequences the beginner's
 * method repeats; its algorithms are the ones `src/tutor/methods/beginner.ts` plans.
 *
 * Every case says how the drill is held (`top`), which stage of which method it belongs to, and
 * whether the drill starts from a random turn of the top layer (`auf`), as real solves do.
 */

import type { CubeColor } from '../cube/types';
import { F2L_CASES, F2L_GROUP_NAMES } from '../tutor/cases/f2l';
import { OLL_CORNER_CASES, OLL_EDGE_CASES } from '../tutor/cases/oll2look';
import { PLL_CORNER_CASES, PLL_EDGE_CASES } from '../tutor/cases/pll2look';
import { OLL_CASES } from '../tutor/cases/oll';
import { PLL_CASES } from '../tutor/cases/pll';
import type { LastLayerMode, MethodId } from '../tutor/types';
import type { TrainerSetId } from './types';

export interface TrainerCase {
  /** The tutor's case id, e.g. `f2l-07`, `oll-21`, `middle-edge-right`. */
  id: string;
  name: string;
  /** Group within the set, for filtering. */
  group: string;
  /** What to look for before turning, with the cube held as the drill shows it. */
  recognition: string;
  algorithm: string;
  method: MethodId;
  /** CFOP last-layer variant the case belongs to (planning the drill uses it). */
  lastLayer?: LastLayerMode;
  /** The stage of `method` the case belongs to. */
  stage: string;
  /** Center color on top while drilling (green is always in front). */
  top: CubeColor;
  /** Start from a random turn of the top layer, which the student undoes first. */
  auf: boolean;
  /** Which pieces the twin lights up. */
  highlight: 'last-layer' | 'f2l-pair' | 'middle-edge' | 'corner';
}

export interface TrainerSet {
  id: TrainerSetId;
  name: string;
  /** One plain line on what the set is for. */
  blurb: string;
  cases: readonly TrainerCase[];
  /** Group names in table order. */
  groups: readonly string[];
}

const BEGINNER_CASES: readonly TrainerCase[] = [
  {
    id: 'white-corner-below',
    name: 'White corner from below',
    group: 'White corners',
    recognition:
      'White cross on top. The white corner sits in the bottom layer, right under its place at the top front-right, with white facing right.',
    algorithm: "R' D' R D",
    method: 'beginner',
    stage: 'white-corners',
    top: 'white',
    auf: false,
    highlight: 'corner',
  },
  {
    id: 'middle-edge-right',
    name: 'Middle edge to the right',
    group: 'Middle layer',
    recognition:
      'An edge with no yellow is at the top front. Its front color matches the front center and its top color matches the right center.',
    algorithm: "U R U' R' U' F' U F",
    method: 'beginner',
    stage: 'middle-edges',
    top: 'yellow',
    auf: true,
    highlight: 'middle-edge',
  },
  {
    id: 'middle-edge-left',
    name: 'Middle edge to the left',
    group: 'Middle layer',
    recognition:
      'An edge with no yellow is at the top front. Its front color matches the front center and its top color matches the left center.',
    algorithm: "U' L' U L U F U' F'",
    method: 'beginner',
    stage: 'middle-edges',
    top: 'yellow',
    auf: true,
    highlight: 'middle-edge',
  },
  {
    id: 'yellow-cross-line',
    name: 'Yellow line',
    group: 'Yellow layer',
    recognition: 'Two yellow edges on top make a line through the center. Turn the top so the line runs left to right.',
    algorithm: "F R U R' U' F'",
    method: 'beginner',
    stage: 'yellow-cross',
    top: 'yellow',
    auf: true,
    highlight: 'last-layer',
  },
  {
    id: 'yellow-edges-adjacent',
    name: 'Neighbouring edges match',
    group: 'Yellow layer',
    recognition:
      'The yellow cross is done. Turn the top until two neighbouring edges match their centers, then hold them at the back and on the right.',
    algorithm: "R U R' U R U2 R' U",
    method: 'beginner',
    stage: 'yellow-edges',
    top: 'yellow',
    auf: true,
    highlight: 'last-layer',
  },
  {
    id: 'yellow-corners-one',
    name: 'One corner in place',
    group: 'Yellow layer',
    recognition:
      'One top corner has the colors of the three sides around it, even if it is twisted. Hold it at the front-right.',
    algorithm: "U R U' L' U R' U' L",
    method: 'beginner',
    stage: 'yellow-corners-position',
    top: 'yellow',
    auf: true,
    highlight: 'last-layer',
  },
  {
    id: 'yellow-corner-twist-2',
    name: 'Twist a yellow corner',
    group: 'Yellow layer',
    recognition:
      'The top front-right corner shows yellow on the right side. Do the four moves twice. The lower layers mix up on the way and come back at the end.',
    algorithm: "R' D' R D R' D' R D",
    method: 'beginner',
    stage: 'yellow-corners-orient',
    top: 'yellow',
    auf: false,
    highlight: 'corner',
  },
];

const F2L_SET_CASES: readonly TrainerCase[] = F2L_CASES.map((c) => ({
  id: c.id,
  name: c.name,
  group: F2L_GROUP_NAMES[c.group],
  recognition: c.recognition,
  algorithm: c.algorithm,
  method: 'cfop',
  stage: 'f2l',
  top: 'yellow',
  auf: true,
  highlight: 'f2l-pair',
}));

const lastLayer = (
  cases: readonly { id: string; name: string; recognition: string; algorithm: string; group?: string }[],
  stage: string,
  group: string | null,
  variant: LastLayerMode
): TrainerCase[] =>
  cases.map((c) => ({
    id: c.id,
    name: c.name,
    group: group ?? c.group ?? 'Other',
    recognition: c.recognition,
    algorithm: c.algorithm,
    method: 'cfop',
    lastLayer: variant,
    stage,
    top: 'yellow',
    auf: true,
    highlight: 'last-layer',
  }));

const TWO_LOOK_CASES: readonly TrainerCase[] = [
  ...lastLayer(OLL_EDGE_CASES, 'oll-edges', 'OLL: yellow cross', '2-look'),
  ...lastLayer(OLL_CORNER_CASES, 'oll-corners', 'OLL: yellow top', '2-look'),
  ...lastLayer(PLL_CORNER_CASES, 'pll-corners', 'PLL: corners', '2-look'),
  ...lastLayer(PLL_EDGE_CASES, 'pll-edges', 'PLL: edges', '2-look'),
];

const groupsOf = (cases: readonly TrainerCase[]) => [...new Set(cases.map((c) => c.group))];

const set = (id: TrainerSetId, name: string, blurb: string, cases: readonly TrainerCase[]): TrainerSet => ({
  id,
  name,
  blurb,
  cases,
  groups: groupsOf(cases),
});

export const TRAINER_SETS: readonly TrainerSet[] = [
  set('beginner', "Beginner's algorithms", 'The seven sequences the beginner’s method uses.', BEGINNER_CASES),
  set('f2l', 'F2L', 'All 41 ways a corner and its edge can sit.', F2L_SET_CASES),
  set('last-layer-2look', '2-look OLL and PLL', 'The 16 last-layer cases of CFOP as first taught.', TWO_LOOK_CASES),
  set('oll', 'Full OLL', 'All 57 cases: the yellow top in one look.', lastLayer(OLL_CASES, 'oll', null, 'full')),
  set('pll', 'Full PLL', 'All 21 cases: the top layer in one look.', lastLayer(PLL_CASES, 'pll', null, 'full')),
];

export function trainerSet(id: TrainerSetId): TrainerSet {
  const found = TRAINER_SETS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown trainer set "${id}"`);
  return found;
}

/** The case ids of a set, optionally only those in one group, in table order. */
export function trainerCaseIds(id: TrainerSetId, group: string | null = null): string[] {
  return trainerSet(id)
    .cases.filter((c) => group === null || c.group === group)
    .map((c) => c.id);
}

/** A case of a set by id. */
export function trainerCase(id: TrainerSetId, caseId: string): TrainerCase | undefined {
  return trainerSet(id).cases.find((c) => c.id === caseId);
}
