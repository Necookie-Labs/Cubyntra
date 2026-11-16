/**
 * Cubyntra - Coach Stage Notes
 * Necookie Labs (c) 2026
 *
 * Teaching notes for every stage of both methods, used by the templates and mirrored in the
 * system prompt. Ids match the tutor engine's stage ids (`src/tutor/methods/*`). The CFOP ids
 * are checked against the engine in the tests; beginner's ids follow the stage list in
 * `docs/tutor/GOAL.md`. A stage id the coach does not know still gets a template built from the
 * plan's own facts.
 */

import type { MethodId } from '../tutor/types';

export interface CoachStageNote {
  id: string;
  method: MethodId;
  name: string;
  /** Hint level 1: what to look for at this stage, in general. */
  lookTip: string;
  /** Hint level 2: why this stage works the way it does. */
  whyTip: string;
}

export const COACH_STAGES: readonly CoachStageNote[] = [
  // Beginner's method: white cross on top, then flip so white is on the bottom.
  {
    id: 'daisy',
    method: 'beginner',
    name: 'Daisy',
    lookTip: 'Find a white edge that is not yet around the yellow center on top.',
    whyTip: 'Gathering the white edges around the yellow center first makes the white cross easy to finish.',
  },
  {
    id: 'white-cross',
    method: 'beginner',
    name: 'White cross',
    lookTip: 'Find a white edge and check the color on its other side. It belongs next to the center of that color.',
    whyTip: 'Each white edge must match two centers: white on top and its side color on the side.',
  },
  {
    id: 'white-corners',
    method: 'beginner',
    name: 'White corners',
    lookTip: 'Find a corner with white on it. Read its other two colors to see which slot it belongs in.',
    whyTip: 'The short trigger lifts the slot out of the way, brings the corner in and puts the slot back, so the cross stays safe.',
  },
  {
    id: 'flip',
    method: 'beginner',
    name: 'Flip the cube',
    lookTip: 'The white layer is done. Turn the whole cube over so white is on the bottom.',
    whyTip: 'With the finished layer on the bottom you can turn the top freely without breaking it.',
  },
  {
    id: 'middle-edges',
    method: 'beginner',
    name: 'Middle edges',
    lookTip: 'Find a top edge with no yellow on it. Turn the top until its front color matches the center below it.',
    whyTip: 'The algorithm takes the edge down into the middle layer and puts the white corner back, so the first layer is kept.',
  },
  {
    id: 'yellow-cross',
    method: 'beginner',
    name: 'Yellow cross',
    lookTip: 'Look only at the yellow edges on top: a dot, an L shape or a line.',
    whyTip: 'The algorithm flips top edges over without touching the two finished layers.',
  },
  {
    id: 'yellow-edges',
    method: 'beginner',
    name: 'Yellow edges',
    lookTip: 'Turn the top and count how many side colors of the top edges match their centers.',
    whyTip: 'The algorithm swaps top edges around while the yellow cross stays yellow.',
  },
  {
    id: 'yellow-corners-position',
    method: 'beginner',
    name: 'Position the yellow corners',
    lookTip: 'Find a top corner that sits between the right three centers, even if it is twisted.',
    whyTip: 'The algorithm cycles three corners and keeps the one at the front-right where it is.',
  },
  {
    id: 'yellow-corners-orient',
    method: 'beginner',
    name: 'Twist the yellow corners',
    lookTip: 'Bring a corner without yellow on top to the front-right. Turn only the top between corners.',
    whyTip: 'The short trigger twists the corner; the lower layers look mixed up and fix themselves at the end.',
  },
  // CFOP: white on the bottom throughout, yellow on top.
  {
    id: 'cross',
    method: 'cfop',
    name: 'White cross',
    lookTip: 'Find the four white edges and plan where each goes on the bottom before you turn.',
    whyTip: 'Each white edge must match the white center and its side center; planning ahead keeps it short.',
  },
  {
    id: 'f2l',
    method: 'cfop',
    name: 'First two layers',
    lookTip: 'Find a white corner on top and the edge with its two side colors. Notice where white faces.',
    whyTip: 'The corner and edge are joined into a pair on top, then the pair goes into its slot together.',
  },
  {
    id: 'oll-edges',
    method: 'cfop',
    name: 'Yellow cross',
    lookTip: 'Look only at the yellow edges on top: a dot, an L shape or a line.',
    whyTip: 'The algorithm flips top edges over without breaking the two layers below.',
  },
  {
    id: 'oll-corners',
    method: 'cfop',
    name: 'Yellow top',
    lookTip: 'Count the yellow corners on top, then look for yellow stickers on the sides.',
    whyTip: 'The algorithm twists the top corners in place while the yellow cross stays put.',
  },
  {
    id: 'pll-corners',
    method: 'cfop',
    name: 'Top corners',
    lookTip: 'Look at the sides for "headlights": two corner stickers of the same color on one side.',
    whyTip: 'The algorithm swaps two corners; afterwards every side has matching corners.',
  },
  {
    id: 'pll-edges',
    method: 'cfop',
    name: 'Top edges',
    lookTip: 'Look for a side that is already finished, and where the other edges need to go.',
    whyTip: 'The algorithm moves only top edges around, leaving the corners where they are.',
  },
  {
    id: 'auf',
    method: 'cfop',
    name: 'Final turn',
    lookTip: 'Everything is done except one turn of the top.',
    whyTip: 'The top layer is solved but sits a turn away from the sides below it.',
  },
];

export function stageNote(method: MethodId, id: string): CoachStageNote | undefined {
  return COACH_STAGES.find((s) => s.method === method && s.id === id);
}
