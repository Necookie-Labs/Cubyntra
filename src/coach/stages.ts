/**
 * Cubyntra - Coach Stage Notes
 * Necookie Labs (c) 2026
 *
 * Teaching notes for the stages of both methods, used by the templates and mirrored in the
 * system prompt. The stage list itself (ids, names, order) comes from the tutor engine's
 * `METHODS`, so the coach never keeps its own copy. Notes are looked up by exact stage id, then
 * by stage family (for example any `oll…` or `pll…` stage a method adds later). A stage with no
 * note at all still gets a template built from the plan's own facts.
 */

import { METHODS } from '../tutor/api';
import type { MethodId } from '../tutor/types';

export interface StageTips {
  /** Hint level 1: what to look for at this stage, in general. */
  lookTip: string;
  /** Hint level 2: why this stage works the way it does. */
  whyTip: string;
}

export interface CoachStageNote extends StageTips {
  id: string;
  method: MethodId;
  /** The tutor's display name for the stage. */
  name: string;
}

/** Notes by `method:stageId`. Ids must exist in the tutor's methods (checked in the tests). */
export const STAGE_TIPS: Readonly<Record<string, StageTips>> = {
  // Beginner's method: daisy and cross with yellow on top, white corners with the cross on top,
  // then white goes to the bottom for the rest of the solve.
  'beginner:daisy': {
    lookTip: 'Find a white edge that is not yet around the yellow center on top.',
    whyTip: 'Gathering the white edges around the yellow center first makes the white cross easy to finish.',
  },
  'beginner:white-cross': {
    lookTip: 'Find a white petal on top and check the color on its other side. It belongs above the center of that color.',
    whyTip: 'Each white edge must match two centers: white on the bottom and its side color on the side.',
  },
  'beginner:white-corners': {
    lookTip: 'Find a corner with white on it. Read its other two colors to see which slot it belongs in.',
    whyTip: 'The short trigger lifts the slot out of the way, brings the corner in and puts the slot back, so the cross stays safe.',
  },
  'beginner:middle-edges': {
    lookTip: 'Find a top edge with no yellow on it. Turn the top until its front color matches the center below it.',
    whyTip: 'The algorithm takes the edge down into the middle layer and puts the white corner back, so the first layer is kept.',
  },
  'beginner:yellow-cross': {
    lookTip: 'Look only at the yellow edges on top: a dot, an L-shape or a line.',
    whyTip: 'The algorithm flips top edges over without touching the two finished layers.',
  },
  'beginner:yellow-edges': {
    lookTip: 'Turn the top and count how many side colors of the top edges match their centers.',
    whyTip: 'The algorithm swaps top edges around while the yellow cross stays yellow.',
  },
  'beginner:yellow-corners-position': {
    lookTip: 'Find a top corner that sits between the right three centers, even if it is twisted.',
    whyTip: 'The algorithm cycles three corners and keeps the one at the front-right where it is.',
  },
  'beginner:yellow-corners-orient': {
    lookTip: 'Bring a corner without yellow on top to the front-right. Turn only the top between corners.',
    whyTip: 'The short trigger twists the corner; the lower layers look mixed up and fix themselves at the end.',
  },
  // CFOP: white on the bottom throughout, yellow on top.
  'cfop:cross': {
    lookTip: 'Find the four white edges and plan where each goes on the bottom before you turn.',
    whyTip: 'Each white edge must match the white center and its side center; planning ahead keeps it short.',
  },
  'cfop:f2l': {
    lookTip: 'Find a white corner on top and the edge with its two side colors. Notice where white faces.',
    whyTip: 'The corner and edge are joined into a pair on top, then the pair goes into its slot together.',
  },
  'cfop:oll-edges': {
    lookTip: 'Look only at the yellow edges on top: a dot, an L-shape or a line.',
    whyTip: 'The algorithm flips top edges over without breaking the two layers below.',
  },
  'cfop:oll-corners': {
    lookTip: 'Count the yellow corners on top, then look for yellow stickers on the sides.',
    whyTip: 'The algorithm twists the top corners in place while the yellow cross stays put.',
  },
  'cfop:pll-corners': {
    lookTip: 'Look at the sides for "headlights": two corner stickers of the same color on one side.',
    whyTip: 'The algorithm swaps two corners; afterwards every side has matching corners.',
  },
  'cfop:pll-edges': {
    lookTip: 'Look for a side that is already finished, and where the other edges need to go.',
    whyTip: 'The algorithm moves only top edges around, leaving the corners where they are.',
  },
  'cfop:auf': {
    lookTip: 'Everything is done except one turn of the top.',
    whyTip: 'The top layer is solved but sits a turn away from the sides below it.',
  },
};

/** Notes for whole families of stages, matched by id prefix when there is no exact note. */
const FAMILY_TIPS: readonly { prefix: string; tips: StageTips }[] = [
  {
    prefix: 'oll',
    tips: {
      lookTip: 'Look at the yellow stickers on top and on the sides of the top layer to see the pattern.',
      whyTip: 'The algorithm turns top pieces so yellow faces up, without breaking the two layers below.',
    },
  },
  {
    prefix: 'pll',
    tips: {
      lookTip: 'Look at the sides of the top layer for matching stickers, like headlights or a finished side.',
      whyTip: 'The algorithm moves top pieces to their places while yellow stays on top and the layers below stay solved.',
    },
  },
];

function tipsFor(method: MethodId, id: string): StageTips | undefined {
  return STAGE_TIPS[`${method}:${id}`] ?? FAMILY_TIPS.find((f) => id.startsWith(f.prefix))?.tips;
}

/** Every stage of every tutor method that has teaching notes, in method then stage order. */
export const COACH_STAGES: readonly CoachStageNote[] = (Object.keys(METHODS) as MethodId[]).flatMap((method) =>
  METHODS[method].stages.flatMap((stage) => {
    const tips = tipsFor(method, stage.id);
    return tips ? [{ id: stage.id, method, name: stage.name, ...tips }] : [];
  })
);

/** Teaching notes for a stage, or undefined when the coach has none (templates then use the plan's facts). */
export function stageNote(method: MethodId, id: string): CoachStageNote | undefined {
  const known = COACH_STAGES.find((s) => s.method === method && s.id === id);
  if (known) return known;
  const tips = tipsFor(method, id);
  return tips ? { id, method, name: id, ...tips } : undefined;
}
